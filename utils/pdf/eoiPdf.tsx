/**
 * Build the standalone, fully-styled HTML for an Expression of Interest PDF.
 *
 * SELF-STYLED — EoiPrintDocument emits its own inline `<style>`, so
 * `renderToStaticMarkup` yields a fully-styled fragment with no reliance on the
 * app's global stylesheet (the headless browser never loads it). `react-dom/server`
 * is imported dynamically (Next's bundler rejects a static import in the app graph).
 */

import { createElement } from "react";
import EoiPrintDocument from "../../app/eoi/[id]/EoiPrintDocument";
import type { EoiData } from "../eoi";
import type { SignatureMark } from "../signatures";

/**
 * Render the EOI to a complete HTML document ready for htmlToPdf. Pass
 * `signatures` (per buyer, signer_index-1) to bake captured e-signatures into
 * the signature area; omit for the unsigned PDF.
 */
export async function renderEoiHtml(
  data: EoiData,
  signatures?: (SignatureMark | null)[],
): Promise<string> {
  const { renderToStaticMarkup } = await import("react-dom/server");
  const body = renderToStaticMarkup(createElement(EoiPrintDocument, { data, signatures }));

  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '<meta charset="utf-8" />',
    "<style>",
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
