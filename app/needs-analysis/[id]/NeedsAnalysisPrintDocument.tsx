/**
 * NCCP Client Needs Analysis — the PRINT-ONLY document.
 *
 * The Licensor (Your Loan Assist) only accepts submissions in the exact format
 * of their original paper PDF. So when the needs analysis is printed / exported
 * / sent, the output must read as a filled-in copy of the YLA document — NOT the
 * flattened web form.
 *
 * This component takes the same `NeedsAnalysisData` blob the editable form edits
 * (utils/needsAnalysis.ts) and renders it in YLA's six-page layout: bordered
 * tables, two applicants side by side in Applicant 1 / Applicant 2 columns,
 * checkboxes drawn as ☐ / ☒ from the data. It is hidden on screen and shown
 * only under `@media print` (wrapped in `hidden print:block` by the form).
 *
 * Data entry stays in NeedsAnalysisForm.tsx; this file never edits anything and
 * reuses the util's enums/labels so the checkbox options can't drift.
 */

import {
  EMPLOYMENT_BASES,
  EMPLOYMENT_TYPES,
  INCOME_GROSS_NET,
  INTERVIEW_TYPES,
  LIVING_EXPENSE_LABELS,
  MARITAL_STATUSES,
  OWNER_OPTIONS,
  PAY_FREQUENCIES,
  PREFERRED_CONTACT_OPTIONS,
  TENURE_OPTIONS,
  computeNeedsAnalysisTotals,
  formatMoney,
  toMonthly,
  type Applicant,
  type CurrentEmployment,
  type NeedsAnalysisData,
} from "../../../utils/needsAnalysis";
import type { SignatureMark } from "../../../utils/signatures";

/* ── Enum → paper-label maps (values come from the util so they stay in sync) ─ */

type Opt = { value: string; label: string };
const opts = (values: readonly string[], labels: Record<string, string>): Opt[] =>
  values.map((v) => ({ value: v, label: labels[v] ?? v }));

const MARITAL_OPTS = opts(MARITAL_STATUSES, { single: "Single", married: "Married", de_facto: "De facto" });
const TENURE_OPTS = opts(TENURE_OPTIONS, { owns: "Owns", rents: "Rents", other: "Other" });
const EMPLOYMENT_TYPE_OPTS = opts(EMPLOYMENT_TYPES, {
  payg: "PAYG (wage)",
  self_employed: "Self Employ",
  unemployed: "Unemployed",
  retired: "Retired",
});
const EMPLOYMENT_BASIS_OPTS = opts(EMPLOYMENT_BASES, {
  casual: "Casual",
  part_time: "Part Time",
  full_time: "Full Time",
  contractor: "Contractor",
});
const GROSS_NET_OPTS = opts(INCOME_GROSS_NET, { gross: "Gross", net: "Net" });
const PAY_FREQ_OPTS = opts(PAY_FREQUENCIES, { wk: "WK", fn: "F/N", m: "M", pa: "P/A" });
const OWNER_OPTS = opts(OWNER_OPTIONS, { app1: "App 1", app2: "App 2", both: "Both" });
const INTERVIEW_OPTS: Opt[] = INTERVIEW_TYPES.map((t) => ({ value: t.key, label: t.label }));
/** Preferred-contact keys (mobile/home/work/email), straight off the util enum. */
const PREFERRED_CONTACT_KEYS = PREFERRED_CONTACT_OPTIONS;

/* ── Value helpers (blank, never "null"/"undefined") ─────────────────────────── */

const t = (v: unknown): string => (v === null || v === undefined || v === "" ? "" : String(v));
const m = (n: number | null | undefined): string => formatMoney(n ?? null);
/** Join non-empty parts with a separator (for "state / postcode", "dob / gender"). */
const joinParts = (parts: (string | number | null | undefined)[], sep = " / "): string =>
  parts.map((p) => t(p)).filter(Boolean).join(sep);

/* ── Primitive marks ─────────────────────────────────────────────────────────── */

/** A bordered checkbox: empty (☐) or filled (☒). */
function Box({ on }: { on: boolean }) {
  return <span className="yla-box">{on ? "✕" : ""}</span>;
}

