"use client";

/**
 * Expression of Interest — the editable form (matches the paper EOI: Buyer/s →
 * Solicitor → Property → Deposit → Finance → Notes). Embeds the shared
 * SigningPanel (send for e-signing; the signer is asked to attach their driver's
 * licence), shows the licence status, and offers "Start CDD from this EOI" — the
 * AML tie-in that seeds a Customer Due Diligence case from the buyer data.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import SigningPanel from "../../components/SigningPanel";
import {
  hydrateEoi,
  emptyEoi,
  eoiProposedSigners,
  eoiOutstanding,
  EOI_STATUSES,
  type EoiData,
  type TermOption,
} from "../../../utils/eoi";

const TEAL = "#0F4C5C";
const inputCls =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:border-gray-500 disabled:bg-gray-50 disabled:text-gray-500";

type HistoryRow = {
  id: string;
  action: string;
  changed_by: string | null;
  changed_at: string;
  status_after: string | null;
  note: string | null;
};

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function EoiForm({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<EoiData>(() => emptyEoi());
  const [status, setStatus] = useState<string>("Draft");
  const [amlCaseId, setAmlCaseId] = useState<string | null>(null);
  const [licenceUploadedAt, setLicenceUploadedAt] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [startingCdd, setStartingCdd] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const locked = status === "Signed";

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/eois/${id}/history`).then((r) => r.json());
      if (res.ok) setHistory(res.history ?? []);
    } catch { /* non-fatal */ }
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/eois/${id}`).then((r) => r.json());
        if (cancelled) return;
        if (!res.ok) throw new Error(res.error || "Load failed");
        setData(hydrateEoi(res.eoi.data));
        setStatus(res.eoi.status ?? "Draft");
        setAmlCaseId(res.eoi.aml_case_id ?? null);
        setLicenceUploadedAt(res.eoi.licence_uploaded_at ?? null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
      if (!cancelled) await loadHistory();
    })();
    return () => {
      cancelled = true;
    };
  }, [id, loadHistory]);

  function edit(mutator: (d: EoiData) => void) {
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
      const res = await fetch(`/api/eois/${id}`, {
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

  async function startCdd() {
    setStartingCdd(true);
    setError("");
    try {
      const res = await fetch(`/api/eois/${id}/start-cdd`, { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Could not start CDD");
      router.push(`/aml/${json.amlCaseId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start CDD");
      setStartingCdd(false);
    }
  }

  if (loading) return <p className="p-6 text-sm text-gray-500">Loading…</p>;

  const outstanding = eoiOutstanding(data);
  const signers = eoiProposedSigners(data);
  const fin = data.finance;

  return (
    <div className="pb-24">
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <Link href="/eoi" className="text-xs text-gray-500 hover:underline">
              ← Back to EOIs
            </Link>
            <h1 className="text-2xl font-bold mt-1" style={{ color: TEAL }}>
              Expression of Interest
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {amlCaseId ? (
              <Link
                href={`/aml/${amlCaseId}`}
                className="px-3 py-2 text-sm font-semibold rounded-lg border"
                style={{ color: TEAL, borderColor: TEAL }}
              >
                View CDD case →
              </Link>
            ) : (
              <button
                onClick={startCdd}
                disabled={startingCdd}
                className="px-3 py-2 text-sm font-semibold rounded-lg border disabled:opacity-60"
                style={{ color: TEAL, borderColor: TEAL }}
              >
                {startingCdd ? "Starting…" : "Start CDD from this EOI"}
              </button>
            )}
          </div>
        </div>

        {locked && (
          <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-900">
            This EOI is <strong>Signed</strong> and locked. Reopen it (change status below) to amend.
          </div>
        )}
        {error && <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>}
        {notice && <div className="mt-4 p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">{notice}</div>}

        {outstanding.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            Still to complete: {outstanding.join(", ")}.
          </div>
        )}

        {licenceUploadedAt && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
            ✓ Driver&apos;s licence attached by the signer ({when(licenceUploadedAt)}).
          </div>
        )}

        <Section title="Buyer/s">
          <Field label="Date">
            <input type="date" className={inputCls} disabled={locked} value={data.date} onChange={(e) => edit((d) => { d.date = e.target.value; })} />
          </Field>
          <Field label="Purchasing entity (incl. ATF … for a trust/SMSF)">
            <input className={inputCls} disabled={locked} value={data.purchasingEntity} onChange={(e) => edit((d) => { d.purchasingEntity = e.target.value; })} />
          </Field>

          <div className="mt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-600">Buyers (each buyer signs)</span>
              {!locked && (
                <button
                  onClick={() => edit((d) => { d.buyers.push({ fullName: "", email: "", mobile: "" }); })}
                  className="text-xs font-semibold px-2 py-1 rounded border"
                  style={{ color: TEAL, borderColor: TEAL }}
                >
                  + Add buyer
                </button>
              )}
            </div>
            <div className="mt-2 space-y-2">
              {data.buyers.map((b, i) => (
                <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-center">
                  <input className={inputCls} placeholder="Full legal name" disabled={locked} value={b.fullName} onChange={(e) => edit((d) => { d.buyers[i].fullName = e.target.value; })} />
                  <input className={inputCls} placeholder="Email" disabled={locked} value={b.email} onChange={(e) => edit((d) => { d.buyers[i].email = e.target.value; })} />
                  <div className="flex gap-2">
                    <input className={inputCls} placeholder="Mobile" disabled={locked} value={b.mobile} onChange={(e) => edit((d) => { d.buyers[i].mobile = e.target.value; })} />
                    {!locked && data.buyers.length > 1 && (
                      <button onClick={() => edit((d) => { d.buyers.splice(i, 1); })} className="text-xs text-red-600 hover:underline px-1">✕</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <Field label="Buyer address"><input className={inputCls} disabled={locked} value={data.buyerAddress} onChange={(e) => edit((d) => { d.buyerAddress = e.target.value; })} /></Field>
            <Field label="Fax"><input className={inputCls} disabled={locked} value={data.fax} onChange={(e) => edit((d) => { d.fax = e.target.value; })} /></Field>
            <Field label="SMSF purchase">
              <YesNo disabled={locked} value={data.smsfPurchase} onChange={(v) => edit((d) => { d.smsfPurchase = v; })} />
            </Field>
            {data.smsfPurchase === true && (
              <Field label="SMSF established">
                <YesNo disabled={locked} value={data.smsfEstablished} onChange={(v) => edit((d) => { d.smsfEstablished = v; })} />
              </Field>
            )}
            <Field label="ACN / ABN"><input className={inputCls} disabled={locked} value={data.acnAbn} onChange={(e) => edit((d) => { d.acnAbn = e.target.value; })} /></Field>
            <Field label="Tax File No/s"><input className={inputCls} disabled={locked} value={data.taxFileNos} onChange={(e) => edit((d) => { d.taxFileNos = e.target.value; })} /></Field>
          </div>
        </Section>

        <Section title="Solicitor">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Name"><input className={inputCls} disabled={locked} value={data.solicitor.name} onChange={(e) => edit((d) => { d.solicitor.name = e.target.value; })} /></Field>
            <Field label="Attention"><input className={inputCls} disabled={locked} value={data.solicitor.attention} onChange={(e) => edit((d) => { d.solicitor.attention = e.target.value; })} /></Field>
            <Field label="Address"><input className={inputCls} disabled={locked} value={data.solicitor.address} onChange={(e) => edit((d) => { d.solicitor.address = e.target.value; })} /></Field>
            <Field label="Phone"><input className={inputCls} disabled={locked} value={data.solicitor.phone} onChange={(e) => edit((d) => { d.solicitor.phone = e.target.value; })} /></Field>
            <Field label="Fax"><input className={inputCls} disabled={locked} value={data.solicitor.fax} onChange={(e) => edit((d) => { d.solicitor.fax = e.target.value; })} /></Field>
            <Field label="E-mail"><input className={inputCls} disabled={locked} value={data.solicitor.email} onChange={(e) => edit((d) => { d.solicitor.email = e.target.value; })} /></Field>
          </div>
        </Section>

        <Section title="Property">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Property address"><input className={inputCls} disabled={locked} value={data.property.address} onChange={(e) => edit((d) => { d.property.address = e.target.value; })} /></Field>
            <Field label="Purchase price (blank = TBC)">
              <input
                type="number"
                className={inputCls}
                disabled={locked}
                value={data.property.purchasePrice ?? ""}
                onChange={(e) => edit((d) => { d.property.purchasePrice = e.target.value === "" ? null : Number(e.target.value); })}
              />
            </Field>
          </div>
        </Section>

        <Section title="Deposit">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Total deposits (e.g. TBC)"><input className={inputCls} disabled={locked} value={data.deposit.total} onChange={(e) => edit((d) => { d.deposit.total = e.target.value; })} /></Field>
            <Field label="Initial / holding deposit (e.g. n/a)"><input className={inputCls} disabled={locked} value={data.deposit.initialHolding} onChange={(e) => edit((d) => { d.deposit.initialHolding = e.target.value; })} /></Field>
          </div>
        </Section>

        <Section title="Finance">
          <Field label="Subject to finance">
            <YesNo disabled={locked} value={fin.subjectToFinance} onChange={(v) => edit((d) => { d.finance.subjectToFinance = v; })} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
            <Field label="If Yes — finance term">
              <TermSelect disabled={locked} term={fin.financeTerm} other={fin.financeOther}
                onTerm={(v) => edit((d) => { d.finance.financeTerm = v; })} onOther={(v) => edit((d) => { d.finance.financeOther = v; })} />
            </Field>
            <Field label="Settlement terms">
              <TermSelect disabled={locked} term={fin.settlementTerm} other={fin.settlementOther}
                onTerm={(v) => edit((d) => { d.finance.settlementTerm = v; })} onOther={(v) => edit((d) => { d.finance.settlementOther = v; })} />
            </Field>
          </div>
        </Section>

        <Section title="Notes">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Broker"><input className={inputCls} disabled={locked} value={data.broker.name} onChange={(e) => edit((d) => { d.broker.name = e.target.value; })} /></Field>
            <Field label="Broker email"><input className={inputCls} disabled={locked} value={data.broker.email} onChange={(e) => edit((d) => { d.broker.email = e.target.value; })} /></Field>
          </div>
          <Field label="Notes"><textarea className={inputCls} rows={3} disabled={locked} value={data.notes} onChange={(e) => edit((d) => { d.notes = e.target.value; })} /></Field>
        </Section>

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
      </div>

      {/* Send-for-signature panel (asks the signer to attach their licence). */}
      <div className="max-w-4xl mx-auto">
        <SigningPanel docType="eoi" docId={id} proposedSigners={signers} />
      </div>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-3 flex items-center gap-3 justify-end z-40">
        <select className="rounded-lg border border-gray-300 px-3 py-2 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
          {EOI_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <button onClick={() => save()} disabled={saving} className="px-5 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-60" style={{ backgroundColor: TEAL }}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

/* ── Small helpers ───────────────────────────────────────────────────────── */

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

/** Tri-state Yes / No / (unset) segmented control. */
function YesNo({ value, disabled, onChange }: { value: boolean | null; disabled: boolean; onChange: (v: boolean | null) => void }) {
  const btn = (active: boolean) =>
    `px-4 py-2 text-sm font-semibold border transition ${active ? "text-white" : "text-gray-600 hover:bg-gray-50"}`;
  return (
    <div className="inline-flex rounded-lg overflow-hidden border border-gray-300">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(value === true ? null : true)}
        className={btn(value === true)}
        style={value === true ? { backgroundColor: TEAL, borderColor: TEAL } : undefined}
      >
        Yes
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(value === false ? null : false)}
        className={`${btn(value === false)} border-l`}
        style={value === false ? { backgroundColor: TEAL, borderColor: TEAL } : undefined}
      >
        No
      </button>
    </div>
  );
}

function TermSelect({
  term,
  other,
  disabled,
  onTerm,
  onOther,
}: {
  term: TermOption;
  other: string;
  disabled: boolean;
  onTerm: (v: TermOption) => void;
  onOther: (v: string) => void;
}) {
  return (
    <div className="flex gap-2">
      <select className={inputCls} disabled={disabled} value={term} onChange={(e) => onTerm(e.target.value as TermOption)}>
        <option value="">—</option>
        <option value="7">7 Days</option>
        <option value="14">14 Days</option>
        <option value="21">21 Days</option>
        <option value="other">Other</option>
      </select>
      {term === "other" && (
        <input className={inputCls} placeholder="Specify" disabled={disabled} value={other} onChange={(e) => onOther(e.target.value)} />
      )}
    </div>
  );
}
