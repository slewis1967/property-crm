"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabaseBrowser } from "../../../utils/supabase-browser";
import {
  formatSaleDate,
  LOST_STAGES,
  SALE_FILES_BUCKET,
  SALE_PATH,
  SALE_STAGE_LABELS,
  saleStageLabel,
  type DepositPosition,
  type SalePayment,
} from "../../../utils/sales";
import type { DealStage } from "../../../utils/partner";
import { STAGE_TONE } from "../SalesClient";
import { buildSalesAdvicePdf } from "./salesAdvicePdf";

type Sale = Record<string, unknown> & { id: string; stage: string; partner_id: string | null };
type SaleFile = { id: string; name: string; size_bytes: number | null; category: string; uploaded_by: string; created_at: string; url: string | null };
type Detail = {
  sale: Sale;
  payments: SalePayment[];
  deposit: DepositPosition;
  files: SaleFile[];
  events: { actor: string; action: string; detail: Record<string, unknown>; created_at: string }[];
  next_step: { label: string; overdue: boolean } | null;
  next_stages: DealStage[];
};

const aud = (v: unknown) =>
  v == null || v === "" || Number(v) === 0 ? "—" : Number(v).toLocaleString("en-AU", { style: "currency", currency: "AUD", minimumFractionDigits: 2 });
const str = (v: unknown) => (v == null || v === "" ? "" : String(v));
const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null;

type Field = { key: string; label: string; type?: "text" | "date" | "money" | "bool" | "long" | "url" };

const SECTIONS: { title: string; fields: Field[] }[] = [
  {
    title: "Sale details",
    fields: [
      { key: "sale_ref", label: "Lot reference" },
      { key: "sale_owner", label: "Sale owner" },
      { key: "sale_price", label: "Price", type: "money" },
      { key: "lead_source", label: "Lead source" },
      { key: "anticipated_exchange_date", label: "Anticipated exchange", type: "date" },
      { key: "exchange_date", label: "Exchanged on", type: "date" },
      { key: "cooling_off_waived", label: "Cooling-off waived", type: "bool" },
      { key: "cooling_off_expires", label: "Cooling-off expires", type: "date" },
      { key: "anticipated_settlement_date", label: "Anticipated settlement", type: "date" },
      { key: "settlement_date", label: "Settled on", type: "date" },
    ],
  },
  {
    title: "Buyer",
    fields: [
      { key: "buyer_names", label: "All buyer names" },
      { key: "buyer_phone", label: "Mobile" },
      { key: "buyer_email", label: "Email" },
      { key: "buyer_address", label: "Address" },
      { key: "buyer_solicitor", label: "Solicitor" },
      { key: "buyer_broker", label: "Broker" },
      { key: "guarantor", label: "Guarantor" },
      { key: "firb_required", label: "FIRB required", type: "bool" },
      { key: "contact_id", label: "CRM contact ID" },
    ],
  },
  {
    title: "Project and lot",
    fields: [
      { key: "project_name", label: "Project" },
      { key: "developer_name", label: "Developer" },
      { key: "unit_no", label: "Unit no." },
      { key: "colour_selection", label: "Colour selection" },
    ],
  },
  {
    title: "Deposit",
    fields: [
      { key: "deposit_initial_required", label: "Initial deposit required", type: "money" },
      { key: "deposit_initial_due_date", label: "Initial deposit due", type: "date" },
      { key: "deposit_balance_required", label: "Balance deposit required", type: "money" },
      { key: "deposit_balance_due_date", label: "Balance deposit due", type: "date" },
      { key: "deposit_returned", label: "Deposit returned", type: "bool" },
    ],
  },
  {
    title: "Terms",
    fields: [
      { key: "conditions", label: "Terms and conditions", type: "long" },
      { key: "clause_amendments", label: "Clause amendments", type: "long" },
      { key: "staff_notes", label: "Internal notes (never shown to partners)", type: "long" },
    ],
  },
  {
    title: "Developer portal",
    fields: [
      { key: "external_source", label: "Developer system" },
      { key: "external_url", label: "Link to the sale in their portal", type: "url" },
    ],
  },
];

