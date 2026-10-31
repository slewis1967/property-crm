"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  STATE_LABEL,
  balanceCents,
  formatCents,
  formatInvoiceDate,
  invoiceState,
  type Invoice,
  type InvoiceSettings,
  type InvoiceState,
  type InvoiceSummary,
} from "../../utils/invoices";

const TEAL = "#0F4C5C";

export const STATE_STYLE: Record<InvoiceState, string> = {
  draft: "bg-gray-100 text-gray-700",
  unpaid: "bg-blue-100 text-blue-800",
  part_paid: "bg-amber-100 text-amber-800",
  overdue: "bg-red-100 text-red-800",
  paid: "bg-green-100 text-green-800",
  void: "bg-gray-200 text-gray-500 line-through",
};

type Filter = "all" | "owing" | "overdue" | "draft" | "paid" | "void";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "owing", label: "Owing" },
  { key: "overdue", label: "Overdue" },
  { key: "draft", label: "Drafts" },
  { key: "paid", label: "Paid" },
  { key: "void", label: "Void" },
];

const INPUT = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm";

function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<InvoiceSettings | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/invoices/settings")
      .then((r) => r.json())
      .then((j) => {
        if (j.settings) setSettings(j.settings);
        else setError(j.hint || j.error || "Could not load settings");
      })
      .catch(() => setError("Could not load settings"));
  }, []);

  async function save() {
    setError("");
    setSaved(false);
    const res = await fetch("/api/invoices/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    const json = await res.json();
    if (json.ok) setSaved(true);
    else setError(json.error || "Could not save");
  }

  const field = (key: keyof InvoiceSettings, label: string, hint?: string) => (
    <label className="block text-sm">
      <span className="font-medium text-gray-700">{label}</span>
      <input
        className={`${INPUT} mt-1`}
        value={settings?.[key] ?? ""}
        onChange={(e) => setSettings((s) => (s ? { ...s, [key]: e.target.value } : s))}
      />
      {hint && <span className="text-xs text-gray-500">{hint}</span>}
    </label>
  );

  return (
    <div className="border border-gray-200 rounded-xl p-5 mt-4 bg-white">
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-semibold" style={{ color: TEAL }}>Invoice settings</h2>
        <button onClick={onClose} className="text-sm text-gray-500">Close</button>
      </div>
      {error && <p className="text-sm text-red-700 mb-3">{error}</p>}
      {settings && (
        <>
          <div className="grid sm:grid-cols-2 gap-3">
            {field("seller_name", "Legal name")}
            {field("abn", "ABN")}
            {field("address", "Address")}
            {field("email", "Accounts email", "Replies and remittance advice go here")}
            {field("phone", "Phone")}
            {field("cc_emails", "Copy every invoice to", "Separate with commas. The customer can see these")}
            {field("bank_name", "Bank")}
            {field("account_name", "Account name")}
            {field("bsb", "BSB")}
            {field("account_number", "Account number")}
            {field("next_number", "Next invoice number")}
            {field("default_terms_days", "Days to pay")}
          </div>
          <div className="flex items-center gap-3 mt-4">
            <button onClick={save} className="px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: TEAL }}>
              Save settings
            </button>
            {saved && <span className="text-sm text-green-700">Saved</span>}
          </div>
        </>
      )}
    </div>
  );
}

