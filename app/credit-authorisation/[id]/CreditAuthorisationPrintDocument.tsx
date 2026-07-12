/**
 * Credit File Authorisation — the SELF-STYLED print/PDF document.
 *
 * The Equifax "Access Seeker Report – Client Privacy Consent Form". Renders the
 * same `CreditAuthorisationData` blob the editable form edits
 * (utils/creditAuthorisation.ts) as a clean A4 consent form ready to sign.
 *
 * Like the other two compliance print docs it is SELF-STYLED — it emits its own
 * inline `<style>` block of `.ca-*` rules and inline styles (NO Tailwind utility
 * classes), so `renderToStaticMarkup` yields a fully-styled standalone page that
 * renders correctly in headless Chromium. The house style matches
 * NeedsAnalysisPrintDocument / FactFindPrintDocument (Arial, teal headings,
 * bordered signature table) so all three compliance PDFs read as one family.
 *
 * The bulk of the document is FIXED LEGAL TEXT (CREDIT_AUTHORISATION_TEXT). Only
 * the name(s), address and the signature/date blocks are filled in. This file
 * never edits anything and reuses the util's verbatim wording so it can't drift.
 */

import {
  CREDIT_AUTHORISATION_TEXT,
  type CreditAuthorisationData,
} from "../../../utils/creditAuthorisation";

const t = (v: unknown): string => (v === null || v === undefined || v === "" ? "" : String(v));

/** A bordered checkbox: empty (☐) or filled (☒). */
function Box({ on }: { on: boolean }) {
  return <span className="ca-box">{on ? "✕" : ""}</span>;
}

/**
 * Render a legal string with any embedded https:// URLs shown as underlined
 * text, leaving every other character exactly as written (used for the (d)/(e)
 * acknowledgements which cite the Equifax privacy and credit-reporting URLs).
 */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s,;]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <span key={i} className="ca-url">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

export default function CreditAuthorisationPrintDocument({ data }: { data: CreditAuthorisationData }) {
  const doc = CREDIT_AUTHORISATION_TEXT;

  return (
    <div className="ca-doc">
      <style>{`
        .ca-doc {
          color: #000;
          background: #fff;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 11px;
          line-height: 1.45;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .ca-doc * { box-sizing: border-box; }
        .ca-page {
          width: 190mm;
          margin: 0 auto;
          padding: 6mm 0;
        }
        .ca-title { font-size: 17px; font-weight: bold; margin: 0 0 4px; color: #0F4C5C; text-align: center; }
        .ca-heading {
          font-size: 12px; font-weight: bold; text-transform: uppercase;
          letter-spacing: 0.4px; text-align: center; margin: 0 0 14px; color: #333;
        }
        .ca-body { margin: 0 0 12px; }
        .ca-fill {
          border-bottom: 1px solid #000; display: inline-block;
          min-width: 160px; padding: 0 4px; font-weight: bold;
        }
        .ca-ack-intro { margin: 0 0 6px; }
        .ca-doc ol.ca-list { margin: 0 0 14px; padding: 0; list-style: none; }
        .ca-doc ol.ca-list > li {
          display: grid; grid-template-columns: 22px 1fr; gap: 2px;
          margin-bottom: 6px;
        }
        .ca-key { color: #444; }
        .ca-url { text-decoration: underline; word-break: break-all; }

        .ca-doc table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 10px; }
        .ca-doc th, .ca-doc td {
          border: 1px solid #000; padding: 6px 6px; vertical-align: bottom;
          text-align: left; font-weight: normal;
        }
        .ca-doc th.ca-colhead { font-weight: bold; text-align: center; background: #f0f0f0; vertical-align: middle; }
        .ca-sig-cell { height: 34px; }
        .ca-box {
          display: inline-block; width: 10px; height: 10px; border: 1px solid #000;
          line-height: 9px; text-align: center; font-size: 9px; font-weight: bold;
          margin-right: 4px; vertical-align: middle;
        }
      `}</style>

      <section className="ca-page">
        <div className="ca-title">{doc.title}</div>
        <div className="ca-heading">{doc.heading}</div>

        {/* "I <names> of <address> authorise …" */}
        <p className="ca-body">
          I <span className="ca-fill">{t(data.names)}</span> of{" "}
          <span className="ca-fill" style={{ minWidth: 220 }}>
            {t(data.address)}
          </span>{" "}
          {doc.body}
        </p>

        <p className="ca-ack-intro">{doc.acknowledgeIntro}</p>
        <ol className="ca-list">
          {doc.acknowledgements.map((a) => (
            <li key={a.key}>
              <span className="ca-key">({a.key})</span>
              <span>
                <Linkified text={a.text} />
              </span>
            </li>
          ))}
        </ol>

        {/* Signature / Date blocks */}
        <table>
          <thead>
            <tr>
              <th className="ca-colhead" style={{ width: "14%" }}>
                Applicant
              </th>
              <th className="ca-colhead">Signature</th>
              <th className="ca-colhead" style={{ width: "12%" }}>
                Signed
              </th>
              <th className="ca-colhead" style={{ width: "24%" }}>
                Date
              </th>
            </tr>
          </thead>
          <tbody>
            {data.signatories.map((s, i) => (
              <tr key={i}>
                <td className="ca-sig-cell">Applicant {i + 1}</td>
                <td className="ca-sig-cell">&nbsp;</td>
                <td className="ca-sig-cell" style={{ textAlign: "center" }}>
                  <Box on={s.signed} />
                </td>
                <td className="ca-sig-cell">{t(s.date)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
