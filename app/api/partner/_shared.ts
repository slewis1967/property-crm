/**
 * Shared helpers for the PUBLIC partner portal API (app/api/partner/*).
 * Not a route (underscore-prefixed).
 *
 * SEGREGATION IS ENFORCED HERE, ONCE. Route handlers never build their own
 * query on partner_clients or partner_enquiries — they call the helpers below,
 * which resolve the session first and filter on the partner id from that
 * session. There is deliberately no helper that loads a client or a deal by id
 * alone, so "forgot the firm filter" is not a mistake a route in this directory
 * can make. "Not yours" and "doesn't exist" are both null → 404, because a
 * distinct 403 would confirm the id exists in another firm's book.
 *
 * WHAT GOES BACK IS A WHITELIST. toClientView / toDealView name every field a
 * partner receives; staff_notes, decided_by, opportunity_id and anything added
 * to those tables later stay server-side by default.
 *
 * The staff routes live at /api/admin/partners/*, a different subtree, so they
 * keep their Cloudflare Access header whatever happens to the carve-out.
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { supabase } from "../../../utils/supabase";
import { resolveSession, sessionCookieName, type PartnerIdentity } from "../../../utils/partner-auth";
import {
  assertNoForbiddenKeys,
  canUse,
  DEAL_STAGE_LABELS,
  isDealStage,
  revealedForPortal,
  type PartnerFeature,
} from "../../../utils/partner";

export type { PartnerIdentity };

/** Resolve the signed-in partner, or the 401 the caller should return. */
export async function requirePartner(): Promise<PartnerIdentity | NextResponse> {
  const jar = await cookies();
  const identity = await resolveSession(jar.get(sessionCookieName())?.value ?? null);
  if (!identity) {
    return NextResponse.json({ ok: false, error: "Please sign in again.", code: "signed_out" }, { status: 401 });
  }
  return identity;
}

/** 403 unless the firm's tier (or a grant) includes the feature. */
export function requireFeature(identity: PartnerIdentity, feature: PartnerFeature): NextResponse | null {
  if (canUse(new Set(identity.features), feature)) return null;
  return NextResponse.json(
    { ok: false, error: "Your plan doesn't include this. Ask your NextKey contact about upgrading.", code: "feature_locked" },
    { status: 403 },
  );
}

export function showsFees(identity: PartnerIdentity): boolean {
  return canUse(new Set(identity.features), "referral_fee");
}

// ── Clients ──────────────────────────────────────────────────────────────────

export const CLIENT_COLUMNS =
  "id,partner_id,first_name,last_name,email,phone,state,budget_max,notes,status,created_at,updated_at";

export type ClientRow = {
  id: string;
  partner_id: string;
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  state: string | null;
  budget_max: number | null;
  notes: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export function toClientView(row: ClientRow) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    name: [row.first_name, row.last_name].filter(Boolean).join(" "),
    email: row.email,
    phone: row.phone,
    state: row.state,
    budgetMax: row.budget_max === null ? null : Number(row.budget_max),
    notes: row.notes,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type ClientView = ReturnType<typeof toClientView>;

export async function loadOwnClient(identity: PartnerIdentity, clientId: string): Promise<ClientRow | null> {
  if (!clientId || typeof clientId !== "string") return null;
  const { data, error } = await supabase
    .from("partner_clients")
    .select(CLIENT_COLUMNS)
    .eq("id", clientId)
    .eq("partner_id", identity.partnerId)
    .maybeSingle();
  if (error || !data) return null;
  return data as ClientRow;
}

export async function listOwnClients(identity: PartnerIdentity): Promise<ClientRow[]> {
  const { data, error } = await supabase
    .from("partner_clients")
    .select(CLIENT_COLUMNS)
    .eq("partner_id", identity.partnerId)
    .order("updated_at", { ascending: false })
    .limit(1000);
  if (error) return [];
  return (data ?? []) as ClientRow[];
}

// ── Deals (partner_enquiries) ────────────────────────────────────────────────

export const DEAL_COLUMNS =
  "id,partner_id,client_id,property_id,stage,stage_updated_at,partner_note,message_to_partner," +
  "lot_summary,price_snapshot,referral_fee_snapshot,revealed,revealed_at,hold_expires_at,created_at,updated_at," +
  "partner_clients(first_name,last_name)";

export type DealRow = {
  id: string;
  partner_id: string;
  client_id: string;
  property_id: string;
  stage: string;
  stage_updated_at: string;
  partner_note: string | null;
  message_to_partner: string | null;
  lot_summary: Record<string, unknown> | null;
  price_snapshot: number | null;
  referral_fee_snapshot: number | null;
  revealed: unknown;
  revealed_at: string | null;
  hold_expires_at: string | null;
  created_at: string;
  updated_at: string;
  partner_clients?: unknown;
};

/**
 * The lot snapshot fields a deal may carry back. lot_summary is only ever
 * written from a masked lot, but "only ever written from" is a promise about
 * every future writer; picking keys here makes it a property of the reader.
 */
const DEAL_LOT_FIELDS = [
  "ref", "suburb", "state", "propertyType", "bedrooms", "bathrooms", "carSpaces", "study",
  "landSizeSqm", "houseSizeSqm", "price",
] as const;

function pickLot(summary: Record<string, unknown> | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of DEAL_LOT_FIELDS) if (summary && summary[k] !== undefined) out[k] = summary[k];
  return out;
}

