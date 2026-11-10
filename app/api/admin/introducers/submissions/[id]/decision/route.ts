/**
 * POST /api/admin/introducers/submissions/<id>/decision
 *   Body: { action: "accept" | "decline" | "withdraw", reason?, message_to_introducer? }
 *
 * SUPER ADMIN. The gate between a third party's form post and our CRM.
 *
 * Nothing an introducer submits creates a contact, an opportunity, or fires any
 * automation until this route accepts it. That is the whole reason referrals sit
 * in their own tables: unvetted external data must not enter the lead pipeline,
 * distort lead reporting, or trigger outbound to someone we haven't verified
 * consented to hear from.
 *
 * ACCEPT creates the opportunity in NEXUS, exactly as the lead-intake promote
 * flow does, and stamps the id back so the referral and the opportunity are
 * linked in both directions. If NEXUS is unreachable we do NOT mark the referral
 * accepted — a referral that says "accepted" with no opportunity behind it is
 * worse than one still sitting in the queue, because nobody goes looking for it.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../../../utils/supabase";
import { nexusApi } from "@/utils/nexus-api";
import { requireSuperAdmin, readJson } from "../../../_shared";
import { logIntroducerEvent } from "../../../../../introducer/_shared";
import { displayName, normaliseAuPhone } from "../../../../../../../utils/introducer";
import { sendReferralUpdateEmail } from "../../../../../../../utils/introducer-email";

export const dynamic = "force-dynamic";

const DECIDABLE = new Set(["submitted", "info_requested"]);

type Decision = "accept" | "decline" | "withdraw";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const action = body.action as Decision;
  if (action !== "accept" && action !== "decline" && action !== "withdraw") {
    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  }

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if ((action === "decline" || action === "withdraw") && !reason) {
    return NextResponse.json(
      { ok: false, error: "A reason is required so the record shows why this didn't proceed." },
      { status: 400 },
    );
  }

  const { data: client, error } = await supabase
    .from("introducer_clients")
    .select("*, introducers(firm_name,contact_email,contact_name)")
    .eq("id", id)
    .maybeSingle();

  if (error || !client) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  const record = client as Record<string, unknown>;
  const status = String(record.status ?? "");
  if (!DECIDABLE.has(status)) {
    return NextResponse.json(
      { ok: false, error: `This referral is ${status} — there's nothing to decide.` },
      { status: 409 },
    );
  }

  const firmRaw = record.introducers;
  const firm = (Array.isArray(firmRaw) ? firmRaw[0] : firmRaw) as
    | { firm_name?: string; contact_email?: string; contact_name?: string }
    | undefined;

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    decided_at: now,
    decided_by: auth,
    decision_reason: reason || null,
    updated_at: now,
  };
  if (typeof body.message_to_introducer === "string") {
    patch.message_to_introducer = body.message_to_introducer.trim() || null;
  }

  let opportunityId: string | null = null;

  if (action === "accept") {
    // Create the opportunity FIRST. If this fails, the referral stays in the
    // queue and the queue stays truthful.
    const phone = String(record.phone ?? "");
    const oppBody: Record<string, unknown> = {
      full_name: displayName(record as { first_name?: string; last_name?: string }),
      email: String(record.email ?? ""),
      phone: normaliseAuPhone(phone) ?? phone,
      // Tagged at the source so introducer-originated business is separable in
      // every downstream report without anyone having to remember to tag it.
      source: `introducer:${firm?.firm_name ?? "unknown"}`,
      state: record.state ?? null,
    };
    if (typeof body.pipeline_id === "string" && body.pipeline_id) oppBody.pipeline_id = body.pipeline_id;
    if (typeof body.stage === "string" && body.stage) oppBody.ghl_stage = body.stage;

    try {
      const res = await nexusApi("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(oppBody),
      });
      const raw = await res.text();
      let opp: Record<string, unknown> = {};
      try {
        opp = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return NextResponse.json(
          { ok: false, error: "NEXUS is unreachable — the referral has NOT been accepted. Try again shortly." },
          { status: 503 },
        );
      }
      if (!res.ok) {
        const e = typeof opp.error === "string" ? opp.error : "NEXUS rejected the opportunity.";
        return NextResponse.json({ ok: false, error: `${e} The referral has NOT been accepted.` }, { status: 502 });
      }
      const nested = opp.lead as Record<string, unknown> | undefined;
      opportunityId = String(opp.id ?? opp.lead_id ?? nested?.id ?? "") || null;
    } catch (e) {
      return NextResponse.json(
        {
          ok: false,
          error: `${e instanceof Error ? e.message : "NEXUS error"} — the referral has NOT been accepted.`,
        },
        { status: 503 },
      );
    }

    patch.status = "accepted";
    patch.stage = "accepted";
    patch.stage_updated_at = now;
    patch.opportunity_id = opportunityId;
  } else {
    patch.status = action === "decline" ? "declined" : "withdrawn";
    patch.stage = "not_proceeding";
    patch.stage_updated_at = now;
  }

  const { data: updated, error: updErr } = await supabase
    .from("introducer_clients")
    .update(patch)
    .eq("id", id)
    .in("status", [...DECIDABLE])     // no double-decision if two tabs are open
    .select("id,client_ref,status,introducer_id,first_name,last_name,opportunity_id")
    .single();

  if (updErr || !updated) {
    // The opportunity may already exist at this point. Say so plainly rather
    // than leaving a mystery record in NEXUS with nothing pointing at it.
    return NextResponse.json(
      {
        ok: false,
        error: opportunityId
          ? `The opportunity was created (${opportunityId}) but the referral could not be marked accepted. Link it manually.`
          : "Could not record the decision. Please try again.",
      },
      { status: 500 },
    );
  }

  // Any open information request is moot once a decision is made — leaving one
  // open would keep telling the introducer we're waiting on them.
  await supabase
    .from("introducer_info_requests")
    .update({ status: "cancelled", cancelled_at: now })
    .eq("client_id", id)
    .eq("status", "open");

  await logIntroducerEvent({
    clientId: id,
    introducerId: updated.introducer_id,
    actorType: "super_admin",
    actor: auth,
    action: action === "accept" ? "accepted" : action === "decline" ? "declined" : "withdrawn",
    detail: { reason: reason || null, opportunity_id: opportunityId },
  });

  // Tell the introducer. Best-effort — the portal already shows the outcome.
  const to = firm?.contact_email;
  if (to) {
    const clientName = displayName(updated);
    const copy =
      action === "accept"
        ? {
            headline: "Referral accepted",
            body:
              (typeof patch.message_to_introducer === "string" && patch.message_to_introducer) ||
              "We've accepted this referral and will be in touch with your client shortly. You can follow progress in the portal.",
          }
        : {
            headline: action === "decline" ? "Referral not proceeding" : "Referral withdrawn",
            body:
              (typeof patch.message_to_introducer === "string" && patch.message_to_introducer) ||
              "Thanks for the referral — unfortunately we're not able to take this one forward.",
          };
    void sendReferralUpdateEmail({
      to,
      name: firm?.contact_name ?? null,
      clientRef: String(updated.client_ref ?? ""),
      clientName,
      clientId: id,
      ...copy,
    }).catch((e) => console.error("[introducer] decision email failed", e));
  }

  return NextResponse.json({ ok: true, status: updated.status, opportunity_id: opportunityId });
}
