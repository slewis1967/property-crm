import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { requireAuth } from "../../../../../utils/cf-access";
import { log, errInfo } from "../../../../../utils/logger";

export const dynamic = "force-dynamic";

/** GET — load one saved report (for reopening). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const { data, error } = await supabase
      .from("feasibility_reports")
      .select("id,address,report,transcript")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({
      ok: true,
      id: data.id,
      address: data.address,
      report: data.report,
      transcript: data.transcript ?? [],
    });
  } catch (e) {
    log.error("feasibility_reports.get_failed", { ...errInfo(e) });
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Load failed" },
      { status: 500 },
    );
  }
}

/** DELETE — remove a saved report. */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const { id } = await params;
    const { error } = await supabase.from("feasibility_reports").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("feasibility_reports.delete_failed", { ...errInfo(e) });
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Delete failed" },
      { status: 500 },
    );
  }
}
