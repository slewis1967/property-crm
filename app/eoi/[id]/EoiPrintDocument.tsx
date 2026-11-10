/**
 * Expression of Interest — the SELF-STYLED print/PDF document.
 *
 * Renders the same `EoiData` blob the form edits (utils/eoi.ts) as a clean A4
 * document, section for section matching NextKey's paper EOI: Buyer/s →
 * Solicitor → Property → Deposit → Finance → Notes → buyer signatures. Emits its
 * OWN inline `<style>` (`.eoi-*`), no Tailwind, so `renderToStaticMarkup` yields
 * a fully-styled standalone page for headless Chromium. Same house style
 * (Arial, uppercase teal headers, bordered tables, grey label columns) as the
 * Fact Find / Needs Analysis PDFs so the compliance documents read as one family.
 */

import {
  buyerNamesLine,
  buyerEmailsLine,
  buyerMobilesLine,
  formatEoiPrice,
  type EoiData,
  type TermOption,
} from "../../../utils/eoi";
import type { SignatureMark } from "../../../utils/signatures";
import PrintTick from "../../components/PrintTick";

const t = (v: unknown): string => (v === null || v === undefined || v === "" ? "" : String(v));

/** A bordered checkbox: empty or filled. */
function Box({ on }: { on: boolean }) {
  // The mark is drawn (PrintTick), not typed: the PDF renderer has no font
  // glyph for "✕" and dropped it silently, leaving every box blank.
  return <span className="eoi-box">{on ? <PrintTick /> : ""}</span>;
}

function Chk({ on, label }: { on: boolean; label: string }) {
  return (
    <span className="eoi-chk">
      <Box on={on} />
      <span>{label}</span>
    </span>
  );
}

/** Yes / No pair from a tri-state boolean. */
function YesNo({ value }: { value: boolean | null }) {
  return (
    <span className="eoi-chkset">
      <Chk on={value === true} label="Yes" />
      <Chk on={value === false} label="No" />
    </span>
  );
}

