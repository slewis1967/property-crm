"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DEAL_STAGES,
  cashflowByMonth,
  dealBanked,
  dealNet,
  fmtMonth,
  fmtMoney,
  nextPayment,
  paymentsReconcile,
  summarise,
  type DealStage,
  type RevenueDeal,
} from "../../utils/revenue";

const TEAL = "#0F4C5C";

type EditorPayment = { label: string; date: string; amount: string; paid: boolean };
type Editor = {
  id: string | null; // null = new
  lot: string;
  purchaser: string;
  remuneration: string;
  referrer_fee: string;
  referrer_note: string;
  stage: DealStage;
  notes: string;
  payments: EditorPayment[];
};

const emptyEditor = (): Editor => ({
  id: null, lot: "", purchaser: "", remuneration: "", referrer_fee: "", referrer_note: "",
  stage: "active", notes: "", payments: [{ label: "1st", date: "", amount: "", paid: false }],
});

function toEditor(d: RevenueDeal): Editor {
  return {
    id: d.id, lot: d.lot, purchaser: d.purchaser ?? "",
    remuneration: String(d.remuneration ?? ""), referrer_fee: String(d.referrer_fee ?? ""),
    referrer_note: d.referrer_note ?? "", stage: d.stage, notes: d.notes ?? "",
    payments: (d.payments ?? []).map((p) => ({ label: p.label, date: p.date ?? "", amount: String(p.amount ?? ""), paid: p.paid })),
  };
}

const nnum = (s: string): number => {
  const n = parseFloat(String(s).replace(/[^0-9.-]/g, ""));
  return isFinite(n) ? n : 0;
};

const stageMeta = (s: DealStage) => DEAL_STAGES.find((x) => x.value === s) ?? DEAL_STAGES[0];

