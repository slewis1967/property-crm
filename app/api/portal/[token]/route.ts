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
import {
  requiredSlots,
  allowsExtra,
  maxSlotFor,
  DOC_BY_KEY,
  YLA_DOC_KEYS_WITH_EXTRA,
  YLA_MAX_BYTES,
  ACCEPTED_MIME,
} from "../../../../utils/yla-documents";
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
    .select("id,doc_type,filename,status,check_notes,size_bytes,uploaded_at")
    .eq("request_id", request.id)
    .neq("status", "replaced")
    .order("uploaded_at", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: "Could not load your documents." }, { status: 500 });
  }

  // One applicant per request now — a flat personal set, no per-applicant split.
  const slots = requiredSlots();

  // Fill each required slot with an uploaded document, in upload order, so the
  // client sees "Payslip 1 done, Payslip 2 outstanding" rather than a count.
  type FilledSlot = {
    docKey: string;
    label: string;
    hint: string;
    slot: number;
    /** Supplied beyond the required minimum — another employer's statement. */
    extra?: boolean;
    document: { id: string; filename: string; status: string; notes: string | null; size: number | null } | null;
  };

  const used = new Set<string>();
  const filled: FilledSlot[] = slots.map((slot) => {
    const match = (docs ?? []).find((d) => !used.has(d.id) && d.doc_type === slot.docKey);
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

  // EXTRA slots the client has already filled beyond the required minimum —
  // a third or fourth ATO income statement, because myGov issues one per
  // employer. They aren't "required" (so they never count as outstanding) but
  // they must be visible, or the client can't tell they landed.
  for (const d of docs ?? []) {
    if (used.has(d.id) || !allowsExtra(d.doc_type)) continue;
    used.add(d.id);
    const spec = DOC_BY_KEY[d.doc_type];
    const nth = filled.filter((s) => s.docKey === d.doc_type).length + 1;
    filled.push({
      docKey: d.doc_type,
      label: spec?.label ?? d.doc_type,
      hint: spec?.hint ?? "",
      slot: nth,
      extra: true,
      document: {
        id: d.id,
        filename: d.filename,
        status: d.status,
        notes: d.check_notes,
        size: d.size_bytes,
      },
    });
  }

  // Where the client may add one more (the "another employer" case).
  const extraSlots = YLA_DOC_KEYS_WITH_EXTRA.map((key) => {
    const usedCount = filled.filter((s) => s.docKey === key && s.document).length;
    const next = usedCount + 1;
    return next <= maxSlotFor(key) ? { docKey: key, label: DOC_BY_KEY[key]?.label ?? key, slot: next } : null;
  }).filter(Boolean);

  const outstanding = filled.filter((s) => !s.document).length;

  return NextResponse.json({
    ok: true,
    client_ref: request.client_ref,
    applicant_name: request.applicant_name,
    status: request.status,
    slots: filled,
    extra_slots: extraSlots,
    outstanding,
    complete: outstanding === 0,
    limits: { max_bytes: YLA_MAX_BYTES, accepted_mime: ACCEPTED_MIME },
  });
}