/** The 7 / 14 / 21 / Other day options, with the selected one filled. */
function DayTerms({ term, other }: { term: TermOption; other: string }) {
  return (
    <span className="eoi-chkset">
      <Chk on={term === "7"} label="7 Days" />
      <Chk on={term === "14"} label="14 Days" />
      <Chk on={term === "21"} label="21 Days" />
      <Chk on={term === "other"} label={`Other${term === "other" && other ? `: ${other}` : ""}`} />
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="eoi-h2">{children}</h2>;
}

/** A grey label | value row. `head` is the outer section label (first row only). */
function Row({ head, label, value }: { head?: string; label: React.ReactNode; value: React.ReactNode }) {
  return (
    <tr>
      {head !== undefined ? <th className="eoi-side">{head}</th> : <td className="eoi-side-empty" />}
      <th className="eoi-lbl">{label}</th>
      <td>{value}</td>
    </tr>
  );
}

/** Buyer signature blocks. When `signatures` is supplied the captured
 *  e-signature image + date render into the matching buyer's row (signer_index-1). */
function Signatures({
  names,
  signatures,
}: {
  names: string[];
  signatures?: (SignatureMark | null)[];
}) {
  const rows = names.length > 0 ? names : [""];
  return (
    <table style={{ marginTop: 6 }}>
      <thead>
        <tr>
          <th className="eoi-colhead">Buyer</th>
          <th className="eoi-colhead">Print name</th>
          <th className="eoi-colhead">Signature</th>
          <th className="eoi-colhead" style={{ width: "22%" }}>
            Date
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((name, i) => {
          const mark = signatures?.[i] ?? null;
          return (
            <tr key={i}>
              <td>Buyer {i + 1}</td>
              <td>{t(mark && mark.name ? mark.name : name)}</td>
              <td>
                {mark ? (
                  <img className="eoi-sig-img" src={mark.image} alt={`Signature of ${mark.name || `Buyer ${i + 1}`}`} />
                ) : (
                  " "
                )}
              </td>
              <td>{t(mark ? mark.date : "")}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default function EoiPrintDocument({
  data,
  signatures,
}: {
  data: EoiData;
  /** Captured e-signatures indexed by buyer (signer_index-1). Optional. */
  signatures?: (SignatureMark | null)[];
}) {
  const buyerNames = data.buyers.filter((b) => b.fullName.trim()).map((b) => b.fullName.trim());
  const fin = data.finance;

  return (
    <div className="eoi-doc">
      <style>{`
        .eoi-doc { color:#000; background:#fff; font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:1.4; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
        .eoi-doc * { box-sizing:border-box; }
        .eoi-page { width:190mm; margin:0 auto; padding:6mm 0; page-break-after:always; break-after:page; }
        .eoi-page:last-child { page-break-after:auto; break-after:auto; }
        .eoi-doc table { width:100%; border-collapse:collapse; table-layout:fixed; margin-bottom:2px; }
        .eoi-doc th, .eoi-doc td { border:1px solid #000; padding:4px 6px; vertical-align:top; text-align:left; font-weight:normal; word-wrap:break-word; overflow-wrap:anywhere; }
        .eoi-doc thead th, .eoi-doc th.eoi-colhead { font-weight:bold; text-align:center; background:#f0f0f0; }
        .eoi-side { font-weight:bold; width:16%; background:#e2e2e2; vertical-align:top; }
        .eoi-side-empty { width:16%; background:#e2e2e2; border-top:none; }
        .eoi-lbl { font-weight:bold; width:26%; background:#f5f5f5; }
        .eoi-h2 { font-size:12px; font-weight:bold; text-transform:uppercase; margin:10px 0 3px; color:#0F4C5C; }
        .eoi-title { font-size:22px; font-weight:bold; letter-spacing:.5px; color:#0F4C5C; }
        .eoi-subtitle { font-size:10px; color:#444; margin:0 0 8px; }
        .eoi-datebar { font-size:12px; margin:10px 0 12px; }
        .eoi-sig-img { max-height:30px; max-width:100%; display:block; }
        .eoi-box { display:inline-block; width:11px; height:11px; border:1px solid #000; line-height:10px; text-align:center; font-size:9px; font-weight:bold; margin-right:3px; vertical-align:middle; }
        .eoi-chk { display:inline-flex; align-items:center; gap:2px; margin-right:14px; white-space:nowrap; }
        .eoi-chkset { display:inline-flex; flex-wrap:wrap; gap:3px 8px; align-items:center; }
        .eoi-pre { white-space:pre-line; }
        .eoi-note { font-size:9px; color:#555; font-style:italic; }
      `}</style>

      {/* ══════════════════════════ PAGE 1 ══════════════════════════ */}
      <section className="eoi-page">
        <div style={{ textAlign: "center" }}>
          <div className="eoi-title">EXPRESSION OF INTEREST</div>
          <div className="eoi-subtitle">NextKey Property Strategists</div>
        </div>

        <div className="eoi-datebar">DATE: {t(data.date)}</div>

        <SectionTitle>Buyer/s</SectionTitle>
        <div className="eoi-note">
          Full name of each buyer is required. If the buyer is a company, the full name and ABN/ACN is required.
        </div>
        <table>
          <tbody>
            <Row head="Buyer/s" label="Purchasing Entity" value={t(data.purchasingEntity)} />
            <Row label="Individuals Full Names" value={buyerNamesLine(data)} />
            <Row label="Address" value={t(data.buyerAddress)} />
            <Row label="Mobile/s" value={<span className="eoi-pre">{buyerMobilesLine(data)}</span>} />
            <Row label="Fax" value={t(data.fax)} />
            <Row label="E-mail/s" value={buyerEmailsLine(data)} />
            <Row
              label="SMSF Purchase"
              value={
                <span className="eoi-chkset">
                  <YesNo value={data.smsfPurchase} />
                  {data.smsfPurchase === true && (
                    <>
                      <span style={{ marginLeft: 8 }}>Established:</span>
                      <YesNo value={data.smsfEstablished} />
                    </>
                  )}
                </span>
              }
            />
            <Row label="ACN / ABN" value={t(data.acnAbn)} />
            <Row label="Tax File No/s" value={t(data.taxFileNos)} />
          </tbody>
        </table>

        <SectionTitle>Solicitor</SectionTitle>
        <table>
          <tbody>
            <Row head="Solicitor" label="Name" value={t(data.solicitor.name)} />
            <Row label="Attention" value={t(data.solicitor.attention)} />
            <Row label="Address" value={t(data.solicitor.address)} />
            <Row label="Phone" value={t(data.solicitor.phone)} />
            <Row label="Fax" value={t(data.solicitor.fax)} />
            <Row label="E-mail" value={t(data.solicitor.email)} />
          </tbody>
        </table>
      </section>

      {/* ══════════════════════════ PAGE 2 ══════════════════════════ */}
      <section className="eoi-page">
        <SectionTitle>Property</SectionTitle>
        <table>
          <tbody>
            <Row head="Property" label="Property Address" value={t(data.property.address)} />
            <Row label="Purchase Price" value={formatEoiPrice(data.property.purchasePrice)} />
          </tbody>
        </table>

        <SectionTitle>Deposit</SectionTitle>
        <table>
          <tbody>
            <Row head="Deposit" label="Total Deposits" value={t(data.deposit.total)} />
            <Row label="Initial / Holding Deposit" value={t(data.deposit.initialHolding)} />
          </tbody>
        </table>

        <SectionTitle>Finance</SectionTitle>
        <table>
          <tbody>
            <Row
              head="Finance"
              label="Subject to finance"
              value={<YesNo value={fin.subjectToFinance} />}
            />
            <Row label="If Yes — finance term" value={<DayTerms term={fin.financeTerm} other={fin.financeOther} />} />
            <Row label="Settlement terms" value={<DayTerms term={fin.settlementTerm} other={fin.settlementOther} />} />
          </tbody>
        </table>

        <SectionTitle>Notes</SectionTitle>
        <table>
          <tbody>
            <Row head="Notes" label="Broker" value={t(data.broker.name)} />
            <Row label="Broker email" value={t(data.broker.email)} />
            <Row label="Notes" value={<span className="eoi-pre">{t(data.notes)}</span>} />
          </tbody>
        </table>

        <SectionTitle>Buyer signature/s</SectionTitle>
        <Signatures names={buyerNames} signatures={signatures} />
      </section>
    </div>
  );
}
