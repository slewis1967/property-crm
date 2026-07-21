/**
 * POST /api/document-requests/<id>/export   (AUTHED)
 *
 * Push an APPLICATION's collected documents into Google Drive — one folder for
 * the whole application, containing every applicant's files. A joint deal has
 * one request per applicant (linked by application_id); this gathers them all
 * into a single folder so YLA get one link, as their process expects.
 *
 * The rep runs it once the application's completeness view is ready, then pastes
 * the folder link into the Thursday calendar entry (see yla-weekly-lead-submission).
 *
 * Guarded: refuses to export while any applicant is incomplete unless ?force=1.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { requireAuth } from "../../../../../utils/cf-access";
import { requiredSlots, surnameOf } from "../../../../../utils/yla-documents";
import { exportToDrive } from "../../../../../utils/google-drive";
import {
  DOCUMENT_REQUESTS_TABLE,
  DOC_MIGRATION_HINT,
  docTableMissing,
} from "../../../../../utils/document-requests-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "client-documents";
const SELECT = "id,client_ref,application_id,applicant_name,status,drive_folder_url,created_at";

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
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();

  if (reqErr) {
    if (docTableMissing(reqErr)) {
      return NextResponse.json({ ok: false, error: DOC_MIGRATION_HINT }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: reqErr.message }, { status: 500 });
  }
  if (!request) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  // The application's requests: all that share application_id, else just this one.
  let siblings = [request];
  if (request.application_id) {
    const { data: sibs } = await supabase
      .from(DOCUMENT_REQUESTS_TABLE)
      .select(SELECT)
      .eq("application_id", request.application_id)
      .neq("status", "cancelled")
      .order("created_at", { ascending: true });
    if (sibs && sibs.length) siblings = sibs;
  }

  const already = siblings.find((s) => s.status === "submitted" && s.drive_folder_url);
  if (already) {
    return NextResponse.json(
      { ok: false, error: "Already exported to Drive.", folder_url: already.drive_folder_url },
      { status: 409 },
    );
  }

  // Gather each applicant's complete personal set.
  const slots = requiredSlots();
  const files: { name: string; bytes: ArrayBuffer; mime: string }[] = [];
  let missing = 0;

  for (const sib of siblings) {
    const { data: docs, error: docErr } = await supabase
      .from("client_documents")
      .select("id,doc_type,filename,storage_path,mime_type,status,uploaded_at")
      .eq("request_id", sib.id)
      .neq("status", "replaced")
      .order("uploaded_at", { ascending: true });
    if (docErr) {
      return NextResponse.json({ ok: false, error: docErr.message }, { status: 500 });
    }

    const used = new Set<string>();
    for (const slot of slots) {
      const match = (docs ?? []).find((d) => !used.has(d.id) && d.doc_type === slot.docKey);
      if (!match) {
        missing++;
        continue;
      }
      used.add(match.id);
      const { data: signed, error: signErr } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(match.storage_path, 120);
      if (signErr || !signed?.signedUrl) {
        return NextResponse.json(
          { ok: false, error: `Could not read ${match.filename} from storage.` },
          { status: 500 },
        );
      }
      const res = await fetch(signed.signedUrl);
      if (!res.ok) {
        return NextResponse.json({ ok: false, error: `Could not download ${match.filename}.` }, { status: 500 });
      }
      files.push({ name: match.filename, bytes: await res.arrayBuffer(), mime: match.mime_type || "application/pdf" });
    }
  }

  if (missing > 0 && !force) {
    return NextResponse.json(
      {
        ok: false,
        error: `${missing} document${missing > 1 ? "s" : ""} still outstanding across the application. Wait for the client(s), or re-run with force to export a partial set.`,
        missing,
      },
      { status: 409 },
    );
  }
  if (files.length === 0) {
    return NextResponse.json({ ok: false, error: "No documents to export yet." }, { status: 409 });
  }

  // One folder for the whole application, named from the primary (earliest)
  // applicant. Surname-led so YLA's Drive sorts sensibly; the NK reference is
  // shared across applicants and disambiguates same-named clients.
  const primary = siblings[0]!;
  const surname = surnameOf(primary.applicant_name) || primary.applicant_name;
  const today = new Date().toISOString().slice(0, 10);
  const ref = primary.client_ref ? ` (${primary.client_ref})` : "";
  const folderName = `${surname} - ${primary.applicant_name}${ref} - ${today}`;

  const result = await exportToDrive({ folderName, files });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }

  // Mark every applicant's request submitted, all pointing at the one folder.
  const ids = siblings.map((s) => s.id);
  const { error: updErr } = await supabase
    .from(DOCUMENT_REQUESTS_TABLE)
    .update({
      status: "submitted",
      drive_folder_id: result.folderId,
      drive_folder_url: result.folderUrl,
      submitted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .in("id", ids);
  if (updErr) {
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
    applicants: siblings.length,
    partial: missing > 0,
  });
}
