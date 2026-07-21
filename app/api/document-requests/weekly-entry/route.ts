/**
 * GET /api/document-requests/weekly-entry   (AUTHED)
 *
 * Assembles the body of the weekly YLA calendar entry from every request that
 * has been exported to Drive but not yet included in a submission. The rep
 * pastes this into a Google Calendar entry titled exactly:
 *
 *   COMP-8317 - NEXTKEY- New Leads Weekly
 *
 * and invites programs@yourloanassist.com.au. See yla-weekly-lead-submission.
 *
 * "Submitted to YLA" is tracked separately from the Drive export via
 * yla_submitted_at, so a request appears in exactly one weekly entry. Marking
 * them included is a POST (below).
 *
 *   POST /api/document-requests/weekly-entry   { ids: string[] }
 *     Stamp yla_submitted_at on the given requests so they drop out of the next
 *     weekly entry.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";
import {
  DOCUMENT_REQUESTS_TABLE,
  DOC_MIGRATION_HINT,
  docTableMissing,
} from "../../../../utils/document-requests-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Exactly as YLA specified — do not reformat.
export const CALENDAR_TITLE = "COMP-8317 - NEXTKEY- New Leads Weekly";
const BODY_HEADER = "Add New Leads Below - INCLUDE Google Drive Link - as per example";

function surnameOf(name: string): string {
  const parts = (name || "").trim().split(/\s+/);
  return (parts.length > 1 ? parts[parts.length - 1] : parts[0] || "").toUpperCase();
}

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  // Exported to Drive (has a folder link, status submitted) but not yet stamped
  // as included in a weekly YLA entry.
  const { data, error } = await supabase
    .from(DOCUMENT_REQUESTS_TABLE)
    .select("id,applicant_name,drive_folder_url,submitted_at,yla_submitted_at")
    .eq("status", "submitted")
    .not("drive_folder_url", "is", null)
    .is("yla_submitted_at", null)
    .order("submitted_at", { ascending: true });

  if (error) {
    if (docTableMissing(error)) {
      return NextResponse.json({ ok: false, error: DOC_MIGRATION_HINT }, { status: 503 });
    }
    // yla_submitted_at column may not exist yet (older migration) — surface a
    // clear hint rather than a raw error.
    if (/yla_submitted_at/.test(error.message)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "The yla_submitted_at column is missing — re-apply migrations/20260720_client_document_portal.sql (it now adds this column).",
        },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const rows = data ?? [];
  const lines = rows.map((r) => `${surnameOf(r.applicant_name)} - ${r.drive_folder_url} -`);
  const body = [BODY_HEADER, ...lines].join("\n");

  return NextResponse.json({
    ok: true,
    title: CALENDAR_TITLE,
    invite: "programs@yourloanassist.com.au",
    body,
    count: rows.length,
    requests: rows.map((r) => ({
      id: r.id,
      applicant_name: r.applicant_name,
      drive_folder_url: r.drive_folder_url,
    })),
  });
}

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const ids = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === "string") : [];
  if (ids.length === 0) {
    return NextResponse.json({ ok: false, error: "ids required" }, { status: 400 });
  }

  const { error } = await supabase
    .from(DOCUMENT_REQUESTS_TABLE)
    .update({ yla_submitted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .in("id", ids)
    .is("yla_submitted_at", null);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, marked: ids.length });
}
