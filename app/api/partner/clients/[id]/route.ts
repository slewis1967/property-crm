/**
 * GET   /api/partner/clients/<id>  — one client and their deals
 * PATCH /api/partner/clients/<id>  — edit details, or { status: "archived" | "active" }
 *
 * PUBLIC (session-scoped). Loaded through loadOwnClient, so another firm's
 * client id is a 404 exactly like an id that doesn't exist.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { parseClientInput } from "../../../../../utils/partner";
import {
  CLIENT_COLUMNS,
  listOwnDeals,
  loadOwnClient,
  logPartnerEvent,
  readJson,
  requireFeature,
  requirePartner,
  showsFees,
  toClientView,
  toDealView,
  type ClientRow,
} from "../../_shared";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePartner();
  if (auth instanceof NextResponse) return auth;
  const locked = requireFeature(auth, "clients");
  if (locked) return locked;

  const { id } = await params;
  const client = await loadOwnClient(auth, id);
  if (!client) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  const deals = await listOwnDeals(auth, { clientId: id });
  const fees = showsFees(auth);
  return NextResponse.json({
    ok: true,
    client: toClientView(client),
    deals: deals.map((d) => toDealView(d, { showFees: fees })),
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePartner();
  if (auth instanceof NextResponse) return auth;
  const locked = requireFeature(auth, "clients");
  if (locked) return locked;

  const { id } = await params;
  const client = await loadOwnClient(auth, id);
  if (!client) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  let patch: Record<string, unknown>;
  if (body.status === "archived" || body.status === "active") {
    patch = { status: body.status };
  } else {
    // Merge over the stored record so a partial edit can't blank what it didn't send.
    const parsed = parseClientInput({ ...client, ...body });
    if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
    patch = { ...parsed.value };
  }
  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("partner_clients")
    .update(patch)
    .eq("id", id)
    .eq("partner_id", auth.partnerId)
    .select(CLIENT_COLUMNS)
    .single();
  if (error || !data) return NextResponse.json({ ok: false, error: "Could not save the client." }, { status: 500 });

  await logPartnerEvent({
    partnerId: auth.partnerId,
    clientId: id,
    actorType: "partner",
    actor: auth.email,
    action: body.status ? `client_${String(body.status)}` : "client_updated",
  });
  return NextResponse.json({ ok: true, client: toClientView(data as unknown as ClientRow) });
}
