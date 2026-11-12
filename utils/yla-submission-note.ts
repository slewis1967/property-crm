/**
 * The advisor's note to YLA that travels with an application.
 *
 * YLA see two things: the Drive folder and the invite email. The note goes in
 * both: as a short "Advisor Notes" PDF beside the signed Needs Analysis, so it
 * stays with the file however it is passed around, and as a paragraph in the
 * email, so the assessor reads it before opening anything.
 *
 * Reading the note must never break a submission. The column arrives with
 * migrations/20261112_submission_note.sql, and code may ship before that SQL is
 * run, so a failed read is treated as "no note".
 */
import { supabase } from "./supabase";
import { htmlToPdf } from "./pdf/render";
import { packageFilename } from "./yla-documents";
import { DOCUMENT_REQUESTS_TABLE } from "./document-requests-db";
import { escapeHtml, noteToHtml } from "./yla-submit";

export const SUBMISSION_NOTE_MAX = 4000;

/** Trim, drop blanks and duplicates, and join a joint application's notes. */
export function combineNotes(notes: (string | null | undefined)[]): string | null {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const n of notes) {
    const t = (n ?? "").trim();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out.length ? out.join("\n\n") : null;
}

/** The combined note across the given requests (one application's siblings). */
export async function fetchSubmissionNote(requestIds: string[]): Promise<string | null> {
  if (!requestIds.length) return null;
  try {
    const { data, error } = await supabase
      .from(DOCUMENT_REQUESTS_TABLE)
      .select("submission_note,created_at")
      .in("id", requestIds)
      .order("created_at", { ascending: true });
    if (error || !data) return null;
    return combineNotes(data.map((r) => (r as { submission_note?: string | null }).submission_note));
  } catch {
    return null;
  }
}

export function advisorNotesHtml(args: { note: string; primaryApplicant: string; clientRef: string | null; date: Date }): string {
  const ref = args.clientRef ? ` (${escapeHtml(args.clientRef)})` : "";
  const date = args.date.toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane", day: "numeric", month: "long", year: "numeric" });
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:Arial,Helvetica,sans-serif;color:#111;font-size:12pt;line-height:1.5;margin:48px}
    h1{font-size:18pt;margin:0 0 4px} .meta{color:#555;font-size:10pt;margin-bottom:24px}
    p{margin:0 0 12px}
  </style></head><body>
    <h1>Advisor Notes</h1>
    <div class="meta">${escapeHtml(args.primaryApplicant)}${ref} &middot; ${escapeHtml(date)}</div>
    ${noteToHtml(args.note)}
  </body></html>`;
}

/** The Drive-folder document, or null when there is no note. */
export async function buildAdvisorNotesDoc(args: {
  requestIds: string[];
  primaryApplicant: string;
  clientRef: string | null;
}): Promise<{ name: string; bytes: ArrayBuffer; mime: string } | null> {
  const note = await fetchSubmissionNote(args.requestIds);
  if (!note) return null;
  const pdf = await htmlToPdf(advisorNotesHtml({ note, primaryApplicant: args.primaryApplicant, clientRef: args.clientRef, date: new Date() }));
  const bytes = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
  return { name: packageFilename("Advisor Notes", args.primaryApplicant, args.clientRef), bytes, mime: "application/pdf" };
}
