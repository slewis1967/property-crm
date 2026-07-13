/**
 * Build the standalone, fully-styled HTML for a NCCP Needs Analysis PDF.
 *
 * THE CSS/AUTH PROBLEM, SOLVED (approach b). NeedsAnalysisPrintDocument is
 * SELF-STYLED — it renders its own inline `<style>` block of `.yla-*` rules
 * (not Tailwind utilities), so `renderToStaticMarkup` already yields a fully
 * styled fragment with no dependency on the app's global stylesheet. The only
 * external asset is the YLA logo (`/yla-logo.png`), which the headless browser
 * can't fetch (it's behind Cloudflare Access and off the network). We inline it
 * as a `data:` URI, so the page is 100% self-contained: no auth round-trip, no
 * navigation to a print route, byte-identical to the on-screen print preview.
 */

import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import NeedsAnalysisPrintDocument from "../../app/needs-analysis/[id]/NeedsAnalysisPrintDocument";
import type { NeedsAnalysisData } from "../needsAnalysis";
import type { SignatureMark } from "../signatures";

/** The src the print document hard-codes for the logo <img>. */
const LOGO_SRC = "/yla-logo.png";

/**
 * Read public/yla-logo.png and return it as a `data:` URI, cached across
 * invocations. Best-effort: if the file can't be read (e.g. not traced into a
 * serverless bundle) we return an empty string and the caller leaves the layout
 * intact minus the logo, rather than failing the whole PDF.
 */
let cachedLogo: string | null = null;
export function ylaLogoDataUri(): string {
  if (cachedLogo !== null) return cachedLogo;
  try {
    const file = path.join(process.cwd(), "public", "yla-logo.png");
    const base64 = fs.readFileSync(file).toString("base64");
    cachedLogo = `data:image/png;base64,${base64}`;
  } catch {
    cachedLogo = "";
  }
  return cachedLogo;
}

/**
 * Render the needs analysis to a complete HTML document ready for htmlToPdf.
 * Pure w.r.t. its inputs (the logo is passed in) so it can be unit-tested
 * without a filesystem.
 *
 * `react-dom/server` is imported dynamically (not at module top level): Next's
 * bundler rejects a static `react-dom/server` import in the app graph, and this
 * server-only path only needs it at call time.
 */
export async function renderNeedsAnalysisHtml(
  data: NeedsAnalysisData,
  logoDataUri: string,
  signatures?: (SignatureMark | null)[],
): Promise<string> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const fragment = renderToStaticMarkup(createElement(NeedsAnalysisPrintDocument, { data, signatures }));
  // Swap the network logo src for the inlined data URI (only when we have one).
  const body = logoDataUri ? fragment.split(`src="${LOGO_SRC}"`).join(`src="${logoDataUri}"`) : fragment;

  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    "<style>",
    // Minimal reset; the document itself supplies all layout/typography.
    "html,body{margin:0;padding:0;background:#fff;}",
    "@page{size:A4;margin:0;}",
    "</style>",
    "</head>",
    "<body>",
    body,
    "</body>",
    "</html>",
  ].join("");
}

/** Convenience for the route: read the logo from disk and build the HTML. */
export function needsAnalysisHtmlWithLogo(
  data: NeedsAnalysisData,
  signatures?: (SignatureMark | null)[],
): Promise<string> {
  return renderNeedsAnalysisHtml(data, ylaLogoDataUri(), signatures);
}
