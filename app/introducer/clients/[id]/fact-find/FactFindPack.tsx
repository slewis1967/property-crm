"use client";

/**
 * The borrower fact find, from the introducer's side.
 *
 * SAME DOCUMENT AS /fact-find, DIFFERENT ROOM. The data is `FactFindData`
 * verbatim — the identical shape `borrower_fact_finds.data` holds — so what an
 * introducer fills in here IS the fact find, not a form that later gets
 * translated into one. utils/factfind.ts is the single schema and both surfaces
 * read it.
 *
 * WHY NOT REUSE app/fact-find/[id]/FactFindForm.tsx. That component is welded to
 * the staff workspace: it seeds a Needs Analysis, mints a credit authorisation,
 * opens an AML case, submits to a named broker, schedules a meeting, and renders
 * the compliance audit trail. Dragging it into the portal would put every one of
 * those affordances in front of a third party, and the portal's founding rule is
 * that an introducer sees their own clients and no internal CRM surface. So the
 * schema is shared and the chrome is not.
 *
 * STEPPED, WHERE THE STAFF FORM IS ONE PAGE. A staff member has the file open
 * and jumps around it; an introducer is sitting opposite the client working
 * through it once. Steps also give saving a natural moment, which matters
 * because this is a 45-minute form on somebody else's laptop.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  APPLICANT_CAPACITIES,
  ASSET_KINDS,
  DISCLOSURE_QUESTIONS,
  ENTITY_TYPES,
  LIABILITY_KINDS,
  OWNERSHIP_STATUSES,
  PROPERTY_USES,
  PURPOSE_BASES,
  computeTotals,
  emptyAsset,
  emptyFactFind,
  emptyLiability,
  emptySecurity,
  formatMoney,
  type Applicant,
  type AssetKind,
  type FactFindData,
  type LiabilityKind,
} from "../../../../../utils/factfind";

const AMBER = "#c7894e";

const STEPS = [
  { key: "applicants", title: "Applicants", blurb: "Who is applying, and what they earn." },
  { key: "loan", title: "The loan", blurb: "What they need and how it gets repaid." },
  { key: "security", title: "Security", blurb: "The property (or properties) behind the loan." },
  { key: "position", title: "Financial position", blurb: "What they owe and what they own." },
  { key: "disclosures", title: "Disclosures", blurb: "Five questions, all of which must be answered." },
  { key: "parties", title: "Other parties", blurb: "Company or trust, solicitor, accountant. Skip if none." },
  { key: "declarations", title: "Declarations", blurb: "What your client is signing." },
] as const;

type StepKey = (typeof STEPS)[number]["key"];

type Loaded = {
  data: FactFindData;
  editable: boolean;
  status: string;
  clientRef: string | null;
  blockers: string[];
};

export default function FactFindPack({ id }: { id: string }) {
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [data, setData] = useState<FactFindData>(emptyFactFind());
  const [step, setStep] = useState<StepKey>("applicants");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  /* Dirtiness is a monotonic counter compared against the counter captured at
   * the last successful save, not a boolean. A boolean is wrongly cleared by an
   * in-flight save completing after a fresh edit landed — the edit then looks
   * saved and is silently lost on navigate. Same approach the staff form uses,
   * and for the same bug. */
  const [rev, setRev] = useState(0);
  const [savedRev, setSavedRev] = useState(0);
  const dirty = rev !== savedRev;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/introducer/clients/${id}/fact-find`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 401) {
            router.push("/introducer");
            return;
          }
          setError(json.error ?? "Could not open the fact find.");
          return;
        }
        setData(json.data as FactFindData);
        setLoaded({
          data: json.data as FactFindData,
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
  const update = useCallback((mut: (d: FactFindData) => void) => {
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
      const res = await fetch(`/api/introducer/clients/${id}/fact-find`, {
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

  /* Warn on leaving with unsaved edits. The portal is used on a laptop in
   * somebody's kitchen, mid-conversation — closing the tab by accident is the
   * realistic failure, not a server error. */
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const totals = useMemo(() => computeTotals(data), [data]);

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

  if (!loaded) {
    return <p className="text-sm text-gray-500">Opening the fact find…</p>;
  }

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
          <h1 className="text-2xl font-semibold text-gray-900">Borrower fact find</h1>
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

      {readOnly && (
        <div className="mt-4 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
          This pack has been submitted, so the fact find is locked. It is shown exactly as you sent
          it. If something needs correcting, contact your Springboard manager.
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
        {step === "applicants" && <Applicants data={data} update={update} />}
        {step === "loan" && <Loan data={data} update={update} />}
        {step === "security" && <Security data={data} update={update} />}
        {step === "position" && <Position data={data} update={update} totals={totals} />}
        {step === "disclosures" && <Disclosures data={data} update={update} />}
        {step === "parties" && <OtherParties data={data} update={update} />}
        {step === "declarations" && <Declarations data={data} update={update} />}
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
          <h2 className="text-sm font-semibold text-amber-900">
            Still needed before you can submit
          </h2>
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

function Choice({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {hint && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}
    </label>
  );
}

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

type Update = (mut: (d: FactFindData) => void) => void;

/* ── Steps ────────────────────────────────────────────────────────────────── */

function Applicants({ data, update }: { data: FactFindData; update: Update }) {
  return (
    <>
      {[0, 1].map((i) => (
        <Card
          key={i}
          title={i === 0 ? "Applicant 1" : "Applicant 2"}
          subtitle={
            i === 1 ? "Leave blank if your client is applying on their own." : undefined
          }
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
        label="Capacity"
        value={a.capacity}
        options={APPLICANT_CAPACITIES}
        onChange={(v) => set((x) => (x.capacity = v))}
      />
      <Text label="Given names" value={a.given_names} onChange={(v) => set((x) => (x.given_names = v))} />
      <Text label="Family name" value={a.family_name} onChange={(v) => set((x) => (x.family_name = v))} />
      <Text
        label="Date of birth"
        type="date"
        value={a.date_of_birth}
        onChange={(v) => set((x) => (x.date_of_birth = v))}
      />
      <Text
        label="Driver's licence"
        value={a.drivers_licence}
        onChange={(v) => set((x) => (x.drivers_licence = v))}
      />
      <Text label="Email" type="email" value={a.email} onChange={(v) => set((x) => (x.email = v))} />
      <Text label="Mobile" type="tel" value={a.phone_home} onChange={(v) => set((x) => (x.phone_home = v))} />
      <Text label="Work phone" type="tel" value={a.phone_work} onChange={(v) => set((x) => (x.phone_work = v))} />
      <Text label="Postcode" value={a.postcode} onChange={(v) => set((x) => (x.postcode = v))} />
      <Text
        wide
        label="Residential address"
        value={a.address}
        onChange={(v) => set((x) => (x.address = v))}
      />
      <Text label="Occupation" value={a.occupation} onChange={(v) => set((x) => (x.occupation = v))} />
      <Money
        label="Annual income"
        value={a.annual_income}
        onChange={(v) => set((x) => (x.annual_income = v))}
        hint="Gross, before tax. Needed for the servicing assessment."
      />
      <label className="flex items-center gap-2 sm:col-span-2">
        <input
          type="checkbox"
          checked={a.has_hecs}
          onChange={(e) =>
            set((x) => {
              x.has_hecs = e.target.checked;
              if (!e.target.checked) x.hecs_balance = null;
            })
          }
          className="h-4 w-4"
        />
        <span className="text-sm text-gray-700">They have a HECS / HELP debt</span>
      </label>
      {a.has_hecs && (
        <Money
          label="HELP balance outstanding"
          value={a.hecs_balance}
          onChange={(v) => set((x) => (x.hecs_balance = v))}
          hint="Caps the compulsory repayment in the servicing calculation."
        />
      )}
    </>
  );
}

function Loan({ data, update }: { data: FactFindData; update: Update }) {
  return (
    <Card title="The loan" subtitle="Net of fees and charges, as the form specifies.">
      <Money
        label="Amount required"
        value={data.loan.amount_required}
        onChange={(v) => update((d) => (d.loan.amount_required = v))}
      />
      <label className="block">
        <span className="text-sm font-medium text-gray-700">Term (months)</span>
        <input
          type="number"
          value={data.loan.term_months ?? ""}
          onChange={(e) =>
            update((d) => (d.loan.term_months = e.target.value === "" ? null : Number(e.target.value)))
          }
          className={`${inputCls} tabular-nums`}
        />
      </label>
      <Text
        label="Expected settlement"
        type="date"
        value={data.loan.expected_settlement}
        onChange={(v) => update((d) => (d.loan.expected_settlement = v))}
      />
      <Area
        label="Purpose"
        value={data.loan.purpose}
        onChange={(v) => update((d) => (d.loan.purpose = v))}
        hint="What the money is for, in your client's own terms."
      />
      <Area
        label="Repayment strategy"
        value={data.loan.repayment_strategy}
        onChange={(v) => update((d) => (d.loan.repayment_strategy = v))}
        hint="How they intend to repay it — including at the end of the term."
      />
      <Text
        wide
        label="Referred by"
        value={data.referred_by}
        onChange={(v) => update((d) => (d.referred_by = v))}
        hint="Who at your firm dealt with this client."
      />
    </Card>
  );
}

function Security({ data, update }: { data: FactFindData; update: Update }) {
  return (
    <>
      {data.securities.map((s, i) => (
        <Card
          key={i}
          title={`Security property ${i + 1}`}
          subtitle={i > 0 ? "Only if there's more than one." : "At least one is needed."}
        >
          <Text
            wide
            label="Address"
            value={s.address}
            onChange={(v) => update((d) => (d.securities[i].address = v))}
          />
          <Text label="Suburb" value={s.suburb} onChange={(v) => update((d) => (d.securities[i].suburb = v))} />
          <Text
            label="Postcode"
            value={s.postcode}
            onChange={(v) => update((d) => (d.securities[i].postcode = v))}
          />
          <Choice
            label="Use"
            value={s.use}
            options={PROPERTY_USES}
            onChange={(v) => update((d) => (d.securities[i].use = v))}
          />
          <Choice
            label="Ownership"
            value={s.ownership}
            options={OWNERSHIP_STATUSES}
            onChange={(v) => update((d) => (d.securities[i].ownership = v))}
          />
          <Money
            label="Estimated value"
            value={s.estimated_value}
            onChange={(v) => update((d) => (d.securities[i].estimated_value = v))}
          />
          <Money
            label="Rent per week"
            value={s.rental_per_week}
            onChange={(v) => update((d) => (d.securities[i].rental_per_week = v))}
            hint="Investment properties only."
          />
          <Text
            label="Folio identifier"
            value={s.folio_identifier}
            onChange={(v) => update((d) => (d.securities[i].folio_identifier = v))}
          />
          <Text label="Zoning" value={s.zoning} onChange={(v) => update((d) => (d.securities[i].zoning = v))} />
        </Card>
      ))}
      <button
        onClick={() => update((d) => d.securities.push(emptySecurity()))}
        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
      >
        + Another property
      </button>
    </>
  );
}

function Position({
  data,
  update,
  totals,
}: {
  data: FactFindData;
  update: Update;
  totals: ReturnType<typeof computeTotals>;
}) {
  return (
    <>
      <Card title="Household" subtitle="What a lender needs that the paper form never asked for.">
        <label className="block">
          <span className="text-sm font-medium text-gray-700">Dependants</span>
          <input
            type="number"
            value={data.financials.servicing.dependents ?? ""}
            onChange={(e) =>
              update(
                (d) =>
                  (d.financials.servicing.dependents =
                    e.target.value === "" ? null : Number(e.target.value)),
              )
            }
            className={`${inputCls} tabular-nums`}
          />
        </label>
        <Money
          label="Monthly living expenses"
          value={data.financials.servicing.monthly_living_expenses}
          onChange={(v) => update((d) => (d.financials.servicing.monthly_living_expenses = v))}
          hint="Leave blank if unsure — the benchmark is used instead, and lenders assess against the higher of the two anyway."
        />
      </Card>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Liabilities</h2>
        <p className="mt-1 text-sm text-gray-500">
          For a credit card, the balance column is the <strong>limit</strong>, not what&apos;s owed.
        </p>
        <div className="mt-4 space-y-3">
          {data.financials.liabilities.map((l, i) => (
            <div key={l.id} className="grid gap-2 sm:grid-cols-[9rem_1fr_8rem_8rem_2rem]">
              <select
                value={l.kind}
                onChange={(e) =>
                  update((d) => (d.financials.liabilities[i].kind = e.target.value as LiabilityKind))
                }
                className={inputCls}
              >
                {LIABILITY_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <input
                value={l.label}
                placeholder="Lender / description"
                onChange={(e) => update((d) => (d.financials.liabilities[i].label = e.target.value))}
                className={inputCls}
              />
              <input
                type="number"
                value={l.balance ?? ""}
                placeholder="Balance"
                onChange={(e) =>
                  update(
                    (d) =>
                      (d.financials.liabilities[i].balance =
                        e.target.value === "" ? null : Number(e.target.value)),
                  )
                }
                className={`${inputCls} tabular-nums`}
              />
              <input
                type="number"
                value={l.monthly ?? ""}
                placeholder="Per month"
                onChange={(e) =>
                  update(
                    (d) =>
                      (d.financials.liabilities[i].monthly =
                        e.target.value === "" ? null : Number(e.target.value)),
                  )
                }
                className={`${inputCls} tabular-nums`}
              />
              <button
                onClick={() => update((d) => d.financials.liabilities.splice(i, 1))}
                aria-label="Remove this liability"
                className="mt-1 text-gray-400 hover:text-red-600"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={() =>
            update((d) =>
              d.financials.liabilities.push(emptyLiability("Other loan", d.financials.liabilities.length)),
            )
          }
          className="mt-3 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
        >
          + Another liability
        </button>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Assets</h2>
        <div className="mt-4 space-y-3">
          {data.financials.assets.map((a, i) => (
            <div key={a.id} className="grid gap-2 sm:grid-cols-[13rem_1fr_8rem_2rem]">
              <select
                value={a.kind}
                onChange={(e) => update((d) => (d.financials.assets[i].kind = e.target.value as AssetKind))}
                className={inputCls}
              >
                {ASSET_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <input
                value={a.label}
                placeholder="Description"
                onChange={(e) => update((d) => (d.financials.assets[i].label = e.target.value))}
                className={inputCls}
              />
              <input
                type="number"
                value={a.value ?? ""}
                placeholder="Value"
                onChange={(e) =>
                  update(
                    (d) =>
                      (d.financials.assets[i].value =
                        e.target.value === "" ? null : Number(e.target.value)),
                  )
                }
                className={`${inputCls} tabular-nums`}
              />
              <button
                onClick={() => update((d) => d.financials.assets.splice(i, 1))}
                aria-label="Remove this asset"
                className="mt-1 text-gray-400 hover:text-red-600"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={() =>
            update((d) => d.financials.assets.push(emptyAsset("Cash at bank", d.financials.assets.length)))
          }
          className="mt-3 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
        >
          + Another asset
        </button>
      </section>

      <section className="rounded-xl border border-gray-200 bg-gray-50 p-5">
        <dl className="grid gap-3 text-sm sm:grid-cols-4">
          <Total label="Total assets" value={totals.totalAssets} />
          <Total label="Total liabilities" value={totals.totalLiabilities} />
          <Total label="Net position" value={totals.surplusAssets} />
          <Total label="Monthly commitments" value={totals.monthlyCommitments} />
        </dl>
      </section>
    </>
  );
}

function Total({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className={`mt-0.5 tabular-nums font-semibold ${value < 0 ? "text-red-700" : "text-gray-900"}`}>
        {formatMoney(value) || "$0"}
      </dd>
    </div>
  );
}

function Disclosures({ data, update }: { data: FactFindData; update: Update }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Disclosures</h2>
      <p className="mt-1 text-sm text-gray-500">
        All five must be answered. Ask them as written — the wording is from the form your client
        signs.
      </p>
      <div className="mt-4 space-y-5">
        {DISCLOSURE_QUESTIONS.map((q) => {
          const answer = data.disclosures[q.key]?.answer ?? null;
          return (
            <div key={q.key}>
              <p className="text-sm text-gray-900">{q.text}</p>
              <div className="mt-2 flex gap-2">
                {(["no", "yes"] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => update((d) => (d.disclosures[q.key].answer = opt))}
                    className={`rounded-lg px-4 py-1.5 text-sm font-medium capitalize ring-1 transition ${
                      answer === opt
                        ? "bg-gray-900 text-white ring-gray-900"
                        : "bg-white text-gray-700 ring-gray-300 hover:ring-gray-400"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              {answer === "yes" && (
                <textarea
                  rows={2}
                  placeholder="Details"
                  value={data.disclosures[q.key]?.details ?? ""}
                  onChange={(e) => update((d) => (d.disclosures[q.key].details = e.target.value))}
                  className={inputCls}
                />
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function OtherParties({ data, update }: { data: FactFindData; update: Update }) {
  return (
    <>
      <Card
        title="Company or trust"
        subtitle="Only if your client is borrowing through an entity. Skip otherwise."
      >
        <Text label="Entity name" value={data.entity.name} onChange={(v) => update((d) => (d.entity.name = v))} />
        <Text label="ACN" value={data.entity.acn} onChange={(v) => update((d) => (d.entity.acn = v))} />
        <Choice
          label="Type"
          value={data.entity.entity_type}
          options={ENTITY_TYPES}
          onChange={(v) => update((d) => (d.entity.entity_type = v))}
        />
        <Text
          label="Principal activity"
          value={data.entity.principal_activity}
          onChange={(v) => update((d) => (d.entity.principal_activity = v))}
        />
        <Text
          wide
          label="Trading address"
          value={data.entity.trading_address}
          onChange={(v) => update((d) => (d.entity.trading_address = v))}
        />
      </Card>

      <Card title="Solicitor" subtitle="If they have one.">
        <Text
          label="Firm"
          value={data.advisors.solicitor.firm}
          onChange={(v) => update((d) => (d.advisors.solicitor.firm = v))}
        />
        <Text
          label="Contact name"
          value={data.advisors.solicitor.contact_name}
          onChange={(v) => update((d) => (d.advisors.solicitor.contact_name = v))}
        />
        <Text
          label="Telephone"
          type="tel"
          value={data.advisors.solicitor.telephone}
          onChange={(v) => update((d) => (d.advisors.solicitor.telephone = v))}
        />
        <Text
          label="Postcode"
          value={data.advisors.solicitor.postcode}
          onChange={(v) => update((d) => (d.advisors.solicitor.postcode = v))}
        />
      </Card>

      <Card title="Accountant" subtitle="If they have one.">
        <Text
          label="Firm"
          value={data.advisors.accountant.firm}
          onChange={(v) => update((d) => (d.advisors.accountant.firm = v))}
        />
        <Text
          label="Contact name"
          value={data.advisors.accountant.contact_name}
          onChange={(v) => update((d) => (d.advisors.accountant.contact_name = v))}
        />
        <Text
          label="Telephone"
          type="tel"
          value={data.advisors.accountant.telephone}
          onChange={(v) => update((d) => (d.advisors.accountant.telephone = v))}
        />
        <Text
          label="Postcode"
          value={data.advisors.accountant.postcode}
          onChange={(v) => update((d) => (d.advisors.accountant.postcode = v))}
        />
      </Card>
    </>
  );
}

function Declarations({ data, update }: { data: FactFindData; update: Update }) {
  return (
    <>
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Declarations</h2>
        {/* The wording is reproduced from the source form (Consumer Credit Code
            s.11 reg.10 / Privacy Act 1988). Legal copy — see utils/factfind.ts.
            Do not paraphrase it here to make it read better. */}
        <label className="mt-4 flex items-start gap-3">
          <input
            type="checkbox"
            checked={data.declarations.info_confirmed}
            onChange={(e) => update((d) => (d.declarations.info_confirmed = e.target.checked))}
            className="mt-1 h-4 w-4"
          />
          <span className="text-sm leading-relaxed text-gray-700">
            My client confirms that the above information is complete and correct.
          </span>
        </label>

        <label className="mt-4 flex items-start gap-3">
          <input
            type="checkbox"
            checked={data.declarations.privacy.acknowledged}
            onChange={(e) => update((d) => (d.declarations.privacy.acknowledged = e.target.checked))}
            className="mt-1 h-4 w-4"
          />
          <span className="text-sm leading-relaxed text-gray-700">
            My client acknowledges the privacy consent, and understands their information will be
            used to assess and progress this application.
          </span>
        </label>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <Text
              key={i}
              label={`Signatory ${i + 1} — full name`}
              value={data.declarations.signatories[i].name}
              onChange={(v) => update((d) => (d.declarations.signatories[i].name = v))}
            />
          ))}
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
          Declaration of purpose
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Only if the loan is NOT for personal, domestic or household purposes.
        </p>
        <label className="mt-4 flex items-start gap-3">
          <input
            type="checkbox"
            checked={data.declarations.purpose.acknowledged}
            onChange={(e) => update((d) => (d.declarations.purpose.acknowledged = e.target.checked))}
            className="mt-1 h-4 w-4"
          />
          <span className="text-sm leading-relaxed text-gray-700">
            The credit is to be applied wholly or predominantly for:
          </span>
        </label>
        {data.declarations.purpose.acknowledged && (
          <div className="mt-3 space-y-2">
            {PURPOSE_BASES.map((b) => (
              <label key={b.key} className="flex items-start gap-3">
                <input
                  type="radio"
                  name="purpose-basis"
                  checked={data.declarations.purpose.basis === b.key}
                  onChange={() => update((d) => (d.declarations.purpose.basis = b.key))}
                  className="mt-1 h-4 w-4"
                />
                <span className="text-sm text-gray-700">{b.text}</span>
              </label>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
