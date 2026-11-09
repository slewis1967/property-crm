/**
 * POST /api/admin/partners/deals/<id>
 *   { action: "grant_hold", hold_until?, message? }
 *   { action: "decline", reason, message? }
 *   { action: "advance", to: "eoi" | "unconditional" | "settled", message? }
 *   { action: "release", reason, message? }
 *   { action: "reveal", revealed?: {builder_name, estate_name, lot_number, street_address} }
 *   { action: "message", message }
 *   { action: "notes", staff_notes }
 *   { action: "create_opportunity" }
 *
 * STAFF (Cloudflare Access). Running a deal is operational, so any staff member
 * can do it; onboarding and pricing (tiers, white-label) stay super-admin.
 *
 * Every stage change is conditional on the stage we read (`.eq("stage", from)`),
 * so two staff in two tabs can't both act, and the one-active-hold-per-lot index
 * turns a second grant on the same lot into a clean 409 instead of a double sale.
 *
 * REVEAL is the only path by which a partner learns who the builder is. It is a
 * separate, deliberate act — never a side effect of granting a hold — and it is
 * written to partner_events with who did it.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../../utils/supabase";
import { nexusApi } from "@/utils/nexus-api";
import { requireStaff, readJson } from "../../../introducers/_shared";
import { logPartnerEvent } from "../../../../partner/_shared";
import {
  canTransition,
  DEAL_STAGE_LABELS,
  isDealStage,
  parseReveal,
  type DealStage,
} from "../../../../../../utils/partner";
import { loadPartnerLot, lotSupplierForStaff } from "../../../../../../utils/partner-stock";
import { sendDealUpdateEmail } from "../../../../../../utils/partner-email";
import { normaliseAuPhone } from "../../../../../../utils/introducer";

export const dynamic = "force-dynamic";

const DEFAULT_HOLD_HOURS = 72;

type Deal = {
  id: string;
  partner_id: string;
  client_id: string;
  property_id: string;
  stage: string;
  lot_summary: Record<string, unknown> | null;
  opportunity_id: string | null;
  created_by_user_id: string | null;
  price_snapshot: number | null;
  referral_fee_snapshot: number | null;
  partners?: unknown;
  partner_clients?: unknown;
};

function one<T>(raw: unknown): T | undefined {
  return (Array.isArray(raw) ? raw[0] : raw) as T | undefined;
}

async function loadDeal(id: string): Promise<Deal | null> {
  const { data } = await supabase
    .from("partner_enquiries")
    .select(
      "id,partner_id,client_id,property_id,stage,lot_summary,opportunity_id,created_by_user_id," +
        "price_snapshot,referral_fee_snapshot," +
        "partners(firm_name,contact_email,contact_name),partner_clients(first_name,last_name,email,phone,state)",
    )
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as Deal) ?? null;
}

/** The person who asked, if they're still active; otherwise the firm's contact. */
async function partnerRecipient(deal: Deal): Promise<{ email: string; name: string | null } | null> {
  if (deal.created_by_user_id) {
    const { data } = await supabase
      .from("partner_users")
      .select("email,full_name,status")
      .eq("id", deal.created_by_user_id)
      .maybeSingle();
    if (data && data.status === "active") return { email: data.email, name: data.full_name };
  }
  const firm = one<{ contact_email?: string; contact_name?: string }>(deal.partners);
  return firm?.contact_email ? { email: firm.contact_email, name: firm.contact_name ?? null } : null;
}

function clientName(deal: Deal): string {
  const c = one<{ first_name?: string; last_name?: string | null }>(deal.partner_clients);
  return [c?.first_name, c?.last_name].filter(Boolean).join(" ");
}

function lotRefOf(deal: Deal): string {
  return typeof deal.lot_summary?.ref === "string" ? deal.lot_summary.ref : "your lot";
}

/**
 * Tell the partner. Best-effort (the portal shows the change regardless) but
 * awaited — a fire-and-forget send can be frozen with the function once the
 * response goes, and then nobody knows the email never left.
 */
async function notify(deal: Deal, headline: string, body: string) {
  const to = await partnerRecipient(deal);
  if (!to) return;
  const sent = await sendDealUpdateEmail({
    to: to.email,
    name: to.name,
    lotRef: lotRefOf(deal),
    clientName: clientName(deal),
    headline,
    body,
    enquiryId: deal.id,
  }).catch((e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : String(e) }));
  if (!sent.ok) console.error("[partner] deal update email not sent", { deal: deal.id, error: sent.error });
}

