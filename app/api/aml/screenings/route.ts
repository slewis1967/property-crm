/**
 * Screening runs — sanctions / PEP / adverse-media checks against a party or a
 * beneficial owner of a CDD case.
 *
 * POST records one screening run: it calls the configured provider
 * (utils/aml-provider.ts — First AML when keyed) or, when no provider is
 * configured, accepts a MANUAL result the compliance officer entered after
 * running the checks themselves. Either way it writes an aml_screenings row and
 * folds the outcome back into the parent case: the case's screening_status is
 * updated, and a confirmed match escalates the case to "Blocked" (cease to act +
 * consider an SMR) while a potential match moves it to "Enhanced DD".
 *
 * GET lists the screening history for one case (newest first).
 */

import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";
import { log, errInfo } from "../../../../utils/logger";
import { recordAudit } from "../../../../utils/compliance-audit";
import {
  hydrateAmlCase,
  amlErrMessage,
  amlTableMissing,
  ALL_SCREENING_LIST_CODES,
  SCREENING_RESULTS,
  type ScreeningListCode,
  type ScreeningResult,
} from "../../../../utils/aml";
import { amlProvider, type ScreeningMatch } from "../../../../utils/aml-provider";

export const dynamic = "force-dynamic";

const MIGRATION_HINT =
  "AML storage isn't set up yet — run migrations/20260715_aml.sql in the Supabase SQL editor.";

const LIST_COLUMNS =
  "id,case_id,subject_name,subject_kind,provider,reference,result,lists,matches,screened_by,screened_at";

/** GET — screening runs for a case (?caseId=…), newest first. */
export async function GET(req: Request): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const caseId = new URL(req.url).searchParams.get("caseId");
  if (!caseId) return NextResponse.json({ ok: false, error: "caseId is required" }, { status: 400 });
  try {
    const { data, error } = await supabase
      .from("aml_screenings")
      .select(LIST_COLUMNS)
      .eq("case_id", caseId)
      .order("screened_at", { ascending: false })
      .limit(500);
    if (error) {
      if (amlTableMissing(error)) return NextResponse.json({ ok: true, screenings: [] });
      throw error;
    }
    return NextResponse.json({ ok: true, screenings: data ?? [] });
  } catch (e) {
    log.error("aml_screenings.list_failed", { detail: amlErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: amlErrMessage(e, "List failed") }, { status: 500 });
  }
}

/** Fold a screening outcome into the parent case's status + screening summary. */
async function applyToCase(
  caseId: string,
  result: ScreeningResult,
  lists: ScreeningListCode[],
  auth: string,
): Promise<void> {
  const { data: current, error } = await supabase
    .from("aml_cases")
    .select("status,data")
    .eq("id", caseId)
    .maybeSingle();
  if (error || !current) return; // best-effort — the screening row is already saved
  const row = current as { status: string; data: unknown };
  const data = hydrateAmlCase(row.data);
  data.screening = { status: result, lastScreenedAt: new Date().toISOString(), lists };

  // Escalate status on an adverse outcome (unless already resolved/locked).
  let status = row.status;
  if (result === "confirmed_match") status = "Blocked";
  else if (result === "potential_match" && status !== "Blocked" && status !== "Cleared") status = "Enhanced DD";

  await supabase
    .from("aml_cases")
    .update({ data, screening_status: result, status, updated_by: auth })
    .eq("id", caseId);
  await recordAudit({
    docType: "aml_case",
    docId: caseId,
    action: "update",
    changedBy: auth,
    statusAfter: status,
    note: `screening: ${result}`,
  });
}

/**
 * POST — run/record a screening.
 * Body: { caseId, subjectName, subjectKind?, lists?, result?, matches? }.
 * When a live provider is configured it is called; otherwise `result` (a manual
 * outcome) is required.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const b = (await req.json().catch(() => ({}))) as {
      caseId?: string;
      subjectName?: string;
      subjectKind?: string;
      lists?: unknown;
      result?: string;
      matches?: unknown;
    };
    if (!b.caseId || !b.subjectName) {
      return NextResponse.json({ ok: false, error: "caseId and subjectName are required" }, { status: 400 });
    }

    const lists: ScreeningListCode[] = Array.isArray(b.lists)
      ? (b.lists.filter((c): c is ScreeningListCode =>
          ALL_SCREENING_LIST_CODES.includes(c as ScreeningListCode)) as ScreeningListCode[])
      : ALL_SCREENING_LIST_CODES;
    const subjectKind = b.subjectKind === "beneficial_owner" ? "beneficial_owner" : "party";

    const provider = amlProvider();
    let result: ScreeningResult;
    let matches: ScreeningMatch[] = [];
    let reference = "";
    let providerId = provider.id;

    if (provider.live) {
      const res = await provider.screen({ name: b.subjectName, lists });
      if (!res.ok) return NextResponse.json({ ok: false, error: res.error }, { status: 502 });
      result = res.result;
      matches = res.matches;
      reference = res.reference;
    } else {
      // Manual mode: the officer supplies the outcome they determined.
      if (!b.result || !(SCREENING_RESULTS as readonly string[]).includes(b.result)) {
        return NextResponse.json(
          { ok: false, error: "No screening provider configured — supply a manual `result`." },
          { status: 400 },
        );
      }
      result = b.result as ScreeningResult;
      providerId = "manual";
      if (Array.isArray(b.matches)) matches = b.matches as ScreeningMatch[];
    }

    const { data: inserted, error } = await supabase
      .from("aml_screenings")
      .insert({
        case_id: b.caseId,
        subject_name: b.subjectName,
        subject_kind: subjectKind,
        provider: providerId,
        reference,
        result,
        lists,
        matches,
        screened_by: auth,
      })
      .select("id")
      .single();
    if (error) {
      if (amlTableMissing(error)) return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 501 });
      throw error;
    }

    await applyToCase(b.caseId, result, lists, auth);

    return NextResponse.json({ ok: true, id: (inserted as { id: string }).id, result, matches });
  } catch (e) {
    log.error("aml_screenings.create_failed", { detail: amlErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: amlErrMessage(e, "Screening failed") }, { status: 500 });
  }
}
