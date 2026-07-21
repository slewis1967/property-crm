/**
 * POST /api/document-requests/<id>/export   (AUTHED)
 *
 * Push a client's collected documents into Google Drive: one folder per
 * submission, named so YLA can identify it, containing every accepted file with
 * the YLA-compliant name we generated. Returns the shareable folder link and
 * records it on the request, then marks the request 'submitted'.
 *
 * This is the actual handoff. The rep runs it once the completeness view shows
 * the set is ready, then pastes the folder link into the Thursday calendar
 * entry (see yla-weekly-lead-submission).
 *
 * Guarded: refuses to export an incomplete set unless ?force=1, so a half-
 * finished submission doesn't reach YLA and burn a week on a partial reject.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { requireAuth } from "../../../../../utils/cf-access";
import { requiredSlots } from "../../../../../utils/yla-documents";
import { exportToDrive } from "../../../../../utils/google-drive";
import {
  DOCUMENT_REQUESTS_TABLE,
  DOC_MIGRATION_HINT,
  docTableMissing,
} from "../../../../../utils/document-requests-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "client-documents";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const force = new URL(req.url).searchParams.get("force") === "1";

  const { data: request, error: reqErr } = await supabase
    .from(DOCUMENT_REQUESTS_TABLE)
    .select("id,applicant_name,applicant_count,status,drive_folder_url")
    .eq("id", id)
    .maybeSingle();

  if (reqErr) {
    if (docTableMissing(reqErr)) {
      return NextResponse.json({ ok: false, error: DOC_MIGRATION_HINT }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: reqErr.message }, { status: 500 });
  }
  if (!request) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  if (request.status === "submitted" && request.drive_folder_url) {
    return NextResponse.json(
      { ok: false, error: "Already exported to Drive.", folder_url: request.drive_folder_url },
      { status: 409 },
    );
  }

  const { data: docs, error: docErr } = await supabase
    .from("client_documents")
    .select("id,doc_type,applicant_index,filename,storage_path,mime_type,status,uploaded_at")
    .eq("request_id", id)
    .neq("status", "replaced")
    .order("uploaded_at", { ascending: true });
  if (docErr) {
    return NextResponse.json({ ok: false, error: docErr.message }, { status: 500 });
  }

  // Completeness guard: keep only the newest per (doc_type, applicant_index),
  // then check every required slot is filled.
  const slots = requiredSlots(request.applicant_count);
  const used = new Set<string>();
  const chosen: typeof docs = [];
  for (const slot of slots) {
    const match = (docs ?? []).find(
      (d) =>
        !used.has(d.id) &&
        d.doc_type === slot.docKey &&
        (d.applicant_index ?? null) === slot.applicantIndex,
    );
    if (match) {
      used.add(match.id);
      chosen.push(match);
    }
  }
  const missing = slots.length - chosen.length;
  if (missing > 0 && !force) {
    return NextResponse.json(
      {
        ok: false,
        error: `${missing} document${missing > 1 ? "s" : ""} still outstanding. Wait for the client, or re-run with force to export a partial set.`,
        missing,
      },
      { status: 409 },
    );
  }

  // Pull the bytes from storage. A signed download per file, then fetch.
  const files: { name: string; bytes: ArrayBuffer; mime: string }[] = [];
  for (const d of chosen) {
    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(d.storage_path, 120);
    if (signErr || !signed?.signedUrl) {
      return NextResponse.json(
        { ok: false, error: `Could not read ${d.filename} from storage.` },
        { status: 500 },
      );
    }
    const res = await fetch(signed.signedUrl);
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: `Could not download ${d.filename}.` },
        { status: 500 },
      );
    }
    files.push({
      name: d.filename,
      bytes: await res.arrayBuffer(),
      mime: d.mime_type || "application/pdf",
    });
  }

  // Folder name YLA sees. Surname-led so their Drive sorts sensibly, dated so
  // repeat submissions for the same client don't collide.
  const surname = request.applicant_name.trim().split(/\s+/).pop() || request.applicant_name;
  const today = new Date().toISOString().slice(0, 10);
  const folderName = `${surname} - ${request.applicant_name} - ${today}`;

  const result = await exportToDrive({ folderName, files });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }

  const { error: updErr } = await supabase
    .from(DOCUMENT_REQUESTS_TABLE)
    .update({
      status: "submitted",
      drive_folder_id: result.folderId,
      drive_folder_url: result.folderUrl,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (updErr) {
    // The Drive export succeeded — surface the link even though the status
    // write failed, so the rep isn't stuck.
    return NextResponse.json({
      ok: true,
      folder_url: result.folderUrl,
      uploaded: result.uploaded,
      warning: "Exported to Drive, but could not update the request status: " + updErr.message,
    });
  }

  return NextResponse.json({
    ok: true,
    folder_url: result.folderUrl,
    uploaded: result.uploaded,
    partial: missing > 0,
  });
}
