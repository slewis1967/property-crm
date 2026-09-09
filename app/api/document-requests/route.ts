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
import { createDocumentRequest } from "../../../utils/document-requests-create";
import { getBroker, type Broker } from "../../../utils/brokers";
import {
  DOCUMENT_REQUESTS_TABLE,
  DOC_MIGRATION_HINT,
  docTableMissing,
  REQUEST_LIST_COLUMNS,
  REQUEST_LIST_COLUMNS_WITH_VIDEO,
  docColumnMissing,
  isValidEmail,
  publicOrigin,
} from "../../../utils/document-requests-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const created = await createDocumentRequest({
    applicantName,
    applicantEmail,
    applicantPhone: typeof body.applicant_phone === "string" ? body.applicant_phone : null,
    origin: publicOrigin(req),
    sendEmail,
    opportunityId: typeof body.opportunity_id === "string" ? body.opportunity_id : null,
    contactId: typeof body.contact_id === "string" ? body.contact_id : null,
    factFindId: typeof body.fact_find_id === "string" ? body.fact_find_id : null,
    applicationId,
    clientRef: sharedRef ?? null,
    submitTarget,
    broker,
    createdBy,
  });

  if (!created.ok) {
    return NextResponse.json({ ok: false, error: created.error }, { status: created.status });
  }

  return NextResponse.json({
    ok: true,
    request: created.request,
    link: created.link,
    emailed: created.emailed,
    email_error: created.emailError,
  });
}

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const opportunityId = url.searchParams.get("opportunity_id");
  const contactId = url.searchParams.get("contact_id");
  const applicationId = url.searchParams.get("application_id");
  const status = url.searchParams.get("status");

  const build = (columns: string) => {
    let q = supabase
      .from(DOCUMENT_REQUESTS_TABLE)
      .select(columns)
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
    return q;
  };

  // Prefer the richer set; degrade to the legacy columns if the training-video
  // migration hasn't run yet, so a pending migration costs the dashboard one
  // toggle rather than the whole page.
  let { data, error } = await build(REQUEST_LIST_COLUMNS_WITH_VIDEO);
  if (error && docColumnMissing(error)) {
    ({ data, error } = await build(REQUEST_LIST_COLUMNS));
  }
  if (error) {
    if (docTableMissing(error)) {
      return NextResponse.json({ ok: true, requests: [], migration_hint: DOC_MIGRATION_HINT });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, requests: data ?? [] });
}
