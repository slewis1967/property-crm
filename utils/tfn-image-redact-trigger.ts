/**
 * Ask the background function to OCR-redact documents. Fire-and-forget:
 * background functions answer 202 at once and run for up to 15 minutes, which
 * is the only place OCR fits — the upload request and the scheduled sweep both
 * have seconds, not minutes.
 *
 * Never throws and never blocks the caller for long. If the trigger is lost,
 * nothing unsafe happens: the document is simply still held by the gate, and
 * the next sweep asks again.
 */
export const IMAGE_REDACT_FUNCTION = "/.netlify/functions/tfn-image-redact-background";

export async function requestImageRedaction(documentIds: string[]): Promise<boolean> {
  const ids = documentIds.filter(Boolean);
  // The production hostname sits behind Cloudflare Access, so the call carries
  // the same service token utils/nexus-api.ts uses. TFN_REDACT_FUNCTION_URL
  // overrides the whole URL if the function has to be reached another way.
  const site = (process.env.URL || process.env.DEPLOY_PRIME_URL || "").replace(/\/$/, "");
  const url = (process.env.TFN_REDACT_FUNCTION_URL || "").trim() || (site ? `${site}${IMAGE_REDACT_FUNCTION}` : "");
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!ids.length || !url || !secret) return false;
  const headers: Record<string, string> = { "Content-Type": "application/json", Authorization: `Bearer ${secret}` };
  if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
    headers["CF-Access-Client-Id"] = process.env.CF_ACCESS_CLIENT_ID;
    headers["CF-Access-Client-Secret"] = process.env.CF_ACCESS_CLIENT_SECRET;
  }
  try {
    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ documentIds: ids }),
      signal: AbortSignal.timeout(5000),
    });
    return res.status === 202 || res.ok;
  } catch {
    return false;
  }
}
