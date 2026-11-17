/**
 * Ask the background function to OCR-redact documents. Fire-and-forget:
 * background functions answer 202 at once and run for up to 15 minutes, which
 * is the only place OCR fits — the upload request and the scheduled sweep both
 * have seconds, not minutes.
 *
 * Never throws and never blocks the caller for long. If the trigger is lost,
 * nothing unsafe happens: the document is simply still held by the gate, and
 * the next sweep asks again.
 *
 * Transport (17 Nov 2026): the same as the feasibility jobs, via
 * utils/background-trigger.ts — the site's netlify.app address, CRON_SECRET
 * bearer, redirects never followed, only a real 202 counts. It used to call
 * the Cloudflare-protected production host, which answers with a 302 to the
 * Access login page, so this job had never actually run (and following that
 * redirect could read as success). TFN_REDACT_FUNCTION_URL still overrides.
 */
import { backgroundFunctionUrl, triggerBackgroundFunction } from "./background-trigger";

export const IMAGE_REDACT_FUNCTION = "/.netlify/functions/tfn-image-redact-background";

export async function requestImageRedaction(documentIds: string[]): Promise<boolean> {
  const ids = documentIds.filter(Boolean);
  if (!ids.length) return false;
  const url = backgroundFunctionUrl(IMAGE_REDACT_FUNCTION, process.env.TFN_REDACT_FUNCTION_URL);
  return (await triggerBackgroundFunction(url, { documentIds: ids }, "tfn-image-redact")).ok;
}
