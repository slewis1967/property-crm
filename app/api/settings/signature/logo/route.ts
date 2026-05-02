/**
 * POST /api/settings/signature/logo
 *   Body: { mime: string, size: number }
 *
 * Creates a signed upload URL on Supabase Storage's property-media bucket.
 * The browser uses this URL to PUT the file directly — bypassing Netlify's
 * serverless body-size limit which was returning 500s on multipart uploads.
 *
 * Response: { ok: true, token, path, publicUrl }
 *   - token + path → pass to supabaseBrowser.storage.uploadToSignedUrl()
 *   - publicUrl → store in app_settings.value.logo_url after upload succeeds
 *
 * Validation happens here against the metadata; the actual file content
 * checks (real MIME match, dimensions, etc.) are NOT performed because the
 * file never touches our server.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";

export const dynamic = "force-dynamic";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
]);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const mime: string = typeof body.mime === "string" ? body.mime : "";
    const size: number = typeof body.size === "number" ? body.size : 0;

    if (!ALLOWED_MIME.has(mime)) {
      return NextResponse.json(
        { ok: false, error: `Unsupported MIME type: ${mime || "(missing)"}` },
        { status: 400 },
      );
    }
    if (size <= 0) {
      return NextResponse.json({ ok: false, error: "size must be > 0" }, { status: 400 });
    }
    if (size > MAX_BYTES) {
      return NextResponse.json(
        { ok: false, error: `File too large (max ${MAX_BYTES / 1024 / 1024}MB)` },
        { status: 400 },
      );
    }

    const ext = extFromMime(mime);
    const path = `signature/logo-${Date.now()}.${ext}`;

    const { data, error } = await supabase.storage
      .from("property-media")
      .createSignedUploadUrl(path);
    if (error || !data) {
      return NextResponse.json(
        { ok: false, error: `Storage signing failed: ${error?.message || "unknown"}` },
        { status: 500 },
      );
    }

    const { data: pub } = supabase.storage.from("property-media").getPublicUrl(path);
    if (!pub?.publicUrl) {
      return NextResponse.json(
        { ok: false, error: "Could not resolve public URL — bucket may not be public" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      token: data.token,
      path: data.path,
      publicUrl: pub.publicUrl,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `Unhandled: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }
}

function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "image/svg+xml": "svg",
    "image/gif": "gif",
  };
  return map[mime] ?? "bin";
}
