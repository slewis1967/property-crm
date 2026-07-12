/**
 * Borrower Fact Find — the SELF-STYLED print/PDF document.
 *
 * Renders the same `FactFindData` blob the editable form edits
 * (utils/factfind.ts) as a clean, complete A4 document. It emits its OWN inline
 * `<style>` block of `.ff-*` rules and inline styles — NO Tailwind utility
 * classes — so `renderToStaticMarkup` yields a fully-styled standalone page that
 * renders correctly in headless Chromium (which never loads the app stylesheet).
 *
 * It mirrors the on-screen `@media print` output of FactFindForm.tsx section for
 * section (referral → applicants → entity → advisors → loan → security →
 * financial position → disclosures → declaration → purpose → privacy), with the
 * SAME house style as NeedsAnalysisPrintDocument (Arial, uppercase section
 * headers, bordered tables, grey label columns) so all three compliance PDFs
 * read as one family. Data entry stays in FactFindForm.tsx; this file never
 * edits anything and reuses the util's enums/labels so nothing can drift.
 */

import {
  DISCLOSURE_QUESTIONS,
  PURPOSE_BASES,
  computeTotals,
  formatMoney,
  type Advisor,
  type Applicant,
  type FactFindData,
  type SecurityProperty,
} from "../../../utils/factfind";

/* ── Value helpers (blank, never "null"/"undefined") ─────────────────────────── */

const t = (v: unknown): string => (v === null || v === undefined || v === "" ? "" : String(v));
const m = (n: number | null | undefined): string => formatMoney(n ?? null);

/** A bordered checkbox: empty (☐) or filled (☒). */
function Box({ on }: { on: boolean }) {
  return <span className="ff-box">{on ? "✕" : ""}</span>;
}

/** An inline checkbox with its label. */
function Chk({ on, label }: { on: boolean; label: string }) {
  return (
    <span className="ff-chk">
      <Box on={on} />
      <span>{label}</span>
    </span>
  );
}

