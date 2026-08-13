/**
 * GET  /api/introducer/clients   — this introducer's referrals, and only theirs
 * POST /api/introducer/clients   — start a new draft referral
 *
 * PUBLIC (session-scoped). Both paths derive the introducer id from the session
 * cookie; neither accepts one from the caller.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import {
  requireIntroducer,
  listOwnClients,
  logIntroducerEvent,
  readJson,
} from "../_shared";
import { pickEditableFields, toPortalView } from "../../../../utils/introducer";
import { enforceRateLimit } from "../../../../utils/rate-limit";
import { clientIp } from "../../../../utils/introducer-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireIntroducer();
  if (auth instanceof NextResponse) return auth;

  const rows = await listOwnClients(auth);

  // Which referrals are waiting on the introducer? Computed here so the list can
  // show it without N+1 fetches from the client.
  const ids = rows.map((r) => r.id);
  const waiting = new Set<string>();
  if (ids.length > 0) {
    const { data } = await supabase
      .from("introducer_info_requests")
      .select("client_id")
      .in("client_id", ids)
      .eq("status", "open");
    for (const r of (data ?? []) as { client_id: string }[]) waiting.add(r.client_id);
  }

  return NextResponse.json({
    ok: true,
    firm: auth.firmName,
    clients: rows.map((r) => ({ ...toPortalView(r), awaiting_you: waiting.has(r.id) })),
  });
}

export async function POST(req: Request) {
  const auth = await requireIntroducer();
  if (auth instanceof NextResponse) return auth;

  const limited = enforceRateLimit(req, {
    windowMs: 60_000,
    max: 20,
    keyFn: () => `introducer-new:${clientIp(req) ?? "unknown"}`,
  });
  if (limited) return limited;

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  // Cap the number of unsubmitted drafts. A draft is a parking space, not a
  // storage area, and an unbounded pile of half-entered client PII is a privacy
  // liability we'd be holding with no purpose.
  const { count } = await supabase
    .from("introducer_clients")
    .select("id", { count: "exact", head: true })
    .eq("introducer_id", auth.introducerId)
    .eq("status", "draft");
  if ((count ?? 0) >= 25) {
    return NextResponse.json(
      { ok: false, error: "You have 25 unfinished drafts. Please submit or delete some before starting another." },
      { status: 409 },
    );
  }

  const fields = pickEditableFields(body);

  const { data, error } = await supabase
    .from("introducer_clients")
    .insert({
      ...fields,
      introducer_id: auth.introducerId,
      submitted_by: auth.userId,
      status: "draft",
    })
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json({ ok: false, error: "Could not start the referral. Please try again." }, { status: 500 });
  }

  await logIntroducerEvent({
    clientId: data.id,
    introducerId: auth.introducerId,
    actorType: "introducer",
    actor: auth.email,
    action: "draft_created",
  });

  return NextResponse.json({ ok: true, client: toPortalView(data) }, { status: 201 });
}
