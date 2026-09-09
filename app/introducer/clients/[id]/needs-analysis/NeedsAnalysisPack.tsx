"use client";

/**
 * The NCCP Client Needs Analysis, from the introducer's side.
 *
 * THIS IS THE DOCUMENT, NOT A DRAFT OF ONE. It is what the client signs and what
 * YLA receive (utils/yla-package.ts). An earlier version of this pack collected a
 * Borrower Fact Find and machine-translated it here at submit; that put
 * acknowledged guesses — an unconfirmed pay frequency, an unsplit address — into
 * a document over a real signature, and it is why the direction reversed. See
 * migrations/20260820c_introducer_pack_collects_needs_analysis.sql.
 *
 * The data is `NeedsAnalysisData` verbatim, the identical shape
 * `nccp_needs_analyses.data` holds, so promotion at submit is a copy.
 *
 * WHY NOT REUSE app/needs-analysis/[id]/NeedsAnalysisForm.tsx. Same reason the
 * fact find version was not reused: the staff form is welded to the staff
 * workspace — the compliance audit trail, the signing panel, credit
 * authorisation and AML seeding, broker submission. The portal's founding rule
 * is that an introducer sees their own clients and no internal CRM surface. So
 * the schema is shared and the chrome is not.
 *
 * STEPPED, WHERE THE STAFF FORM IS ONE PAGE. A staff member has the file open
 * and jumps around it; an introducer is sitting opposite the client working
 * through it once, on somebody else's laptop, for the better part of an hour.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ASSET_TYPES,
  EMPLOYMENT_BASES,
  EMPLOYMENT_TYPES,
  INCOME_GROSS_NET,
  INTERVIEW_TYPES,
  LIABILITY_TYPES,
  MARITAL_STATUSES,
  OTHER_INCOME_TYPES,
  OWNER_OPTIONS,
  PAY_FREQUENCIES,
  PREFERRED_CONTACT_OPTIONS,
  TENURE_OPTIONS,
  computeNeedsAnalysisTotals,
  emptyAsset,
  emptyLiability,
  emptyNeedsAnalysis,
  emptyOtherIncome,
  formatMoney,
  toMonthly,
  type Applicant,
  type NeedsAnalysisData,
} from "../../../../../utils/needsAnalysis";

const AMBER = "#c7894e";

const STEPS = [
  { key: "interview", title: "Interview", blurb: "Where and how you met, and what they need." },
  { key: "applicants", title: "Applicants", blurb: "Who is applying — identity, address and contact." },
  { key: "employment", title: "Employment", blurb: "What they do and what they earn. Be exact here." },
  { key: "assets", title: "Assets", blurb: "What they own." },
  { key: "liabilities", title: "Liabilities", blurb: "What they owe, and the repayments." },
  { key: "expenses", title: "Living expenses", blurb: "The household's monthly outgoings." },
  { key: "relative", title: "Contact person", blurb: "A relative not living with them." },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

type Loaded = { editable: boolean; status: string; clientRef: string | null; blockers: string[] };

export default function NeedsAnalysisPack({ id }: { id: string }) {
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [data, setData] = useState<NeedsAnalysisData>(emptyNeedsAnalysis());
  const [step, setStep] = useState<StepKey>("interview");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  /* Dirtiness is a monotonic counter compared against the counter captured at
   * the last successful save, not a boolean. A boolean is wrongly cleared by an
   * in-flight save completing after a fresh edit landed — the edit then looks
   * saved and is silently lost on navigate. Same approach the staff forms use,
   * and for the same bug. */
  const [rev, setRev] = useState(0);
  const [savedRev, setSavedRev] = useState(0);
  const dirty = rev !== savedRev;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/introducer/clients/${id}/needs-analysis`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 401) {
            router.push("/introducer");
            return;
          }
          setError(json.error ?? "Could not open the Needs Analysis.");
          return;
        }
        setData(json.data as NeedsAnalysisData);
        setLoaded({
          editable: Boolean(json.editable),
          status: String(json.status),
          clientRef: json.client_ref ?? null,
          blockers: (json.blockers as string[]) ?? [],
        });
      } catch {
        if (!cancelled) setError("We couldn't reach the server.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  /** Structured-clone edit: mutate a draft, get new immutable state. */
  const update = useCallback((mut: (d: NeedsAnalysisData) => void) => {
    setData((prev) => {
      const next = structuredClone(prev);
      mut(next);
      return next;
    });
    setRev((r) => r + 1);
  }, []);

  const save = useCallback(async (): Promise<boolean> => {
    const revAtSave = rev;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/introducer/clients/${id}/needs-analysis`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Could not save. Your work is still on this screen — try again.");
        return false;
      }
      setSavedRev(revAtSave);
      setSavedAt(new Date().toLocaleTimeString("en-AU", { timeStyle: "short" }));
      setLoaded((l) => (l ? { ...l, blockers: (json.blockers as string[]) ?? l.blockers } : l));
      return true;
    } catch {
      setError("We couldn't reach the server. Your work is still on this screen — try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }, [data, id, rev]);

  /* Warn on leaving with unsaved edits. The portal is used on a laptop at
   * somebody's kitchen table, mid-conversation — closing the tab by accident is
   * the realistic failure, not a server error. */
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const totals = useMemo(() => computeNeedsAnalysisTotals(data), [data]);

  async function go(next: StepKey) {
    // Save on the way out of a step, so "next" is also a checkpoint. A failed
    // save keeps them where they are rather than advancing over lost work.
    if (dirty && loaded?.editable) {
      const ok = await save();
      if (!ok) return;
    }
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (error && !loaded) {
    return (
      <div>
        <Link href={`/introducer/clients/${id}`} className="text-sm text-gray-600 hover:text-gray-900">
          ← Back to the pack
        </Link>
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      </div>
    );
  }

  if (!loaded) return <p className="text-sm text-gray-500">Opening the Needs Analysis…</p>;

  const readOnly = !loaded.editable;
  const stepIndex = STEPS.findIndex((s) => s.key === step);
  const current = STEPS[stepIndex];

  return (
    <div>
      <Link href={`/introducer/clients/${id}`} className="text-sm text-gray-600 hover:text-gray-900">
        ← Back to the pack
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Client Needs Analysis</h1>
          <p className="mt-1 text-sm text-gray-600">
            {loaded.clientRef ? `${loaded.clientRef} · ` : ""}
            Step {stepIndex + 1} of {STEPS.length} — {current.title}
          </p>
        </div>
        {!readOnly && (
          <p className="text-xs text-gray-500">
            {saving ? "Saving…" : dirty ? "Unsaved changes" : savedAt ? `Saved at ${savedAt}` : "Saved"}
          </p>
        )}
      </div>

      {/* Said once, at the top, because it changes how carefully someone fills
          this in: it is not a worksheet, it is the document their client signs. */}
      {!readOnly && (
        <p className="mt-4 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
          This is the document your client signs and the assessor reads. Take the figures from their
          payslips rather than memory — they get checked against the documents your client uploads.
        </p>
      )}

      {readOnly && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
          This pack has been submitted, so the Needs Analysis is locked. It is shown exactly as you
          sent it. If something needs correcting, contact your Springboard manager.
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <nav className="mt-5 flex flex-wrap gap-1.5">
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            onClick={() => void go(s.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
              s.key === step
                ? "bg-gray-900 text-white"
                : "bg-white text-gray-600 ring-1 ring-gray-200 hover:ring-gray-400"
            }`}
          >
            {i + 1}. {s.title}
          </button>
        ))}
      </nav>

      <p className="mt-3 text-sm text-gray-500">{current.blurb}</p>

      <fieldset disabled={readOnly} className="mt-4 space-y-5">
        {step === "interview" && <Interview data={data} update={update} />}
        {step === "applicants" && <Applicants data={data} update={update} />}
        {step === "employment" && <Employment data={data} update={update} />}
        {step === "assets" && <Assets data={data} update={update} totals={totals} />}
        {step === "liabilities" && <Liabilities data={data} update={update} totals={totals} />}
        {step === "expenses" && <Expenses data={data} update={update} totals={totals} />}
        {step === "relative" && <RelativeStep data={data} update={update} />}
      </fieldset>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        {stepIndex > 0 && (
          <button
            onClick={() => void go(STEPS[stepIndex - 1].key)}
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700"
          >
            ← {STEPS[stepIndex - 1].title}
          </button>
        )}
        {stepIndex < STEPS.length - 1 ? (
          <button
            onClick={() => void go(STEPS[stepIndex + 1].key)}
            disabled={saving}
            className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: AMBER }}
          >
            {saving ? "Saving…" : `${STEPS[stepIndex + 1].title} →`}
          </button>
        ) : (
          <button
            onClick={async () => {
              if (dirty && !(await save())) return;
              router.push(`/introducer/clients/${id}`);
              router.refresh();
            }}
            disabled={saving}
            className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: AMBER }}
          >
            {saving ? "Saving…" : "Done — back to the pack"}
          </button>
        )}
        {!readOnly && (
          <button
            onClick={() => void save()}
            disabled={saving || !dirty}
            className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 disabled:opacity-50"
          >
            Save
          </button>
        )}
      </div>

      {!readOnly && loaded.blockers.length > 0 && (
        <section className="mt-6 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <h2 className="text-sm font-semibold text-amber-900">Still needed before you can submit</h2>
          {/* The whole list, not just this step's share. A pack cannot be sent
              back for a correction, so "what is missing" has to be answerable
              without walking every step to find out. */}
          <ul className="mt-2 space-y-1 text-sm text-amber-900">
            {loaded.blockers.map((b) => (
              <li key={b}>· {b}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-amber-800">Updated each time you save.</p>
        </section>
      )}
    </div>
  );
}

/* ── Field primitives ─────────────────────────────────────────────────────── */

const inputCls =
  "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-gray-400 focus:outline-none disabled:bg-gray-50 disabled:text-gray-600";

function Text({
  label,
  value,
  onChange,
  type = "text",
  hint,
  wide = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  hint?: string;
  wide?: boolean;
}) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
      {hint && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}
    </label>
  );
}

function Money({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
        <input
          type="number"
          inputMode="decimal"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          className={`${inputCls} pl-7 tabular-nums`}
        />
      </div>
      {hint && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}
    </label>
  );
}

/** A select over plain string options, with a human label per option. */
function Choice({
  label,
  value,
  options,
  onChange,
  hint,
  wide = false,
}: {
  label: string;
  value: string;
  options: readonly { key: string; label: string }[];
  onChange: (v: string) => void;
  hint?: string;
  wide?: boolean;
}) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
      {hint && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}
    </label>
  );
}

/** Turn an enum of raw keys into labelled options: "de_facto" → "De facto". */
const opts = (keys: readonly string[]) =>
  keys.map((k) => ({ key: k, label: k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, " ") }));

const FREQUENCY_OPTIONS = [
  { key: "wk", label: "Weekly" },
  { key: "fn", label: "Fortnightly" },
  { key: "m", label: "Monthly" },
  { key: "pa", label: "Yearly" },
];

function Area({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <label className="block sm:col-span-2">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <textarea rows={3} value={value} onChange={(e) => onChange(e.target.value)} className={inputCls} />
      {hint && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}
    </label>
  );
}

function YesNo({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="sm:col-span-2">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <div className="mt-2 flex gap-2">
        {[
          { v: false, l: "No" },
          { v: true, l: "Yes" },
        ].map((o) => (
          <button
            key={o.l}
            type="button"
            onClick={() => onChange(o.v)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium ring-1 transition ${
              value === o.v
                ? "bg-gray-900 text-white ring-gray-900"
                : "bg-white text-gray-700 ring-gray-300 hover:ring-gray-400"
            }`}
          >
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
      {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}

function Total({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className={`mt-0.5 font-semibold tabular-nums ${value < 0 ? "text-red-700" : "text-gray-900"}`}>
        {formatMoney(value) || "$0"}
      </dd>
    </div>
  );
}

type Update = (mut: (d: NeedsAnalysisData) => void) => void;
type Totals = ReturnType<typeof computeNeedsAnalysisTotals>;

/* ── Steps ────────────────────────────────────────────────────────────────── */

function Interview({ data, update }: { data: NeedsAnalysisData; update: Update }) {
  return (
    <>
      <Card title="The interview" subtitle="Where and how you spoke to your client.">
        <Choice
          label="Interview type"
          value={data.interview_type}
          options={INTERVIEW_TYPES.map((t) => ({ key: t.key, label: t.label }))}
          onChange={(v) => update((d) => (d.interview_type = v))}
        />
        <Text
          label="Date and time"
          type="datetime-local"
          value={data.date_time}
          onChange={(v) => update((d) => (d.date_time = v))}
        />
        <Text
          wide
          label="Location"
          value={data.location}
          onChange={(v) => update((d) => (d.location = v))}
          hint="Where the interview took place. For a phone call, say so."
        />
      </Card>

      <Card title="What they need" subtitle="In your client's own words wherever you can.">
        <Area
          label="Needs and objectives — why do they need a loan?"
          value={data.needs_objectives}
          onChange={(v) => update((d) => (d.needs_objectives = v))}
          hint="The assessor reads this first. What are they trying to achieve, and by when?"
        />
        <Money
          label="Loan amount sought"
          value={data.loan_amount_sought}
          onChange={(v) => update((d) => (d.loan_amount_sought = v))}
        />
        <YesNo
          label="Have they purchased, or signed a contract of sale?"
          value={data.purchased_or_signed_cos}
          onChange={(v) => update((d) => (d.purchased_or_signed_cos = v))}
        />
        <YesNo
          label="First home buyer?"
          value={data.first_home_buyer}
          onChange={(v) => update((d) => (d.first_home_buyer = v))}
        />
      </Card>
    </>
  );
}

function Applicants({ data, update }: { data: NeedsAnalysisData; update: Update }) {
  return (
    <>
      {[0, 1].map((i) => (
        <Card
          key={i}
          title={i === 0 ? "Applicant 1" : "Applicant 2"}
          subtitle={i === 1 ? "Leave blank if your client is applying on their own." : undefined}
        >
          <ApplicantFields
            a={data.applicants[i]}
            set={(mut) => update((d) => mut(d.applicants[i]))}
          />
        </Card>
      ))}
    </>
  );
}

function ApplicantFields({ a, set }: { a: Applicant; set: (mut: (a: Applicant) => void) => void }) {
  return (
    <>
      <Text label="Title" value={a.title} onChange={(v) => set((x) => (x.title = v))} />
      <Choice
        label="Marital status"
        value={a.marital_status}
        options={opts(MARITAL_STATUSES)}
        onChange={(v) => set((x) => (x.marital_status = v))}
      />
      <Text label="Given names" value={a.given_names} onChange={(v) => set((x) => (x.given_names = v))} />
      <Text label="Surname" value={a.surname} onChange={(v) => set((x) => (x.surname = v))} />
      <Text label="Date of birth" type="date" value={a.dob} onChange={(v) => set((x) => (x.dob = v))} />
      <label className="block">
        <span className="text-sm font-medium text-gray-700">Dependants</span>
        <input
          type="number"
          value={a.dependents_count ?? ""}
          onChange={(e) =>
            set((x) => (x.dependents_count = e.target.value === "" ? null : Number(e.target.value)))
          }
          className={`${inputCls} tabular-nums`}
        />
      </label>

      <Text
        label="Mobile"
        type="tel"
        value={a.contact.mobile_phone}
        onChange={(v) => set((x) => (x.contact.mobile_phone = v))}
      />
      <Text
        label="Email"
        type="email"
        value={a.contact.email}
        onChange={(v) => set((x) => (x.contact.email = v))}
        hint="They're emailed the document to sign and their upload link — it can't be blank."
      />
      <Choice
        label="Preferred contact"
        value={a.contact.preferred_contact}
        options={opts(PREFERRED_CONTACT_OPTIONS)}
        onChange={(v) => set((x) => (x.contact.preferred_contact = v))}
      />
      <Text
        label="Driver's licence or passport"
        value={a.additional.id_document}
        onChange={(v) => set((x) => (x.additional.id_document = v))}
      />

      <Text
        wide
        label="Current address — street"
        value={a.current_address.street}
        onChange={(v) => set((x) => (x.current_address.street = v))}
      />
      <Text
        label="Suburb"
        value={a.current_address.suburb}
        onChange={(v) => set((x) => (x.current_address.suburb = v))}
      />
      <Text
        label="State"
        value={a.current_address.state}
        onChange={(v) => set((x) => (x.current_address.state = v))}
      />
      <Text
        label="Postcode"
        value={a.current_address.postcode}
        onChange={(v) => set((x) => (x.current_address.postcode = v))}
      />
      <Choice
        label="Own or rent?"
        value={a.current_address.tenure}
        options={opts(TENURE_OPTIONS)}
        onChange={(v) => set((x) => (x.current_address.tenure = v))}
      />
      <Text
        label="Date moved in"
        type="date"
        value={a.current_address.date_moved_in}
        onChange={(v) => set((x) => (x.current_address.date_moved_in = v))}
        hint="If under three years, add the previous address on the paper form."
      />
    </>
  );
}

function Employment({ data, update }: { data: NeedsAnalysisData; update: Update }) {
  return (
    <>
      {[0, 1].map((i) => {
        const a = data.applicants[i];
        const inUse = Boolean(a.given_names.trim() || a.surname.trim());
        if (i === 1 && !inUse) return null;
        const name = [a.given_names, a.surname].filter(Boolean).join(" ") || `Applicant ${i + 1}`;
        const emp = a.current_employment;
        const working = emp.employment_type !== "unemployed" && emp.employment_type !== "retired";
        return (
          <Card
            key={i}
            title={name}
            subtitle="Take the figures from a payslip. They are checked against the documents your client uploads."
          >
            <Choice
              label="Employment type"
              value={emp.employment_type}
              options={opts(EMPLOYMENT_TYPES)}
              onChange={(v) => update((d) => (d.applicants[i].current_employment.employment_type = v))}
            />
            {working && (
              <>
                <Choice
                  label="Basis"
                  value={emp.employment_basis}
                  options={opts(EMPLOYMENT_BASES)}
                  onChange={(v) => update((d) => (d.applicants[i].current_employment.employment_basis = v))}
                />
                <Text
                  label="Occupation"
                  value={emp.occupation}
                  onChange={(v) => update((d) => (d.applicants[i].current_employment.occupation = v))}
                />
                <Text
                  label="Date started"
                  type="date"
                  value={emp.date_started}
                  onChange={(v) => update((d) => (d.applicants[i].current_employment.date_started = v))}
                  hint="Matters — a job started mid-year makes their tax statement read low."
                />
                <Text
                  wide
                  label="Employer name and address"
                  value={emp.employer.street}
                  onChange={(v) => update((d) => (d.applicants[i].current_employment.employer.street = v))}
                  hint="Name first, e.g. 'Woolworths Bateau Bay, 12 Bay Village Rd'."
                />
                <Money
                  label="Income amount"
                  value={emp.income_amount}
                  onChange={(v) => update((d) => (d.applicants[i].current_employment.income_amount = v))}
                />
                <Choice
                  label="How often"
                  value={emp.pay_frequency}
                  options={FREQUENCY_OPTIONS}
                  onChange={(v) => update((d) => (d.applicants[i].current_employment.pay_frequency = v))}
                />
                <Choice
                  label="Gross or net"
                  value={emp.income_gross_or_net}
                  options={opts(INCOME_GROSS_NET)}
                  onChange={(v) =>
                    update((d) => (d.applicants[i].current_employment.income_gross_or_net = v))
                  }
                  hint="Gross is before tax — it's what the payslip shows at the top."
                />
                <label className="flex items-center gap-2 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={emp.on_probation}
                    onChange={(e) =>
                      update((d) => (d.applicants[i].current_employment.on_probation = e.target.checked))
                    }
                    className="h-4 w-4"
                  />
                  <span className="text-sm text-gray-700">Still on probation</span>
                </label>
              </>
            )}
          </Card>
        );
      })}

      <OtherIncomeSection data={data} update={update} />
    </>
  );
}

/**
 * Other income — a row per source, per applicant.
 *
 * WHY ROWS AND NOT THE PAPER FORM'S ONE LINE. A household sentence cannot say
 * whose income it is, so a lender assessing one applicant's servicing cannot
 * use it; and it is not a number, so nothing can add it up or compare it to a
 * payslip. Both of those have cost us: the reconciliation was reduced to
 * scanning the prose for a first name to guess an owner.
 *
 * Nothing is pre-printed. Most households have no other income, and a grid of
 * blank rows reads as something that must be filled in.
 */
function OtherIncomeSection({ data, update }: { data: NeedsAnalysisData; update: Update }) {
  const rows = data.other_incomes ?? [];
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Other income</h2>
      <p className="mt-1 text-sm text-gray-500">
        Anything coming in that isn&apos;t the salary above — bonus, commission, Centrelink, family
        assistance, rent, a second job. Add a row each, and say whose it is.
      </p>

      {rows.length === 0 && (
        <p className="mt-3 text-sm text-gray-500">No other income recorded.</p>
      )}

      <div className="mt-4 space-y-3">
        {rows.map((o, i) => (
          <div key={o.id} className="grid gap-2 sm:grid-cols-[11rem_1fr_7rem_7rem_7rem_2rem]">
            <select
              value={o.type}
              onChange={(e) => update((d) => (d.other_incomes[i].type = e.target.value))}
              className={inputCls}
            >
              <option value="">Type…</option>
              {OTHER_INCOME_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              value={o.description}
              placeholder="Who pays it, or what it is"
              onChange={(e) => update((d) => (d.other_incomes[i].description = e.target.value))}
              className={inputCls}
            />
            <input
              type="number"
              value={o.amount ?? ""}
              placeholder="Amount"
              onChange={(e) =>
                update(
                  (d) =>
                    (d.other_incomes[i].amount =
                      e.target.value === "" ? null : Number(e.target.value)),
                )
              }
              className={`${inputCls} tabular-nums`}
            />
            <select
              value={o.frequency}
              onChange={(e) => update((d) => (d.other_incomes[i].frequency = e.target.value))}
              className={inputCls}
            >
              {FREQUENCY_OPTIONS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
            <select
              value={o.owner}
              onChange={(e) => update((d) => (d.other_incomes[i].owner = e.target.value))}
              className={inputCls}
            >
              <option value="">Whose?</option>
              {OWNER_OPTIONS.map((w) => (
                <option key={w} value={w}>
                  {ownerLabel(w, data)}
                </option>
              ))}
            </select>
            <button
              onClick={() => update((d) => d.other_incomes.splice(i, 1))}
              aria-label="Remove this income"
              className="mt-1 text-gray-400 hover:text-red-600"
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={() =>
          update((d) => (d.other_incomes ?? (d.other_incomes = [])).push(emptyOtherIncome("", d.other_incomes.length)))
        }
        className="mt-3 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
      >
        + Add other income
      </button>

      {/* A pack written before other income became rows keeps its sentence, and
          it is shown rather than hidden — it may be the only record of that
          client's extra income. Read-only: re-typing it into rows is a person's
          judgement, not something to do silently on their behalf. */}
      {data.other_income.trim() !== "" && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
            Previously recorded as a note
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-amber-900">{data.other_income}</p>
          <p className="mt-1 text-xs text-amber-800">Add it as rows above so it can be assessed.</p>
        </div>
      )}
    </section>
  );
}

/** "App 1 (David)" where we know the name, so "whose?" is answerable. */
function ownerLabel(owner: string, data: NeedsAnalysisData): string {
  if (owner === "both") return "Both";
  const i = owner === "app1" ? 0 : 1;
  const a = data.applicants[i];
  const name = [a.given_names, a.surname].filter(Boolean).join(" ").trim();
  const base = owner === "app1" ? "App 1" : "App 2";
  return name ? `${base} (${name})` : base;
}

function Assets({ data, update, totals }: { data: NeedsAnalysisData; update: Update; totals: Totals }) {
  return (
    <>
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Assets</h2>
        <div className="mt-4 space-y-3">
          {data.assets.map((a, i) => (
            <div key={a.id} className="grid gap-2 sm:grid-cols-[11rem_1fr_8rem_8rem_7rem_2rem]">
              <select
                value={a.type}
                onChange={(e) => update((d) => (d.assets[i].type = e.target.value))}
                className={inputCls}
              >
                <option value="">Type…</option>
                {ASSET_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                value={a.description}
                placeholder="Description"
                onChange={(e) => update((d) => (d.assets[i].description = e.target.value))}
                className={inputCls}
              />
              <input
                type="number"
                value={a.estimated_value ?? ""}
                placeholder="Value"
                onChange={(e) =>
                  update(
                    (d) =>
                      (d.assets[i].estimated_value =
                        e.target.value === "" ? null : Number(e.target.value)),
                  )
                }
                className={`${inputCls} tabular-nums`}
              />
              {/* Rental income belongs to the asset, not the income section —
                  an investment property's rent is assessed against the property
                  that produces it. The YLA form has this column; leaving it out
                  meant an investment property looked like it earned nothing. */}
              <input
                type="number"
                value={a.rental_income ?? ""}
                placeholder="Rent p/w"
                onChange={(e) =>
                  update(
                    (d) =>
                      (d.assets[i].rental_income =
                        e.target.value === "" ? null : Number(e.target.value)),
                  )
                }
                className={`${inputCls} tabular-nums`}
              />
              <select
                value={a.owner}
                onChange={(e) => update((d) => (d.assets[i].owner = e.target.value))}
                className={inputCls}
              >
                <option value="">Owner…</option>
                {OWNER_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {ownerLabel(o, data)}
                  </option>
                ))}
              </select>
              <button
                onClick={() => update((d) => d.assets.splice(i, 1))}
                aria-label="Remove this asset"
                className="mt-1 text-gray-400 hover:text-red-600"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={() => update((d) => d.assets.push(emptyAsset("Other", d.assets.length)))}
          className="mt-3 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
        >
          + Another asset
        </button>
      </section>

      <section className="rounded-xl border border-gray-200 bg-gray-50 p-5">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Total label="Total assets" value={totals.totalAssets} />
          <Total label="Total liabilities" value={totals.totalLiabilities} />
        </dl>
      </section>
    </>
  );
}

function Liabilities({
  data,
  update,
  totals,
}: {
  data: NeedsAnalysisData;
  update: Update;
  totals: Totals;
}) {
  return (
    <>
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Liabilities</h2>
        <p className="mt-1 text-sm text-gray-500">
          For a credit card, record the <strong>limit</strong> as well as the balance — lenders assess
          on the limit.
        </p>
        <div className="mt-4 space-y-3">
          {data.liabilities.map((l, i) => (
            <div key={l.id} className="grid gap-2 sm:grid-cols-[10rem_1fr_7rem_7rem_7rem_7rem_2rem]">
              <select
                value={l.type}
                onChange={(e) => update((d) => (d.liabilities[i].type = e.target.value))}
                className={inputCls}
              >
                <option value="">Type…</option>
                {LIABILITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                value={l.loan_provider}
                placeholder="Provider"
                onChange={(e) => update((d) => (d.liabilities[i].loan_provider = e.target.value))}
                className={inputCls}
              />
              <input
                type="number"
                value={l.loan_balance ?? ""}
                placeholder="Balance"
                onChange={(e) =>
                  update(
                    (d) =>
                      (d.liabilities[i].loan_balance =
                        e.target.value === "" ? null : Number(e.target.value)),
                  )
                }
                className={`${inputCls} tabular-nums`}
              />
              <input
                type="number"
                value={l.loan_limit ?? ""}
                placeholder="Limit"
                onChange={(e) =>
                  update(
                    (d) =>
                      (d.liabilities[i].loan_limit =
                        e.target.value === "" ? null : Number(e.target.value)),
                  )
                }
                className={`${inputCls} tabular-nums`}
              />
              <input
                type="number"
                value={l.repayments ?? ""}
                placeholder="Repayment"
                onChange={(e) =>
                  update(
                    (d) =>
                      (d.liabilities[i].repayments =
                        e.target.value === "" ? null : Number(e.target.value)),
                  )
                }
                className={`${inputCls} tabular-nums`}
              />
              <select
                value={l.owner}
                onChange={(e) => update((d) => (d.liabilities[i].owner = e.target.value))}
                className={inputCls}
              >
                <option value="">Whose?</option>
                {OWNER_OPTIONS.map((o) => (
                  <option key={o} value={o}>
                    {ownerLabel(o, data)}
                  </option>
                ))}
              </select>
              <button
                onClick={() => update((d) => d.liabilities.splice(i, 1))}
                aria-label="Remove this liability"
                className="mt-1 text-gray-400 hover:text-red-600"
              >
                ×
              </button>

              {/* The second line of each liability. Term, dates and a fixed/IO
                  expiry are on the YLA form and a lender asks for them — an
                  interest-only period about to end changes the assessment. */}
              <div className="sm:col-span-7 sm:pl-2">
                <div className="grid gap-2 sm:grid-cols-3">
                  <input
                    value={l.loan_term}
                    placeholder="Term (e.g. 30 years)"
                    onChange={(e) => update((d) => (d.liabilities[i].loan_term = e.target.value))}
                    className={inputCls}
                  />
                  <input
                    value={l.loan_start_end_date}
                    placeholder="Start / end date"
                    onChange={(e) =>
                      update((d) => (d.liabilities[i].loan_start_end_date = e.target.value))
                    }
                    className={inputCls}
                  />
                  <input
                    value={l.fixed_io_expiry}
                    placeholder="Fixed / interest-only expiry"
                    onChange={(e) => update((d) => (d.liabilities[i].fixed_io_expiry = e.target.value))}
                    className={inputCls}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={() => update((d) => d.liabilities.push(emptyLiability("Other", d.liabilities.length)))}
          className="mt-3 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
        >
          + Another liability
        </button>

        <div className="mt-4">
          <Area
            label="Notes"
            value={data.liabilities_notes}
            onChange={(v) => update((d) => (d.liabilities_notes = v))}
          />
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-gray-50 p-5">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Total label="Total liabilities" value={totals.totalLiabilities} />
          <Total label="Net position" value={totals.totalAssets - totals.totalLiabilities} />
        </dl>
      </section>
    </>
  );
}

function Expenses({ data, update, totals }: { data: NeedsAnalysisData; update: Update; totals: Totals }) {
  return (
    <>
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Living expenses</h2>
        <p className="mt-1 text-sm text-gray-500">
          A lender assesses against the higher of what your client declares and their own benchmark, so
          under-stating these helps nobody. If a category really is nil, say why.
        </p>
        <div className="mt-4 space-y-2">
          {data.living_expenses.map((e, i) => (
            <div key={i} className="grid gap-2 sm:grid-cols-[13rem_7rem_8rem_1fr]">
              <span className="self-center text-sm text-gray-700">{LIVING_LABEL(i)}</span>
              <input
                type="number"
                value={e.amount ?? ""}
                placeholder="Amount"
                onChange={(e2) =>
                  update(
                    (d) =>
                      (d.living_expenses[i].amount =
                        e2.target.value === "" ? null : Number(e2.target.value)),
                  )
                }
                className={`${inputCls} tabular-nums`}
              />
              <select
                value={e.frequency}
                onChange={(e2) => update((d) => (d.living_expenses[i].frequency = e2.target.value))}
                className={inputCls}
              >
                {FREQUENCY_OPTIONS.map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
              <input
                value={e.description}
                placeholder={e.amount ? "" : "If nil, why?"}
                onChange={(e2) => update((d) => (d.living_expenses[i].description = e2.target.value))}
                className={inputCls}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-gray-50 p-5">
        <dl className="grid gap-3 text-sm sm:grid-cols-3">
          <Total label="Living expenses per month" value={totals.monthlyLivingExpenses} />
          <Total
            label="Loan repayments per month"
            value={data.liabilities.reduce((t, l) => t + toMonthly(l.repayments, "m"), 0)}
          />
          <Total label="Other income per month" value={totals.monthlyOtherIncome} />
        </dl>
      </section>
    </>
  );
}

/**
 * The paper form prints "Other" three times at the end, so the index is what
 * distinguishes them. Numbering the repeats keeps the three rows tellable apart
 * on screen without changing the document's own wording.
 */
const LIVING_LABELS = [
  "Utilities",
  "Rates",
  "Body Corporate",
  "Ongoing Rent",
  "Transport",
  "Car expenses",
  "Food / Groceries",
  "Communication & Media",
  "Medical & Health",
  "Education & Childcare",
  "Child Support/Maintenance",
  "Insurance - General",
  "Insurance - Health",
  "Insurance - Risk",
  "Entertainment & Recreation",
  "Clothing & Personal Care",
  "Gift/Donations",
  "Other",
  "Other",
  "Other",
];

function LIVING_LABEL(i: number): string {
  const label = LIVING_LABELS[i] ?? "Other";
  if (label !== "Other") return label;
  const nth = LIVING_LABELS.slice(0, i + 1).filter((l) => l === "Other").length;
  return `Other ${nth}`;
}

function RelativeStep({ data, update }: { data: NeedsAnalysisData; update: Update }) {
  return (
    <Card
      title="Contact person"
      subtitle="A relative not living with your client. Lenders ask for this as a stable point of contact."
    >
      <Text label="Name" value={data.relative.name} onChange={(v) => update((d) => (d.relative.name = v))} />
      <Text
        label="Phone"
        type="tel"
        value={data.relative.phone}
        onChange={(v) => update((d) => (d.relative.phone = v))}
      />
      <Text
        label="Email"
        type="email"
        value={data.relative.email}
        onChange={(v) => update((d) => (d.relative.email = v))}
      />
      <Text
        wide
        label="Address"
        value={data.relative.address}
        onChange={(v) => update((d) => (d.relative.address = v))}
      />
    </Card>
  );
}
