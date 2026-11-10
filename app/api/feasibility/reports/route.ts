import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";
import { log, errInfo } from "../../../../utils/logger";

export const dynamic = "force-dynamic";

/** Human message from an Error or a Supabase PostgrestError (plain object). */
function errMessage(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  const o = e as { message?: string; details?: string; hint?: string; code?: string } | null;
  return o?.message || o?.details || o?.hint || o?.code || fallback;
}

/** True when the failure is just "table not created yet" (migration not run).
 * Covers both direct Postgres (42P01) and PostgREST's schema-cache miss
 * (PGRST205 → "Could not find the table … in the schema cache"). */
function tableMissing(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  const msg = (e?.message ?? "").toLowerCase();
  return (
    e?.code === "42P01" ||
    e?.code === "PGRST205" ||
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("could not find the table")
  );
}

/** POST — save a generated feasibility report. */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const report = body?.report;
    if (!report || typeof report !== "object") {
      return NextResponse.json({ ok: false, error: "report required" }, { status: 400 });
    }
    const r = report as Record<string, unknown>;
    const row = {
      address: typeof body?.address === "string" ? body.address : null,
      property_id:
        typeof body?.property_id === "string" && body.property_id ? body.property_id : null,
      title: typeof r.title === "string" ? r.title : null,
      subtitle: typeof r.subtitle === "string" ? r.subtitle : null,
      report,
      transcript: Array.isArray(body?.transcript) ? body.transcript : [],
      created_by: auth,
    };

    const { data, error } = await supabase
      .from("feasibility_reports")
      .insert(row)
      .select("id")
      .single();

    if (error) {
      if (tableMissing(error)) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "Saved-reports storage isn't set up yet — run migrations/20260701_feasibility_reports.sql in the Supabase SQL editor.",
          },
          { status: 501 },
        );
      }
      throw error;
    }
    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    log.error("feasibility_reports.save_failed", { detail: errMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: errMessage(e, "Save failed") }, { status: 500 });
  }
}

/** GET — list saved reports (optionally filtered by ?property_id=). */
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const propertyId = new URL(req.url).searchParams.get("property_id");
    let query = supabase
      .from("feasibility_reports")
      .select("id,address,title,subtitle,created_by,created_at,property_id")
      .order("created_at", { ascending: false })
      .limit(100);
    if (propertyId) query = query.eq("property_id", propertyId);

    const { data, error } = await query;
    if (error) {
      // Before the migration runs, just report an empty list so the UI is calm.
      if (tableMissing(error)) return NextResponse.json({ ok: true, reports: [] });
      throw error;
    }
    return NextResponse.json({ ok: true, reports: data ?? [] });
  } catch (e) {
    log.error("feasibility_reports.list_failed", { detail: errMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: errMessage(e, "List failed") }, { status: 500 });
  }
}
