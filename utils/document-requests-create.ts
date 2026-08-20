/**
 * Minting a document-collection session, in one place.
 *
 * There are now two callers with nothing else in common: the rep-side route
 * (POST /api/document-requests, behind Cloudflare Access) and a Tier 2
 * introducer submitting a full pack (POST /api/introducer/clients/<id>/submit,
 * behind an introducer session cookie). They cannot share a route — the auth is
 * different and proxy.ts keeps the two API trees apart deliberately — so they
 * share this instead.
 *
 * WHY THAT MATTERS BEYOND TIDINESS. The borrower gets ONE experience of
 * Springboard asking for their payslips, and it should not depend on who
 * triggered it. Two copies of this would drift: a link built from the wrong
 * origin, an email that says something slightly different, a request row missing
 * the `fact_find_id` that the Drive export later needs.
 *
 * The raw token exists only in the returned `link`. It is never stored (the row
 * holds its SHA-256) and never logged, so a request whose link is lost is
 * replaced, not recovered.
 */
import { supabase } from "./supabase";
import { newToken } from "./sign-token";
import { sendBrevoEmail } from "./brevo";
import {
  DOCUMENT_REQUESTS_TABLE,
  DOC_MIGRATION_HINT,
  docTableMissing,
  REQUEST_LIST_COLUMNS,
} from "./document-requests-db";

/**
 * "That column isn't there" — for an INSERT specifically.
 *
 * Not `docColumnMissing` from document-requests-db, which matches Postgres 42703
 * and the text "column ... does not exist". A write through PostgREST to an
 * unknown column never reaches Postgres: PostgREST rejects it first with
 * PGRST204, "Could not find the 'x' column of 'y' in the schema cache", and
 * neither of those tests match it. The fallback below would therefore never
 * fire, which is the quiet way a pre-migration deploy takes the document request
 * down with it. Matches the convention amlColumnMissing already uses.
 */
function insertColumnMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "PGRST204" || error.code === "42703") return true;
  return /could not find the .* column|column .* does not exist/i.test(error.message ?? "");
}

const AMBER = "#B45309";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

/** The borrower's invitation. Springboard-branded — the client never sees YLA. */
export function inviteHtml(firstName: string, link: string): string {
  const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : "Hello,";
  return `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:560px;margin:0 auto">
    <div style="background:${AMBER};color:#fff;padding:18px 22px;border-radius:8px 8px 0 0">
      <div style="font-size:18px;font-weight:bold">Springboard Homes</div>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;padding:22px;border-radius:0 0 8px 8px">
      <p style="margin:0 0 16px">${greeting}</p>
      <p style="margin:0 0 16px">To move your application forward we need a few documents. You can upload them securely from your phone — it takes just a few minutes and you don't need to create an account.</p>
      <p style="margin:0 0 24px">
        <a href="${link}" style="display:inline-block;background:${AMBER};color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold">
          Upload my documents
        </a>
      </p>
      <p style="margin:0 0 8px;font-size:13px;color:#555">Or paste this link into your browser:</p>
      <p style="margin:0 0 16px;font-size:13px;color:#555;word-break:break-all">${escapeHtml(link)}</p>
      <p style="margin:0;font-size:13px;color:#555">If you're unsure about anything, just reply to this email or call your Springboard consultant.</p>
    </div>
  </div>`;
}

export type CreateDocumentRequestInput = {
  applicantName: string;
  applicantEmail?: string | null;
  applicantPhone?: string | null;
  /** Origin the borrower's link is built from — see publicOrigin(). */
  origin: string;
  /** Email the link now? Requires applicantEmail. */
  sendEmail?: boolean;
  opportunityId?: string | null;
  contactId?: string | null;
  factFindId?: string | null;
  /** Links the per-applicant requests of one joint application together. */
  applicationId?: string | null;
  /** Share applicant 1's reference (and Drive folder) with applicant 2. */
  clientRef?: string | null;
  /** The Tier 2 pack this came from, when an introducer created it. */
  introducerClientId?: string | null;
  submitTarget?: "yla" | "broker";
  broker?: { id: string; name: string; email: string; reference?: string | null } | null;
  /** CF-Access email, or the introducer's email. Whoever asked for the documents. */
  createdBy: string;
};