/**
 * Put the partner's client into the NEXUS pipeline, tagged at the source so
 * partner business is separable in every report. Returns the opportunity id or
 * an error — never throws, because the hold has already been granted and must
 * stand whether or not NEXUS answered.
 */
async function createOpportunity(deal: Deal): Promise<{ id: string | null; error: string | null }> {
  const c = one<{ first_name?: string; last_name?: string | null; email?: string | null; phone?: string | null; state?: string | null }>(
    deal.partner_clients,
  );
  const firm = one<{ firm_name?: string }>(deal.partners);
  const phone = c?.phone ?? "";
  // NEXUS requires an email; a phone-only client stays a partner deal and the
  // staff queue says why no opportunity exists.
  if (!c?.email) return { id: null, error: "The client has no email, which NEXUS requires. Add one, then retry." };
  try {
    const res = await nexusApi("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: clientName(deal),
        email: c?.email ?? "",
        phone: normaliseAuPhone(phone) ?? phone,
        source: `partner:${firm?.firm_name ?? "unknown"}`,
        state: c?.state ?? null,
        message: `Partner hold on ${lotRefOf(deal)} (stock ${deal.property_id})`,
      }),
    });
    const raw = await res.text();
    let opp: Record<string, unknown> = {};
    try {
      opp = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return { id: null, error: "NEXUS is unreachable." };
    }
    if (!res.ok) return { id: null, error: typeof opp.error === "string" ? opp.error : "NEXUS rejected the opportunity." };
    const nested = opp.lead as Record<string, unknown> | undefined;
    const id = String(opp.id ?? opp.lead_id ?? nested?.id ?? "") || null;
    if (id) await supabase.from("partner_enquiries").update({ opportunity_id: id }).eq("id", deal.id);
    return { id, error: null };
  } catch (e) {
    return { id: null, error: e instanceof Error ? e.message : "NEXUS error" };
  }
}

