/**
 * POST /api/eois/[id]/start-cdd — the AML tie-in.
 *
 * Creates an AML CDD case (aml_cases) prepopulated from the EOI's buyer data and
 * links it back onto the EOI (aml_case_id), so the driver's licence collected at
 * signing doubles as the identity document for Customer Due Diligence. Idempotent:
 * if the EOI already has a linked case, returns that one.
 */

import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { requireAuth } from "../../../../../utils/cf-access";
import { log, errInfo } from "../../../../../utils/logger";
import { recordAudit } from "../../../../../utils/compliance-audit";
import { hydrateEoi, eoiErrMessage, eoisTableMissing } from "../../../../../utils/eoi";
import { emptyAmlCase, partySummary, deriveRiskRating, type PartyType, type AmlCaseData } from "../../../../../utils/aml";

export const dynamic = "force-dynamic";

const MIGRATION_HINT =
  "AML storage isn't set up yet — run migrations/20260715_aml.sql in the Supabase SQL editor.";

/** Infer the AML party type from the EOI's purchasing entity + SMSF flag. */
function inferPartyType(entity: string, smsf: boolean | null): PartyType {
  const e = entity.toLowerCase();
  if (smsf === true || e.includes("smsf") || e.includes("super")) return "smsf";
  if (e.includes("trust")) return "trust";
  if (entity.trim()) return "company";
  return "individual";
}

/** Map the EOI buyer block onto a fresh CDD case blob. */
function cddFromEoi(eoi: ReturnType<typeof hydrateEoi>): AmlCaseData {
  const partyType = inferPartyType(eoi.purchasingEntity, eoi.smsfPurchase);
  const data = emptyAmlCase(partyType);
  const primary = eoi.buyers.find((b) => b.fullName.trim());

  data.partyRole = "buyer";
  if (primary) {
    data.entity.fullLegalName = primary.fullName.trim();
    data.entity.residentialAddress.line1 = eoi.buyerAddress;
  }
  if (partyType === "company") {
    data.entity.companyName = eoi.purchasingEntity;
    data.entity.acnAbn = eoi.acnAbn;
  } else if (partyType === "trust") {
    data.entity.trustName = eoi.purchasingEntity;
  } else if (partyType === "smsf") {
    data.entity.fundName = eoi.purchasingEntity;
  }
  // For a non-individual, the buyers are the beneficial owners / members.
  if (partyType !== "individual") {
    data.beneficialOwners = eoi.buyers
      .filter((b) => b.fullName.trim())
      .map((b) => ({ fullLegalName: b.fullName.trim(), dob: "", ownershipPercent: null, role: "", verified: false }));
  }
  data.riskRating = deriveRiskRating(data);
  return data;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const { data: eoiRow, error: eoiErr } = await supabase
      .from("eois")
      .select("id,contact_id,deal_id,aml_case_id,data")
      .eq("id", id)
      .maybeSingle();
    if (eoiErr) {
      if (eoisTableMissing(eoiErr)) return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 501 });
      throw eoiErr;
    }
    if (!eoiRow) return NextResponse.json({ ok: false, error: "EOI not found" }, { status: 404 });

    const row = eoiRow as { id: string; contact_id: string | null; deal_id: string | null; aml_case_id: string | null; data: unknown };
    if (row.aml_case_id) return NextResponse.json({ ok: true, amlCaseId: row.aml_case_id, existing: true });

    const eoi = hydrateEoi(row.data);
    const data = cddFromEoi(eoi);

    const { data: inserted, error: insErr } = await supabase
      .from("aml_cases")
      .insert({
        party_name: partySummary(data) || null,
        party_type: data.partyType,
        party_role: "buyer",
        status: "Draft",
        risk_rating: data.riskRating,
        screening_status: data.screening.status,
        contact_id: row.contact_id,
        deal_id: row.deal_id,
        data,
        created_by: auth,
      })
      .select("id")
      .single();
    if (insErr) {
      // aml_cases missing → guide to that migration specifically.
      const e = insErr as { code?: string };
      if (e.code === "42P01" || e.code === "PGRST205") return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 501 });
      throw insErr;
    }
    const amlCaseId = (inserted as { id: string }).id;

    await recordAudit({
      docType: "aml_case",
      docId: amlCaseId,
      action: "create",
      changedBy: auth,
      statusAfter: "Draft",
      note: `Created from EOI ${id}`,
      snapshot: data,
    });
    await supabase.from("eois").update({ aml_case_id: amlCaseId, updated_by: auth }).eq("id", id);

    return NextResponse.json({ ok: true, amlCaseId });
  } catch (e) {
    log.error("eois.start_cdd_failed", { detail: eoiErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: eoiErrMessage(e, "Could not start CDD") }, { status: 500 });
  }
}
