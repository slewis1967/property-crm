"use client";

/**
 * NCCP Client Needs Analysis — the form. Mirrors the six-page paper "Client
 * Needs Analysis" (Your Loan Assist) section for section, so a printed copy can
 * be signed and filed against the original.
 *
 * The whole document is one `data` blob (utils/needsAnalysis.ts). Editing is
 * local; "Save" PATCHes the entire blob. The editable form is for data ENTRY
 * only — it is `print:hidden`. "Export PDF" (window.print) instead prints the
 * dedicated `NeedsAnalysisPrintDocument` (a `hidden print:block` sibling), which
 * reproduces Your Loan Assist's original six-page PDF layout. The Licensor only
 * accepts submissions in their own format, so the print output must look like a
 * filled-in copy of the YLA document, not this flattened web form.
 *
 * Mirrors app/fact-find/[id]/FactFindForm.tsx.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ASSET_TYPES,
  EMPLOYMENT_BASES,
  EMPLOYMENT_TYPES,
  INCOME_GROSS_NET,
  INTERVIEW_TYPES,
  LIABILITY_TYPES,
  LIVING_EXPENSE_LABELS,
  MARITAL_STATUSES,
  NEEDS_ANALYSIS_STATUSES,
  NEEDS_ANALYSIS_TERMINAL_STATUS,
  OWNER_OPTIONS,
  PAY_FREQUENCIES,
  PREFERRED_CONTACT_OPTIONS,
  TENURE_OPTIONS,
  computeNeedsAnalysisTotals,
  emptyAsset,
  emptyLiability,
  emptyNeedsAnalysis,
  formatMoney,
  outstandingSections,
  type Applicant,
  type NeedsAnalysisData,
} from "../../../utils/needsAnalysis";
import NeedsAnalysisPrintDocument from "./NeedsAnalysisPrintDocument";
import { LockedBanner, HistoryPanel, SaveStateIndicator } from "../../components/ComplianceDocAudit";
import { useAutosave, type AutosaveOutcome } from "../../hooks/useAutosave";

const TEAL = "#0F4C5C";

/* ── Option label maps (presentation only; util enums hold the values) ──────── */

type Opt = { value: string; label: string };
const opt = (values: readonly string[], labels: Record<string, string>): Opt[] =>
  values.map((v) => ({ value: v, label: labels[v] ?? v }));

const MARITAL_OPTS = opt(MARITAL_STATUSES, { single: "Single", married: "Married", de_facto: "De facto" });
const TENURE_OPTS = opt(TENURE_OPTIONS, { owns: "Owns", rents: "Rents", other: "Other" });
const PREFERRED_CONTACT_OPTS = opt(PREFERRED_CONTACT_OPTIONS, {
  mobile: "Mobile",
  home: "Home",
  work: "Work",
  email: "Email",
});
const EMPLOYMENT_TYPE_OPTS = opt(EMPLOYMENT_TYPES, {
  payg: "PAYG",
  self_employed: "Self-employed",
  unemployed: "Unemployed",
  retired: "Retired",
});
const EMPLOYMENT_BASIS_OPTS = opt(EMPLOYMENT_BASES, {
  casual: "Casual",
  part_time: "Part time",
  full_time: "Full time",
  contractor: "Contractor",
});
const GROSS_NET_OPTS = opt(INCOME_GROSS_NET, { gross: "Gross", net: "Net" });
const PAY_FREQUENCY_OPTS = opt(PAY_FREQUENCIES, { wk: "Weekly", fn: "Fortnightly", m: "Monthly", pa: "Annually" });
const OWNER_OPTS = opt(OWNER_OPTIONS, { app1: "Applicant 1", app2: "Applicant 2", both: "Both" });
const FREQ_OPTS = opt(PAY_FREQUENCIES, { wk: "Wk", fn: "Fn", m: "M", pa: "Pa" });

/* ── Small field primitives (mirrors FactFindForm) ──────────────────────────── */

function Label({ children }: { children: React.ReactNode }) {
  return <span className="block text-[11px] uppercase tracking-wide text-gray-500 font-semibold mb-1">{children}</span>;
}

const inputCls =
  "w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-[#0F4C5C]/30 focus:border-[#0F4C5C] transition";

/** Hidden on screen; swapped in for a money <input type=number> under @media print. */
function PrintMoney({ value }: { value: number | null }) {
  return <span className="print-value hidden tabular-nums">{formatMoney(value) || " "}</span>;
}

function Text({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    </label>
  );
}

function Money({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <div className="relative">
        <span className="no-print absolute left-2 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
        <input
          type="number"
          inputMode="decimal"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          className={`${inputCls} print-hide pl-6 tabular-nums`}
        />
        <PrintMoney value={value} />
      </div>
    </label>
  );
}

