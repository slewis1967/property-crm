/**
 * The accreditation certificate.
 *
 * Rendered here rather than from the accreditation repo's certificate.html so
 * that issuing one is something the CRM does, with the number and the name it
 * already holds, instead of a person filling in query parameters by hand and
 * hoping they typed the name the same way it appears on the agreement.
 *
 * Plain string templating, inline styles: the headless browser that turns this
 * into a PDF never loads the app stylesheet. Landscape, because a certificate
 * that prints portrait looks like an invoice.
 */

const NAVY = "#020e40";
const AMBER = "#c7894e";

const esc = (v: unknown): string =>
  String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );

export type CertificateData = {
  legalName: string;
  firmName?: string | null;
  accreditationNo: string;
  tier: "t1" | "t2";
  issuedOn: string;
  /** Blank unless this is a replacement, in which case say so on its face. */
  reissued?: boolean;
};

export async function renderCertificateHtml(d: CertificateData): Promise<string> {
  const tierLabel = d.tier === "t2" ? "Tier 2" : "Tier 1";

  return `<!DOCTYPE html>
<html lang="en-AU"><head><meta charset="utf-8" />
<style>
  html,body{margin:0;padding:0;background:#fff;}
  @page{size:A4 landscape;margin:0;}
  body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2430;}
  .sheet{box-sizing:border-box;width:297mm;height:210mm;padding:20mm 24mm;position:relative;}
  .rule{height:6px;background:${AMBER};width:120px;margin:14px auto 0;}
</style></head><body>
<div class="sheet">
  <div style="border:2px solid ${NAVY};height:100%;box-sizing:border-box;padding:16mm 18mm;text-align:center;position:relative;">

    <div style="font-size:12px;letter-spacing:.28em;text-transform:uppercase;color:${AMBER};font-weight:700;">
      Springboard Homes
    </div>

    <div style="font-size:30px;color:${NAVY};margin-top:14px;letter-spacing:-.01em;">
      Certificate of Accreditation
    </div>
    <div class="rule"></div>

    <div style="margin-top:26px;font-size:13px;color:#6b7280;">This certifies that</div>

    <div style="font-size:38px;font-weight:700;color:${NAVY};margin-top:8px;line-height:1.15;">
      ${esc(d.legalName)}
    </div>
    ${
      d.firmName?.trim()
        ? `<div style="font-size:15px;color:#4b5563;margin-top:4px;">${esc(d.firmName)}</div>`
        : ""
    }

    <div style="margin-top:22px;font-size:14px;color:#374151;max-width:170mm;margin-left:auto;margin-right:auto;line-height:1.7;">
      has completed the Springboard Homes Introducer Accreditation at <strong>${tierLabel}</strong>,
      passing the assessment in full, and is authorised to introduce clients to the
      Springboard Community Funding Program in accordance with the introducer agreement.
    </div>

    <div style="position:absolute;left:18mm;right:18mm;bottom:16mm;display:flex;justify-content:space-between;align-items:flex-end;">
      <div style="text-align:left;">
        <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#9ca3af;">Accreditation number</div>
        <div style="font-family:ui-monospace,Consolas,monospace;font-size:19px;font-weight:700;color:${NAVY};letter-spacing:.04em;">
          ${esc(d.accreditationNo)}
        </div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#9ca3af;">Issued</div>
        <div style="font-size:15px;color:${NAVY};font-weight:600;">${esc(d.issuedOn)}</div>
      </div>
    </div>

    ${
      d.reissued
        ? `<div style="position:absolute;top:10mm;right:12mm;font-size:10px;letter-spacing:.12em;
             text-transform:uppercase;color:${AMBER};border:1px solid ${AMBER};padding:3px 8px;border-radius:3px;">
             Replacement
           </div>`
        : ""
    }
  </div>
</div>
</body></html>`;
}
