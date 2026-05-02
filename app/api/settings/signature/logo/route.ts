/**
 * POST /api/settings/signature/logo
 *   multipart/form-data with field "file" (image)
 *
 * Uploads the image to Supabase Storage under property-media/signature/
 * and returns its public URL. Caller (the SignatureEditor) then PUTs the
 * URL into /api/settings/signature.
 *
 * 5MB max. PNG / JPEG / WebP / SVG / GIF accepted.
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
  // Top-level try/catch — without this, an uncaught exception lets Netlify
  // serve its default HTML "Internal Server Error" page, which crashes the
  // client's res.json() with "Unexpected token 'I'...".
  try {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (e) {
      return NextResponse.json(
        { ok: false, error: `Could not parse multipart body: ${e instanceof Error ? e.message : String(e)}` },
        { status: 400 },
      );
    }

    const file = formData.get("file");
    if (!file || !(file instanceof Blob)) {
      return NextResponse.json({ ok: false, error: "No 'file' field in request" }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ ok: false, error: "File is empty" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ ok: false, error: `File too large (max ${MAX_BYTES / 1024 / 1024}MB)` }, { status: 400 });
    }
    const mime = file.type || "application/octet-stream";
    if (!ALLOWED_MIME.has(mime)) {
      return NextResponse.json({ ok: false, error: `Unsupported MIME type: ${mime}` }, { status: 400 });
    }

    const ext = extFromMime(mime);
    const path = `signature/logo-${Date.now()}.${ext}`;
    const arrayBuf = await file.arrayBuffer();

    const { error: uploadErr } = await supabase.storage
      .from("property-media")
      .upload(path, new Uint8Array(arrayBuf), {
        contentType: mime,
        upsert: false,
        cacheControl: "31536000",
      });
    if (uploadErr) {
      return NextResponse.json({ ok: false, error: `Storage upload failed: ${uploadErr.message}` }, { status: 500 });
    }

    const { data: pub } = supabase.storage.from("property-media").getPublicUrl(path);
    if (!pub?.publicUrl) {
      return NextResponse.json({ ok: false, error: "Upload succeeded but public URL was empty — bucket may not be public" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, url: pub.publicUrl, path });
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