export type CreateDocumentRequestResult =
  | {
      ok: true;
      request: Record<string, unknown>;
      /** Contains the raw token. Show it once; never persist or log it. */
      link: string;
      emailed: boolean;
      emailError: string | null;
    }
  | { ok: false; error: string; status: number };

export async function createDocumentRequest(
  input: CreateDocumentRequestInput,
): Promise<CreateDocumentRequestResult> {
  const applicantName = input.applicantName.trim();
  if (!applicantName) return { ok: false, error: "applicant_name required", status: 400 };

  const applicantEmail = input.applicantEmail?.trim() || null;
  if (input.sendEmail && !applicantEmail) {
    return { ok: false, error: "Cannot email the link without an applicant email", status: 400 };
  }

  const token = newToken();

  const insert: Record<string, unknown> = {
    token_hash: token.hash,
    applicant_name: applicantName,
    applicant_email: applicantEmail,
    applicant_phone: input.applicantPhone?.trim() || null,
    applicant_count: 1,
    application_id: input.applicationId ?? null,
    opportunity_id: input.opportunityId ?? null,
    contact_id: input.contactId ?? null,
    fact_find_id: input.factFindId ?? null,
    submit_target: input.submitTarget ?? "yla",
    broker_id: input.broker?.id ?? null,
    broker_name: input.broker?.name ?? null,
    broker_email: input.broker?.email ?? null,
    broker_reference: input.broker?.reference ?? null,
    created_by: input.createdBy,
  };
  // Only override the DB-default client_ref when sharing one across siblings.
  if (input.clientRef) insert.client_ref = input.clientRef;
  if (input.introducerClientId) insert.introducer_client_id = input.introducerClientId;

  let { data: row, error } = await supabase
    .from(DOCUMENT_REQUESTS_TABLE)
    .insert(insert)
    .select(REQUEST_LIST_COLUMNS)
    .single();

  /* `introducer_client_id` arrives with 20260820. Code ships before the SQL is
   * run, and a Tier 2 submit that fails purely because the provenance column
   * isn't there yet would strand a client who has already been promised their
   * upload link. Retry without it — losing the back-pointer is a far smaller
   * problem than losing the request, and the row still carries the fact find
   * and opportunity ids that connect it to the pack. */
  if (error && insertColumnMissing(error) && insert.introducer_client_id) {
    delete insert.introducer_client_id;
    ({ data: row, error } = await supabase
      .from(DOCUMENT_REQUESTS_TABLE)
      .insert(insert)
      .select(REQUEST_LIST_COLUMNS)
      .single());
  }

  if (error) {
    if (docTableMissing(error)) return { ok: false, error: DOC_MIGRATION_HINT, status: 503 };
    return { ok: false, error: error.message, status: 500 };
  }

  // The raw token appears ONLY here. If it's lost, a new request is issued
  // rather than this one recovered.
  const link = `${input.origin}/portal/${token.raw}`;

  let emailed = false;
  let emailError: string | null = null;
  if (input.sendEmail && applicantEmail) {
    const first = applicantName.split(/\s+/)[0] ?? "";
    const res = await sendBrevoEmail({
      to: [{ email: applicantEmail, name: applicantName }],
      subject: "Upload your documents — Springboard Homes",
      html: inviteHtml(first, link),
      fromName: "Springboard Homes",
      fromEmail: process.env.SPRINGBOARD_SENDER_EMAIL || undefined,
      replyTo: process.env.SPRINGBOARD_REPLY_TO || undefined,
      tags: ["springboard", "document-portal"],
    });
    emailed = res.ok;
    if (!res.ok) emailError = res.error ?? "email failed";
  }

  return { ok: true, request: row as Record<string, unknown>, link, emailed, emailError };
}