export function toDealView(row: DealRow, opts: { showFees: boolean }) {
  const clientRaw = Array.isArray(row.partner_clients) ? row.partner_clients[0] : row.partner_clients;
  const client = (clientRaw ?? {}) as { first_name?: string; last_name?: string | null };
  const lot = pickLot(row.lot_summary);
  return assertNoForbiddenKeys({
    id: row.id,
    stage: row.stage,
    stageLabel: isDealStage(row.stage) ? DEAL_STAGE_LABELS[row.stage] : row.stage,
    stageUpdatedAt: row.stage_updated_at,
    propertyId: row.property_id,
    lotRef: typeof lot.ref === "string" ? lot.ref : null,
    lot,
    price: row.price_snapshot === null ? null : Number(row.price_snapshot),
    referralFee: opts.showFees && row.referral_fee_snapshot !== null ? Number(row.referral_fee_snapshot) : null,
    clientId: row.client_id,
    clientName: [client.first_name, client.last_name].filter(Boolean).join(" "),
    partnerNote: row.partner_note,
    messageFromNextKey: row.message_to_partner,
    // Label/value pairs, never the raw column names — see revealedForPortal.
    lotDetails: revealedForPortal(row.revealed),
    lotDetailsReleasedAt: row.revealed_at,
    holdExpiresAt: row.hold_expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

export type DealView = ReturnType<typeof toDealView>;

export async function loadOwnDeal(identity: PartnerIdentity, dealId: string): Promise<DealRow | null> {
  if (!dealId || typeof dealId !== "string") return null;
  const { data, error } = await supabase
    .from("partner_enquiries")
    .select(DEAL_COLUMNS)
    .eq("id", dealId)
    .eq("partner_id", identity.partnerId)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as DealRow;
}

export async function listOwnDeals(
  identity: PartnerIdentity,
  opts: { clientId?: string } = {},
): Promise<DealRow[]> {
  let q = supabase
    .from("partner_enquiries")
    .select(DEAL_COLUMNS)
    .eq("partner_id", identity.partnerId);
  if (opts.clientId) q = q.eq("client_id", opts.clientId);
  const { data, error } = await q.order("updated_at", { ascending: false }).limit(1000);
  if (error) return [];
  return (data ?? []) as unknown as DealRow[];
}

// ── Audit + plumbing ─────────────────────────────────────────────────────────

/**
 * Append an audit event. Best-effort: a failed log must not fail the user's
 * action, but it is written to the platform log so an unaudited period shows.
 */
export async function logPartnerEvent(entry: {
  partnerId?: string | null;
  enquiryId?: string | null;
  clientId?: string | null;
  actorType: "partner" | "staff" | "super_admin" | "system";
  actor: string;
  action: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabase.from("partner_events").insert({
    partner_id: entry.partnerId ?? null,
    enquiry_id: entry.enquiryId ?? null,
    client_id: entry.clientId ?? null,
    actor_type: entry.actorType,
    actor: entry.actor,
    action: entry.action,
    detail: entry.detail ?? {},
  });
  if (error) console.error("[partner] audit write failed", { action: entry.action, error: error.message });
}

export async function readJson(req: Request): Promise<Record<string, unknown> | NextResponse> {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") throw new Error("not an object");
    return body as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
}
