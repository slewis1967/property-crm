/**
 * GET  /api/partner/clients  — this firm's clients
 * POST /api/partner/clients  — register one: { first_name, last_name, email, phone, state,
 *                               budget_max, notes, consent: true }
 *
 * PUBLIC (session-scoped). partner_id always comes from the session.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { parseClientInput } from "../../../../utils/partner";
import {
  CLIENT_COLUMNS,
  listOwnClients,
  logPartnerEvent,
  readJson,
  requireFeature,
  requirePartner,
  toClientView,
  type ClientRow,
} from "../_shared";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requirePartner();
  if (auth instanceof NextResponse) return auth;
  const locked = requireFeature(auth, "clients");
  if (locked) return locked;

  const rows = await listOwnClients(auth);
  return NextResponse.json({ ok: true, clients: rows.map(toClientView) });
}

export async function POST(req: Request) {
  const auth = await requirePartner();
  if (auth instanceof NextResponse) return auth;
  const locked = requireFeature(auth, "clients");
  if (locked) return locked;

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  // Our lawful basis for holding a third party's details (APP 3/5). Required,
  // and stored as a timestamp so the record says when it was given.
  if (body.consent !== true) {
    return NextResponse.json(
      { ok: false, error: "Please confirm your client has agreed to you passing their details to NextKey." },
      { status: 400 },
    );
  }
  const parsed = parseClientInput(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });

  const { data, error } = await supabase
    .from("partner_clients")
    .insert({
      ...parsed.value,
      partner_id: auth.partnerId,
      created_by_user_id: auth.userId,
      consent_confirmed_at: new Date().toISOString(),
    })
    .select(CLIENT_COLUMNS)
    .single();
  if (error || !data) {
    console.error("[partner] client insert failed", error?.message);
    return NextResponse.json({ ok: false, error: "Could not save the client. Please try again." }, { status: 500 });
  }

  const client = data as unknown as ClientRow;
  await logPartnerEvent({
    partnerId: auth.partnerId,
    clientId: client.id,
    actorType: "partner",
    actor: auth.email,
    action: "client_created",
  });
  return NextResponse.json({ ok: true, client: toClientView(client) }, { status: 201 });
}
