/**
 * AML/CTF staff training register. GET lists records; POST adds one; DELETE
 * (?id=…) removes one.
 */

import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";
import { log, errInfo } from "../../../../utils/logger";
import { amlErrMessage, amlTableMissing, amlColumnMissing } from "../../../../utils/aml";

export const dynamic = "force-dynamic";

const MIGRATION_HINT =
  "AML storage isn't set up yet — run migrations/20260715_aml.sql in the Supabase SQL editor.";

const LIST_COLUMNS =
  "id,staff_name,staff_email,module,completed_on,notes,edd_completed_on,edd_outcome,edd_notes,created_by,created_at";

/** Without the employee-due-diligence migration. */
const LIST_COLUMNS_BASE = "id,staff_name,staff_email,module,completed_on,notes,created_by,created_at";

/** Columns added by migrations/20260730_aml_staff_due_diligence.sql. */
const EDD_COLUMNS = ["edd_completed_on", "edd_outcome", "edd_notes"] as const;

/** GET — training records, newest completion first. */
export async function GET(req: Request): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const select = (columns: string) =>
      supabase
        .from("aml_training")
        .select(columns)
        .order("completed_on", { ascending: false, nullsFirst: false })
        .limit(500);

    // The due-diligence columns may not be migrated yet — fall back rather than
    // break the whole register (same pattern as the ongoing-CDD columns).
    const first = await select(LIST_COLUMNS);
    const result =
      first.error && amlColumnMissing(first.error) ? await select(LIST_COLUMNS_BASE) : first;
    const rows = result.data as unknown[] | null;
    const error = result.error;
    if (error) {
      if (amlTableMissing(error)) return NextResponse.json({ ok: true, training: [] });
      throw error;
    }
    return NextResponse.json({ ok: true, training: rows ?? [] });
  } catch (e) {
    log.error("aml_training.list_failed", { detail: amlErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: amlErrMessage(e, "List failed") }, { status: 500 });
  }
}

/** POST — add a training record. Body: { staffName, staffEmail?, module?, completedOn?, notes? }. */
export async function POST(req: Request): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const b = (await req.json().catch(() => ({}))) as {
      staffName?: string;
      staffEmail?: string;
      module?: string;
      completedOn?: string;
      notes?: string;
      eddCompletedOn?: string;
      eddOutcome?: string;
      eddNotes?: string;
    };
    if (!b.staffName) return NextResponse.json({ ok: false, error: "staffName is required" }, { status: 400 });
    const str = (v: unknown) => (typeof v === "string" && v ? v : null);
    const row = {
      staff_name: b.staffName,
      staff_email: str(b.staffEmail),
      module: str(b.module) ?? "AML/CTF awareness",
      completed_on: str(b.completedOn),
      notes: str(b.notes),
      edd_completed_on: str(b.eddCompletedOn),
      edd_outcome: str(b.eddOutcome),
      edd_notes: str(b.eddNotes),
      created_by: auth,
    };
    let { data: inserted, error } = await supabase.from("aml_training").insert(row).select("id").single();
    if (error && amlColumnMissing(error)) {
      const trimmed = { ...row } as Record<string, unknown>;
      for (const c of EDD_COLUMNS) delete trimmed[c];
      log.warn("aml_training.edd_columns_absent", { columns: EDD_COLUMNS.join(",") });
      ({ data: inserted, error } = await supabase.from("aml_training").insert(trimmed).select("id").single());
    }
    if (error) {
      if (amlTableMissing(error)) return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 501 });
      throw error;
    }
    return NextResponse.json({ ok: true, id: (inserted as { id: string }).id });
  } catch (e) {
    log.error("aml_training.create_failed", { detail: amlErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: amlErrMessage(e, "Create failed") }, { status: 500 });
  }
}

/** DELETE — remove a training record (?id=…). */
export async function DELETE(req: Request): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
  try {
    const { error } = await supabase.from("aml_training").delete().eq("id", id);
    if (error) {
      if (amlTableMissing(error)) return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 501 });
      throw error;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("aml_training.delete_failed", { detail: amlErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: amlErrMessage(e, "Delete failed") }, { status: 500 });
  }
}
