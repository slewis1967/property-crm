/**
 * Build the standalone, fully-styled HTML for a Credit File Authorisation PDF.
 *
 * SELF-STYLED, SO NO EXTERNAL DEPENDENCIES. CreditAuthorisationPrintDocument
 * renders its own inline `<style>` block of `.ca-*` rules (not Tailwind
 * utilities), so `renderToStaticMarkup` already yields a fully styled fragment
 * with no reliance on the app's global stylesheet — which the headless browser
 * never loads. The document uses a text letterhead (no logo image), so the page
 * is 100% self-contained: byte-identical to the on-screen print preview.
 *
 * `react-dom/server` is imported dynamically (not at module top level): Next's
 * bundler rejects a static `react-dom/server` import in the app graph, and this
 * server-only path only needs it at call time.
 */

import { createElement } from "react";
import CreditAuthorisationPrintDocument from "../../app/credit-authorisation/[id]/CreditAuthorisationPrintDocument";
import type { CreditAuthorisationData } from "../creditAuthorisation";
import type { SignatureMark } from "../signatures";

/**
 * Render the credit authorisation to a complete HTML document ready for
 * htmlToPdf. Pass `signatures` (per applicant, signer_index-1) to bake captured
 * e-signatures into the signature table; omit for the unsigned PDF.
 */
export async function renderCreditAuthorisationHtml(
  data: CreditAuthorisationData,
  signatures?: (SignatureMark | null)[],
): Promise<string> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const body = renderToStaticMarkup(createElement(CreditAuthorisationPrintDocument, { data, signatures }));

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
