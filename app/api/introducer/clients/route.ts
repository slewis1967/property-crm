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
import {
  pickEditableFields,
  toPortalView,
  canSendFullPack,
  seedFactFindFromReferral,
} from "../../../../utils/introducer";
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

  /* Which of the two things they are starting.
   *
   * The tier check is here, on the session's own firm, and never on anything in
   * the body — `pack_type` is the only thing the caller gets to say, and saying
   * "full" without the accreditation to back it is refused. The database
   * trigger refuses it a second time (see the migration); this exists so the
   * introducer gets a sentence rather than a 500. */
  const wantsFullPack = body.pack_type === "full";
  if (wantsFullPack && !canSendFullPack(auth.tier)) {
    await logIntroducerEvent({
      introducerId: auth.introducerId,
      actorType: "introducer",
      actor: auth.email,
      action: "full_pack_refused_tier",
      detail: { tier: auth.tier },
    });
    return NextResponse.json(
      {
        ok: false,
        error:
          "A full submission pack needs Tier 2 accreditation. Your firm is accredited at Tier 1, " +
          "which covers referrals. Contact Springboard if you'd like to be assessed at Tier 2.",
        code: "tier_required",
      },
      { status: 403 },
    );
  }

  const insert: Record<string, unknown> = {
    ...fields,
    introducer_id: auth.introducerId,
    submitted_by: auth.userId,
    status: "draft",
    pack_type: wantsFullPack ? "full" : "referral",
  };
  // Carry the details they just typed into the fact find's first page, so the
  // client's own name is entered once rather than twice.
  if (wantsFullPack) insert.fact_find_data = seedFactFindFromReferral(fields);

  let { data, error } = await supabase
    .from("introducer_clients")
    .insert(insert)
    .select("*")
    .single();

  /* Pre-migration fallback, and ONLY for a plain referral. If pack_type doesn't
   * exist yet the Tier 1 flow must keep working, so retry without the new
   * columns. A full pack, by contrast, must NOT quietly degrade into a referral
   * that says nothing about a fact find — it fails loudly and says why. */
  if (error && !wantsFullPack) {
    const retry = await supabase
      .from("introducer_clients")
      .insert({ ...fields, introducer_id: auth.introducerId, submitted_by: auth.userId, status: "draft" })
      .select("*")
      .single();
    if (!retry.error) ({ data, error } = retry);
  }

  if (error || !data) {
    return NextResponse.json(
      {
        ok: false,
        error: wantsFullPack
          ? "Could not start the submission pack. Please try again, and tell Springboard if it keeps failing."
          : "Could not start the referral. Please try again.",
      },
      { status: 500 },
    );
  }

  await logIntroducerEvent({
    clientId: data.id,
    introducerId: auth.introducerId,
    actorType: "introducer",
    actor: auth.email,
    action: "draft_created",
    detail: { pack_type: insert.pack_type },
  });

  return NextResponse.json({ ok: true, client: toPortalView(data) }, { status: 201 });
}