export default function RevenueClient() {
  const [deals, setDeals] = useState<RevenueDeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/revenue", { cache: "no-store" });
        const json = await res.json();
        if (!cancelled && json.ok) {
          setDeals(json.deals ?? []);
          setTableMissing(Boolean(json.tableMissing));
        }
      } catch { /* leave empty */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const summary = useMemo(() => summarise(deals), [deals]);
  const months = useMemo(() => cashflowByMonth(deals), [deals]);
  const maxMonth = useMemo(() => Math.max(1, ...months.map((m) => m.total)), [months]);

  async function patchDeal(id: string, partial: Record<string, unknown>) {
    const prev = deals;
    try {
      const res = await fetch(`/api/revenue/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(partial),
      });
      const json = await res.json();
      if (json.ok && json.deal) setDeals((list) => list.map((d) => (d.id === id ? json.deal : d)));
      else setDeals(prev);
    } catch { setDeals(prev); }
  }

  function togglePaid(deal: RevenueDeal, idx: number) {
    const payments = deal.payments.map((p, i) => (i === idx ? { ...p, paid: !p.paid } : p));
    setDeals((list) => list.map((d) => (d.id === deal.id ? { ...d, payments } : d))); // optimistic
    patchDeal(deal.id, { payments });
  }

  async function saveEditor() {
    if (!editor || saving) return;
    if (!editor.lot.trim()) { setErr("A lot / address is required."); return; }
    setSaving(true); setErr(null);
    const payload = {
      lot: editor.lot.trim(),
      purchaser: editor.purchaser.trim(),
      remuneration: nnum(editor.remuneration),
      referrer_fee: nnum(editor.referrer_fee),
      referrer_note: editor.referrer_note.trim(),
      stage: editor.stage,
      notes: editor.notes.trim(),
      payments: editor.payments
        .filter((p) => p.amount.trim() || p.date.trim())
        .map((p) => ({ label: p.label.trim() || "—", date: p.date || null, amount: nnum(p.amount), paid: p.paid })),
    };
    try {
      const res = editor.id
        ? await fetch(`/api/revenue/${editor.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch("/api/revenue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const json = await res.json();
      if (!json.ok) { setErr(json.error || "Could not save."); setSaving(false); return; }
      setDeals((list) => editor.id ? list.map((d) => (d.id === editor.id ? json.deal : d)) : [json.deal, ...list]);
      setEditor(null);
    } catch { setErr("Could not reach the server."); }
    setSaving(false);
  }

  async function deleteDeal(d: RevenueDeal) {
    if (!confirm(`Delete "${d.lot}"? This can't be undone.`)) return;
    const prev = deals;
    setDeals((list) => list.filter((x) => x.id !== d.id));
    try {
      const res = await fetch(`/api/revenue/${d.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) setDeals(prev);
    } catch { setDeals(prev); }
  }

  const activeDeals = deals.filter((d) => d.stage !== "lost");

  return (
    <div className="max-w-7xl mx-auto">
      <header className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Revenue &amp; deals</h1>
          <p className="text-gray-600 mt-1 text-sm">Live commission pipeline — remuneration, referrer splits, and when the cash lands.</p>
        </div>
        <button onClick={() => { setErr(null); setEditor(emptyEditor()); }} className="rounded-lg text-white font-semibold px-4 py-2 text-sm" style={{ backgroundColor: TEAL }}>
          + Add deal
        </button>
      </header>

      {tableMissing && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Revenue storage isn&apos;t set up yet — run <code className="font-mono">migrations/20260714_revenue_deals.sql</code> in Supabase to enable it.
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {[
          { label: "Net — our total", value: summary.net, accent: true },
          { label: "Gross remuneration", value: summary.gross },
          { label: "To referrers", value: summary.referrers },
          { label: "Banked", value: summary.banked, good: true },
          { label: "Outstanding", value: summary.outstanding + summary.unscheduled },
        ].map((c) => (
          <div key={c.label} className={`rounded-xl border p-4 ${c.accent ? "text-white" : "bg-white border-gray-200"}`} style={c.accent ? { backgroundColor: TEAL, borderColor: TEAL } : undefined}>
            <div className={`text-[11px] uppercase tracking-wide ${c.accent ? "text-white/70" : "text-gray-500"}`}>{c.label}</div>
            <div className={`text-xl font-bold mt-1 tabular-nums ${c.good ? "text-green-600" : c.accent ? "text-white" : "text-gray-900"}`}>{fmtMoney(c.value)}</div>
          </div>
        ))}
      </div>

      {/* Cashflow by month */}
      {months.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Cash in by month</h2>
            <div className="flex items-center gap-3 text-[11px] text-gray-500">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" /> banked</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: TEAL }} /> due</span>
            </div>
          </div>
          <div className="space-y-1.5">
            {months.map((m) => (
              <div key={m.month} className="flex items-center gap-3">
                <div className="w-24 shrink-0 text-xs text-gray-600 text-right">{fmtMonth(m.month)}</div>
                <div className="flex-1 h-5 rounded bg-gray-100 overflow-hidden flex">
                  <div className="h-full bg-green-500" style={{ width: `${(m.paid / maxMonth) * 100}%` }} />
                  <div className="h-full" style={{ width: `${(m.due / maxMonth) * 100}%`, backgroundColor: TEAL }} />
                </div>
                <div className="w-24 shrink-0 text-xs font-medium text-gray-700 tabular-nums text-right">{fmtMoney(m.total)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deals table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-200">
                <th className="px-4 py-2.5 font-semibold">Lot / address</th>
                <th className="px-3 py-2.5 font-semibold">Purchaser</th>
                <th className="px-3 py-2.5 font-semibold text-right">Remun.</th>
                <th className="px-3 py-2.5 font-semibold text-right">Referrer</th>
                <th className="px-3 py-2.5 font-semibold text-right">Net</th>
                <th className="px-3 py-2.5 font-semibold">Payments (click to mark paid)</th>
                <th className="px-3 py-2.5 font-semibold">Stage</th>
                <th className="px-3 py-2.5 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">Loading…</td></tr>
              ) : activeDeals.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">No deals yet — add one to get started.</td></tr>
              ) : (
                activeDeals.map((d) => {
                  const next = nextPayment(d);
                  const reconciles = paymentsReconcile(d);
                  return (
                    <tr key={d.id} className="border-b border-gray-100 last:border-0 align-top hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900">{d.lot}</div>
                        {d.notes && <div className="text-[11px] text-gray-400 mt-0.5">{d.notes}</div>}
                      </td>
                      <td className="px-3 py-3 text-gray-700">{d.purchaser || "—"}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-gray-700">{fmtMoney(d.remuneration)}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-gray-500">
                        {d.referrer_fee > 0 ? `−${fmtMoney(d.referrer_fee)}` : "—"}
                        {d.referrer_note && <div className="text-[10px] text-gray-400">{d.referrer_note}</div>}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums font-semibold text-gray-900">{fmtMoney(dealNet(d))}</td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {(d.payments ?? []).map((p, i) => (
                            <button
                              key={i}
                              onClick={() => togglePaid(d, i)}
                              title={p.paid ? "Paid — click to mark unpaid" : "Click to mark paid"}
                              className={`rounded-md px-2 py-1 text-[11px] font-medium border transition ${
                                p.paid ? "bg-green-50 border-green-300 text-green-700" : "bg-white border-gray-300 text-gray-600 hover:border-gray-400"
                              }`}
                            >
                              {p.paid ? "✓ " : ""}{fmtMoney(p.amount)}
                              <span className="text-[9px] text-gray-400 ml-1">{p.date ? fmtMonth(p.date.slice(0, 7)).replace(/ 20/, " '") : "tba"}</span>
                            </button>
                          ))}
                          {!reconciles && (
                            <span className="rounded-md px-2 py-1 text-[10px] bg-amber-50 border border-amber-300 text-amber-700" title="Payments don't add up to the remuneration">
                              ⚠ ≠ remun.
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-1 tabular-nums">
                          banked {fmtMoney(dealBanked(d))}{next ? ` · next ${fmtMoney(next.amount)} ${fmtMonth(next.date!.slice(0, 7))}` : ""}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${stageMeta(d.stage).className}`}>{stageMeta(d.stage).label}</span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap text-right">
                        <button onClick={() => { setErr(null); setEditor(toEditor(d)); }} className="text-xs text-gray-500 hover:text-gray-800 mr-2">Edit</button>
                        <button onClick={() => deleteDeal(d)} className="text-xs text-rose-400 hover:text-rose-600">Delete</button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / edit modal */}
      {editor && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto" onClick={() => setEditor(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-8 p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-gray-900 mb-4">{editor.id ? "Edit deal" : "Add deal"}</h2>
            <div className="grid grid-cols-2 gap-3">
              <label className="col-span-2 text-sm">
                <span className="block font-semibold text-gray-700 mb-1">Lot / address</span>
                <input value={editor.lot} onChange={(e) => setEditor({ ...editor, lot: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2" placeholder="Lot 16 Commercial Townsville" />
              </label>
              <label className="text-sm">
                <span className="block font-semibold text-gray-700 mb-1">Purchaser</span>
                <input value={editor.purchaser} onChange={(e) => setEditor({ ...editor, purchaser: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2" placeholder="Client SMSF" />
              </label>
              <label className="text-sm">
                <span className="block font-semibold text-gray-700 mb-1">Stage</span>
                <select value={editor.stage} onChange={(e) => setEditor({ ...editor, stage: e.target.value as DealStage })} className="w-full rounded-lg border border-gray-300 px-3 py-2 bg-white">
                  {DEAL_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="block font-semibold text-gray-700 mb-1">Remuneration ($)</span>
                <input type="number" value={editor.remuneration} onChange={(e) => setEditor({ ...editor, remuneration: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2" placeholder="50000" />
              </label>
              <label className="text-sm">
                <span className="block font-semibold text-gray-700 mb-1">Referrer fee ($)</span>
                <input type="number" value={editor.referrer_fee} onChange={(e) => setEditor({ ...editor, referrer_fee: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2" placeholder="30000" />
              </label>
              <label className="col-span-2 text-sm">
                <span className="block font-semibold text-gray-700 mb-1">Referrer note</span>
                <input value={editor.referrer_note} onChange={(e) => setEditor({ ...editor, referrer_note: e.target.value })} className="w-full rounded-lg border border-gray-300 px-3 py-2" placeholder="to Glenn" />
              </label>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-700">Payments</span>
                <button onClick={() => setEditor({ ...editor, payments: [...editor.payments, { label: `${editor.payments.length + 1}`, date: "", amount: "", paid: false }] })} className="text-xs font-medium" style={{ color: TEAL }}>+ Add payment</button>
              </div>
              <div className="space-y-2">
                {editor.payments.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input value={p.label} onChange={(e) => setEditor({ ...editor, payments: editor.payments.map((x, j) => j === i ? { ...x, label: e.target.value } : x) })} className="w-16 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" placeholder="1st" />
                    <input type="date" value={p.date} onChange={(e) => setEditor({ ...editor, payments: editor.payments.map((x, j) => j === i ? { ...x, date: e.target.value } : x) })} className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
                    <input type="number" value={p.amount} onChange={(e) => setEditor({ ...editor, payments: editor.payments.map((x, j) => j === i ? { ...x, amount: e.target.value } : x) })} className="w-28 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" placeholder="amount" />
                    <label className="flex items-center gap-1 text-xs text-gray-600"><input type="checkbox" checked={p.paid} onChange={(e) => setEditor({ ...editor, payments: editor.payments.map((x, j) => j === i ? { ...x, paid: e.target.checked } : x) })} /> paid</label>
                    <button onClick={() => setEditor({ ...editor, payments: editor.payments.filter((_, j) => j !== i) })} className="text-gray-300 hover:text-rose-500 ml-auto text-lg leading-none">×</button>
                  </div>
                ))}
              </div>
            </div>

            <label className="block text-sm mt-4">
              <span className="block font-semibold text-gray-700 mb-1">Notes</span>
              <textarea value={editor.notes} onChange={(e) => setEditor({ ...editor, notes: e.target.value })} rows={2} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
            </label>

            {err && <p className="text-sm text-rose-600 mt-3">{err}</p>}
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setEditor(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={saveEditor} disabled={saving} className="rounded-lg text-white px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ backgroundColor: TEAL }}>
                {saving ? "Saving…" : editor.id ? "Save changes" : "Add deal"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