/** An inline checkbox with its label. */
function Chk({ on, label }: { on: boolean; label: string }) {
  return (
    <span className="yla-chk">
      <Box on={on} />
      <span>{label}</span>
    </span>
  );
}

/** A horizontal set of labelled checkboxes; the one whose value equals `selected` is filled. */
function ChkSet({ options, selected }: { options: Opt[]; selected: string }) {
  return (
    <span className="yla-chkset">
      {options.map((o) => (
        <Chk key={o.value} on={o.value === selected} label={o.label} />
      ))}
    </span>
  );
}

/** Yes / No pair from a nullable boolean (null → neither checked). */
function YesNo({ value, yesLabel = "Yes", noLabel = "No" }: { value: boolean | null; yesLabel?: string; noLabel?: string }) {
  return (
    <span className="yla-chkset">
      <Chk on={value === true} label={yesLabel} />
      <Chk on={value === false} label={noLabel} />
    </span>
  );
}

/* ── Table building blocks ───────────────────────────────────────────────────── */

/** A label | Applicant 1 | Applicant 2 row. */
function ApRow({ label, a1, a2 }: { label: React.ReactNode; a1: React.ReactNode; a2: React.ReactNode }) {
  return (
    <tr>
      <th className="yla-lbl">{label}</th>
      <td>{a1}</td>
      <td>{a2}</td>
    </tr>
  );
}

/** A full-width sub-header row inside a two-applicant table. */
function GroupRow({ children }: { children: React.ReactNode }) {
  return (
    <tr>
      <th className="yla-group" colSpan={3}>
        {children}
      </th>
    </tr>
  );
}

