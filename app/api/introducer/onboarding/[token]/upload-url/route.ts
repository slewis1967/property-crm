/**
 * POST /api/introducer/onboarding/<token>/upload-url
 *   Body: { side: "front" | "back", filename, size, mime_type }
 *
 * PUBLIC, token-scoped. Mints a signed Supabase Storage upload URL for one side
 * of the applicant's photo ID and pre-inserts the row; the browser PUTs the
 * bytes straight to storage so they never traverse the Netlify function.
 *
 * DIFFERENT FROM THE REFERRAL UPLOAD in the one way that matters: there is no
 * session here. The applicant is a stranger holding a link, so the token IS the
 * authorisation, and the state is the gate — an applicant who has not signed the
 * NDA, or who is already verified, cannot upload however valid their link.
 *
 * These images are identity evidence and go to their own private bucket, not
 * the one an introducer session can reach. Nothing an introducer can
 * authenticate to should be able to enumerate other people's licences.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../../utils/supabase";
import { findByToken, logOnboardingEvent } from "../../../../../../utils/introducer-onboarding-db";
import { canUploadId, onboardingTablesMissing } from "../../../../../../utils/introducer-onboarding";
import { enforceRateLimit } from "../../../../../../utils/rate-limit";
import { clientIp } from "../../../../../../utils/introducer-auth";

export const dynamic = "force-dynamic";

const BUCKET = "introducer-identity";
const MAX_BYTES = 15 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/heif": "heif",
  "image/webp": "webp",
};

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const limited = enforceRateLimit(req, {
    windowMs: 60_000,
    max: 20,
    keyFn: () => `onboarding-upload:${clientIp(req) ?? "unknown"}`,
  });
  if (limited) return limited;

  const { token } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const side = body.side === "back" ? "back" : body.side === "front" ? "front" : null;
  const mime = typeof body.mime_type === "string" ? body.mime_type : "";
  const size = typeof body.size === "number" ? body.size : 0;

  if (!side) {
    return NextResponse.json({ ok: false, error: "Tell us which side this is." }, { status: 400 });
  }
  if (!EXT_BY_MIME[mime]) {
    return NextResponse.json(
      { ok: false, error: "Please upload a photo (JPG, PNG, HEIC or WebP) or a PDF." },
      { status: 400 },
    );
  }
  if (size <= 0 || size > MAX_BYTES) {
    return NextResponse.json({ ok: false, error: "That file is too large — 15MB maximum." }, { status: 400 });
  }

  let found;
  try {
    found = await findByToken(decodeURIComponent(token));
  } catch (err) {
    if (onboardingTablesMissing(err)) {
      return NextResponse.json({ ok: false, error: "Not available yet." }, { status: 503 });
    }
    throw err;
  }

  if (!found.ok) {
    return NextResponse.json(
      { ok: false, error: "This link is no longer valid. Ask Springboard to send you a new one." },
      { status: 403 },
    );
  }

  const app = found.application;

  if (!canUploadId(app.state)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          app.state === "invited"
            ? "Sign the confidentiality agreement first — it's the step above this one."
            : "We already have your identity documents.",
      },
      { status: 409 },
    );
  }

  const ext = EXT_BY_MIME[mime];
  // Random component so a re-upload never collides and the key cannot be
  // guessed from the application id alone.
  const key = `${app.id}/${side}-${crypto.randomUUID()}.${ext}`;

  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUploadUrl(key);

  if (signErr || !signed) {
    return NextResponse.json(
      { ok: false, error: "Could not prepare the upload. Please try again." },
      { status: 500 },
    );
  }

  // Replacing a side: mark the old row purged so the partial unique index frees
  // up. The object is left for the offboarding sweep rather than deleted here —
  // a failed re-upload should not destroy the copy we already had.
  await supabase
    .from("introducer_identity_documents")
    .update({ purged_at: new Date().toISOString() })
    .eq("application_id", app.id)
    .eq("side", side)
    .is("purged_at", null);

  const { error: rowErr } = await supabase.from("introducer_identity_documents").insert({
    application_id: app.id,
    side,
    filename: `${side}.${ext}`,
    original_name: typeof body.filename === "string" ? body.filename.slice(0, 200) : null,
    storage_path: key,
    mime_type: mime,
    size_bytes: size,
  });

  if (rowErr) {
    return NextResponse.json({ ok: false, error: "Could not record the upload." }, { status: 500 });
  }

  await logOnboardingEvent(app.id, "applicant", app.email, "identity_document_uploaded", { side });

  return NextResponse.json({
    ok: true,
    upload_url: signed.signedUrl,
    path: signed.path,
    token: signed.token,
  });
}
