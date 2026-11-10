/**
 * GET /api/portal/mygov-guide  — PUBLIC (under the CF-Access-bypassed
 * /api/portal/* namespace).
 *
 * Serves the myGov income-statement walkthrough PDF to a borrower on the public
 * portal. It can't be a root-level public/ file: those sit behind Cloudflare
 * Access (verified — /logo.png 302s), and Netlify doesn't bundle public/ into
 * serverless functions anyway. So the bytes are base64-embedded and streamed
 * from here, which is definitely reachable without a CRM login.
 *
 * This route sits at a fixed segment, so Next matches it ahead of the sibling
 * dynamic /api/portal/[token] route.
 */
import { MYGOV_GUIDE_B64 } from "../../../../utils/mygov-guide-data";

export const runtime = "nodejs";
export const dynamic = "force-static";

export function GET() {
  const bytes = Buffer.from(MYGOV_GUIDE_B64, "base64");
  return new Response(bytes, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": 'inline; filename="myGov Income Statement Guide.pdf"',
      "cache-control": "public, max-age=86400",
    },
  });
}