/** The Applicant 1 / Applicant 2 header row for a two-applicant table. */
function ApplicantHead({ first = "" }: { first?: string }) {
  return (
    <tr>
      <th className="yla-lbl">{first}</th>
      <th>Applicant 1</th>
      <th>Applicant 2</th>
    </tr>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="yla-h2">{children}</h2>;
}

/* ── Per-applicant cell renderers ────────────────────────────────────────────── */

const dobGender = (a: Applicant) => joinParts([a.dob, a.gender]);
const dependents = (a: Applicant) => (a.dependents_count == null ? "" : `# of ${a.dependents_count}`);
const statePostcode = (state: string, postcode: string) => joinParts([state, postcode]);

/** Employment sub-block rows, shared by Current and Previous. `extra` inserts the Previous "Date Started / Finished" row. */
function employmentRows(
  emp1: CurrentEmployment,
  emp2: CurrentEmployment,
  opts_: { previous?: boolean; finished1?: string; finished2?: string } = {},
) {
  return (
    <>
      <ApRow
        label="Employment type"
        a1={<ChkSet options={EMPLOYMENT_TYPE_OPTS} selected={emp1.employment_type} />}
        a2={<ChkSet options={EMPLOYMENT_TYPE_OPTS} selected={emp2.employment_type} />}
      />
      <ApRow
        label="Employment basis"
        a1={<ChkSet options={EMPLOYMENT_BASIS_OPTS} selected={emp1.employment_basis} />}
        a2={<ChkSet options={EMPLOYMENT_BASIS_OPTS} selected={emp2.employment_basis} />}
      />
      {opts_.previous ? (
        <ApRow
          label="Date Started / Finished"
          a1={joinParts([emp1.date_started, opts_.finished1])}
          a2={joinParts([emp2.date_started, opts_.finished2])}
        />
      ) : (
        <ApRow label="Date Started" a1={t(emp1.date_started)} a2={t(emp2.date_started)} />
      )}
      <ApRow label="Occupation" a1={t(emp1.occupation)} a2={t(emp2.occupation)} />
      <ApRow
        label="Income Amount (Gross / Net)"
        a1={
          <span className="yla-inline">
            <span className="yla-money">{m(emp1.income_amount)}</span>
            <ChkSet options={GROSS_NET_OPTS} selected={emp1.income_gross_or_net} />
          </span>
        }
        a2={
          <span className="yla-inline">
            <span className="yla-money">{m(emp2.income_amount)}</span>
            <ChkSet options={GROSS_NET_OPTS} selected={emp2.income_gross_or_net} />
          </span>
        }
      />
      <ApRow
        label="Pay frequency"
        a1={<ChkSet options={PAY_FREQ_OPTS} selected={emp1.pay_frequency} />}
        a2={<ChkSet options={PAY_FREQ_OPTS} selected={emp2.pay_frequency} />}
      />
      <GroupRow>Employer</GroupRow>
      <ApRow label="Street Address" a1={t(emp1.employer.street)} a2={t(emp2.employer.street)} />
      <ApRow label="Suburb" a1={t(emp1.employer.suburb)} a2={t(emp2.employer.suburb)} />
      <ApRow
        label="State / Postcode"
        a1={statePostcode(emp1.employer.state, emp1.employer.postcode)}
        a2={statePostcode(emp2.employer.state, emp2.employer.postcode)}
      />
      <ApRow label="Contact Name" a1={t(emp1.employer.contact_name)} a2={t(emp2.employer.contact_name)} />
      <ApRow
        label="Contact Phone number (to verify income)"
        a1={t(emp1.employer.contact_phone)}
        a2={t(emp2.employer.contact_phone)}
      />
      <ApRow
        label="On Probation"
        a1={
          <YesNo
            value={emp1.on_probation ? true : emp1.on_probation === false ? false : null}
            yesLabel={`Yes – time left ${t(emp1.probation_time_left)}`.trim()}
          />
        }
        a2={
          <YesNo
            value={emp2.on_probation ? true : emp2.on_probation === false ? false : null}
            yesLabel={`Yes – time left ${t(emp2.probation_time_left)}`.trim()}
          />
        }
      />
    </>
  );
}

/* ── The document ────────────────────────────────────────────────────────────── */

export default function NeedsAnalysisPrintDocument({
  data,
  signatures,
}: {
  data: NeedsAnalysisData;
  /** Captured e-signatures indexed by applicant (signer_index-1). Optional —
   *  when absent the signature area renders blank ruled lines to sign by hand. */
  signatures?: (SignatureMark | null)[];
}) {
  const [a1, a2] = data.applicants;
  const totals = computeNeedsAnalysisTotals(data);
  const applicantPrintName = (a: Applicant): string =>
    [a.given_names, a.surname].map((v) => (v ?? "").trim()).filter(Boolean).join(" ");

  return (
    <div className="yla-doc">
      <style>{`
        .yla-doc {
          color: #000;
          background: #fff;
          font-family: Arial, Helvetica, sans-serif;
          font-size: 10.5px;
          line-height: 1.35;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .yla-doc * { box-sizing: border-box; }
        .yla-page {
          width: 190mm;
          margin: 0 auto;
          padding: 4mm 0;
          page-break-after: always;
          break-after: page;
        }
        .yla-page:last-child { page-break-after: auto; break-after: auto; }

        .yla-doc table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .yla-doc th, .yla-doc td {
          border: 1px solid #000;
          padding: 2px 4px;
          vertical-align: top;
          text-align: left;
          font-weight: normal;
          word-wrap: break-word;
          overflow-wrap: anywhere;
        }
        .yla-doc thead th, .yla-doc th.yla-colhead { font-weight: bold; text-align: center; }
        .yla-lbl { font-weight: bold; width: 26%; background: #f0f0f0; }
        .yla-group { font-weight: bold; background: #e2e2e2; text-align: left; }

        .yla-h2 { font-size: 11px; font-weight: bold; text-transform: uppercase; margin: 8px 0 3px; }
        .yla-title { font-size: 20px; font-weight: bold; letter-spacing: 0.5px; margin: 2px 0; }
        .yla-subtitle { font-size: 10.5px; margin: 0 0 6px; }

        .yla-sig-img { max-height: 28px; max-width: 100%; display: block; }
        .yla-box {
          display: inline-block;
          width: 10px; height: 10px;
          border: 1px solid #000;
          line-height: 9px; text-align: center;
          font-size: 9px; font-weight: bold;
          margin-right: 2px; vertical-align: middle;
        }
        .yla-chk { display: inline-flex; align-items: center; gap: 1px; margin-right: 8px; white-space: nowrap; }
        .yla-chkset { display: inline-flex; flex-wrap: wrap; gap: 2px 4px; align-items: center; }
        .yla-inline { display: inline-flex; flex-wrap: wrap; gap: 6px; align-items: center; }
        .yla-money { min-width: 60px; }

        .yla-strip { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
        .yla-strip-left > div { margin-bottom: 3px; }
        .yla-logo { width: 180px; height: auto; }

        .yla-box-field {
          border: 1px solid #000; padding: 4px 6px; min-height: 48px;
          white-space: pre-wrap; word-wrap: break-word;
        }
        .yla-3row { border: 1px solid #000; border-bottom: none; }
        .yla-3row > div { border-bottom: 1px solid #000; padding: 4px 6px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
        .yla-money-total { text-align: right; font-weight: bold; }
      `}</style>

      {/* ══════════════════════════ PAGE 1 ══════════════════════════ */}
      <section className="yla-page">
        <div className="yla-strip">
          <div className="yla-strip-left">
            <div className="yla-inline">
              <strong>Interview:</strong>
              <ChkSet options={INTERVIEW_OPTS} selected={data.interview_type} />
            </div>
            <div>
              <strong>Location:</strong> {t(data.location)}
            </div>
            <div>
              <strong>Date &amp; Time:</strong> {t(data.date_time)}
            </div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="yla-logo" src="/yla-logo.png" alt="Your Loan Assist" />
        </div>

        <div style={{ textAlign: "center" }}>
          <div className="yla-title">CLIENT NEEDS ANALYSIS</div>
          <div className="yla-subtitle">
            Please complete the below fields to enable us to assist you with your credit enquiry.
          </div>
        </div>

        <SectionTitle>Your Needs &amp; Objectives – Why do you need a loan?</SectionTitle>
        <div className="yla-box-field">{t(data.needs_objectives)}</div>

        <div className="yla-3row" style={{ marginTop: 8 }}>
          <div>
            <strong>Loan Amount sought:</strong> $ {m(data.loan_amount_sought).replace(/^\$/, "")}
          </div>
          <div>
            <strong>Have you purchased a property / signed a Contract of Sale:</strong>
            <YesNo value={data.purchased_or_signed_cos} />
          </div>
          <div>
            <strong>Are you a First Home Buyer:</strong>
            <YesNo value={data.first_home_buyer} />
          </div>
        </div>

        <SectionTitle>Personal Details</SectionTitle>
        <table>
          <thead>
            <ApplicantHead />
          </thead>
          <tbody>
            <ApRow label="Title" a1={t(a1.title)} a2={t(a2.title)} />
            <ApRow label="Surname" a1={t(a1.surname)} a2={t(a2.surname)} />
            <ApRow label="Given Name/s" a1={t(a1.given_names)} a2={t(a2.given_names)} />
            <ApRow label="Preferred Name" a1={t(a1.preferred_name)} a2={t(a2.preferred_name)} />
            <ApRow label="Previous Name" a1={t(a1.previous_name)} a2={t(a2.previous_name)} />
            <ApRow label="Date of Birth (DOB) / Gender" a1={dobGender(a1)} a2={dobGender(a2)} />
            <ApRow
              label="Marital Status"
              a1={<ChkSet options={MARITAL_OPTS} selected={a1.marital_status} />}
              a2={<ChkSet options={MARITAL_OPTS} selected={a2.marital_status} />}
            />
            <ApRow label="Dependents" a1={dependents(a1)} a2={dependents(a2)} />
            <ApRow label="Dependents DOB" a1={t(a1.dependents_dob)} a2={t(a2.dependents_dob)} />
          </tbody>
        </table>
      </section>

      {/* ══════════════════════════ PAGE 2 ══════════════════════════ */}
      <section className="yla-page">
        <SectionTitle>Address Details</SectionTitle>
        <table>
          <thead>
            <ApplicantHead />
          </thead>
          <tbody>
            <GroupRow>Current</GroupRow>
            <ApRow label="Street" a1={t(a1.current_address.street)} a2={t(a2.current_address.street)} />
            <ApRow label="Suburb" a1={t(a1.current_address.suburb)} a2={t(a2.current_address.suburb)} />
            <ApRow
              label="State / Postcode"
              a1={statePostcode(a1.current_address.state, a1.current_address.postcode)}
              a2={statePostcode(a2.current_address.state, a2.current_address.postcode)}
            />
            <ApRow label="Date moved in" a1={t(a1.current_address.date_moved_in)} a2={t(a2.current_address.date_moved_in)} />
            <ApRow
              label="Tenure"
              a1={<ChkSet options={TENURE_OPTS} selected={a1.current_address.tenure} />}
              a2={<ChkSet options={TENURE_OPTS} selected={a2.current_address.tenure} />}
            />
            <GroupRow>Previous</GroupRow>
            <ApRow label="Street" a1={t(a1.previous_address.street)} a2={t(a2.previous_address.street)} />
            <ApRow label="Suburb" a1={t(a1.previous_address.suburb)} a2={t(a2.previous_address.suburb)} />
            <ApRow
              label="State / Postcode"
              a1={statePostcode(a1.previous_address.state, a1.previous_address.postcode)}
              a2={statePostcode(a2.previous_address.state, a2.previous_address.postcode)}
            />
            <ApRow
              label="Date moved in / out"
              a1={joinParts([a1.previous_address.date_moved_in, a1.previous_address.date_moved_out])}
              a2={joinParts([a2.previous_address.date_moved_in, a2.previous_address.date_moved_out])}
            />
            <GroupRow>Mailing (if different)</GroupRow>
            <ApRow label="Street" a1={t(a1.mailing_address.street)} a2={t(a2.mailing_address.street)} />
            <ApRow label="Suburb" a1={t(a1.mailing_address.suburb)} a2={t(a2.mailing_address.suburb)} />
            <ApRow
              label="State / Postcode"
              a1={statePostcode(a1.mailing_address.state, a1.mailing_address.postcode)}
              a2={statePostcode(a2.mailing_address.state, a2.mailing_address.postcode)}
            />
          </tbody>
        </table>

        <SectionTitle>Contact Details</SectionTitle>
        <table>
          <thead>
            <tr>
              <th className="yla-lbl" />
              <th style={{ width: "14%" }}>Preferred</th>
              <th>Applicant 1</th>
              <th>Applicant 2</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ["Mobile Phone", "mobile", a1.contact.mobile_phone, a2.contact.mobile_phone],
                ["Home Phone", "home", a1.contact.home_phone, a2.contact.home_phone],
                ["Work Phone", "work", a1.contact.work_phone, a2.contact.work_phone],
                ["Email Address", "email", a1.contact.email, a2.contact.email],
              ] as const
            ).map(([label, key, v1, v2]) => (
              <tr key={key}>
                <th className="yla-lbl">{label}</th>
                <td style={{ textAlign: "center" }}>
                  <Box on={a1.contact.preferred_contact === key || a2.contact.preferred_contact === key} />
                </td>
                <td>{t(v1)}</td>
                <td>{t(v2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize: 9, marginTop: 2 }}>
          Preferred contact — Applicant 1:{" "}
          {t(PREFERRED_CONTACT_KEYS.find((k) => k === a1.contact.preferred_contact))} · Applicant 2:{" "}
          {t(PREFERRED_CONTACT_KEYS.find((k) => k === a2.contact.preferred_contact))}
        </div>

        <SectionTitle>Additional Information</SectionTitle>
        <table>
          <thead>
            <ApplicantHead />
          </thead>
          <tbody>
            <ApRow label="Mother's Maiden Name" a1={t(a1.additional.mothers_maiden_name)} a2={t(a2.additional.mothers_maiden_name)} />
            <ApRow label="ID document # (DL/Passport)" a1={t(a1.additional.id_document)} a2={t(a2.additional.id_document)} />
            <ApRow
              label="Foreign Tax Status / TFN"
              a1={t(a1.additional.foreign_tax_status_tfn)}
              a2={t(a2.additional.foreign_tax_status_tfn)}
            />
            <ApRow label="Town / Country of Birth" a1={t(a1.additional.town_country_of_birth)} a2={t(a2.additional.town_country_of_birth)} />
            <ApRow
              label="Estimated Retirement Age"
              a1={t(a1.additional.estimated_retirement_age)}
              a2={t(a2.additional.estimated_retirement_age)}
            />
          </tbody>
        </table>

        <SectionTitle>Relative Not Living With You</SectionTitle>
        <table>
          <tbody>
            <tr>
              <th className="yla-lbl">Name</th>
              <td>{t(data.relative.name)}</td>
            </tr>
            <tr>
              <th className="yla-lbl">Phone</th>
              <td>{t(data.relative.phone)}</td>
            </tr>
            <tr>
              <th className="yla-lbl">Email</th>
              <td>{t(data.relative.email)}</td>
            </tr>
            <tr>
              <th className="yla-lbl">Address</th>
              <td>{t(data.relative.address)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      {/* ══════════════════════════ PAGE 3 ══════════════════════════ */}
      <section className="yla-page">
        <SectionTitle>Employment Details (Current)</SectionTitle>
        <table>
          <thead>
            <ApplicantHead />
          </thead>
          <tbody>{employmentRows(a1.current_employment, a2.current_employment)}</tbody>
        </table>

        <SectionTitle>Employment Details (Previous – if less than 3 years in current position)</SectionTitle>
        <table>
          <thead>
            <ApplicantHead />
          </thead>
          <tbody>
            {employmentRows(a1.previous_employment, a2.previous_employment, {
              previous: true,
              finished1: a1.previous_employment.date_finished,
              finished2: a2.previous_employment.date_finished,
            })}
          </tbody>
        </table>
      </section>

      {/* ══════════════════════════ PAGE 4 ══════════════════════════ */}
      <section className="yla-page">
        <SectionTitle>
          Do you receive any other income (Bonus, Commission, Centrelink, Family Assistance)?
        </SectionTitle>
        <div className="yla-box-field">{t(data.other_income)}</div>

        <SectionTitle>Assets</SectionTitle>
        <table>
          <thead>
            <tr>
              <th className="yla-colhead" style={{ width: "22%" }}>
                Type
              </th>
              <th className="yla-colhead">Description</th>
              <th className="yla-colhead" style={{ width: "18%" }}>
                Estimated Value
              </th>
              <th className="yla-colhead" style={{ width: "22%" }}>
                Owner
              </th>
            </tr>
          </thead>
          <tbody>
            {data.assets.map((as) => (
              <tr key={as.id}>
                <td>{t(as.type)}</td>
                <td>
                  {t(as.description)}
                  {as.type === "Investment Property" && (
                    <div style={{ marginTop: 2 }}>Rental Income $ {m(as.rental_income).replace(/^\$/, "")}</div>
                  )}
                </td>
                <td>{m(as.estimated_value)}</td>
                <td>
                  <ChkSet options={OWNER_OPTS} selected={as.owner} />
                </td>
              </tr>
            ))}
            <tr>
              <th className="yla-lbl" colSpan={2}>
                Total Assets
              </th>
              <td className="yla-money-total">{m(totals.totalAssets) || "$0"}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </section>

      {/* ══════════════════════════ PAGE 5 ══════════════════════════ */}
      <section className="yla-page">
        <SectionTitle>Liabilities</SectionTitle>
        <table>
          <thead>
            <tr>
              <th className="yla-colhead">Type</th>
              <th className="yla-colhead">Loan Provider</th>
              <th className="yla-colhead">Loan Balance</th>
              <th className="yla-colhead">Loan Limit</th>
              <th className="yla-colhead">Repayments</th>
              <th className="yla-colhead">Loan Term</th>
              <th className="yla-colhead">Loan Start/End date</th>
              <th className="yla-colhead">Fixed/IO expiry</th>
              <th className="yla-colhead" style={{ width: "12%" }}>
                Owner
              </th>
            </tr>
          </thead>
          <tbody>
            {data.liabilities.map((l) => (
              <tr key={l.id}>
                <td>{t(l.type)}</td>
                <td>{t(l.loan_provider)}</td>
                <td>{m(l.loan_balance)}</td>
                <td>{m(l.loan_limit)}</td>
                <td>{m(l.repayments)}</td>
                <td>{t(l.loan_term)}</td>
                <td>{t(l.loan_start_end_date)}</td>
                <td>{t(l.fixed_io_expiry)}</td>
                <td>
                  <ChkSet options={OWNER_OPTS} selected={l.owner} />
                </td>
              </tr>
            ))}
            <tr>
              <th className="yla-lbl" colSpan={2}>
                Total Liabilities
              </th>
              <td className="yla-money-total">{m(totals.totalLiabilities) || "$0"}</td>
              <td colSpan={6} />
            </tr>
          </tbody>
        </table>

        <SectionTitle>Notes</SectionTitle>
        <div className="yla-box-field">{t(data.liabilities_notes)}</div>
      </section>

      {/* ══════════════════════════ PAGE 6 ══════════════════════════ */}
      <section className="yla-page">
        <SectionTitle>
          Living Expenses (if $0.00 against any Type please enter explanation as to why)
        </SectionTitle>
        <table>
          <thead>
            <tr>
              <th className="yla-colhead" style={{ width: "22%" }}>
                Expense Type
              </th>
              <th className="yla-colhead" style={{ width: "14%" }}>
                Expense Amount
              </th>
              <th className="yla-colhead" style={{ width: "20%" }}>
                Frequency (WK F/N M P/A)
              </th>
              <th className="yla-colhead" style={{ width: "16%" }}>
                Total Calc Monthly
              </th>
              <th className="yla-colhead">Description / Explanation</th>
            </tr>
          </thead>
          <tbody>
            {data.living_expenses.map((e, i) => (
              <tr key={i}>
                <td>{LIVING_EXPENSE_LABELS[i]}</td>
                <td>{m(e.amount)}</td>
                <td>
                  <ChkSet options={PAY_FREQ_OPTS} selected={e.frequency} />
                </td>
                <td>{e.amount == null ? "" : formatMoney(toMonthly(e.amount, e.frequency))}</td>
                <td>{t(e.description)}</td>
              </tr>
            ))}
            <tr>
              <th className="yla-lbl">TOTAL</th>
              <td />
              <td />
              <td className="yla-money-total">{m(totals.monthlyLivingExpenses) || "$0"}</td>
              <td />
            </tr>
          </tbody>
        </table>

        {/* Declaration + signature area. Renders captured e-signatures when
            supplied; otherwise blank ruled cells to sign by hand. */}
        <SectionTitle>Declaration</SectionTitle>
        <p style={{ margin: "4px 0 8px" }}>
          I/We declare that the information provided in this Needs Analysis is true and correct, and I/We
          consent to it being used to assess my/our credit needs and objectives.
        </p>
        <table style={{ marginTop: 6 }}>
          <thead>
            <tr>
              <th className="yla-colhead" style={{ width: "14%" }}>
                Applicant
              </th>
              <th className="yla-colhead">Print name</th>
              <th className="yla-colhead">Signature</th>
              <th className="yla-colhead" style={{ width: "22%" }}>
                Date
              </th>
            </tr>
          </thead>
          <tbody>
            {[a1, a2].map((a, i) => {
              const mark = signatures?.[i] ?? null;
              return (
                <tr key={i}>
                  <td>Applicant {i + 1}</td>
                  <td>{mark && mark.name ? mark.name : applicantPrintName(a)}</td>
                  <td style={{ height: 32 }}>
                    {mark ? (
                      <img className="yla-sig-img" src={mark.image} alt={`Signature of ${mark.name || `Applicant ${i + 1}`}`} />
                    ) : (
                      " "
                    )}
                  </td>
                  <td>{mark ? mark.date : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
