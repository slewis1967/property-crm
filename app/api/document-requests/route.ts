/**
 * Rep-side document-request management (AUTHED — behind Cloudflare Access).
 *
 *   POST /api/document-requests
 *     Body: { applicant_name, applicant_email?, applicant_phone?,
 *             applicant_count?, opportunity_id?, contact_id?, fact_find_id?,
 *             send_email? }
 *     Mints a fresh portal token (only the SHA-256 hash is stored), creates a
 *     document_requests row, optionally emails the borrower their upload link,
 *     and returns the row PLUS the one-time link so the rep can copy it.
 *
 *   GET /api/document-requests?opportunity_id=&status=
 *     Lists requests for the rep dashboard — PII-safe columns, never the hash.
 *
 * These are DELIBERATELY not under /api/portal/*, which is CF-Access-bypassed.
 * Keeping them here preserves their auth requirement.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../utils/supabase";
import { requireAuth } from "../../../utils/cf-access";
import { enforceRateLimit } from "../../../utils/rate-limit";
import { newToken } from "../../../utils/sign-token";
import { sendBrevoEmail } from "../../../utils/brevo";
import { getBroker, type Broker } from "../../../utils/brokers";
import {
  DOCUMENT_REQUESTS_TABLE,
  DOC_MIGRATION_HINT,
  docTableMissing,
  REQUEST_LIST_COLUMNS,
  isValidEmail,
  publicOrigin,
} from "../../../utils/document-requests-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const AMBER = "#B45309";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

function inviteHtml(firstName: string, link: string): string {
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

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const createdBy = auth;

  const limited = enforceRateLimit(req, { windowMs: 60_000, max: 20 });
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const applicantName = typeof body.applicant_name === "string" ? body.applicant_name.trim() : "";
  if (!applicantName) {
    return NextResponse.json({ ok: false, error: "applicant_name required" }, { status: 400 });
  }

  const applicantEmail =
    typeof body.applicant_email === "string" && body.applicant_email.trim()
      ? body.applicant_email.trim()
      : null;
  if (applicantEmail && !isValidEmail(applicantEmail)) {
    return NextResponse.json({ ok: false, error: "applicant_email is not a valid email" }, { status: 400 });
  }

  const sendEmail = body.send_email === true;
  if (sendEmail && !applicantEmail) {
    return NextResponse.json(
      { ok: false, error: "Cannot email the link without an applicant email" },
      { status: 400 },
    );
  }

  // Each request is now a single applicant. `application_id` (and a shared
  // `client_ref`) link the per-applicant requests of one joint application; the
  // caller creates applicant 1 first, then passes both back on applicant 2 so
  // they share a reference and one Drive folder.
  const applicationId =
    typeof body.application_id === "string" && body.application_id ? body.application_id : null;
  const sharedRef =
    typeof body.client_ref === "string" && body.client_ref.trim() ? body.client_ref.trim() : undefined;

  // Destination: YLA (default) or a broker chosen from Settings. Snapshot the
  // broker's details now so the submission is stable if it's later edited/removed.
  const submitTarget = body.submit_target === "broker" ? "broker" : "yla";
  let broker: Broker | null = null;
  if (submitTarget === "broker") {
    const bid = typeof body.broker_id === "string" ? body.broker_id : "";
    broker = bid ? await getBroker(bid) : null;
    if (!broker) {
      return NextResponse.json({ ok: false, error: "Broker not found — pick one from Settings → Brokers." }, { status: 400 });
    }
  }

  const token = newToken();

  const insert: Record<string, unknown> = {
    token_hash: token.hash,
    applicant_name: applicantName,
    applicant_email: applicantEmail,
    applicant_phone:
      typeof body.applicant_phone === "string" ? body.applicant_phone.trim() || null : null,
    applicant_count: 1,
    application_id: applicationId,
    opportunity_id: typeof body.opportunity_id === "string" ? body.opportunity_id : null,
    contact_id: typeof body.contact_id === "string" ? body.contact_id : null,
    fact_find_id: typeof body.fact_find_id === "string" ? body.fact_find_id : null,
    submit_target: submitTarget,
    broker_id: broker?.id ?? null,
    broker_name: broker?.name ?? null,
    broker_email: broker?.email ?? null,
    broker_reference: broker?.reference ?? null,
    created_by: createdBy,
  };
  // Only override the DB-default client_ref when sharing one across siblings.
  if (sharedRef) insert.client_ref = sharedRef;

  const { data: row, error } = await supabase
    .from(DOCUMENT_REQUESTS_TABLE)
    .insert(insert)
    .select(REQUEST_LIST_COLUMNS)
    .single();

  if (error) {
    if (docTableMissing(error)) {
      return NextResponse.json({ ok: false, error: DOC_MIGRATION_HINT }, { status: 503 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  // The raw token appears ONLY here, in this response — never stored, never
  // logged, never returned by GET. If the rep loses the link they issue a new
  // request rather than recovering this one.
  const link = `${publicOrigin(req)}/portal/${token.raw}`;

  let emailed = false;
  let emailError: string | null = null;
  if (sendEmail && applicantEmail) {
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

  return NextResponse.json({ ok: true, request: row, link, emailed, email_error: emailError });
}

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const opportunityId = url.searchParams.get("opportunity_id");
  const contactId = url.searchParams.get("contact_id");
  const applicationId = url.searchParams.get("application_id");
  const status = url.searchParams.get("status");

  let q = supabase
    .from(DOCUMENT_REQUESTS_TABLE)
    .select(REQUEST_LIST_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(200);
  if (opportunityId) q = q.eq("opportunity_id", opportunityId);
  if (contactId) q = q.eq("contact_id", contactId);
  // A joint application's per-applicant requests share an application_id. Its
  // applicant-2 request carries no contact_id (that contact is the co-applicant,
  // not the primary), so the contact-scoped list alone would miss it — callers
  // gather the siblings by application_id.
  if (applicationId) q = q.eq("application_id", applicationId);
  if (status) q = q.eq("status", status);

  const { data, error } = await q;
  if (error) {
    if (docTableMissing(error)) {
      return NextResponse.json({ ok: true, requests: [], migration_hint: DOC_MIGRATION_HINT });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, requests: data ?? [] });
}
