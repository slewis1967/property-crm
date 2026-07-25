/**
 * POST /api/portal/<token>/upload-url
 *   Body: { doc_key, applicant_index?, slot, size, mime_type }
 *
 * PUBLIC. Mints a signed Supabase Storage upload URL and pre-inserts the
 * client_documents row. The browser then PUTs the bytes straight to storage —
 * they never traverse the Netlify function (its body-size limit returns 500s on
 * multipart), same approach as /api/mail/attachments/upload-url.
 *
 * The bytes arriving here have ALREADY been normalised to a compliant PDF on
 * the client's device (see app/portal/[token]/normalise.ts). We still enforce
 * the ceiling server-side — a public endpoint cannot trust its caller.
 */
import { NextResponse } from "next/server";
import { resolveToken, clientIp } from "../../_shared";
import { enforceRateLimit } from "../../../../../utils/rate-limit";
import { prepareClientDocumentUpload } from "../../../../../utils/client-document-upload";

export const dynamic = "force-dynamic";


export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const resolved = await resolveToken(token);
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status });
  }
  const request = resolved.request;

  // PUBLIC endpoint: a valid-token holder could otherwise loop this to mint
  // unbounded signed upload URLs + client_documents rows (per-file size is
  // capped, count wasn't). Throttle per token+IP.
  const limited = enforceRateLimit(req, {
    windowMs: 60_000,
    max: 30,
    keyFn: () => `portal-upload:${token}:${clientIp(req)}`,
  });
  if (limited) return limited;

  if (request.status === "submitted") {
    return NextResponse.json(
      { ok: false, error: "This application has already been submitted. Contact your consultant to add anything further." },
      { status: 409 },
    );
  }

  const body = await req.json().catch(() => ({}));

  const prepared = await prepareClientDocumentUpload(
    { id: request.id, applicant_name: request.applicant_name, client_ref: request.client_ref },
    body,
  );
  if (!prepared.ok) {
    return NextResponse.json({ ok: false, error: prepared.error }, { status: prepared.status });
  }

  return NextResponse.json({
    ok: true,
    token: prepared.token,
    path: prepared.path,
    bucket: prepared.bucket,
    document_id: prepared.document_id,
    filename: prepared.filename,
  });
}
