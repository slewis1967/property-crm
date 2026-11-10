import { describe, expect, it } from "vitest";
import { renderFactFindHtml } from "./factFindPdf";
import { emptyFactFind, hydrateFactFind, type FactFindData } from "../factfind";

/**
 * The HTML builder is the testable seam of the server PDF path (the Chromium
 * launch itself isn't unit-testable). These pin the properties the PDF depends
 * on: it's a complete, self-styled document, it carries the Fact Find heading,
 * and it reflects the captured data (applicant, loan, disclosures, privacy copy).
 */

function sample(): FactFindData {
  const d = emptyFactFind();
  d.applicants[0].family_name = "Smith";
  d.applicants[0].given_names = "John";
  d.applicants[0].annual_income = 95000;
  d.loan.amount_required = 425000;
  d.loan.purpose = "Purchase first home in Brisbane.";
  d.financials.assets[0].value = 600000;
  d.disclosures.bankruptcy.answer = "no";
  return hydrateFactFind(d);
}

describe("renderFactFindHtml", () => {
  it("produces a complete, self-styled HTML document", async () => {
    const html = await renderFactFindHtml(sample());
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("</html>");
    // The print document's own inline stylesheet must be present (no reliance on
    // the app's global Tailwind sheet, which the headless page never loads).
    expect(html).toContain("<style>");
    expect(html).toContain(".ff-doc");
    expect(html).toContain(".ff-page");
    // No Tailwind utility class should leak into the standalone document.
    expect(html).not.toContain('class="rounded-xl');
  });

  it("carries the Fact Find heading and the applicant's data", async () => {
    const html = await renderFactFindHtml(sample());
    expect(html).toContain("BORROWER FACT FINDER FORM");
    expect(html).toContain("Smith");
    expect(html).toContain("Purchase first home in Brisbane.");
    // Money is formatted, not raw ("$425,000" not "425000").
    expect(html).toContain("$425,000");
  });

  it("reproduces the verbatim disclosure and privacy legal copy", async () => {
    const html = await renderFactFindHtml(sample());
    expect(html).toContain("declared bankrupt or insolvent");
    expect(html).toContain("Privacy Act 1988");
    expect(html).toContain("Consumer Credit Code");
  });
});
