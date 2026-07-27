/**
 * Headless-Chromium HTML → PDF, shared by the server-side compliance-document
 * PDF endpoints (Needs Analysis first; Fact Find / Credit Auth to follow).
 *
 * WHY Chromium (not @react-pdf): the on-screen print document
 * (NeedsAnalysisPrintDocument) is the validated exact-YLA layout. Rendering that
 * same self-styled HTML through a real browser gives a PDF that is byte-for-byte
 * the print preview — no second, drift-prone re-implementation of the layout.
 *
 * ENV-AWARE LAUNCH. Serverless (Netlify/Lambda) has no system Chrome, so we ship
 * one via @sparticuz/chromium and point puppeteer-core at it. Local dev uses an
 * already-installed Chrome/Edge (detected, or PUPPETEER_EXECUTABLE_PATH) so we
 * don't pull a ~300 MB browser into devDependencies. Either way the browser is
 * ALWAYS closed in a finally, so a render failure can't leak a Chromium process.
 */

import fs from "node:fs";
import puppeteer, { type Browser, type PDFOptions } from "puppeteer-core";

/** True when we're running where no system browser exists (serverless/CI-prod). */
function isServerless(): boolean {
  return (
    !!process.env.AWS_LAMBDA_FUNCTION_VERSION ||
    !!process.env.NETLIFY ||
    !!process.env.AWS_EXECUTION_ENV ||
    process.env.NODE_ENV === "production"
  );
}

/** First existing path from a candidate list, or null. */
function firstExisting(paths: (string | undefined)[]): string | null {
  for (const p of paths) {
    if (p && fs.existsSync(p)) return p;
  }
  return null;
}

/**
 * Locate a Chrome/Chromium/Edge binary for LOCAL dev. Prefers an explicit
 * override, then the platform's usual install locations. Throws a clear,
 * actionable error if none is found — better than a cryptic puppeteer spawn
 * failure.
 */
function devExecutablePath(): string {
  const override = process.env.PUPPETEER_EXECUTABLE_PATH || process.env.CHROME_PATH;
  if (override) return override;

  const candidates: Record<string, (string | undefined)[]> = {
    win32: [
      `${process.env["ProgramFiles"]}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env["ProgramFiles(x86)"]}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env["LOCALAPPDATA"]}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env["ProgramFiles(x86)"]}\\Microsoft\\Edge\\Application\\msedge.exe`,
      `${process.env["ProgramFiles"]}\\Microsoft\\Edge\\Application\\msedge.exe`,
    ],
    darwin: [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    ],
    linux: [
      "/usr/bin/google-chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/usr/bin/microsoft-edge",
    ],
  };

  const found = firstExisting(candidates[process.platform] ?? []);
  if (found) return found;
  throw new Error(
    "No local Chrome/Chromium found for PDF rendering. Install Chrome or set PUPPETEER_EXECUTABLE_PATH to a Chromium binary.",
  );
}

/** puppeteer-core launch options for the current environment. */
async function launchBrowser(): Promise<Browser> {
  if (isServerless()) {
    // Dynamic import so the heavy serverless binary never loads in dev.
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }
  return puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    executablePath: devExecutablePath(),
    headless: true,
  });
}

/**
 * Launch failures that are worth another go rather than a 500.
 *
 * ETXTBSY is the one we actually hit: @sparticuz/chromium extracts its binary
 * into /tmp on first use, and a second invocation reaching exec() while that
 * write is still in flight gets "text file busy". It is purely a cold-start
 * race — the same call succeeds moments later. It cost a YLA submission one
 * failed attempt on 2026-07-27; the sweep's next run recovered it, but that is
 * up to two hours of delay for something a 250 ms wait fixes.
 *
 * Deliberately narrow. A missing binary or a bad executablePath also surfaces
 * as "Failed to launch the browser process", and retrying THAT just turns a
 * clear configuration error into a slow one.
 */
export function isTransientLaunchFailure(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.message} ${err.stack ?? ""}` : String(err);
  return /\bETXTBSY\b|\bEAGAIN\b|\bEBUSY\b/i.test(msg);
}

const LAUNCH_ATTEMPTS = 3;
/** Waits before attempts 2 and 3. Short: we are inside a serverless budget. */
const LAUNCH_BACKOFF_MS = [250, 750];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Run a browser launch, retrying only the transient races above. Exported so the
 * retry policy can be tested without spawning a real Chromium.
 */
export async function withLaunchRetry<T>(
  launch: () => Promise<T>,
  wait: (ms: number) => Promise<unknown> = sleep,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await launch();
    } catch (err) {
      if (attempt >= LAUNCH_ATTEMPTS || !isTransientLaunchFailure(err)) throw err;
      await wait(LAUNCH_BACKOFF_MS[attempt - 1] ?? LAUNCH_BACKOFF_MS.at(-1)!);
    }
  }
}

/** A4, backgrounds on, ~10 mm margins (the print doc lays out to a 190 mm body). */
const DEFAULT_PDF_OPTIONS: PDFOptions = {
  format: "A4",
  printBackground: true,
  margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
};

/** How long a single render may take before we give up (guards a stuck page). */
const RENDER_TIMEOUT_MS = 30_000;

/**
 * Render a full standalone HTML string to a PDF. The HTML must be self-contained
 * (inline CSS, embedded images) — the headless page has no access to the app's
 * stylesheet or the public/ folder over the network.
 */
export async function htmlToPdf(html: string, options: PDFOptions = {}): Promise<Uint8Array> {
  let browser: Browser | null = null;
  try {
    browser = await withLaunchRetry(launchBrowser);
    const page = await browser.newPage();
    // The HTML is fully self-contained (inline CSS + data-URI logo), so there are
    // no network requests to settle — "load" (fires after inline images decode)
    // is the right, and only setContent-supported, wait condition.
    await page.setContent(html, { waitUntil: "load", timeout: RENDER_TIMEOUT_MS });
    const pdf = await page.pdf({ ...DEFAULT_PDF_OPTIONS, ...options });
    return pdf;
  } finally {
    // Always tear the browser down — a leaked Chromium in a serverless function
    // is a slow resource leak that eventually fails cold starts.
    if (browser) await browser.close().catch(() => {});
  }
}
