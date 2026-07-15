"use client";

/**
 * CDD case form — captures Customer Due Diligence on one party (buyer/seller):
 * entity identity (individual/company/trust/SMSF), 25%+ beneficial owners,
 * source of funds, risk factors + derived rating, verification, and the
 * sanctions/PEP/adverse-media screening panel. A Cleared case is read-only
 * (reopen to amend); every change is recorded in the audit trail.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  hydrateAmlCase,
  emptyAmlCase,
  cddCompleteness,
  deriveRiskRating,
  needsEnhancedDd,
  screeningSubjects,
  retentionUntil,
  AML_CASE_STATUSES,
  PARTY_TYPE_LABELS,
  PARTY_ROLES,
  ID_DOCUMENT_TYPES,
  ID_DOCUMENT_LABELS,
  SOURCE_OF_FUNDS_CATEGORIES,
  SOURCE_OF_FUNDS_LABELS,
  SCREENING_RESULTS,
  type AmlCaseData,
  type BeneficialOwner,
  type ScreeningResult,
} from "../../../utils/aml";

const TEAL = "#0F4C5C";
const inputCls =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-gray-500 disabled:bg-gray-50 disabled:text-gray-500";

type ScreeningRow = {
  id: string;
  subject_name: string;
  subject_kind: string;
  provider: string;
  result: string;
  screened_by: string | null;
  screened_at: string;
};
type HistoryRow = {
  id: string;
  action: string;
  changed_by: string | null;
  changed_at: string;
  status_after: string | null;
  note: string | null;
};

const SCREEN_RESULT_LABEL: Record<string, string> = {
  pending: "Pending",
  clear: "Clear",
  potential_match: "Potential match",
  confirmed_match: "Confirmed match",
};

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function CaseForm({ id }: { id: string }) {
  const [data, setData] = useState<AmlCaseData>(() => emptyAmlCase());
  const [status, setStatus] = useState<string>("Draft");
  const [createdAt, setCreatedAt] = useState<string>("");
  const [screenings, setScreenings] = useState<ScreeningRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const locked = status === "Cleared";

  const loadScreenings = useCallback(async () => {
    try {
      const res = await fetch(`/api/aml/screenings?caseId=${id}`).then((r) => r.json());
      if (res.ok) setScreenings(res.screenings ?? []);
    } catch { /* non-fatal */ }
  }, [id]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/aml/cases/${id}/history`).then((r) => r.json());
      if (res.ok) setHistory(res.history ?? []);
    } catch { /* non-fatal */ }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/aml/cases/${id}`).then((r) => r.json());
        if (cancelled) return;
        if (!res.ok) throw new Error(res.error || "Load failed");
        setData(hydrateAmlCase(res.case.data));
        setStatus(res.case.status ?? "Draft");
        setCreatedAt(res.case.created_at ?? "");
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
      // After the primary load resolves — setState here is post-await, so it
      // doesn't trigger the cascading-render lint (unlike a bare call).
      if (!cancelled) await loadScreenings();
      if (!cancelled) await loadHistory();
    })();
    return () => {
      cancelled = true;
    };
  }, [id, loadScreenings, loadHistory]);

  /** Immutable nested update. */
  function edit(mutator: (d: AmlCaseData) => void) {
    setData((prev) => {
      const next = structuredClone(prev);
      mutator(next);
      return next;
    });
  }

  async function save(nextStatus?: string) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/aml/cases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data, status: nextStatus ?? status }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Save failed");
      if (nextStatus) setStatus(nextStatus);
      setNotice("Saved.");
      loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function recordScreening(subjectName: string, subjectKind: "party" | "beneficial_owner", result: ScreeningResult) {
    setError("");
    try {
      const res = await fetch("/api/aml/screenings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: id, subjectName, subjectKind, result }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Screening failed");
      // Reflect the outcome the server folded back into the case.
      edit((d) => {
        d.screening.status = json.result;
        d.screening.lastScreenedAt = new Date().toISOString();
      });
      if (json.result === "confirmed_match") setStatus("Blocked");
      loadScreenings();
      loadHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Screening failed");
    }
  }

  if (loading) return <p className="p-6 text-sm text-gray-500">Loading…</p>;

  const cdd = cddCompleteness(data);
  const derivedRisk = deriveRiskRating(data);
  const enhanced = needsEnhancedDd(data);
  const subjects = screeningSubjects(data);
  const e = data.entity;

  return (
    <div className="p-6 max-w-4xl mx-auto pb-24">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <Link href="/aml" className="text-xs text-gray-500 hover:underline">
            ← Back to AML
          </Link>
          <h1 className="text-2xl font-bold mt-1" style={{ color: TEAL }}>
            CDD — {PARTY_TYPE_LABELS[data.partyType]}
          </h1>
          {createdAt && (
            <p className="text-xs text-gray-500 mt-1">
              Opened {new Date(createdAt).toLocaleDateString("en-AU")} · retain records until {retentionUntil(createdAt)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-1 rounded-full text-xs font-semibold uppercase ${
              derivedRisk === "high" ? "bg-red-100 text-red-800" : derivedRisk === "medium" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
            }`}
          >
            {derivedRisk} risk
          </span>
        </div>
      </div>

      {locked && (
        <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-900">
          This case is <strong>Cleared</strong> and locked. Reopen it (change status below) to amend — every change is recorded.
        </div>
      )}
      {error && <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>}
      {notice && <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">{notice}</div>}

      {/* CDD completeness checklist */}
      <div className="mt-5 rounded-xl border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800">CDD completeness</h2>
          <span className={`text-xs font-semibold ${cdd.complete ? "text-emerald-700" : "text-amber-700"}`}>
            {cdd.complete ? "All required fields captured" : `${cdd.missing.length} outstanding`}
          </span>
        </div>
        {!cdd.complete && <p className="text-xs text-gray-500 mt-1">Missing: {cdd.missing.join(", ")}.</p>}
        {enhanced && (
          <p className="text-xs text-amber-700 mt-2 font-semibold">
            Enhanced due diligence required (high-risk customer). Verify source of funds and obtain senior sign-off.
          </p>
        )}
      </div>

      {/* Party role + type */}
      <Section title="Party">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Role in transaction">
            <select
              className={inputCls}
              disabled={locked}
              value={data.partyRole}
              onChange={(ev) => edit((d) => { d.partyRole = ev.target.value as AmlCaseData["partyRole"]; })}
            >
              {PARTY_ROLES.map((r) => (
                <option key={r} value={r} className="capitalize">
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Entity type">
            <input className={inputCls} disabled value={PARTY_TYPE_LABELS[data.partyType]} />
          </Field>
        </div>
      </Section>

      {/* Entity identity — varies by type */}
      {data.partyType === "individual" ? (
        <Section title="Identity">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Full legal name">
              <input className={inputCls} disabled={locked} value={e.fullLegalName} onChange={(ev) => edit((d) => { d.entity.fullLegalName = ev.target.value; })} />
            </Field>
            <Field label="Date of birth">
              <input type="date" className={inputCls} disabled={locked} value={e.dob} onChange={(ev) => edit((d) => { d.entity.dob = ev.target.value; })} />
            </Field>
          </div>
          <AddressFields label="Residential address" value={e.residentialAddress} disabled={locked} onChange={(patch) => edit((d) => Object.assign(d.entity.residentialAddress, patch))} />
          <IdDocumentFields value={e.idDocument} disabled={locked} onChange={(patch) => edit((d) => Object.assign(d.entity.idDocument, patch))} />
        </Section>
      ) : (
        <Section title="Entity">
          {data.partyType === "company" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Company name">
                <input className={inputCls} disabled={locked} value={e.companyName} onChange={(ev) => edit((d) => { d.entity.companyName = ev.target.value; })} />
              </Field>
              <Field label="ACN / ABN">
                <input className={inputCls} disabled={locked} value={e.acnAbn} onChange={(ev) => edit((d) => { d.entity.acnAbn = ev.target.value; })} />
              </Field>
            </div>
          )}
          {data.partyType === "trust" && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Trust name">
                <input className={inputCls} disabled={locked} value={e.trustName} onChange={(ev) => edit((d) => { d.entity.trustName = ev.target.value; })} />
              </Field>
              <Field label="Trust type">
                <input className={inputCls} disabled={locked} placeholder="Discretionary, unit, …" value={e.trustType} onChange={(ev) => edit((d) => { d.entity.trustType = ev.target.value; })} />
              </Field>
            </div>
          )}
          {data.partyType === "smsf" && (
            <Field label="SMSF name">
              <input className={inputCls} disabled={locked} value={e.fundName} onChange={(ev) => edit((d) => { d.entity.fundName = ev.target.value; })} />
            </Field>
          )}
          {data.partyType === "company" && (
            <AddressFields label="Registered office" value={e.registeredOffice} disabled={locked} onChange={(patch) => edit((d) => Object.assign(d.entity.registeredOffice, patch))} />
          )}
          <Field label="Authorised individual acting for the entity">
            <input className={inputCls} disabled={locked} value={e.fullLegalName} onChange={(ev) => edit((d) => { d.entity.fullLegalName = ev.target.value; })} />
          </Field>

          {/* Beneficial owners */}
          <div className="mt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-800">Beneficial owners / controllers (25%+)</h3>
              {!locked && (
                <button
                  onClick={() => edit((d) => { d.beneficialOwners.push({ fullLegalName: "", dob: "", ownershipPercent: null, role: "", verified: false }); })}
                  className="text-xs font-semibold px-2 py-1 rounded border"
                  style={{ color: TEAL, borderColor: TEAL }}
                >
                  + Add owner
                </button>
              )}
            </div>
            {data.beneficialOwners.length === 0 ? (
              <p className="text-xs text-gray-500 mt-2">
                No beneficial owners captured. A company, trust or SMSF must identify each individual who owns or controls 25% or more.
              </p>
            ) : (
              <div className="mt-2 space-y-3">
                {data.beneficialOwners.map((bo, i) => (
                  <BeneficialOwnerRow
                    key={i}
                    value={bo}
                    disabled={locked}
                    onChange={(patch) => edit((d) => Object.assign(d.beneficialOwners[i], patch))}
                    onRemove={() => edit((d) => { d.beneficialOwners.splice(i, 1); })}
                  />
                ))}
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Source of funds */}
      <Section title="Source of funds">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Category">
            <select className={inputCls} disabled={locked} value={data.sourceOfFunds.category} onChange={(ev) => edit((d) => { d.sourceOfFunds.category = ev.target.value as AmlCaseData["sourceOfFunds"]["category"]; })}>
              <option value="">Select…</option>
              {SOURCE_OF_FUNDS_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {SOURCE_OF_FUNDS_LABELS[c]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Verified">
            <label className="flex items-center gap-2 text-sm text-gray-700 mt-2">
              <input type="checkbox" disabled={locked} checked={data.sourceOfFunds.verified} onChange={(ev) => edit((d) => { d.sourceOfFunds.verified = ev.target.checked; })} />
              Source of funds evidenced
            </label>
          </Field>
        </div>
        <Field label="Description / evidence">
          <textarea className={inputCls} rows={2} disabled={locked} value={data.sourceOfFunds.description} onChange={(ev) => edit((d) => { d.sourceOfFunds.description = ev.target.value; })} />
        </Field>
      </Section>

      {/* Risk factors */}
      <Section title="Risk assessment">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Toggle label="Politically exposed person (PEP)" checked={data.riskFactors.pep} disabled={locked} onChange={(v) => edit((d) => { d.riskFactors.pep = v; })} />
          <Toggle label="High-risk / sanctioned geography" checked={data.riskFactors.highRiskCountry} disabled={locked} onChange={(v) => edit((d) => { d.riskFactors.highRiskCountry = v; })} />
          <Toggle label="Cash-intensive" checked={data.riskFactors.cashIntensive} disabled={locked} onChange={(v) => edit((d) => { d.riskFactors.cashIntensive = v; })} />
          <Toggle label="Complex ownership structure" checked={data.riskFactors.complexStructure} disabled={locked} onChange={(v) => edit((d) => { d.riskFactors.complexStructure = v; })} />
        </div>
        <p className="text-xs text-gray-500 mt-2">
          Derived rating: <strong className="uppercase">{derivedRisk}</strong>
          {enhanced && " — enhanced due diligence required."}
        </p>
      </Section>

      {/* Screening */}
      <Section title="Sanctions / PEP / adverse-media screening">
        <p className="text-xs text-gray-500">
          Screen every party and 25%+ beneficial owner against DFAT, UN, OFAC, EU, UK HMT, PEP and adverse-media lists — on
          onboarding and on an ongoing basis. A confirmed match means cease to act and consider a Suspicious Matter Report
          (do <strong>not</strong> tell the client).
        </p>
        {subjects.length === 0 ? (
          <p className="text-xs text-gray-500 mt-3">Add a party name (and beneficial owners) to enable screening.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {subjects.map((s, i) => (
              <ScreenSubjectRow key={`${s.name}-${i}`} name={s.name} kind={s.kind} disabled={locked} onRecord={(result) => recordScreening(s.name, s.kind, result)} />
            ))}
          </div>
        )}
        {screenings.length > 0 && (
          <div className="mt-4">
            <h4 className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Screening history</h4>
            <ul className="mt-2 space-y-1">
              {screenings.map((s) => (
                <li key={s.id} className="text-xs text-gray-600 flex items-center gap-2">
                  <span className={`font-semibold ${s.result === "confirmed_match" ? "text-red-700" : s.result === "potential_match" ? "text-amber-700" : s.result === "clear" ? "text-emerald-700" : "text-gray-500"}`}>
                    {SCREEN_RESULT_LABEL[s.result] ?? s.result}
                  </span>
                  <span>· {s.subject_name}</span>
                  <span className="text-gray-400">· {s.provider} · {when(s.screened_at)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      {/* Notes */}
      <Section title="Notes">
        <textarea className={inputCls} rows={3} disabled={locked} value={data.notes} onChange={(ev) => edit((d) => { d.notes = ev.target.value; })} />
      </Section>

      {/* Audit history */}
      {history.length > 0 && (
        <Section title="Audit trail">
          <ul className="space-y-1">
            {history.map((h) => (
              <li key={h.id} className="text-xs text-gray-600">
                <span className="font-semibold capitalize">{h.action}</span>
                {h.status_after && <span> → {h.status_after}</span>}
                {h.note && <span> · {h.note}</span>}
                <span className="text-gray-400"> · {h.changed_by ?? "system"} · {when(h.changed_at)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3 flex items-center gap-3 justify-end z-40">
        <select
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          value={status}
          onChange={(ev) => setStatus(ev.target.value)}
        >
          {AML_CASE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <button
          onClick={() => save()}
          disabled={saving}
          className="px-5 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-60"
          style={{ backgroundColor: TEAL }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        {!locked && cdd.complete && data.screening.status === "clear" && (
          <button
            onClick={() => save("Cleared")}
            disabled={saving}
            className="px-5 py-2 text-sm font-semibold rounded-lg border disabled:opacity-60"
            style={{ color: "#065f46", borderColor: "#065f46" }}
          >
            Mark cleared
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Small presentational helpers ────────────────────────────────────────── */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-5 rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-bold text-gray-800 mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm text-gray-700 py-1">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function AddressFields({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: { line1: string; suburb: string; state: string; postcode: string; country: string };
  disabled: boolean;
  onChange: (patch: Partial<{ line1: string; suburb: string; state: string; postcode: string; country: string }>) => void;
}) {
  return (
    <div className="mt-4">
      <span className="block text-xs font-semibold text-gray-600 mb-1">{label}</span>
      <input className={inputCls} placeholder="Street address" disabled={disabled} value={value.line1} onChange={(e) => onChange({ line1: e.target.value })} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
        <input className={inputCls} placeholder="Suburb" disabled={disabled} value={value.suburb} onChange={(e) => onChange({ suburb: e.target.value })} />
        <input className={inputCls} placeholder="State" disabled={disabled} value={value.state} onChange={(e) => onChange({ state: e.target.value })} />
        <input className={inputCls} placeholder="Postcode" disabled={disabled} value={value.postcode} onChange={(e) => onChange({ postcode: e.target.value })} />
        <input className={inputCls} placeholder="Country" disabled={disabled} value={value.country} onChange={(e) => onChange({ country: e.target.value })} />
      </div>
    </div>
  );
}

function IdDocumentFields({
  value,
  disabled,
  onChange,
}: {
  value: { type: string; number: string; expiry: string; country: string; verified: boolean };
  disabled: boolean;
  onChange: (patch: Partial<{ type: string; number: string; expiry: string; country: string; verified: boolean }>) => void;
}) {
  return (
    <div className="mt-4">
      <span className="block text-xs font-semibold text-gray-600 mb-1">Identity document</span>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <select className={inputCls} disabled={disabled} value={value.type} onChange={(e) => onChange({ type: e.target.value })}>
          {ID_DOCUMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {ID_DOCUMENT_LABELS[t]}
            </option>
          ))}
        </select>
        <input className={inputCls} placeholder="Document number" disabled={disabled} value={value.number} onChange={(e) => onChange({ number: e.target.value })} />
        <input type="date" className={inputCls} placeholder="Expiry" disabled={disabled} value={value.expiry} onChange={(e) => onChange({ expiry: e.target.value })} />
        <input className={inputCls} placeholder="Issuing country" disabled={disabled} value={value.country} onChange={(e) => onChange({ country: e.target.value })} />
      </div>
      <label className="flex items-center gap-2 text-sm text-gray-700 mt-2">
        <input type="checkbox" disabled={disabled} checked={value.verified} onChange={(e) => onChange({ verified: e.target.checked })} />
        Document sighted / verified
      </label>
    </div>
  );
}

function BeneficialOwnerRow({
  value,
  disabled,
  onChange,
  onRemove,
}: {
  value: BeneficialOwner;
  disabled: boolean;
  onChange: (patch: Partial<BeneficialOwner>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <input className={inputCls} placeholder="Full legal name" disabled={disabled} value={value.fullLegalName} onChange={(e) => onChange({ fullLegalName: e.target.value })} />
        <input type="date" className={inputCls} disabled={disabled} value={value.dob} onChange={(e) => onChange({ dob: e.target.value })} />
        <input className={inputCls} placeholder="Role (director, trustee, member…)" disabled={disabled} value={value.role} onChange={(e) => onChange({ role: e.target.value })} />
        <input
          type="number"
          min={0}
          max={100}
          className={inputCls}
          placeholder="Ownership %"
          disabled={disabled}
          value={value.ownershipPercent ?? ""}
          onChange={(e) => onChange({ ownershipPercent: e.target.value === "" ? null : Number(e.target.value) })}
        />
      </div>
      <div className="flex items-center justify-between mt-2">
        <label className="flex items-center gap-2 text-xs text-gray-700">
          <input type="checkbox" disabled={disabled} checked={value.verified} onChange={(e) => onChange({ verified: e.target.checked })} />
          Verified
        </label>
        {!disabled && (
          <button onClick={onRemove} className="text-xs text-red-600 hover:underline">
            Remove
          </button>
        )}
      </div>
    </div>
  );
}

function ScreenSubjectRow({
  name,
  kind,
  disabled,
  onRecord,
}: {
  name: string;
  kind: "party" | "beneficial_owner";
  disabled: boolean;
  onRecord: (result: ScreeningResult) => void;
}) {
  const [result, setResult] = useState<ScreeningResult>("clear");
  return (
    <div className="flex items-center gap-2 flex-wrap rounded-lg border border-gray-200 p-2">
      <span className="text-sm text-gray-800 flex-1 min-w-[10rem]">
        {name} <span className="text-xs text-gray-400">· {kind === "party" ? "party" : "beneficial owner"}</span>
      </span>
      <select
        className="rounded-lg border border-gray-300 px-2 py-1 text-xs"
        value={result}
        disabled={disabled}
        onChange={(e) => setResult(e.target.value as ScreeningResult)}
      >
        {SCREENING_RESULTS.filter((r) => r !== "pending").map((r) => (
          <option key={r} value={r}>
            {SCREEN_RESULT_LABEL[r]}
          </option>
        ))}
      </select>
      <button
        onClick={() => onRecord(result)}
        disabled={disabled}
        className="text-xs font-semibold px-3 py-1 rounded border disabled:opacity-50"
        style={{ color: TEAL, borderColor: TEAL }}
      >
        Record screening
      </button>
    </div>
  );
}
