/**
 * POST /api/introducer/clients/<id>/upload-url
 *   Body: { info_request_id, label, filename, size, mime_type }
 *
 * PUBLIC (session-scoped). Mints a signed Supabase Storage upload URL and
 * pre-inserts the introducer_documents row; the browser then PUTs the bytes
 * straight to storage, so they never traverse the Netlify function (whose body
 * limit turns multipart uploads into 500s). Same approach as the client portal.
 *
 * AN UPLOAD IS ONLY EVER A REPLY — with exactly one exception. Normally it must
 * name an OPEN information request that asked for that exact document label:
 * there is no path for an introducer to attach files to a LOCKED referral of
 * their own accord, which is the field lock applied to documents.
 *
 * THE EXCEPTION IS THE SIGNED CONSENT FORM, ON A DRAFT. The referral agreement
 * makes the signed Referral Consent and Privacy Form a precondition of
 * submitting, so it has to be attachable BEFORE submit — and before submit there
 * is nothing to ask for, because there is no referral in the queue yet. It is
 * allowed only while the referral is still a draft, which is precisely the
 * window in which the introducer can change everything else too. Once submitted,
 * the ordinary rule applies again and a replacement consent form needs an
 * information request like any other document.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../../utils/supabase";
import { requireIntroducer, loadOwnClient, logIntroducerEvent, readJson } from "../../../_shared";
import { CONSENT_FORM_LABEL } from "../../../../../../utils/introducer";
import { enforceRateLimit } from "../../../../../../utils/rate-limit";
import { clientIp } from "../../../../../../utils/introducer-auth";

export const dynamic = "force-dynamic";

const BUCKET = "introducer-documents";
const MAX_BYTES = 15 * 1024 * 1024;
const ACCEPTED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/heic",
  "image/heif",
  "image/webp",
]);

const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/webp": "webp",
};

/** Strip anything that isn't safe in a storage key or a human-readable name. */
function safeSlug(input: string, fallback: string): string {
  const cleaned = input
    .normalize("NFKD")
    .replace(/[^\w\s.-]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return cleaned || fallback;
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireIntroducer();
  if (auth instanceof NextResponse) return auth;

  const limited = enforceRateLimit(req, {
    windowMs: 60_000,
    max: 30,
    keyFn: () => `introducer-upload:${clientIp(req) ?? "unknown"}`,
  });
  if (limited) return limited;

  const { id } = await params;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const record = await loadOwnClient(auth, id);
  if (!record) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  const label = typeof body.label === "string" ? body.label.trim() : "";
  const mime = typeof body.mime_type === "string" ? body.mime_type : "";
  const size = typeof body.size === "number" ? body.size : 0;
  const infoRequestId = typeof body.info_request_id === "string" ? body.info_request_id : "";

  if (!ACCEPTED_MIME.has(mime)) {
    return NextResponse.json(
      { ok: false, error: "Please upload a PDF or a photo (JPG, PNG, HEIC or WebP)." },
      { status: 400 },
    );
  }
  if (size <= 0 || size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "That file is too large — 15MB maximum." }, { status: 400 });
  }

  // The consent form on a still-editable draft is the one upload that is not a
  // reply to anything — see the note at the top of this file.
  const isConsentOnDraft =
    label.toLowerCase() === CONSENT_FORM_LABEL.toLowerCase() && record.status === "draft";

  let infoReq: { id: string } | null = null;

  if (!isConsentOnDraft) {
    // The authorisation check: an OPEN request on THIS referral that asked for
    // THIS label. Re-read from the database rather than trusting the body.
    const { data: found } = await supabase
      .from("introducer_info_requests")
      .select("id,documents,status")
      .eq("id", infoRequestId)
      .eq("client_id", record.id)
      .eq("status", "open")
      .maybeSingle();

    if (!found) {
      return NextResponse.json(
        { ok: false, error: "We haven't asked for a document on this referral. Contact Springboard if you need to send something." },
        { status: 403 },
      );
    }
    const asked = ((found.documents as string[]) ?? []).map((d) => d.toLowerCase());
    if (!asked.includes(label.toLowerCase())) {
      return NextResponse.json(
        { ok: false, error: "That isn't one of the documents we asked for." },
        { status: 403 },
      );
    }
    infoReq = { id: found.id };
  }

  const ext = EXT_BY_MIME[mime] ?? "bin";
  const ref = safeSlug(String(record.client_ref ?? "referral"), "referral");
  const surname = safeSlug(String(record.last_name ?? ""), "client");
  const filename = `${safeSlug(label, "Document")} - ${surname}.${ext}`;
  // Random suffix so a re-upload of the same label never collides, and so the
  // storage key can't be guessed from the reference alone.
  const key = `${record.introducer_id}/${record.id}/${ref}-${safeSlug(label, "doc")}-${crypto.randomUUID()}.${ext}`;

  const { data: signed, error: signErr } = await supabase.storage.from(BUCKET).createSignedUploadUrl(key);
  if (signErr || !signed) {
    return NextResponse.json({ ok: false, error: "Could not prepare the upload. Please try again." }, { status: 500 });
  }

  const { data: doc, error: docErr } = await supabase
    .from("introducer_documents")
    .insert({
      client_id: record.id,
      // Null for the consent form on a draft: it answers no request, and
      // inventing one to satisfy the column would put a request in the audit
      // trail that nobody made.
      info_request_id: infoReq?.id ?? null,
      label,
      filename,
      original_name: typeof body.filename === "string" ? body.filename.slice(0, 200) : null,
      storage_path: key,
      mime_type: mime,
      size_bytes: size,
      uploaded_by: auth.userId,
    })
    .select("id")
    .single();

  if (docErr || !doc) {
    return NextResponse.json({ ok: false, error: "Could not record the upload. Please try again." }, { status: 500 });
  }

  await logIntroducerEvent({
    clientId: record.id,
    introducerId: auth.introducerId,
    actorType: "introducer",
    actor: auth.email,
    action: isConsentOnDraft ? "consent_form_uploaded" : "document_uploaded",
    detail: { label, info_request_id: infoReq?.id ?? null },
  });

  return NextResponse.json({
    ok: true,
    bucket: BUCKET,
    path: key,
    token: signed.token,
    document_id: doc.id,
    filename,
  });
}
