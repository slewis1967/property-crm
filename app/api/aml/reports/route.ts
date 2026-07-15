/**
 * AUSTRAC reports — SMR (suspicious matter), TTR (threshold cash ≥ $10k) and
 * IFTI (international funds transfer). GET lists them (newest first); POST
 * creates one, computing the statutory due date from the trigger date and
 * flagging SMRs confidential (the tipping-off offence).
 */

import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";
import { log, errInfo } from "../../../../utils/logger";
import {
  reportDueDate,
  reportTypeMeta,
  amlErrMessage,
  amlTableMissing,
  REPORT_TYPES,
  type ReportType,
} from "../../../../utils/aml";

export const dynamic = "force-dynamic";

const MIGRATION_HINT =
  "AML storage isn't set up yet — run migrations/20260715_aml.sql in the Supabase SQL editor.";

const LIST_COLUMNS =
  "id,report_type,status,case_id,deal_id,subject_name,trigger_date,due_date,terrorism_related,confidential,austrac_reference,lodged_at,created_by,created_at,updated_at";

const REPORT_CODES = REPORT_TYPES.map((r) => r.code);

/** GET — all reports, newest first (no `data` narrative blob). */
export async function GET(req: Request): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const { data, error } = await supabase
      .from("aml_reports")
      .select(LIST_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) {
      if (amlTableMissing(error)) return NextResponse.json({ ok: true, reports: [] });
      throw error;
    }
    return NextResponse.json({ ok: true, reports: data ?? [] });
  } catch (e) {
    log.error("aml_reports.list_failed", { detail: amlErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: amlErrMessage(e, "List failed") }, { status: 500 });
  }
}

/** POST — create a report. Body: { reportType, triggerDate, terrorismRelated?, caseId?, dealId?, subjectName?, data? }. */
export async function POST(req: Request): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const b = (await req.json().catch(() => ({}))) as {
      reportType?: string;
      triggerDate?: string;
      terrorismRelated?: boolean;
      caseId?: string;
      dealId?: string;
      subjectName?: string;
      data?: unknown;
    };
    if (!b.reportType || !(REPORT_CODES as readonly string[]).includes(b.reportType)) {
      return NextResponse.json({ ok: false, error: "Valid reportType (SMR|TTR|IFTI) is required" }, { status: 400 });
    }
    const reportType = b.reportType as ReportType;
    const meta = reportTypeMeta(reportType);
    const str = (v: unknown) => (typeof v === "string" && v ? v : null);
    const triggerDate = str(b.triggerDate) ?? new Date().toISOString().slice(0, 10);
    const terrorismRelated = reportType === "SMR" && b.terrorismRelated === true;
    const dueDate = reportDueDate(reportType, triggerDate, terrorismRelated);

    const row = {
      report_type: reportType,
      status: "draft",
      case_id: str(b.caseId),
      deal_id: str(b.dealId),
      subject_name: str(b.subjectName),
      trigger_date: triggerDate,
      due_date: dueDate,
      terrorism_related: terrorismRelated,
      confidential: meta.confidential,
      data: b.data && typeof b.data === "object" ? b.data : {},
      created_by: auth,
    };

    const { data: inserted, error } = await supabase.from("aml_reports").insert(row).select("id").single();
    if (error) {
      if (amlTableMissing(error)) return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 501 });
      throw error;
    }
    return NextResponse.json({ ok: true, id: (inserted as { id: string }).id, dueDate });
  } catch (e) {
    log.error("aml_reports.create_failed", { detail: amlErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: amlErrMessage(e, "Create failed") }, { status: 500 });
  }
}