export default function InvoicesClient() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [summary, setSummary] = useState<InvoiceSummary | null>(null);
  const [today, setToday] = useState("");
  const [hint, setHint] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/invoices");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Could not load invoices");
      setInvoices(json.invoices);
      setSummary(json.summary);
      setToday(json.today ?? "");
      setHint(json.migrationNeeded ? json.hint : "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load invoices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Awaited inside an IIFE so setState lands post-await.
    (async () => {
      await load();
    })();
  }, [load]);

  async function createInvoice() {
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/invoices", { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Could not create the invoice");
      router.push(`/invoices/${json.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the invoice");
      setCreating(false);
    }
  }

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices.filter((inv) => {
      const state = invoiceState(inv, today);
      if (filter === "owing" && !["unpaid", "part_paid", "overdue"].includes(state)) return false;
      if (filter === "overdue" && state !== "overdue") return false;
      if (filter === "draft" && state !== "draft") return false;
      if (filter === "paid" && state !== "paid") return false;
      if (filter === "void" && state !== "void") return false;
      if (!q) return true;
      return [inv.buyer_name, inv.reference, inv.number === null ? "" : String(inv.number)].some((v) =>
        (v ?? "").toLowerCase().includes(q),
      );
    });
  }, [invoices, filter, search, today]);

  if (loading) return <div className="p-6 text-gray-500">Loading invoices…</div>;

  return (
    <div className="max-w-[1150px] mx-auto px-5 py-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: TEAL }}>Invoices</h1>
          <p className="text-sm text-gray-500 mt-1 max-w-[70ch]">
            Tax invoices for NextKey Pty Ltd and its registered business names. Once issued, an invoice is locked: to
            correct one, void it and issue a new one.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowSettings((v) => !v)} className="px-4 py-2 rounded-lg border border-gray-300 text-sm">
            Settings
          </button>
          <button
            onClick={createInvoice}
            disabled={creating || !!hint}
            className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: TEAL }}
          >
            {creating ? "Creating…" : "+ New invoice"}
          </button>
        </div>
      </div>

      {hint && <p className="mt-4 p-3 rounded-lg bg-amber-50 text-amber-900 text-sm">{hint}</p>}
      {error && <p className="mt-4 p-3 rounded-lg bg-red-50 text-red-800 text-sm">{error}</p>}
      {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">
          <div className="border border-gray-200 rounded-xl p-4 bg-white">
            <div className="text-xs text-gray-500">Owed to you</div>
            <div className="text-xl font-semibold mt-1">{formatCents(summary.outstandingCents)}</div>
          </div>
          <div className="border border-gray-200 rounded-xl p-4 bg-white">
            <div className="text-xs text-gray-500">Overdue ({summary.overdueCount})</div>
            <div className={`text-xl font-semibold mt-1 ${summary.overdueCents > 0 ? "text-red-700" : ""}`}>
              {formatCents(summary.overdueCents)}
            </div>
          </div>
          <div className="border border-gray-200 rounded-xl p-4 bg-white">
            <div className="text-xs text-gray-500">Drafts</div>
            <div className="text-xl font-semibold mt-1">{summary.draftCount}</div>
          </div>
        </div>
      )}

      <div className="flex gap-2 flex-wrap items-center mt-5">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-sm ${filter === f.key ? "text-white" : "bg-gray-100 text-gray-700"}`}
            style={filter === f.key ? { backgroundColor: TEAL } : undefined}
          >
            {f.label}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search buyer, reference or number"
          aria-label="Search invoices"
          className="ml-auto border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-full sm:w-72"
        />
      </div>

      <div className="mt-3 overflow-x-auto border border-gray-200 rounded-xl bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-gray-600">
            <tr>
              <th className="px-3 py-2 font-medium">No.</th>
              <th className="px-3 py-2 font-medium">Buyer</th>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Due</th>
              <th className="px-3 py-2 font-medium text-right">Total</th>
              <th className="px-3 py-2 font-medium text-right">Owing</th>
              <th className="px-3 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((inv) => {
              const state = invoiceState(inv, today);
              return (
                <tr key={inv.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <Link href={`/invoices/${inv.id}`} className="font-medium underline" style={{ color: TEAL }}>
                      {inv.number ?? "Draft"}
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    {inv.buyer_name || <span className="text-gray-400">No buyer yet</span>}
                    {inv.trading_as && <div className="text-xs text-gray-500">{inv.trading_as}</div>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatInvoiceDate(inv.issue_date)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatInvoiceDate(inv.due_date)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">{formatCents(inv.total_cents)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {inv.status === "issued" ? formatCents(balanceCents(inv)) : ""}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATE_STYLE[state]}`}>{STATE_LABEL[state]}</span>
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-gray-500">
                  {invoices.length === 0 ? "No invoices yet." : "Nothing matches."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