function Num({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <input
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className={`${inputCls} tabular-nums`}
      />
    </label>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly Opt[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Area({
  label,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className={inputCls} />
    </label>
  );
}

/** A tri-state Yes / No control. `null` = not yet answered. */
function YesNo({ label, value, onChange }: { label: string; value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div className="block">
      <Label>{label}</Label>
      <div className="flex gap-4 pt-1">
        {[
          { k: "yes", v: true },
          { k: "no", v: false },
        ].map(({ k, v }) => (
          <label key={k} className="flex items-center gap-1.5 text-sm">
            <input
              type="radio"
              checked={value === v}
              onChange={() => onChange(v)}
              className="w-4 h-4"
            />
            <span className="uppercase text-xs font-semibold text-gray-700">{k}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 break-inside-avoid">
      <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: TEAL }}>
        {title}
      </h2>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return <h4 className="text-[11px] font-bold text-gray-600 uppercase tracking-wide mt-4 mb-2">{children}</h4>;
}

/* ── Per-applicant block ────────────────────────────────────────────────────── */

function ApplicantBlock({
  a,
  i,
  set,
}: {
  a: Applicant;
  i: number;
  set: (mut: (ap: Applicant) => void) => void;
}) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-bold text-gray-700">Applicant {i + 1}</h3>

      {/* Identity */}
      <div className="grid grid-cols-3 gap-3">
        <Text label="Title" placeholder="Mr / Mrs / Ms / Dr" value={a.title} onChange={(v) => set((x) => void (x.title = v))} />
        <div className="col-span-2">
          <Text label="Surname" value={a.surname} onChange={(v) => set((x) => void (x.surname = v))} />
        </div>
      </div>
      <Text label="Given name(s)" value={a.given_names} onChange={(v) => set((x) => void (x.given_names = v))} />
      <div className="grid grid-cols-2 gap-3">
        <Text label="Preferred name" value={a.preferred_name} onChange={(v) => set((x) => void (x.preferred_name = v))} />
        <Text label="Previous name" value={a.previous_name} onChange={(v) => set((x) => void (x.previous_name = v))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Text label="Date of birth" type="date" value={a.dob} onChange={(v) => set((x) => void (x.dob = v))} />
        <Text label="Gender" value={a.gender} onChange={(v) => set((x) => void (x.gender = v))} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Select
          label="Marital status"
          value={a.marital_status}
          options={MARITAL_OPTS}
          onChange={(v) => set((x) => void (x.marital_status = v))}
        />
        <Num label="Dependents" value={a.dependents_count} onChange={(v) => set((x) => void (x.dependents_count = v))} />
        <Text
          label="Dependents' DOB"
          value={a.dependents_dob}
          onChange={(v) => set((x) => void (x.dependents_dob = v))}
        />
      </div>

      {/* Current address */}
      <SubHeading>Current address</SubHeading>
      <Text label="Street" value={a.current_address.street} onChange={(v) => set((x) => void (x.current_address.street = v))} />
      <div className="grid grid-cols-3 gap-3">
        <Text label="Suburb" value={a.current_address.suburb} onChange={(v) => set((x) => void (x.current_address.suburb = v))} />
        <Text label="State" value={a.current_address.state} onChange={(v) => set((x) => void (x.current_address.state = v))} />
        <Text label="Postcode" value={a.current_address.postcode} onChange={(v) => set((x) => void (x.current_address.postcode = v))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Text
          label="Date moved in"
          type="date"
          value={a.current_address.date_moved_in}
          onChange={(v) => set((x) => void (x.current_address.date_moved_in = v))}
        />
        <Select
          label="Owns / rents / other"
          value={a.current_address.tenure}
          options={TENURE_OPTS}
          onChange={(v) => set((x) => void (x.current_address.tenure = v))}
        />
      </div>

      {/* Previous address */}
      <SubHeading>Previous address (if &lt; 3 years)</SubHeading>
      <Text label="Street" value={a.previous_address.street} onChange={(v) => set((x) => void (x.previous_address.street = v))} />
      <div className="grid grid-cols-3 gap-3">
        <Text label="Suburb" value={a.previous_address.suburb} onChange={(v) => set((x) => void (x.previous_address.suburb = v))} />
        <Text label="State" value={a.previous_address.state} onChange={(v) => set((x) => void (x.previous_address.state = v))} />
        <Text label="Postcode" value={a.previous_address.postcode} onChange={(v) => set((x) => void (x.previous_address.postcode = v))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Text
          label="Date moved in"
          type="date"
          value={a.previous_address.date_moved_in}
          onChange={(v) => set((x) => void (x.previous_address.date_moved_in = v))}
        />
        <Text
          label="Date moved out"
          type="date"
          value={a.previous_address.date_moved_out}
          onChange={(v) => set((x) => void (x.previous_address.date_moved_out = v))}
        />
      </div>

      {/* Mailing address */}
      <SubHeading>Mailing address (if different)</SubHeading>
      <Text label="Street" value={a.mailing_address.street} onChange={(v) => set((x) => void (x.mailing_address.street = v))} />
      <div className="grid grid-cols-3 gap-3">
        <Text label="Suburb" value={a.mailing_address.suburb} onChange={(v) => set((x) => void (x.mailing_address.suburb = v))} />
        <Text label="State" value={a.mailing_address.state} onChange={(v) => set((x) => void (x.mailing_address.state = v))} />
        <Text label="Postcode" value={a.mailing_address.postcode} onChange={(v) => set((x) => void (x.mailing_address.postcode = v))} />
      </div>

      {/* Contact */}
      <SubHeading>Contact</SubHeading>
      <div className="grid grid-cols-3 gap-3">
        <Text label="Mobile" value={a.contact.mobile_phone} onChange={(v) => set((x) => void (x.contact.mobile_phone = v))} />
        <Text label="Home" value={a.contact.home_phone} onChange={(v) => set((x) => void (x.contact.home_phone = v))} />
        <Text label="Work" value={a.contact.work_phone} onChange={(v) => set((x) => void (x.contact.work_phone = v))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Text label="Email" type="email" value={a.contact.email} onChange={(v) => set((x) => void (x.contact.email = v))} />
        <Select
          label="Preferred contact"
          value={a.contact.preferred_contact}
          options={PREFERRED_CONTACT_OPTS}
          onChange={(v) => set((x) => void (x.contact.preferred_contact = v))}
        />
      </div>

      {/* Additional */}
      <SubHeading>Additional details</SubHeading>
      <div className="grid grid-cols-2 gap-3">
        <Text
          label="Mother's maiden name"
          value={a.additional.mothers_maiden_name}
          onChange={(v) => set((x) => void (x.additional.mothers_maiden_name = v))}
        />
        <Text
          label="ID document (DL / Passport #)"
          value={a.additional.id_document}
          onChange={(v) => set((x) => void (x.additional.id_document = v))}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Text
          label="Foreign tax status / TFN"
          value={a.additional.foreign_tax_status_tfn}
          onChange={(v) => set((x) => void (x.additional.foreign_tax_status_tfn = v))}
        />
        <Text
          label="Town / country of birth"
          value={a.additional.town_country_of_birth}
          onChange={(v) => set((x) => void (x.additional.town_country_of_birth = v))}
        />
      </div>
      <Text
        label="Estimated retirement age"
        value={a.additional.estimated_retirement_age}
        onChange={(v) => set((x) => void (x.additional.estimated_retirement_age = v))}
      />

      {/* Current employment */}
      <SubHeading>Current employment</SubHeading>
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Employment type"
          value={a.current_employment.employment_type}
          options={EMPLOYMENT_TYPE_OPTS}
          onChange={(v) => set((x) => void (x.current_employment.employment_type = v))}
        />
        <Select
          label="Basis"
          value={a.current_employment.employment_basis}
          options={EMPLOYMENT_BASIS_OPTS}
          onChange={(v) => set((x) => void (x.current_employment.employment_basis = v))}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Text
          label="Date started"
          type="date"
          value={a.current_employment.date_started}
          onChange={(v) => set((x) => void (x.current_employment.date_started = v))}
        />
        <Text
          label="Occupation"
          value={a.current_employment.occupation}
          onChange={(v) => set((x) => void (x.current_employment.occupation = v))}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Money
          label="Income amount"
          value={a.current_employment.income_amount}
          onChange={(v) => set((x) => void (x.current_employment.income_amount = v))}
        />
        <Select
          label="Gross / net"
          value={a.current_employment.income_gross_or_net}
          options={GROSS_NET_OPTS}
          onChange={(v) => set((x) => void (x.current_employment.income_gross_or_net = v))}
        />
        <Select
          label="Frequency"
          value={a.current_employment.pay_frequency}
          options={PAY_FREQUENCY_OPTS}
          onChange={(v) => set((x) => void (x.current_employment.pay_frequency = v))}
        />
      </div>
      <p className="text-[11px] text-gray-500">Employer</p>
      <Text
        label="Employer street"
        value={a.current_employment.employer.street}
        onChange={(v) => set((x) => void (x.current_employment.employer.street = v))}
      />
      <div className="grid grid-cols-3 gap-3">
        <Text
          label="Suburb"
          value={a.current_employment.employer.suburb}
          onChange={(v) => set((x) => void (x.current_employment.employer.suburb = v))}
        />
        <Text
          label="State"
          value={a.current_employment.employer.state}
          onChange={(v) => set((x) => void (x.current_employment.employer.state = v))}
        />
        <Text
          label="Postcode"
          value={a.current_employment.employer.postcode}
          onChange={(v) => set((x) => void (x.current_employment.employer.postcode = v))}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Text
          label="Employer contact name"
          value={a.current_employment.employer.contact_name}
          onChange={(v) => set((x) => void (x.current_employment.employer.contact_name = v))}
        />
        <Text
          label="Employer contact phone"
          value={a.current_employment.employer.contact_phone}
          onChange={(v) => set((x) => void (x.current_employment.employer.contact_phone = v))}
        />
      </div>
      <div className="grid grid-cols-2 gap-3 items-end">
        <YesNo
          label="On probation?"
          value={a.current_employment.on_probation}
          onChange={(v) => set((x) => void (x.current_employment.on_probation = v))}
        />
        <Text
          label="Probation time left"
          value={a.current_employment.probation_time_left}
          onChange={(v) => set((x) => void (x.current_employment.probation_time_left = v))}
        />
      </div>

      {/* Previous employment */}
      <SubHeading>Previous employment (if &lt; 3 years)</SubHeading>
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Employment type"
          value={a.previous_employment.employment_type}
          options={EMPLOYMENT_TYPE_OPTS}
          onChange={(v) => set((x) => void (x.previous_employment.employment_type = v))}
        />
        <Select
          label="Basis"
          value={a.previous_employment.employment_basis}
          options={EMPLOYMENT_BASIS_OPTS}
          onChange={(v) => set((x) => void (x.previous_employment.employment_basis = v))}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Text
          label="Date started"
          type="date"
          value={a.previous_employment.date_started}
          onChange={(v) => set((x) => void (x.previous_employment.date_started = v))}
        />
        <Text
          label="Date finished"
          type="date"
          value={a.previous_employment.date_finished}
          onChange={(v) => set((x) => void (x.previous_employment.date_finished = v))}
        />
        <Text
          label="Occupation"
          value={a.previous_employment.occupation}
          onChange={(v) => set((x) => void (x.previous_employment.occupation = v))}
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Money
          label="Income amount"
          value={a.previous_employment.income_amount}
          onChange={(v) => set((x) => void (x.previous_employment.income_amount = v))}
        />
        <Select
          label="Gross / net"
          value={a.previous_employment.income_gross_or_net}
          options={GROSS_NET_OPTS}
          onChange={(v) => set((x) => void (x.previous_employment.income_gross_or_net = v))}
        />
        <Select
          label="Frequency"
          value={a.previous_employment.pay_frequency}
          options={PAY_FREQUENCY_OPTS}
          onChange={(v) => set((x) => void (x.previous_employment.pay_frequency = v))}
        />
      </div>
      <Text
        label="Previous employer street"
        value={a.previous_employment.employer.street}
        onChange={(v) => set((x) => void (x.previous_employment.employer.street = v))}
      />
      <div className="grid grid-cols-3 gap-3">
        <Text
          label="Suburb"
          value={a.previous_employment.employer.suburb}
          onChange={(v) => set((x) => void (x.previous_employment.employer.suburb = v))}
        />
        <Text
          label="State"
          value={a.previous_employment.employer.state}
          onChange={(v) => set((x) => void (x.previous_employment.employer.state = v))}
        />
        <Text
          label="Postcode"
          value={a.previous_employment.employer.postcode}
          onChange={(v) => set((x) => void (x.previous_employment.employer.postcode = v))}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Text
          label="Employer contact name"
          value={a.previous_employment.employer.contact_name}
          onChange={(v) => set((x) => void (x.previous_employment.employer.contact_name = v))}
        />
        <Text
          label="Employer contact phone"
          value={a.previous_employment.employer.contact_phone}
          onChange={(v) => set((x) => void (x.previous_employment.employer.contact_phone = v))}
        />
      </div>
    </div>
  );
}

/* ── The form ────────────────────────────────────────────────────────────── */

export default function NeedsAnalysisForm({ id }: { id: string }) {
  const [data, setData] = useState<NeedsAnalysisData>(emptyNeedsAnalysis());
  const [status, setStatus] = useState<string>("Draft");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  // Dirtiness is derived from a monotonic edit counter vs. the counter captured
  // at the last successful save — survives autosave (an edit mid-save keeps the
  // doc dirty rather than being wrongly cleared by the completing save).
  const [rev, setRev] = useState(0);
  const [savedRev, setSavedRev] = useState(0);
  const dirty = rev !== savedRev;
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/needs-analyses/${id}`);
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || "Load failed");
        if (cancelled) return;
        setData(json.needsAnalysis.data);
        setStatus(json.needsAnalysis.status);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  /** Structured-clone edit: mutate a draft, get a new immutable state. */
  const update = useCallback((mut: (d: NeedsAnalysisData) => void) => {
    setData((prev) => {
      const next = structuredClone(prev);
      mut(next);
      return next;
    });
    setRev((r) => r + 1);
  }, []);

  /**
   * The single save path — PATCHes the whole blob. Used by the manual Save
   * button, the status dropdown, the reopen action, AND autosave (via
   * `saveNow`). A 409 means the doc was Completed elsewhere → reflect locked and
   * stop autosaving; other failures keep the data and surface the error.
   */
  const doSave = useCallback(
    async (nextStatus?: string): Promise<AutosaveOutcome> => {
      const revAtSave = rev;
      setSaving(true);
      setError("");
      try {
        const res = await fetch(`/api/needs-analyses/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data, status: nextStatus ?? status }),
        });
        const json = await res.json();
        if (res.status === 409) {
          setStatus(NEEDS_ANALYSIS_TERMINAL_STATUS);
          setError(json.error || "This document is signed/locked.");
          return "locked";
        }
        if (!json.ok) {
          setError(json.error || "Save failed");
          return "error";
        }
        if (nextStatus) setStatus(nextStatus);
        setSavedRev(revAtSave);
        return "saved";
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
        return "error";
      } finally {
        setSaving(false);
      }
    },
    [id, data, status, rev],
  );

  // "Locked" is derived from status — a Complete document is read-only until
  // reopened. Single source of truth: NEEDS_ANALYSIS_TERMINAL_STATUS.
  const locked = status === NEEDS_ANALYSIS_TERMINAL_STATUS;

  /**
   * Download the server-rendered PDF (headless Chromium reusing the YLA print
   * document). Distinct from "Export PDF" (window.print): this yields an
   * attachable file. Saves first so the PDF reflects the latest edits — the
   * server reads the persisted blob, not the in-memory form state.
   */
  const downloadPdf = useCallback(async () => {
    setDownloading(true);
    setError("");
    try {
      if (dirty && !locked) await doSave();
      const res = await fetch(`/api/needs-analyses/${id}/pdf`);
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error || "PDF download failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `needs-analysis-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF download failed");
    } finally {
      setDownloading(false);
    }
    // `dirty` / `locked` are read fresh at call time; `doSave` is stable enough
    // for this manual action.
  }, [id, dirty, locked, doSave]);

  const {
    state: saveState,
    lastSavedAt,
    saveNow,
  } = useAutosave({ isDirty: dirty, isLocked: locked, rev, save: () => doSave() });

  if (loading) return <p className="p-6 text-sm text-gray-500">Loading needs analysis…</p>;

  const totals = computeNeedsAnalysisTotals(data);
  const missing = outstandingSections(data);
  const money = formatMoney;

  return (
    <>
      {/* Screen: the editable form (hidden when printing). */}
      <div className="h-full overflow-y-auto bg-gray-50 print:hidden">
      {/* Toolbar */}
      <div className="no-print sticky top-0 z-10 bg-gray-50/90 backdrop-blur border-b border-gray-200 px-4 py-3 flex gap-3 items-center flex-wrap">
        <Link href="/needs-analysis" className="text-sm text-gray-600 hover:text-gray-900 hover:underline">
          ← All needs analyses
        </Link>
        <div className="flex-1" />
        {!locked && <SaveStateIndicator state={saveState} lastSavedAt={lastSavedAt} onRetry={saveNow} />}
        <select
          value={status}
          onChange={(e) => void doSave(e.target.value)}
          disabled={saving}
          className="px-2 py-1.5 text-sm border border-gray-300 rounded-md bg-white"
        >
          {NEEDS_ANALYSIS_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 text-sm font-semibold rounded-lg border transition"
          style={{ borderColor: TEAL, color: TEAL }}
        >
          Export PDF
        </button>
        <button
          onClick={() => void downloadPdf()}
          disabled={downloading}
          className="px-4 py-2 text-sm font-semibold rounded-lg border transition disabled:opacity-60"
          style={{ borderColor: TEAL, color: TEAL }}
        >
          {downloading ? "Preparing…" : "Download PDF"}
        </button>
        <button
          onClick={() => saveNow()}
          disabled={saving || !dirty || locked}
          className="px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-60 transition"
          style={{ backgroundColor: TEAL }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {error && (
        <div className="no-print mx-4 mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      {locked && <LockedBanner onReopen={() => void doSave(NEEDS_ANALYSIS_STATUSES[0])} busy={saving} />}
      <HistoryPanel apiBase="/api/needs-analyses" id={id} />

      {/* When locked (Complete) every input inside is disabled — the document is
          read-only until reopened. min-w-0 keeps the fieldset from forcing its
          intrinsic min-width and overflowing on small screens. */}
      <fieldset id="needs-document" disabled={locked} className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5 min-w-0 border-0">
        {/* Letterhead */}
        <header className="text-center pb-2">
          <h1 className="text-xl font-bold tracking-wide" style={{ color: TEAL }}>
            CLIENT NEEDS ANALYSIS
          </h1>
          <p className="text-xs text-gray-500 mt-1">Your Loan Assist — NCCP credit assistance</p>
        </header>

        {/* Interview */}
        <Section title="Interview">
          <div className="grid md:grid-cols-3 gap-4 items-start">
            <div>
              <Label>Interview type</Label>
              <div className="flex flex-col gap-1.5 pt-1">
                {INTERVIEW_TYPES.map((t) => (
                  <label key={t.key} className="flex items-center gap-1.5 text-sm">
                    <input
                      type="radio"
                      name="interview_type"
                      checked={data.interview_type === t.key}
                      onChange={() => update((d) => void (d.interview_type = t.key))}
                      className="w-4 h-4"
                    />
                    <span className="text-gray-800">{t.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <Text label="Location" value={data.location} onChange={(v) => update((d) => void (d.location = v))} />
            <Text label="Date / time" value={data.date_time} onChange={(v) => update((d) => void (d.date_time = v))} />
          </div>
        </Section>

        {/* Needs & objectives */}
        <Section title="Needs & objectives">
          <Area
            label="Why do you need a loan?"
            rows={4}
            value={data.needs_objectives}
            onChange={(v) => update((d) => void (d.needs_objectives = v))}
          />
        </Section>

        {/* Loan basics */}
        <Section title="Loan basics">
          <div className="grid md:grid-cols-3 gap-4 items-end">
            <Money
              label="Loan amount sought"
              value={data.loan_amount_sought}
              onChange={(v) => update((d) => void (d.loan_amount_sought = v))}
            />
            <YesNo
              label="Purchased / signed contract of sale?"
              value={data.purchased_or_signed_cos}
              onChange={(v) => update((d) => void (d.purchased_or_signed_cos = v))}
            />
            <YesNo
              label="First home buyer?"
              value={data.first_home_buyer}
              onChange={(v) => update((d) => void (d.first_home_buyer = v))}
            />
          </div>
        </Section>

        {/* Applicants */}
        <Section title="Applicants">
          <div className="grid md:grid-cols-2 gap-8">
            {data.applicants.map((a, i) => (
              <ApplicantBlock
                key={i}
                a={a}
                i={i}
                set={(mut) => update((d) => mut(d.applicants[i]))}
              />
            ))}
          </div>
        </Section>

        {/* Relative */}
        <Section title="Relative not living with you" subtitle="A contact who does not live with you (e.g. a parent).">
          <div className="grid md:grid-cols-2 gap-3">
            <Text label="Name" value={data.relative.name} onChange={(v) => update((d) => void (d.relative.name = v))} />
            <Text label="Phone" value={data.relative.phone} onChange={(v) => update((d) => void (d.relative.phone = v))} />
            <Text
              label="Email"
              type="email"
              value={data.relative.email}
              onChange={(v) => update((d) => void (d.relative.email = v))}
            />
            <Text
              label="Address"
              value={data.relative.address}
              onChange={(v) => update((d) => void (d.relative.address = v))}
            />
          </div>
        </Section>

        {/* Other income */}
        <Section title="Other income">
          <Area
            label="Bonus, Commission, Centrelink, Family Assistance"
            rows={3}
            value={data.other_income}
            onChange={(v) => update((d) => void (d.other_income = v))}
          />
        </Section>

        {/* Assets */}
        <Section title="Assets">
          <div className="space-y-2">
            {data.assets.map((a, i) => (
              <div key={a.id} className="grid grid-cols-[1fr_1.4fr_1fr_0.9fr_1fr_auto] gap-2 items-end">
                <label className="block">
                  {i === 0 && <Label>Type</Label>}
                  <select
                    value={a.type}
                    onChange={(e) => update((d) => void (d.assets[i].type = e.target.value))}
                    className={inputCls}
                  >
                    {ASSET_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  {i === 0 && <Label>Description</Label>}
                  <input
                    value={a.description}
                    onChange={(e) => update((d) => void (d.assets[i].description = e.target.value))}
                    className={inputCls}
                  />
                </label>
                <label className="block">
                  {i === 0 && <Label>Estimated value</Label>}
                  <input
                    type="number"
                    value={a.estimated_value ?? ""}
                    onChange={(e) =>
                      update(
                        (d) => void (d.assets[i].estimated_value = e.target.value === "" ? null : Number(e.target.value)),
                      )
                    }
                    className={`${inputCls} print-hide tabular-nums`}
                  />
                  <PrintMoney value={a.estimated_value} />
                </label>
                <label className="block">
                  {i === 0 && <Label>Owner</Label>}
                  <select
                    value={a.owner}
                    onChange={(e) => update((d) => void (d.assets[i].owner = e.target.value))}
                    className={inputCls}
                  >
                    <option value="">—</option>
                    {OWNER_OPTS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  {i === 0 && <Label>Rental income</Label>}
                  <input
                    type="number"
                    placeholder={a.type === "Investment Property" ? "" : "N/A"}
                    value={a.rental_income ?? ""}
                    onChange={(e) =>
                      update(
                        (d) => void (d.assets[i].rental_income = e.target.value === "" ? null : Number(e.target.value)),
                      )
                    }
                    className={`${inputCls} print-hide tabular-nums`}
                  />
                  <PrintMoney value={a.rental_income} />
                </label>
                <button
                  onClick={() => update((d) => void d.assets.splice(i, 1))}
                  className="no-print text-gray-400 hover:text-red-600 pb-2 px-1"
                  title="Remove row"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => update((d) => void d.assets.push(emptyAsset("Other", d.assets.length)))}
            className="no-print mt-3 text-xs font-semibold hover:underline"
            style={{ color: TEAL }}
          >
            + Add asset
          </button>
          <div className="mt-4 pt-3 border-t border-gray-200 flex justify-between text-sm">
            <span className="font-semibold text-gray-700">Total assets</span>
            <span className="font-bold tabular-nums">{money(totals.totalAssets) || "$0"}</span>
          </div>
        </Section>

        {/* Liabilities */}
        <Section title="Liabilities" subtitle="For a credit card, repayments / term / dates / expiry may be left N/A.">
          <div className="space-y-2">
            {data.liabilities.map((l, i) => (
              <div key={l.id} className="grid grid-cols-[1fr_1.2fr_1fr_1fr_1fr_auto] gap-2 items-end">
                <label className="block">
                  {i === 0 && <Label>Type</Label>}
                  <select
                    value={l.type}
                    onChange={(e) => update((d) => void (d.liabilities[i].type = e.target.value))}
                    className={inputCls}
                  >
                    {LIABILITY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  {i === 0 && <Label>Loan provider</Label>}
                  <input
                    value={l.loan_provider}
                    onChange={(e) => update((d) => void (d.liabilities[i].loan_provider = e.target.value))}
                    className={inputCls}
                  />
                </label>
                <label className="block">
                  {i === 0 && <Label>Balance</Label>}
                  <input
                    type="number"
                    value={l.loan_balance ?? ""}
                    onChange={(e) =>
                      update(
                        (d) => void (d.liabilities[i].loan_balance = e.target.value === "" ? null : Number(e.target.value)),
                      )
                    }
                    className={`${inputCls} print-hide tabular-nums`}
                  />
                  <PrintMoney value={l.loan_balance} />
                </label>
                <label className="block">
                  {i === 0 && <Label>Limit</Label>}
                  <input
                    type="number"
                    value={l.loan_limit ?? ""}
                    onChange={(e) =>
                      update(
                        (d) => void (d.liabilities[i].loan_limit = e.target.value === "" ? null : Number(e.target.value)),
                      )
                    }
                    className={`${inputCls} print-hide tabular-nums`}
                  />
                  <PrintMoney value={l.loan_limit} />
                </label>
                <label className="block">
                  {i === 0 && <Label>Repayments</Label>}
                  <input
                    type="number"
                    placeholder={l.type === "Credit Card" ? "N/A" : ""}
                    value={l.repayments ?? ""}
                    onChange={(e) =>
                      update(
                        (d) => void (d.liabilities[i].repayments = e.target.value === "" ? null : Number(e.target.value)),
                      )
                    }
                    className={`${inputCls} print-hide tabular-nums`}
                  />
                  <PrintMoney value={l.repayments} />
                </label>
                <button
                  onClick={() => update((d) => void d.liabilities.splice(i, 1))}
                  className="no-print text-gray-400 hover:text-red-600 pb-2 px-1"
                  title="Remove row"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          {/* The remaining liability detail fields — one expandable row-set per liability. */}
          <div className="mt-4 space-y-3">
            {data.liabilities.map((l, i) => (
              <div key={`${l.id}-detail`} className="grid md:grid-cols-4 gap-3 border-t border-gray-100 pt-3">
                <div className="md:col-span-4 text-[11px] font-semibold text-gray-500">
                  {l.type}
                  {l.loan_provider ? ` — ${l.loan_provider}` : ` #${i + 1}`}
                </div>
                <Text
                  label="Loan term"
                  value={l.loan_term}
                  onChange={(v) => update((d) => void (d.liabilities[i].loan_term = v))}
                />
                <Text
                  label="Loan start / end date"
                  value={l.loan_start_end_date}
                  onChange={(v) => update((d) => void (d.liabilities[i].loan_start_end_date = v))}
                />
                <Text
                  label="Fixed / IO expiry"
                  value={l.fixed_io_expiry}
                  onChange={(v) => update((d) => void (d.liabilities[i].fixed_io_expiry = v))}
                />
                <Select
                  label="Owner"
                  value={l.owner}
                  options={OWNER_OPTS}
                  onChange={(v) => update((d) => void (d.liabilities[i].owner = v))}
                />
              </div>
            ))}
          </div>
          <button
            onClick={() => update((d) => void d.liabilities.push(emptyLiability("Other", d.liabilities.length)))}
            className="no-print mt-3 text-xs font-semibold hover:underline"
            style={{ color: TEAL }}
          >
            + Add liability
          </button>
          <div className="mt-4">
            <Area
              label="Notes"
              rows={2}
              value={data.liabilities_notes}
              onChange={(v) => update((d) => void (d.liabilities_notes = v))}
            />
          </div>
          <div className="mt-4 pt-3 border-t border-gray-200 flex justify-between text-sm">
            <span className="font-semibold text-gray-700">Total liabilities</span>
            <span className="font-bold tabular-nums">{money(totals.totalLiabilities) || "$0"}</span>
          </div>
        </Section>

        {/* Living expenses */}
        <Section
          title="Living expenses"
          subtitle="If $0.00 against any type, enter an explanation in the description."
        >
          <div className="space-y-2">
            <div className="grid grid-cols-[1.2fr_1fr_0.8fr_1.6fr] gap-2 text-[11px] uppercase tracking-wide text-gray-500 font-semibold">
              <span>Type</span>
              <span>Amount</span>
              <span>Freq.</span>
              <span>Description / explanation</span>
            </div>
            {data.living_expenses.map((e, i) => (
              <div key={i} className="grid grid-cols-[1.2fr_1fr_0.8fr_1.6fr] gap-2 items-center">
                <span className="text-sm text-gray-800">{LIVING_EXPENSE_LABELS[i]}</span>
                <div className="relative">
                  <span className="no-print absolute left-2 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                  <input
                    type="number"
                    value={e.amount ?? ""}
                    onChange={(ev) =>
                      update(
                        (d) =>
                          void (d.living_expenses[i].amount = ev.target.value === "" ? null : Number(ev.target.value)),
                      )
                    }
                    className={`${inputCls} print-hide pl-6 tabular-nums`}
                  />
                  <PrintMoney value={e.amount} />
                </div>
                <select
                  value={e.frequency}
                  onChange={(ev) => update((d) => void (d.living_expenses[i].frequency = ev.target.value))}
                  className={inputCls}
                >
                  {FREQ_OPTS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <input
                  value={e.description}
                  onChange={(ev) => update((d) => void (d.living_expenses[i].description = ev.target.value))}
                  className={inputCls}
                />
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-gray-200 flex justify-between text-sm">
            <span className="font-semibold text-gray-700">Total living expenses (per month)</span>
            <span className="font-bold tabular-nums">{money(totals.monthlyLivingExpenses) || "$0"}</span>
          </div>
        </Section>

        {/* Completeness helper — screen only. */}
        {missing.length > 0 && (
          <div className="no-print p-4 rounded-xl bg-amber-50 border border-amber-200">
            <p className="text-sm font-semibold text-amber-900">Outstanding before this can be marked Complete</p>
            <ul className="mt-2 ml-5 list-disc text-sm text-amber-900 space-y-0.5">
              {missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
      </fieldset>
      </div>

      {/*
        Print: the YLA-format document. Hidden on screen, shown only under
        @media print (`hidden print:block`). "Export PDF" (window.print) then
        reproduces the Your Loan Assist original layout — YLA only accepts
        submissions in their own format.
      */}
      <div className="hidden print:block">
        <NeedsAnalysisPrintDocument data={data} />
      </div>
    </>
  );
}