/** Conditional stage move. Returns false if someone else moved it first. */
async function moveStage(deal: Deal, to: DealStage, extra: Record<string, unknown>) {
  const now = new Date().toISOString();
  return supabase
    .from("partner_enquiries")
    .update({ stage: to, stage_updated_at: now, updated_at: now, ...extra })
    .eq("id", deal.id)
    .eq("stage", deal.stage)
    .select("id")
    .maybeSingle();
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const deal = await loadDeal(id);
  if (!deal) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  const action = String(body.action ?? "");
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 2000) || null : null;
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : "";
  const stale = () =>
    NextResponse.json({ ok: false, error: "Someone else has just updated this deal. Refresh and try again." }, { status: 409 });
  const log = (a: string, detail: Record<string, unknown> = {}) =>
    logPartnerEvent({ partnerId: deal.partner_id, enquiryId: deal.id, clientId: deal.client_id, actorType: "staff", actor: auth, action: a, detail });

  switch (action) {
    case "grant_hold": {
      if (!canTransition(deal.stage, "hold")) {
        return NextResponse.json({ ok: false, error: `This deal is ${deal.stage}; only a request can be granted.` }, { status: 409 });
      }
      const until =
        typeof body.hold_until === "string" && !Number.isNaN(Date.parse(body.hold_until))
          ? new Date(body.hold_until).toISOString()
          : new Date(Date.now() + DEFAULT_HOLD_HOURS * 3_600_000).toISOString();
      // Re-snapshot the fee: the figure at grant is the one that binds.
      const lot = await loadPartnerLot(deal.property_id, { showFees: true });
      // If the stock row has gone (the aggregator owns its lifecycle), keep the
      // request-time figures rather than blanking them.
      const { data, error } = await moveStage(deal, "hold", {
        hold_expires_at: until,
        decided_by: auth,
        referral_fee_snapshot: lot ? lot.referralFee : deal.referral_fee_snapshot,
        price_snapshot: lot ? lot.price : deal.price_snapshot,
        ...(message ? { message_to_partner: message } : {}),
      });
      if (error?.code === "23505") {
        return NextResponse.json({ ok: false, error: "Another partner already holds this lot." }, { status: 409 });
      }
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      if (!data) return stale();

      await log("hold_granted", { hold_until: until });
      const opp = deal.opportunity_id ? { id: deal.opportunity_id, error: null } : await createOpportunity(deal);
      if (opp.error) await log("opportunity_failed", { error: opp.error });
      await notify(
        deal,
        "Hold confirmed",
        message ??
          `We've placed ${lotRefOf(deal)} on hold for ${clientName(deal)} until ${new Date(until).toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane" })}. We'll release the lot details shortly.`,
      );
      return NextResponse.json({ ok: true, stage: "hold", opportunity_id: opp.id, opportunity_error: opp.error });
    }

    case "decline":
    case "release": {
      const to: DealStage = action === "decline" ? "declined" : "released";
      if (!canTransition(deal.stage, to)) {
        return NextResponse.json({ ok: false, error: `Can't ${action} a deal that is ${deal.stage}.` }, { status: 409 });
      }
      if (!reason) return NextResponse.json({ ok: false, error: "A reason is required for the record." }, { status: 400 });
      const { data, error } = await moveStage(deal, to, {
        decided_by: auth,
        decision_reason: reason,
        ...(message ? { message_to_partner: message } : {}),
      });
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      if (!data) return stale();
      await log(action === "decline" ? "request_declined" : "hold_released", { reason });
      await notify(
        deal,
        DEAL_STAGE_LABELS[to],
        message ??
          (action === "decline"
            ? `Unfortunately ${lotRefOf(deal)} isn't available for ${clientName(deal)}. Browse the portal for similar stock.`
            : `The hold on ${lotRefOf(deal)} for ${clientName(deal)} has been released.`),
      );
      return NextResponse.json({ ok: true, stage: to });
    }

    case "advance": {
      const to = body.to;
      if (!isDealStage(to) || !["eoi", "unconditional", "settled"].includes(to) || !canTransition(deal.stage, to)) {
        return NextResponse.json({ ok: false, error: `Can't move a ${deal.stage} deal to ${String(to)}.` }, { status: 409 });
      }
      const { data, error } = await moveStage(deal, to, message ? { message_to_partner: message } : {});
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      if (!data) return stale();
      await log("stage_advanced", { from: deal.stage, to });
      await notify(deal, DEAL_STAGE_LABELS[to], message ?? `${lotRefOf(deal)} for ${clientName(deal)} is now: ${DEAL_STAGE_LABELS[to]}.`);
      return NextResponse.json({ ok: true, stage: to });
    }

    case "reveal": {
      if (["requested", "declined", "withdrawn"].includes(deal.stage)) {
        return NextResponse.json(
          { ok: false, error: "Grant the hold before releasing the lot details." },
          { status: 409 },
        );
      }
      const revealed = parseReveal(body.revealed ?? (await lotSupplierForStaff(deal.property_id)));
      if (Object.keys(revealed).length === 0) {
        return NextResponse.json({ ok: false, error: "There are no lot details to release." }, { status: 400 });
      }
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("partner_enquiries")
        .update({ revealed, revealed_at: now, revealed_by: auth, updated_at: now })
        .eq("id", deal.id);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      await log("lot_details_released", { fields: Object.keys(revealed) });
      await notify(deal, "Lot details released", `The builder, estate and lot details for ${lotRefOf(deal)} are now in the portal.`);
      return NextResponse.json({ ok: true, revealed });
    }

    case "message": {
      if (!message) return NextResponse.json({ ok: false, error: "Write a message first." }, { status: 400 });
      const { error } = await supabase
        .from("partner_enquiries")
        .update({ message_to_partner: message, updated_at: new Date().toISOString() })
        .eq("id", deal.id);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      await log("message_sent");
      await notify(deal, "Update from NextKey", message);
      return NextResponse.json({ ok: true });
    }

    case "notes": {
      const notes = typeof body.staff_notes === "string" ? body.staff_notes.slice(0, 5000) : null;
      const { error } = await supabase.from("partner_enquiries").update({ staff_notes: notes }).eq("id", deal.id);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    case "create_opportunity": {
      if (deal.opportunity_id) return NextResponse.json({ ok: true, opportunity_id: deal.opportunity_id });
      const opp = await createOpportunity(deal);
      if (opp.error) return NextResponse.json({ ok: false, error: opp.error }, { status: 502 });
      await log("opportunity_created", { opportunity_id: opp.id });
      return NextResponse.json({ ok: true, opportunity_id: opp.id });
    }

    default:
      return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  }
}
