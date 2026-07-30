/**
 * One AUSTRAC report — GET, PATCH (edit / mark ready / lodge), DELETE.
 * A LODGED report is immutable: it can't be edited or deleted (record-keeping),
 * only read. Marking a report `lodged` stamps lodged_at and requires the AUSTRAC
 * reference. Editing the trigger date recomputes the statutory due date.
 */

import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { requireAuth } from "../../../../../utils/cf-access";
import { log, errInfo } from "../../../../../utils/logger";
import {
  reportDueDate,
  amlErrMessage,
  amlTableMissing,
  canViewConfidentialReport,
  hydrateProgram,
  emptyProgram,
  REPORT_STATUSES,
  type ReportType,
} from "../../../../../utils/aml";

export const dynamic = "force-dynamic";

const MIGRATION_HINT =
  "AML storage isn't set up yet — run migrations/20260715_aml.sql in the Supabase SQL editor.";

type ParamsCtx = { params: Promise<{ id: string }> };

/**
 * Tipping-off gate. A filtered list is worthless if the row is still fetchable
 * by id, so every verb on a confidential report goes through here. Fails CLOSED:
 * if the program can't be read, the allow-list is empty and only the lodger gets
 * through.
 *
 * Returns 404 rather than 403 on purpose — "you may not see this SMR" and "this
 * SMR exists" are the same disclosure, and the second one is the offence.
 */
async function guardConfidential(
  viewer: string,
  row: { confidential?: boolean; created_by?: string | null } | null,
): Promise<NextResponse | null> {
  if (!row?.confidential) return null;
  let program = emptyProgram();
  try {
    const { data, error } = await supabase
      .from("aml_program")
      .select("data")
      .eq("org", "nextkey")
      .maybeSingle();
    if (!error) program = hydrateProgram((data as { data?: unknown } | null)?.data);
  } catch {
    /* keep the empty program — fail closed */
  }
  if (canViewConfidentialReport(viewer, program, row.created_by)) return null;
  return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
}

/** GET — one report, including its `data` narrative. */
export async function GET(req: Request, { params }: ParamsCtx): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const { data, error } = await supabase.from("aml_reports").select("*").eq("id", id).maybeSingle();
    if (error) {
      if (amlTableMissing(error)) return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 501 });
      throw error;
    }
    if (!data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    const denied = await guardConfidential(auth, data as { confidential?: boolean; created_by?: string | null });
    if (denied) return denied;
    return NextResponse.json({ ok: true, report: data });
  } catch (e) {
    log.error("aml_reports.get_failed", { detail: amlErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: amlErrMessage(e, "Load failed") }, { status: 500 });
  }
}

/** PATCH — edit a report or change its status. Lodged reports are locked (409). */
export async function PATCH(req: Request, { params }: ParamsCtx): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const b = (await req.json().catch(() => ({}))) as {
      status?: string;
      subjectName?: string;
      triggerDate?: string;
      terrorismRelated?: boolean;
      austracReference?: string;
      data?: unknown;
    };

    const { data: current, error: fetchErr } = await supabase
      .from("aml_reports")
      .select("status,report_type,trigger_date,terrorism_related,confidential,created_by")
      .eq("id", id)
      .maybeSingle();
    if (fetchErr) {
      if (amlTableMissing(fetchErr)) return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 501 });
      throw fetchErr;
    }
    if (!current) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    {
      const denied = await guardConfidential(auth, current as { confidential?: boolean; created_by?: string | null });
      if (denied) return denied;
    }
    const cur = current as { status: string; report_type: ReportType; trigger_date: string; terrorism_related: boolean };
    if (cur.status === "lodged") {
      return NextResponse.json({ ok: false, error: "A lodged report can't be edited (record-keeping)." }, { status: 409 });
    }

    const patch: Record<string, unknown> = { updated_by: auth };
    if (typeof b.subjectName === "string") patch.subject_name = b.subjectName || null;
    if (b.data !== undefined) patch.data = b.data && typeof b.data === "object" ? b.data : {};
    if (typeof b.austracReference === "string") patch.austrac_reference = b.austracReference || null;

    // Recompute the due date if the trigger date or terrorism flag changed.
    const triggerDate = typeof b.triggerDate === "string" && b.triggerDate ? b.triggerDate : cur.trigger_date;
    const terrorism =
      cur.report_type === "SMR"
        ? typeof b.terrorismRelated === "boolean"
          ? b.terrorismRelated
          : cur.terrorism_related
        : false;
    if (triggerDate !== cur.trigger_date || terrorism !== cur.terrorism_related) {
      patch.trigger_date = triggerDate;
      patch.terrorism_related = terrorism;
      patch.due_date = reportDueDate(cur.report_type, triggerDate, terrorism);
    }

    if (typeof b.status === "string" && (REPORT_STATUSES as readonly string[]).includes(b.status)) {
      patch.status = b.status;
      if (b.status === "lodged") {
        const ref = typeof b.austracReference === "string" ? b.austracReference : "";
        if (!ref) {
          return NextResponse.json(
            { ok: false, error: "An AUSTRAC reference is required to mark a report lodged." },
            { status: 400 },
          );
        }
        patch.austrac_reference = ref;
        patch.lodged_at = new Date().toISOString();
      }
    }

    const { error } = await supabase.from("aml_reports").update(patch).eq("id", id);
    if (error) {
      if (amlTableMissing(error)) return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 501 });
      throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("aml_reports.update_failed", { detail: amlErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: amlErrMessage(e, "Save failed") }, { status: 500 });
  }
}

/** DELETE — remove a draft/ready report. Lodged reports can't be deleted. */
export async function DELETE(req: Request, { params }: ParamsCtx): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const { data: current, error: fetchErr } = await supabase
      .from("aml_reports")
      .select("status,confidential,created_by")
      .eq("id", id)
      .maybeSingle();
    if (fetchErr) {
      if (amlTableMissing(fetchErr)) return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 501 });
      throw fetchErr;
    }
    if (!current) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    {
      const denied = await guardConfidential(auth, current as { confidential?: boolean; created_by?: string | null });
      if (denied) return denied;
    }
    if ((current as { status: string }).status === "lodged") {
      return NextResponse.json({ ok: false, error: "A lodged report can't be deleted (record-keeping)." }, { status: 409 });
    }
    const { error } = await supabase.from("aml_reports").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("aml_reports.delete_failed", { detail: amlErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: amlErrMessage(e, "Delete failed") }, { status: 500 });
  }
}