/** Yes / No pair from a stored "yes" | "no" | null. */
function YesNo({ value }: { value: "yes" | "no" | null }) {
  return (
    <span className="ff-chkset">
      <Chk on={value === "yes"} label="Yes" />
      <Chk on={value === "no"} label="No" />
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="ff-h2">{children}</h2>;
}

/** A label | Applicant 1 | Applicant 2 row. */
function ApRow({ label, a1, a2 }: { label: React.ReactNode; a1: React.ReactNode; a2: React.ReactNode }) {
  return (
    <tr>
      <th className="ff-lbl">{label}</th>
      <td>{a1}</td>
      <td>{a2}</td>
    </tr>
  );
}

/** A simple label | value row (single value column). */
function KvRow({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <tr>
      <th className="ff-lbl">{label}</th>
      <td>{value}</td>
    </tr>
  );
}

/** The declaration signature blocks (name + date, ruled signature line). */
function Signatures({
  signatories,
}: {
  signatories: readonly { name: string; date: string }[];
}) {
  return (
    <table style={{ marginTop: 6 }}>
      <thead>
        <tr>
          <th className="ff-colhead">Applicant</th>
          <th className="ff-colhead">Print name</th>
          <th className="ff-colhead">Signature</th>
          <th className="ff-colhead" style={{ width: "22%" }}>
            Date
          </th>
        </tr>
      </thead>
      <tbody>
        {signatories.map((s, i) => (
          <tr key={i}>
            <td>Applicant {i + 1}</td>
            <td>{t(s.name)}</td>
            <td>&nbsp;</td>
            <td>{t(s.date)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ── Field group renderers ───────────────────────────────────────────────────── */

function applicantRows(a1: Applicant, a2: Applicant) {
  return (
    <>
      <ApRow label="Title" a1={t(a1.title)} a2={t(a2.title)} />
      <ApRow label="Family name" a1={t(a1.family_name)} a2={t(a2.family_name)} />
      <ApRow label="Given name/s" a1={t(a1.given_names)} a2={t(a2.given_names)} />
      <ApRow label="Capacity of applicant" a1={t(a1.capacity)} a2={t(a2.capacity)} />
      <ApRow label="Current home address" a1={t(a1.address)} a2={t(a2.address)} />
      <ApRow label="Postcode" a1={t(a1.postcode)} a2={t(a2.postcode)} />
      <ApRow label="Phone (work)" a1={t(a1.phone_work)} a2={t(a2.phone_work)} />
      <ApRow label="Phone (home)" a1={t(a1.phone_home)} a2={t(a2.phone_home)} />
      <ApRow label="Email address" a1={t(a1.email)} a2={t(a2.email)} />
      <ApRow label="Date of birth" a1={t(a1.date_of_birth)} a2={t(a2.date_of_birth)} />
      <ApRow label="Driver's licence no." a1={t(a1.drivers_licence)} a2={t(a2.drivers_licence)} />
      <ApRow label="Occupation / position / industry" a1={t(a1.occupation)} a2={t(a2.occupation)} />
      <ApRow label="Gross annual income" a1={m(a1.annual_income)} a2={m(a2.annual_income)} />
      <ApRow label="HECS/HELP balance owing" a1={m(a1.hecs_balance)} a2={m(a2.hecs_balance)} />
    </>
  );
}

function advisorColumns(who: "Solicitor" | "Accountant", adv: Advisor) {
  return (
    <>
      <tr>
        <th className="ff-group" colSpan={2}>
          {who}
        </th>
      </tr>
      <KvRow label="Name of firm" value={t(adv.firm)} />
      <KvRow label="Address" value={t(adv.address)} />
      <KvRow label="Postcode" value={t(adv.postcode)} />
      <KvRow label="Telephone" value={t(adv.telephone)} />
      <KvRow label="Fax" value={t(adv.fax)} />
      <KvRow label="Contact name" value={t(adv.contact_name)} />
      {who === "Solicitor" && (
        <>
          <KvRow label="DX no." value={t(adv.dx_number)} />
          <KvRow label="DX location" value={t(adv.dx_location)} />
        </>
      )}
    </>
  );
}

function SecurityTable({ s, index }: { s: SecurityProperty; index: number }) {
  return (
    <table style={{ marginTop: index === 0 ? 0 : 6 }}>
      <thead>
        <tr>
          <th className="ff-group" colSpan={2}>
            Property {index + 1}
          </th>
        </tr>
      </thead>
      <tbody>
        <KvRow label="Address" value={t(s.address)} />
        <KvRow label="Suburb / Postcode" value={[t(s.suburb), t(s.postcode)].filter(Boolean).join(" / ")} />
        <KvRow label="Folio identifier" value={t(s.folio_identifier)} />
        <KvRow label="Zoning" value={t(s.zoning)} />
        <KvRow label="Use of property" value={t(s.use)} />
        <KvRow label="Ownership" value={t(s.ownership)} />
        <KvRow label="Estimated value / purchase price" value={m(s.estimated_value)} />
        <KvRow label="Rental value per week" value={m(s.rental_per_week)} />
        <KvRow label="Quick valuation requested" value={<Chk on={s.quick_valuation} label="Requested" />} />
        <KvRow label="Contact for valuer access" value={t(s.valuer_contact_name)} />
        <KvRow
          label="Valuer phone (bus / a-h / mob)"
          value={[t(s.phone_business), t(s.phone_after_hours), t(s.phone_mobile)].filter(Boolean).join(" / ")}
        />
      </tbody>
    </table>
  );
}

/* ── The privacy notice (verbatim from FactFindForm) ─────────────────────────── */

const PRIVACY_INTRO = "Important notice to applicant(s) for credit — s.18E(8)(c) and s.18L(4), Privacy Act 1988.";
const PRIVACY_PARAGRAPHS: React.ReactNode[] = [
  <p key="p1" className="ff-note-bold">
    Notice of disclosure of your credit information to a credit reporting agency.
  </p>,
  <p key="p2">We may give information about you to a credit reporting agency, for the following purposes:</p>,
  <ul key="l1">
    <li>to obtain a consumer credit report about you; and/or</li>
    <li>to allow the credit reporting agency to create or maintain a credit information file containing information about you.</li>
  </ul>,
  <p key="p3">The information is limited to:</p>,
  <ul key="l2">
    <li>identity particulars — your name, sex, address (and the previous two addresses), date of birth, name of employer, and driver&apos;s licence number;</li>
    <li>your application for credit or commercial credit — the fact that you have applied for credit and the amount;</li>
    <li>the fact that the lender is a current credit provider to you;</li>
    <li>advice that your loan repayments are no longer overdue in respect of any default that has been listed;</li>
    <li>information that, in the opinion of the lender, you have committed a serious credit infringement (that is, acted fraudulently or shown an intention not to comply with your credit obligations);</li>
    <li>dishonoured cheques — cheques drawn by you for $100 or more which have been dishonoured more than once;</li>
    <li>that credit provided to you by the lender has been paid or otherwise discharged.</li>
  </ul>,
  <p key="p4" className="ff-note-bold">
    Period to which this understanding applies
  </p>,
  <p key="p5">This information may be given before, during or after the provision of credit to you.</p>,
  <p key="p6" className="ff-note-bold">
    Statement by applicant(s) for credit
  </p>,
  <p key="p7">Please read carefully before signing. Where there is more than one applicant, each applicant must sign.</p>,
  <p key="p8">
    <strong>1. Giving information to a credit reporting agency (s.18E(8)(c) Privacy Act 1988).</strong> The service
    provider has informed me that it may give certain personal information about me to a credit reporting agency.
  </p>,
  <p key="p9">
    <strong>2. Access to commercial credit information (s.18L(4) Privacy Act 1988).</strong> I/We agree that the service
    provider may obtain information about me/us from a business which provides information about the commercial credit
    worthiness of people, for the purpose of assessing my/our application for consumer credit.
  </p>,
  <p key="p10">The information exchanged may be used:</p>,
  <ul key="l3">
    <li>to notify other credit providers of a default by me/us;</li>
    <li>to exchange information with other credit providers as to the status of this loan where I am in default with other credit providers;</li>
    <li>to assess my/our credit worthiness.</li>
  </ul>,
  <p key="p11">
    I/We understand that the information exchanged can include anything about my/our credit worthiness, credit standing,
    credit history or credit capacity that credit providers are allowed to exchange under the Privacy Act. I/We hereby
    apply to establish credit facilities with the lender and agree to abide by the attached terms and conditions. I/We
    understand that a credit check will be undertaken as part of this application and that I/we have read and understood
    the acknowledgement and authority regarding the Privacy Protection of Information.
  </p>,
];

/* ── The document ────────────────────────────────────────────────────────────── */

export default function FactFindPrintDocument({ data }: { data: FactFindData }) {
  const [a1, a2] = data.applicants;
  const totals = computeTotals(data);

  return (
    <div className="ff-doc">
      <style>{`
        .ff-doc {
          color: #000;
          background: #fff;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 10.5px;
          line-height: 1.35;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .ff-doc * { box-sizing: border-box; }
        .ff-page {
          width: 190mm;
          margin: 0 auto;
          padding: 4mm 0;
          page-break-after: always;
          break-after: page;
        }
        .ff-page:last-child { page-break-after: auto; break-after: auto; }

        .ff-doc table { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: 2px; }
        .ff-doc th, .ff-doc td {
          border: 1px solid #000;
          padding: 2px 4px;
          vertical-align: top;
          text-align: left;
          font-weight: normal;
          word-wrap: break-word;
          overflow-wrap: anywhere;
        }
        .ff-doc thead th, .ff-doc th.ff-colhead { font-weight: bold; text-align: center; background: #f0f0f0; }
        .ff-lbl { font-weight: bold; width: 30%; background: #f0f0f0; }
        .ff-group { font-weight: bold; background: #e2e2e2; text-align: left; }

        .ff-h2 { font-size: 11px; font-weight: bold; text-transform: uppercase; margin: 10px 0 3px; color: #0F4C5C; }
        .ff-title { font-size: 20px; font-weight: bold; letter-spacing: 0.5px; margin: 2px 0; color: #0F4C5C; }
        .ff-subtitle { font-size: 10px; color: #444; margin: 0 0 6px; }

        .ff-box {
          display: inline-block;
          width: 10px; height: 10px;
          border: 1px solid #000;
          line-height: 9px; text-align: center;
          font-size: 9px; font-weight: bold;
          margin-right: 3px; vertical-align: middle;
        }
        .ff-chk { display: inline-flex; align-items: center; gap: 1px; margin-right: 10px; white-space: nowrap; }
        .ff-chkset { display: inline-flex; flex-wrap: wrap; gap: 2px 6px; align-items: center; }

        .ff-total-row th, .ff-total-row td { background: #f0f0f0; font-weight: bold; }
        .ff-money { text-align: right; }
        .ff-surplus {
          border: 1px solid #000; margin-top: 6px; padding: 4px 8px;
          display: flex; justify-content: space-between; font-weight: bold; background: #E0F2F1;
        }

        .ff-note {
          border: 1px solid #000; padding: 6px 8px; margin-top: 4px;
          font-size: 9px; line-height: 1.4;
        }
        .ff-note p { margin: 0 0 4px; }
        .ff-note ul { margin: 0 0 4px 16px; padding: 0; }
        .ff-note li { margin: 0 0 1px; }
        .ff-note-bold { font-weight: bold; }
        .ff-ack { margin-top: 6px; }
      `}</style>

      {/* ══════════════════════════ PAGE 1 ══════════════════════════ */}
      <section className="ff-page">
        <div style={{ textAlign: "center" }}>
          <div className="ff-title">BORROWER FACT FINDER FORM</div>
          <div className="ff-subtitle">NextKey Property Strategists</div>
        </div>

        <table>
          <tbody>
            <KvRow label="Individuals referred by" value={t(data.referred_by)} />
          </tbody>
        </table>

        <SectionTitle>Individual Applicants</SectionTitle>
        <table>
          <thead>
            <tr>
              <th className="ff-lbl" />
              <th className="ff-colhead">Applicant 1</th>
              <th className="ff-colhead">Applicant 2</th>
            </tr>
          </thead>
          <tbody>{applicantRows(a1, a2)}</tbody>
        </table>
      </section>

      {/* ══════════════════════════ PAGE 2 ══════════════════════════ */}
      <section className="ff-page">
        <SectionTitle>Companies / Trusts</SectionTitle>
        <table>
          <tbody>
            <KvRow label="Name" value={t(data.entity.name)} />
            <KvRow label="A.C.N." value={t(data.entity.acn)} />
            <KvRow label="Entity type" value={t(data.entity.entity_type)} />
            <KvRow label="Capacity" value={t(data.entity.capacity)} />
            <KvRow
              label="Postal address / Postcode"
              value={[t(data.entity.postal_address), t(data.entity.postal_postcode)].filter(Boolean).join(" / ")}
            />
            <KvRow
              label="Trading address / Postcode"
              value={[t(data.entity.trading_address), t(data.entity.trading_postcode)].filter(Boolean).join(" / ")}
            />
            <KvRow label="Phone number" value={t(data.entity.phone)} />
            <KvRow label="Facsimile number" value={t(data.entity.fax)} />
            <KvRow label="Incorporation date" value={t(data.entity.incorporation_date)} />
            <KvRow label="Principal activity" value={t(data.entity.principal_activity)} />
          </tbody>
        </table>

        <SectionTitle>Advisors&apos; Details</SectionTitle>
        <table>
          <tbody>
            {advisorColumns("Solicitor", data.advisors.solicitor)}
            {advisorColumns("Accountant", data.advisors.accountant)}
          </tbody>
        </table>
      </section>

      {/* ══════════════════════════ PAGE 3 ══════════════════════════ */}
      <section className="ff-page">
        <SectionTitle>Details of Loan Required</SectionTitle>
        <table>
          <tbody>
            <KvRow label="Loan amount required (net of fees & charges)" value={m(data.loan.amount_required)} />
            <KvRow label="Term (months)" value={t(data.loan.term_months)} />
            <KvRow label="Expected settlement date" value={t(data.loan.expected_settlement)} />
            <KvRow label="Loan purpose" value={t(data.loan.purpose)} />
            <KvRow label="Loan repayment strategy" value={t(data.loan.repayment_strategy)} />
          </tbody>
        </table>

        <SectionTitle>Security Offered for the Loan</SectionTitle>
        {data.securities.map((s, i) => (
          <SecurityTable key={i} s={s} index={i} />
        ))}
      </section>

      {/* ══════════════════════════ PAGE 4 ══════════════════════════ */}
      <section className="ff-page">
        <SectionTitle>Personal Financial Statements</SectionTitle>
        <table>
          <tbody>
            <KvRow label="Statement for" value={t(data.financials.statement_for)} />
            <KvRow label="Dependents" value={t(data.financials.servicing.dependents)} />
            <KvRow label="Monthly living expenses" value={m(data.financials.servicing.monthly_living_expenses)} />
          </tbody>
        </table>

        <SectionTitle>Liabilities</SectionTitle>
        <table>
          <thead>
            <tr>
              <th className="ff-colhead" style={{ width: "20%" }}>
                Type
              </th>
              <th className="ff-colhead">Lender / description</th>
              <th className="ff-colhead" style={{ width: "20%" }}>
                Balance / limit
              </th>
              <th className="ff-colhead" style={{ width: "18%" }}>
                Per month
              </th>
            </tr>
          </thead>
          <tbody>
            {data.financials.liabilities.map((l) => (
              <tr key={l.id}>
                <td>{t(l.kind)}</td>
                <td>{t(l.label)}</td>
                <td className="ff-money">{m(l.balance)}</td>
                <td className="ff-money">{m(l.monthly)}</td>
              </tr>
            ))}
            <tr className="ff-total-row">
              <th className="ff-lbl" colSpan={2}>
                Total liabilities
              </th>
              <td className="ff-money">{m(totals.totalLiabilities) || "$0"}</td>
              <td className="ff-money">{m(totals.monthlyCommitments) || "$0"}</td>
            </tr>
          </tbody>
        </table>

        <SectionTitle>Assets</SectionTitle>
        <table>
          <thead>
            <tr>
              <th className="ff-colhead" style={{ width: "22%" }}>
                Type
              </th>
              <th className="ff-colhead">Description</th>
              <th className="ff-colhead" style={{ width: "22%" }}>
                Value
              </th>
            </tr>
          </thead>
          <tbody>
            {data.financials.assets.map((a) => (
              <tr key={a.id}>
                <td>{t(a.kind)}</td>
                <td>{t(a.label)}</td>
                <td className="ff-money">{m(a.value)}</td>
              </tr>
            ))}
            <tr className="ff-total-row">
              <th className="ff-lbl" colSpan={2}>
                Total assets
              </th>
              <td className="ff-money">{m(totals.totalAssets) || "$0"}</td>
            </tr>
          </tbody>
        </table>

        <div className="ff-surplus">
          <span>Surplus assets</span>
          <span>{m(totals.surplusAssets) || "$0"}</span>
        </div>
      </section>

      {/* ══════════════════════════ PAGE 5 ══════════════════════════ */}
      <section className="ff-page">
        <SectionTitle>Disclosures</SectionTitle>
        <table>
          <thead>
            <tr>
              <th className="ff-colhead">Question</th>
              <th className="ff-colhead" style={{ width: "16%" }}>
                Answer
              </th>
              <th className="ff-colhead" style={{ width: "30%" }}>
                Details
              </th>
            </tr>
          </thead>
          <tbody>
            {DISCLOSURE_QUESTIONS.map((q) => {
              const d = data.disclosures[q.key];
              return (
                <tr key={q.key}>
                  <td>{q.text}</td>
                  <td>
                    <YesNo value={d?.answer ?? null} />
                  </td>
                  <td>{t(d?.details)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <SectionTitle>Declaration</SectionTitle>
        <div className="ff-ack">
          <Chk
            on={data.declarations.info_confirmed}
            label="I confirm that the above information is complete and correct."
          />
        </div>
        <Signatures signatories={data.declarations.signatories} />
      </section>

      {/* ══════════════════════════ PAGE 6 ══════════════════════════ */}
      <section className="ff-page">
        <SectionTitle>Declaration of Purpose</SectionTitle>
        <div className="ff-note">
          <p className="ff-note-bold">
            IMPORTANT — As required under the Consumer Credit Code, Section 11, Regulation 10.
          </p>
          <p>You should only sign this declaration if this loan is wholly or predominantly for:</p>
          <ul>
            {PURPOSE_BASES.map((p) => (
              <li key={p.key}>{p.text}</li>
            ))}
          </ul>
          <p className="ff-note-bold">
            By signing this declaration, you may lose your protection under the National Credit Code.
          </p>
        </div>
        <table style={{ marginTop: 6 }}>
          <tbody>
            <KvRow
              label="Purpose selected"
              value={
                <span className="ff-chkset">
                  {PURPOSE_BASES.map((p) => (
                    <Chk
                      key={p.key}
                      on={data.declarations.purpose.basis === p.key}
                      label={`${p.key.charAt(0).toUpperCase()}${p.key.slice(1)} purposes`}
                    />
                  ))}
                </span>
              }
            />
          </tbody>
        </table>
        <div className="ff-ack">
          <Chk
            on={data.declarations.purpose.acknowledged}
            label="The applicant(s) have read the above and declare the loan is wholly or predominantly for the purpose selected."
          />
        </div>
        <Signatures signatories={data.declarations.purpose.signatories} />

        <SectionTitle>Privacy — Notice &amp; Consent</SectionTitle>
        <div className="ff-subtitle">{PRIVACY_INTRO}</div>
        <div className="ff-note">{PRIVACY_PARAGRAPHS}</div>
        <div className="ff-ack">
          <Chk
            on={data.declarations.privacy.acknowledged}
            label="The applicant(s) have read and understood the privacy notice above and consent to the disclosures described."
          />
        </div>
        <Signatures signatories={data.declarations.privacy.signatories} />
      </section>
    </div>
  );
}
