/**
 * Background function: remove TFNs from scanned / image-only client documents.
 *
 * The "-background" suffix makes Netlify answer 202 immediately and give this
 * up to 15 minutes — OCR takes seconds per page. Triggered by
 * utils/tfn-image-redact-trigger.ts after an upload and by the YLA sweep when
 * the gate is holding an application for a TFN the text redactor could not
 * reach. See utils/tfn-redact-image.ts for how the pixels are removed.
 *
 * Machine-to-machine, so it carries no Cloudflare Access identity: secured by
 * the same CRON_SECRET bearer as /api/cron/run, failing closed when unset.
 */
import { timingSafeEqual } from "node:crypto";
import { redactStoredDocumentImages } from "../../utils/tfn-redact-image-store";
import { tesseractOcr, closeOcr } from "../../utils/ocr-tesseract";

function authorised(req: Request): boolean {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return false;
  const m = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  const given = Buffer.from((m?.[1] || "").trim());
  const want = Buffer.from(secret);
  return given.length === want.length && timingSafeEqual(given, want);
}

const handler = async (req: Request) => {
  if (req.method !== "POST" || !authorised(req)) return new Response("Forbidden", { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { documentIds?: unknown };
  const ids = Array.isArray(body.documentIds) ? body.documentIds.filter((x): x is string => typeof x === "string").slice(0, 50) : [];

  try {
    for (const id of ids) {
      try {
        const r = await redactStoredDocumentImages(id, tesseractOcr);
        console.log("tfn-image-redact", JSON.stringify(r));
      } catch (e) {
        console.error("tfn-image-redact failed", id, e instanceof Error ? e.message : e);
      }
    }
  } finally {
    await closeOcr();
  }
  return new Response(null, { status: 202 });
};
export default handler;
