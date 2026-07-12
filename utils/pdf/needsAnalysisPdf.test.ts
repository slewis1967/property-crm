import { describe, expect, it } from "vitest";
import { renderNeedsAnalysisHtml } from "./needsAnalysisPdf";
import { emptyNeedsAnalysis, hydrateNeedsAnalysis, type NeedsAnalysisData } from "../needsAnalysis";

/**
 * The HTML builder is the testable seam of the server PDF path (the Chromium
 * launch itself isn't unit-testable). These pin the properties the PDF depends
 * on: it's a complete, self-styled document, it carries the exact YLA heading,
 * it reflects the data, and the logo is inlined as a data URI (never left as the
 * un-fetchable /yla-logo.png network path).
 */

function sample(): NeedsAnalysisData {
  const d = emptyNeedsAnalysis();
  d.applicants[0].surname = "Smith";
  d.applicants[0].given_names = "John";
  d.loan_amount_sought = 425000;
  d.needs_objectives = "Purchase first home in Brisbane.";
  return hydrateNeedsAnalysis(d);
}

const DATA_URI = "data:image/png;base64,AAAA";

describe("renderNeedsAnalysisHtml", () => {
  it("produces a complete, self-styled HTML document", async () => {
    const html = await renderNeedsAnalysisHtml(sample(), DATA_URI);
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("</html>");
    // The print document's own inline stylesheet must be present (no reliance on
    // the app's global Tailwind sheet, which the headless page never loads).
    expect(html).toContain("<style>");
    expect(html).toContain(".yla-doc");
    expect(html).toContain(".yla-page");
  });

  it("carries the exact YLA heading and the applicant's data", async () => {
    const html = await renderNeedsAnalysisHtml(sample(), DATA_URI);
    expect(html).toContain("CLIENT NEEDS ANALYSIS");
    expect(html).toContain("Smith");
    expect(html).toContain("Purchase first home in Brisbane.");
  });

  it("inlines the logo as a data URI and drops the network src", async () => {
    const html = await renderNeedsAnalysisHtml(sample(), DATA_URI);
    expect(html).toContain(`src="${DATA_URI}"`);
    expect(html).not.toContain('src="/yla-logo.png"');
  });

  it("leaves the layout intact (logo src untouched) when no data URI is available", async () => {
    const html = await renderNeedsAnalysisHtml(sample(), "");
    // Falls back to the original src rather than injecting an empty one.
    expect(html).toContain('src="/yla-logo.png"');
  });
});
