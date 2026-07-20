/**
 * GET /api/portal/<token>
 *
 * PUBLIC. Returns everything the client's browser needs to render the upload
 * page: who it's for, which documents are outstanding, and what has already
 * been received. No CF Access identity — the token is the credential.
 *
 * Deliberately returns no internal identifiers beyond the document row ids the
 * client needs to replace a file.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requiredSlots, YLA_MAX_BYTES, ACCEPTED_MIME } from "../../../../utils/yla-documents";
import { resolveToken } from "../_shared";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const resolved = await resolveToken(token);
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status });
  }
  const request = resolved.request;

  const { data: docs, error } = await supabase
    .from("client_documents")
    .select("id,doc_type,applicant_index,filename,status,check_notes,size_bytes,uploaded_at")
    .eq("request_id", request.id)
    .neq("status", "replaced")
    .order("uploaded_at", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: "Could not load your documents." }, { status: 500 });
  }

  const slots = requiredSlots(request.applicant_count);

  // Fill each required slot with an uploaded document, in upload order, so the
  // client sees "Payslip 1 done, Payslip 2 outstanding" rather than an
  // undifferentiated count.
  const used = new Set<string>();
  const filled = slots.map((slot) => {
    const match = (docs ?? []).find(
      (d) =>
        !used.has(d.id) &&
        d.doc_type === slot.docKey &&
        (d.applicant_index ?? null) === slot.applicantIndex,
    );
    if (match) used.add(match.id);
    return {
      ...slot,
      document: match
        ? {
            id: match.id,
            filename: match.filename,
            status: match.status,
            notes: match.check_notes,
            size: match.size_bytes,
          }
        : null,
    };
  });

  const outstanding = filled.filter((s) => !s.document).length;

  return NextResponse.json({
    ok: true,
    applicant_name: request.applicant_name,
    applicant_count: request.applicant_count,
    status: request.status,
    slots: filled,
    outstanding,
    complete: outstanding === 0,
    limits: { max_bytes: YLA_MAX_BYTES, accepted_mime: ACCEPTED_MIME },
  });
}