export default function SaleDetail({ id }: { id: string }) {
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<"files" | "payments" | "activity">("files");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/sales/${id}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!json.ok) return setError(json.error ?? "Couldn't load the sale");
    setError(null);
    setD(json as Detail);
  }, [id]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/sales/${id}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((json) => {
        if (!alive) return;
        if (!json.ok) setError(json.error ?? "Couldn't load the sale");
        else setD(json as Detail);
      })
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [id]);

  async function call(url: string, init: RequestInit, okMsg?: string) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(url, { headers: { "content-type": "application/json" }, ...init });
      const json = await res.json().catch(() => ({}));
      if (!json.ok) throw new Error(json.error ?? "That didn't work");
      if (okMsg) setNotice(okMsg);
      await load();
      return json;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function moveTo(to: DealStage) {
    let reason: string | undefined;
    if (LOST_STAGES.has(to)) {
      reason = window.prompt("Why was the sale lost?")?.trim();
      if (!reason) return;
    }
    await call(`/api/sales/${id}`, { method: "POST", body: JSON.stringify({ action: "stage", to, reason }) }, `Moved to ${SALE_STAGE_LABELS[to]}.`);
  }

  async function upload(file: File, category: string) {
    const start = await call(`/api/sales/${id}/files`, {
      method: "POST",
      body: JSON.stringify({ filename: file.name, size: file.size, mime_type: file.type, category }),
    });
    if (!start) return;
    setBusy(true);
    const { error: upErr } = await supabaseBrowser.storage.from(SALE_FILES_BUCKET).uploadToSignedUrl(start.path, start.token, file);
    setBusy(false);
    if (upErr) return setError(upErr.message);
    await call(`/api/sales/${id}/files`, { method: "PATCH", body: JSON.stringify({ file_id: start.file_id }) }, `Uploaded ${file.name}.`);
  }

  async function makeSalesAdvice() {
    if (!d) return;
    const blob = buildSalesAdvicePdf(d.sale, d.deposit);
    const name = `SalesAdvice-${str(d.sale.sale_ref) || "sale"}.pdf`;
    await upload(new File([blob], name, { type: "application/pdf" }), "sales_advice");
  }

  if (error && !d) return <div className="p-6 text-sm text-red-700">{error}</div>;
  if (!d) return <div className="p-6 text-sm text-gray-500">Loading…</div>;

  const { sale, deposit } = d;
  const partner = one<{ firm_name?: string }>(sale.partners);
  const lost = LOST_STAGES.has(sale.stage as DealStage);
  const pathIndex = SALE_PATH.indexOf(sale.stage as DealStage);

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-4 lg:p-6">
      <div className="mx-auto max-w-6xl">
        <Link href="/sales" className="text-sm text-gray-500 hover:underline">← Sales</Link>
        {error && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
        {notice && <div className="mt-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">{notice}</div>}

        <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_1.1fr]">
          {/* Summary card */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wide text-gray-400">Sale{partner?.firm_name ? ` · via ${partner.firm_name}` : ""}</div>
                <h1 className="text-xl font-semibold text-gray-900">{str(sale.sale_ref) || "Untitled sale"}</h1>
              </div>
              <div className="text-right text-xs uppercase tracking-wide text-gray-500">{str(sale.project_name)}</div>
            </div>
            <div className="mt-3 text-2xl font-semibold">{aud(sale.sale_price ?? sale.price_snapshot)}</div>
            <div className="text-sm text-gray-700">{str(sale.buyer_names) || "No buyer recorded"}</div>

            {/* Progress path */}
            <ol className="mt-5 flex items-start justify-between gap-1 border-t border-gray-100 pt-4">
              {SALE_PATH.map((s, i) => {
                const done = !lost && pathIndex > i;
                const current = !lost && pathIndex === i;
                return (
                  <li key={s} className="flex flex-1 flex-col items-center text-center">
                    <span
                      className={`flex h-5 w-5 items-center justify-center rounded-full border text-[10px] ${
                        done ? "border-green-700 bg-green-700 text-white" : current ? "border-gray-900 bg-gray-900" : "border-gray-300 bg-white"
                      }`}
                    >
                      {done ? "✓" : ""}
                    </span>
                    <span className={`mt-1 text-[10px] uppercase leading-tight ${current ? "font-semibold text-gray-900" : "text-gray-400"}`}>
                      {SALE_STAGE_LABELS[s]}
                    </span>
                  </li>
                );
              })}
            </ol>
            {lost && (
              <div className="mt-3 rounded-lg bg-gray-100 px-3 py-2 text-sm text-gray-700">
                {saleStageLabel(sale.stage)}{sale.lost_reason ? `: ${str(sale.lost_reason)}` : ""}
              </div>
            )}

            {d.next_step && (
              <div className={`mt-4 rounded-lg px-3 py-2 text-sm ${d.next_step.overdue ? "bg-red-50 text-red-800" : "bg-blue-50 text-blue-800"}`}>
                <span className="font-semibold">Next step:</span> {d.next_step.label}
                {d.next_step.overdue ? " (overdue)" : ""}
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              {sale.partner_id ? (
                <Link href="/admin/partners" className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                  Move stage in Partners (the partner is told)
                </Link>
              ) : (
                d.next_stages.map((to) => (
                  <button
                    key={to}
                    disabled={busy}
                    onClick={() => void moveTo(to)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
                      LOST_STAGES.has(to) ? "border border-gray-300 text-gray-600 hover:bg-gray-50" : "bg-gray-900 text-white hover:bg-gray-800"
                    }`}
                  >
                    {LOST_STAGES.has(to) ? "Mark lost" : `Move to ${SALE_STAGE_LABELS[to]}`}
                  </button>
                ))
              )}
              {typeof sale.external_url === "string" && sale.external_url && (
                <a href={sale.external_url} target="_blank" rel="noreferrer" className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                  Open in developer portal ↗
                </a>
              )}
            </div>
            {typeof sale.external_stage === "string" && sale.external_stage && (
              <div className="mt-2 text-xs text-gray-500">
                Developer shows: <span className={`rounded px-1.5 py-0.5 ${STAGE_TONE[sale.stage] ?? ""}`}>{sale.external_stage}</span>
                {sale.external_synced_at ? ` · checked ${new Date(String(sale.external_synced_at)).toLocaleString("en-AU")}` : ""}
              </div>
            )}

            <div className="mt-4 border-t border-gray-100 pt-3">
              <div className="text-[11px] uppercase tracking-wide text-gray-400">Terms and conditions</div>
              <p className="mt-1 whitespace-pre-wrap text-sm italic text-gray-700">{str(sale.conditions) || "None recorded."}</p>
            </div>
          </div>

          {/* Files / payments / activity */}
          <div className="rounded-2xl border border-gray-200 bg-white">
            <div className="flex gap-1 border-b border-gray-200 px-3">
              {(["files", "payments", "activity"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-3 py-2 text-sm font-medium capitalize ${tab === t ? "border-b-2 border-gray-900 text-gray-900" : "text-gray-500"}`}
                >
                  {t === "files" ? `Files (${d.files.length})` : t === "payments" ? `Payments (${d.payments.length})` : "Activity"}
                </button>
              ))}
            </div>
            <div className="p-4">
              {tab === "files" && <FilesTab files={d.files} busy={busy} onUpload={upload} onSalesAdvice={makeSalesAdvice}
                onDelete={(f) => window.confirm(`Delete ${f.name}? This can't be undone.`) &&
                  void call(`/api/sales/${id}/files?file_id=${f.id}`, { method: "DELETE" }, `Deleted ${f.name}.`)} />}
              {tab === "payments" && (
                <PaymentsTab
                  deposit={deposit}
                  payments={d.payments}
                  busy={busy}
                  onAdd={(p) => call(`/api/sales/${id}/payments`, { method: "POST", body: JSON.stringify(p) }, "Payment recorded.")}
                  onDelete={(p) => window.confirm("Remove this payment record?") &&
                    void call(`/api/sales/${id}/payments?payment_id=${p.id}`, { method: "DELETE" }, "Payment removed.")}
                />
              )}
              {tab === "activity" && (
                <ul className="space-y-2 text-sm">
                  {d.events.length === 0 && <li className="text-gray-500">Nothing yet.</li>}
                  {d.events.map((e, i) => (
                    <li key={i} className="flex justify-between gap-3 border-b border-gray-50 pb-1">
                      <span className="text-gray-800">{e.action.replace(/_/g, " ")}{e.detail?.to ? ` → ${saleStageLabel(String(e.detail.to))}` : ""}</span>
                      <span className="shrink-0 text-xs text-gray-500">{e.actor} · {new Date(e.created_at).toLocaleString("en-AU")}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          {SECTIONS.map((sec) => (
            <EditSection key={sec.title} title={sec.title} fields={sec.fields} sale={sale} busy={busy}
              onSave={(patch) => call(`/api/sales/${id}`, { method: "PATCH", body: JSON.stringify(patch) }, `${sec.title} saved.`)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function EditSection({ title, fields, sale, busy, onSave }: {
  title: string; fields: Field[]; sale: Sale; busy: boolean; onSave: (patch: Record<string, unknown>) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const start = () => {
    setDraft(Object.fromEntries(fields.map((f) => [f.key, sale[f.key] ?? (f.type === "bool" ? false : "")])));
    setEditing(true);
  };
  async function save() {
    const patch: Record<string, unknown> = {};
    for (const f of fields) if (draft[f.key] !== (sale[f.key] ?? (f.type === "bool" ? false : ""))) patch[f.key] = draft[f.key];
    if (Object.keys(patch).length && !(await onSave(patch))) return;
    setEditing(false);
  }
  const show = (f: Field) => {
    const v = sale[f.key];
    if (f.type === "money") return aud(v);
    if (f.type === "date") return typeof v === "string" ? formatSaleDate(v) : "—";
    if (f.type === "bool") return v == null ? "—" : v ? "Yes" : "No";
    if (f.type === "url" && typeof v === "string" && v) return <a className="text-blue-700 underline" href={v} target="_blank" rel="noreferrer">{v}</a>;
    return str(v) || "—";
  };
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {editing ? (
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="rounded-lg border border-gray-300 px-3 py-1 text-sm">Cancel</button>
            <button disabled={busy} onClick={() => void save()} className="rounded-lg bg-gray-900 px-3 py-1 text-sm text-white disabled:opacity-50">Save</button>
          </div>
        ) : (
          <button onClick={start} className="text-sm text-gray-600 hover:underline">Edit</button>
        )}
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.key} className={f.type === "long" ? "sm:col-span-2" : ""}>
            <dt className="text-xs text-gray-500">{f.label}</dt>
            <dd className="mt-0.5 text-sm text-gray-900">
              {!editing ? (
                <span className={f.type === "long" ? "whitespace-pre-wrap" : ""}>{show(f)}</span>
              ) : f.type === "bool" ? (
                <input type="checkbox" checked={!!draft[f.key]} onChange={(e) => setDraft((p) => ({ ...p, [f.key]: e.target.checked }))} />
              ) : f.type === "long" ? (
                <textarea rows={4} value={str(draft[f.key])} onChange={(e) => setDraft((p) => ({ ...p, [f.key]: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-2 py-1 text-sm" />
              ) : (
                <input
                  type={f.type === "date" ? "date" : "text"}
                  inputMode={f.type === "money" ? "decimal" : undefined}
                  value={str(draft[f.key])}
                  onChange={(e) => setDraft((p) => ({ ...p, [f.key]: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-2 py-1 text-sm"
                />
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  sales_advice: "Sales advice", buyer_id: "Buyer ID", contract: "Contract", deposit_receipt: "Deposit receipt", other: "Other",
};

function FilesTab({ files, busy, onUpload, onSalesAdvice, onDelete }: {
  files: SaleFile[]; busy: boolean; onUpload: (f: File, category: string) => Promise<void>; onSalesAdvice: () => Promise<void>; onDelete: (f: SaleFile) => void;
}) {
  const [category, setCategory] = useState("buyer_id");
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded-lg border border-gray-300 px-2 py-1" aria-label="File type">
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <label className={`cursor-pointer rounded-lg border border-gray-300 px-3 py-1 hover:bg-gray-50 ${busy ? "pointer-events-none opacity-50" : ""}`}>
          Upload file
          <input type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void onUpload(f, category); }} />
        </label>
        <button disabled={busy} onClick={() => void onSalesAdvice()} className="rounded-lg bg-gray-900 px-3 py-1 text-white disabled:opacity-50">
          Generate sales advice
        </button>
      </div>
      <ul className="mt-3 divide-y divide-gray-100 text-sm">
        {files.length === 0 && <li className="py-3 text-gray-500">No files yet.</li>}
        {files.map((f) => (
          <li key={f.id} className="flex items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              {f.url ? <a href={f.url} className="truncate font-medium text-gray-900 hover:underline">{f.name}</a> : <span>{f.name}</span>}
              <div className="text-xs text-gray-500">
                {CATEGORY_LABELS[f.category] ?? f.category} · {new Date(f.created_at).toLocaleDateString("en-AU")}
                {f.size_bytes ? ` · ${Math.max(1, Math.round(f.size_bytes / 1024))} KB` : ""}
              </div>
            </div>
            <button onClick={() => onDelete(f)} className="text-xs text-gray-500 hover:text-red-700">Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const PAYMENT_KINDS: Record<string, string> = {
  initial_deposit: "Initial deposit", balance_deposit: "Balance deposit", refund: "Refund", other: "Other",
};

function PaymentsTab({ deposit, payments, busy, onAdd, onDelete }: {
  deposit: DepositPosition; payments: SalePayment[]; busy: boolean;
  onAdd: (p: Record<string, unknown>) => Promise<unknown>; onDelete: (p: SalePayment) => void;
}) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Brisbane" });
  const [p, setP] = useState({ kind: "initial_deposit", amount: "", received_on: today, method: "", reference: "" });
  const row = (label: string, required: number, received: number, paid: boolean) => (
    <div className="rounded-lg border border-gray-100 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm"><span className="font-semibold">{aud(received) === "—" ? "$0.00" : aud(received)}</span> of {aud(required)}</div>
      <div className={`text-xs ${paid ? "text-green-700" : "text-gray-500"}`}>{paid ? "Paid in full" : required ? "Outstanding" : "Not set"}</div>
    </div>
  );
  return (
    <div className="text-sm">
      <div className="grid grid-cols-2 gap-2">
        {row("Initial deposit", deposit.initialRequired, deposit.initialReceived, deposit.initialPaid)}
        {row("Balance deposit", deposit.balanceRequired, deposit.balanceReceived, deposit.balancePaid)}
      </div>
      <form
        className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_0.8fr_1fr_auto]"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await onAdd(p)) setP((x) => ({ ...x, amount: "", reference: "" }));
        }}
      >
        <select value={p.kind} onChange={(e) => setP({ ...p, kind: e.target.value })} className="rounded-lg border border-gray-300 px-2 py-1" aria-label="Payment type">
          {Object.entries(PAYMENT_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input value={p.amount} onChange={(e) => setP({ ...p, amount: e.target.value })} placeholder="Amount" inputMode="decimal" className="rounded-lg border border-gray-300 px-2 py-1" />
        <input type="date" value={p.received_on} onChange={(e) => setP({ ...p, received_on: e.target.value })} className="rounded-lg border border-gray-300 px-2 py-1" aria-label="Received on" />
        <button disabled={busy || !p.amount} className="rounded-lg bg-gray-900 px-3 py-1 text-white disabled:opacity-50">Record</button>
        <input value={p.reference} onChange={(e) => setP({ ...p, reference: e.target.value })} placeholder="Reference (optional)" className="col-span-2 rounded-lg border border-gray-300 px-2 py-1 sm:col-span-4" />
      </form>
      <p className="mt-1 text-xs text-gray-500">Records money the developer or trust account has received. Nothing is charged.</p>
      <ul className="mt-3 divide-y divide-gray-100">
        {payments.map((x) => (
          <li key={x.id} className="flex items-center justify-between py-2">
            <span>
              {PAYMENT_KINDS[x.kind]} · <span className="font-medium">{aud(x.amount)}</span> · {formatSaleDate(x.received_on)}
              {x.reference ? <span className="text-gray-500"> · {x.reference}</span> : null}
            </span>
            <button onClick={() => onDelete(x)} className="text-xs text-gray-500 hover:text-red-700">Remove</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
