import { describe, expect, it } from "vitest";
import { renderCreditAuthorisationHtml } from "./creditAuthorisationPdf";
import {
  emptyCreditAuthorisation,
  hydrateCreditAuthorisation,
  type CreditAuthorisationData,
} from "../creditAuthorisation";

/**
 * The HTML builder is the testable seam of the server PDF path (the Chromium
 * launch itself isn't unit-testable). These pin the properties the PDF depends
 * on: it's a complete, self-styled document, it carries the exact Equifax
 * consent heading and verbatim legal body, and it reflects the filled-in
 * name/address.
 */

function sample(): CreditAuthorisationData {
  const d = emptyCreditAuthorisation();
  d.names = "John & Jane Smith";
  d.address = "12 Example St, Brisbane QLD 4000";
  d.signatories[0].signed = true;
  d.signatories[0].date = "2026-07-12";
  return hydrateCreditAuthorisation(d);
}

describe("renderCreditAuthorisationHtml", () => {
  it("produces a complete, self-styled HTML document", async () => {
    const html = await renderCreditAuthorisationHtml(sample());
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("</html>");
    expect(html).toContain("<style>");
    expect(html).toContain(".ca-doc");
    expect(html).not.toContain('class="rounded-xl');
  });

  it("carries the exact Equifax heading and verbatim legal body", async () => {
    const html = await renderCreditAuthorisationHtml(sample());
    expect(html).toContain("Access Seeker Customer Authorisation");
    expect(html).toContain("Equifax Access Seeker Report");
    expect(html).toContain("section 6L of the Privacy Act 1988");
    expect(html).toContain("https://www.equifax.com.au/privacy");
  });

  it("reflects the filled-in name and address", async () => {
    const html = await renderCreditAuthorisationHtml(sample());
    expect(html).toContain("John &amp; Jane Smith");
    expect(html).toContain("12 Example St, Brisbane QLD 4000");
  });
});
