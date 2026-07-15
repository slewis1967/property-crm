/**
 * AML/CTF program — the single organisation-wide governance record: AUSTRAC
 * enrolment, appointed compliance officer, program approval, and the enterprise
 * risk assessment. GET reads the singleton (org='nextkey'); PUT upserts it.
 */

import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";
import { log, errInfo } from "../../../../utils/logger";
import { hydrateProgram, emptyProgram, amlErrMessage, amlTableMissing } from "../../../../utils/aml";

export const dynamic = "force-dynamic";

const ORG = "nextkey";
const MIGRATION_HINT =
  "AML storage isn't set up yet — run migrations/20260715_aml.sql in the Supabase SQL editor.";

/** GET — the program record (a blank program when none saved yet). */
export async function GET(req: Request): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const { data, error } = await supabase.from("aml_program").select("data,updated_by,updated_at").eq("org", ORG).maybeSingle();
    if (error) {
      if (amlTableMissing(error)) return NextResponse.json({ ok: true, program: emptyProgram(), updatedAt: null });
      throw error;
    }
    const row = data as { data?: unknown; updated_at?: string } | null;
    return NextResponse.json({
      ok: true,
      program: hydrateProgram(row?.data),
      updatedAt: row?.updated_at ?? null,
    });
  } catch (e) {
    log.error("aml_program.get_failed", { detail: amlErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: amlErrMessage(e, "Load failed") }, { status: 500 });
  }
}

/** PUT — save the program. Body: { data: AmlProgramData }. */
export async function PUT(req: Request): Promise<NextResponse> {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const b = (await req.json().catch(() => ({}))) as { data?: unknown };
    const program = hydrateProgram(b.data);
    const { error } = await supabase
      .from("aml_program")
      .upsert({ org: ORG, data: program, updated_by: auth }, { onConflict: "org" });
    if (error) {
      if (amlTableMissing(error)) return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 501 });
      throw error;
    }
    return NextResponse.json({ ok: true, program });
  } catch (e) {
    log.error("aml_program.save_failed", { detail: amlErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: amlErrMessage(e, "Save failed") }, { status: 500 });
  }
}
