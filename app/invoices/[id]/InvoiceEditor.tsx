"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  STATE_LABEL,
  TRADING_NAMES,
  balanceCents,
  computeTotals,
  formatCents,
  formatInvoiceDate,
  invoiceState,
  parseMoneyToCents,
  type Invoice,
  type InvoiceLine,
} from "../../../utils/invoices";
import { brisbaneToday } from "../../../utils/paid-services";
import type { BuyerOption } from "../../api/invoices/buyers/route";
import { STATE_STYLE } from "../InvoicesClient";

const TEAL = "#0F4C5C";
const INPUT = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-600";
const BUTTON = "px-4 py-2 rounded-lg border border-gray-300 text-sm disabled:opacity-50";

type Payment = { id: string; amount_cents: number; paid_on: string; method: string | null; note: string | null };
type InvoiceEvent = { id: string; action: string; actor: string | null; created_at: string };
type Deal = { id: string; lot: string; purchaser: string | null };

const EVENT_LABEL: Record<string, string> = {
  created: "Draft created",
  issued: "Issued",
  emailed: "Emailed to buyer",
  reminder_sent: "Reminder emailed",
  payment_recorded: "Payment recorded",
  payment_removed: "Payment removed",
  voided: "Voided",
  due_date_changed: "Due date changed",
};

const centsText = (cents: number) => (cents ? (cents / 100).toFixed(2) : "");

export default function InvoiceEditor({ id }: { id: string }) {
  const router = useRouter();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [events, setEvents] = useState<InvoiceEvent[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [priceText, setPriceText] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const [flash, setFlash] = useState("");
  const [buyerOptions, setBuyerOptions] = useState<BuyerOption[]>([]);
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(brisbaneToday());
  const [payMethod, setPayMethod] = useState("Bank transfer");

  const load = useCallback(async () => {
    const res = await fetch(`/api/invoices/${id}`);
    const json = await res.json();
    if (!json.ok) {
      setError(json.error || "Could not load the invoice");
      return;
    }
    setInvoice(json.invoice);
    setPriceText((json.invoice as Invoice).lines.map((l) => centsText(l.unit_cents)));
    setPayments(json.payments);
    setEvents(json.events);
    setDirty(false);
  }, [id]);

  useEffect(() => {
    // Awaited inside an IIFE so setState lands post-await.
    (async () => {
      await load();
    })();
    fetch("/api/revenue")
      .then((r) => r.json())
      .then((j) => setDeals(j.deals ?? []))
      .catch(() => setDeals([]));
  }, [load]);

  const isDraft = invoice?.status === "draft";
  const totals = useMemo(
    () => (invoice ? computeTotals(invoice.lines, invoice.amounts_include_gst) : null),
    [invoice],
  );

  function change(patch: Partial<Invoice>) {
    setInvoice((inv) => (inv ? { ...inv, ...patch } : inv));
    setDirty(true);
    setFlash("");
  }

  function changeLine(index: number, patch: Partial<InvoiceLine>) {
    if (!invoice) return;
    change({ lines: invoice.lines.map((l, i) => (i === index ? { ...l, ...patch } : l)) });
  }

  function changePrice(index: number, text: string) {
    setPriceText((t) => t.map((v, i) => (i === index ? text : v)));
    changeLine(index, { unit_cents: parseMoneyToCents(text) ?? 0 });
  }

  function addLine() {
    if (!invoice) return;
    setPriceText((t) => [...t, ""]);
    change({ lines: [...invoice.lines, { description: "", quantity: 1, unit_cents: 0, gst: "taxable" }] });
  }

  function removeLine(index: number) {
    if (!invoice) return;
    setPriceText((t) => t.filter((_, i) => i !== index));
    change({ lines: invoice.lines.filter((_, i) => i !== index) });
  }

  async function searchBuyers(q: string) {
    if (q.trim().length < 2) {
      setBuyerOptions([]);
      return;
    }
    const res = await fetch(`/api/invoices/buyers?q=${encodeURIComponent(q)}`);
    const json = await res.json();
    setBuyerOptions(json.buyers ?? []);
  }

  function pickBuyer(option: BuyerOption) {
    change({
      buyer_name: option.buyer_name,
      buyer_email: option.buyer_email,
      buyer_abn: option.buyer_abn,
      buyer_address: option.buyer_address,
      contact_id: option.contact_id,
    });
    setBuyerOptions([]);
  }

  /** The fields that can change at this stage. Returns false if saving failed. */
  async function save(): Promise<boolean> {
    if (!invoice) return false;
    const always = {
      buyer_email: invoice.buyer_email,
      due_date: invoice.due_date,
      internal_note: invoice.internal_note,
      contact_id: invoice.contact_id,
      revenue_deal_id: invoice.revenue_deal_id,
    };
    const body = isDraft
      ? {
          ...always,
          trading_as: invoice.trading_as,
          issue_date: invoice.issue_date,
          buyer_name: invoice.buyer_name,
          buyer_abn: invoice.buyer_abn,
          buyer_address: invoice.buyer_address,
          reference: invoice.reference,
          notes: invoice.notes,
          lines: invoice.lines,
          amounts_include_gst: invoice.amounts_include_gst,
        }
      : always;
    const res = await fetch(`/api/invoices/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!json.ok) {
      setError(json.error || "Save failed");
      return false;
    }
    setDirty(false);
    return true;
  }

  async function run(name: string, action: () => Promise<void>) {
    setBusy(name);
    setError("");
    setProblems([]);
    setFlash("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy("");
    }
  }

  const saveNow = () =>
    run("save", async () => {
      if (await save()) {
        setFlash("Saved");
        await load();
      }
    });

  const issue = () =>
    run("issue", async () => {
      if (!(await save())) return;
      const res = await fetch(`/api/invoices/${id}/issue`, { method: "POST" });
      const json = await res.json();
      if (!json.ok) {
        setError(json.problems ? "This can't be issued yet:" : json.error || "Could not issue");
        setProblems(json.problems ?? []);
        await load();
        return;
      }
      setFlash(`Issued as invoice ${json.number}. It's now locked. Nothing has been emailed yet.`);
      await load();
    });

  const email = (kind: "invoice" | "reminder") =>
    run(kind, async () => {
      if (dirty && !(await save())) return;
      const label = kind === "reminder" ? "a payment reminder" : `invoice ${invoice?.number}`;
      if (!window.confirm(`Email ${label} to ${invoice?.buyer_email || "the buyer"} now?`)) return;
      const res = await fetch(`/api/invoices/${id}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Could not send");
      setFlash(`Emailed to ${json.to}.`);
      await load();
    });

  const addPayment = () =>
    run("pay", async () => {
      const res = await fetch(`/api/invoices/${id}/payments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: payAmount, paid_on: payDate, method: payMethod }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Could not record the payment");
      setPayAmount("");
      setFlash("Payment recorded.");
      await load();
    });

  const removePayment = (paymentId: string) =>
    run("pay", async () => {
      if (!window.confirm("Remove this payment?")) return;
      const res = await fetch(`/api/invoices/${id}/payments?payment=${paymentId}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Could not remove the payment");
      await load();
    });

  const voidInvoice = () =>
    run("void", async () => {
      const reason = window.prompt(`Why is invoice ${invoice?.number} being voided? This can't be undone.`);
      if (!reason?.trim()) return;
      const res = await fetch(`/api/invoices/${id}/void`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Could not void");
      setFlash("Voided. Create a new invoice to replace it.");
      await load();
    });

  const deleteDraft = () =>
    run("delete", async () => {
      if (!window.confirm("Delete this draft?")) return;
      const res = await fetch(`/api/invoices/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Could not delete");
      router.push("/invoices");
    });

  if (!invoice || !totals) {
    return <div className="p-6 text-gray-500">{error || "Loading invoice…"}</div>;
  }

  const today = brisbaneToday();
  const state = invoiceState(invoice, today);
  const owing = invoice.status === "issued" ? balanceCents(invoice) : 0;
  const linkedDeal = deals.find((d) => d.id === invoice.revenue_deal_id);

  return (
    <div className="max-w-[1000px] mx-auto px-5 py-6">
      <Link href="/invoices" className="text-sm text-gray-500 hover:text-gray-800">← All invoices</Link>

      <div className="flex items-start justify-between gap-4 flex-wrap mt-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold" style={{ color: TEAL }}>
            {invoice.number ? `Invoice ${invoice.number}` : "New invoice"}
          </h1>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATE_STYLE[state]}`}>{STATE_LABEL[state]}</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isDraft && (
            <>
              <button onClick={deleteDraft} disabled={!!busy} className={BUTTON}>Delete draft</button>
              <button onClick={saveNow} disabled={!!busy || !dirty} className={BUTTON}>{busy === "save" ? "Saving…" : "Save draft"}</button>
            </>
          )}
          <a href={`/api/invoices/${id}/pdf`} target="_blank" rel="noopener" className={BUTTON}>View PDF</a>
          {isDraft && (
            <button onClick={issue} disabled={!!busy} className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50" style={{ backgroundColor: TEAL }}>
              {busy === "issue" ? "Issuing…" : "Issue invoice"}
            </button>
          )}
          {!isDraft && invoice.status !== "void" && (
            <>
              {dirty && <button onClick={saveNow} disabled={!!busy} className={BUTTON}>Save changes</button>}
              {invoice.amount_paid_cents === 0 && <button onClick={voidInvoice} disabled={!!busy} className={BUTTON}>Void</button>}
              {owing > 0 && invoice.sent_at && (
                <button onClick={() => email("reminder")} disabled={!!busy} className={BUTTON}>
                  {busy === "reminder" ? "Sending…" : "Send reminder"}
                </button>
              )}
              <button onClick={() => email("invoice")} disabled={!!busy} className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-50" style={{ backgroundColor: TEAL }}>
                {busy === "invoice" ? "Sending…" : invoice.sent_at ? "Email again" : "Email to buyer"}
              </button>
            </>
          )}
        </div>
      </div>

      {flash && <p className="mt-3 p-3 rounded-lg bg-green-50 text-green-800 text-sm">{flash}</p>}
      {error && (
        <div className="mt-3 p-3 rounded-lg bg-red-50 text-red-800 text-sm">
          {error}
          {problems.length > 0 && <ul className="list-disc ml-5 mt-1">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
        </div>
      )}
      {invoice.status === "void" && (
        <p className="mt-3 p-3 rounded-lg bg-gray-100 text-gray-700 text-sm">Voided: {invoice.void_reason}</p>
      )}
      {!isDraft && invoice.status !== "void" && (
        <p className="mt-3 text-xs text-gray-500">
          Issued and locked. {invoice.sent_at ? `Last emailed ${formatInvoiceDate(invoice.sent_at.slice(0, 10))}.` : "Not emailed yet."}
          {invoice.reminder_count > 0 ? ` ${invoice.reminder_count} reminder(s) sent.` : ""}
        </p>
      )}

      <div className="border border-gray-200 rounded-xl p-5 mt-4 bg-white grid sm:grid-cols-2 gap-4">
        <div className="space-y-3">
          <label className="block text-sm relative">
            <span className="font-medium text-gray-700">Bill to</span>
            <input
              className={`${INPUT} mt-1`}
              disabled={!isDraft}
              value={invoice.buyer_name ?? ""}
              placeholder="Company or person"
              onChange={(e) => {
                change({ buyer_name: e.target.value });
                void searchBuyers(e.target.value);
              }}
            />
            {buyerOptions.length > 0 && (
              <div className="absolute z-10 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow mt-1 max-h-56 overflow-auto">
                {buyerOptions.map((option) => (
                  <button key={option.key} type="button" onClick={() => pickBuyer(option)} className="block w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">
                    {option.buyer_name}
                    <span className="text-xs text-gray-500"> {option.buyer_email ?? ""} · {option.source === "invoice" ? "past invoice" : "contact"}</span>
                  </button>
                ))}
              </div>
            )}
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Buyer&apos;s email</span>
            <input className={`${INPUT} mt-1`} disabled={invoice.status === "void"} value={invoice.buyer_email ?? ""} onChange={(e) => change({ buyer_email: e.target.value })} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Buyer&apos;s ABN (if a business)</span>
            <input className={`${INPUT} mt-1`} disabled={!isDraft} value={invoice.buyer_abn ?? ""} onChange={(e) => change({ buyer_abn: e.target.value })} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Buyer&apos;s address</span>
            <textarea className={`${INPUT} mt-1`} rows={2} disabled={!isDraft} value={invoice.buyer_address ?? ""} onChange={(e) => change({ buyer_address: e.target.value })} />
          </label>
        </div>
        <div className="space-y-3">
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Invoice from</span>
            <select className={`${INPUT} mt-1`} disabled={!isDraft} value={invoice.trading_as ?? ""} onChange={(e) => change({ trading_as: e.target.value || null })}>
              <option value="">NextKey Pty Ltd</option>
              {TRADING_NAMES.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Invoice date</span>
              <input type="date" className={`${INPUT} mt-1`} disabled={!isDraft} value={invoice.issue_date ?? ""} onChange={(e) => change({ issue_date: e.target.value || null })} />
            </label>
            <label className="block text-sm">
              <span className="font-medium text-gray-700">Due date</span>
              <input type="date" className={`${INPUT} mt-1`} disabled={invoice.status === "void" || invoice.status === "paid"} value={invoice.due_date ?? ""} onChange={(e) => change({ due_date: e.target.value || null })} />
            </label>
          </div>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Reference</span>
            <input className={`${INPUT} mt-1`} disabled={!isDraft} placeholder="e.g. lot or project" value={invoice.reference ?? ""} onChange={(e) => change({ reference: e.target.value })} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Linked deal</span>
            <select className={`${INPUT} mt-1`} disabled={invoice.status === "void"} value={invoice.revenue_deal_id ?? ""} onChange={(e) => change({ revenue_deal_id: e.target.value || null })}>
              <option value="">None</option>
              {deals.map((d) => <option key={d.id} value={d.id}>{d.lot}{d.purchaser ? ` (${d.purchaser})` : ""}</option>)}
            </select>
          </label>
          <div className="flex gap-4 text-sm">
            {invoice.contact_id && <Link href={`/contacts/${invoice.contact_id}`} className="underline" style={{ color: TEAL }}>Open contact</Link>}
            {linkedDeal && <Link href="/revenue" className="underline" style={{ color: TEAL }}>Open Revenue</Link>}
          </div>
        </div>
      </div>

      <div className="border border-gray-200 rounded-xl p-5 mt-4 bg-white">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
          <h2 className="font-semibold" style={{ color: TEAL }}>Items</h2>
          <label className="text-sm flex items-center gap-2">
            Prices
            <select className="border border-gray-300 rounded-lg px-2 py-1 text-sm disabled:bg-gray-50" disabled={!isDraft} value={invoice.amounts_include_gst ? "inc" : "ex"} onChange={(e) => change({ amounts_include_gst: e.target.value === "inc" })}>
              <option value="inc">include GST</option>
              <option value="ex">exclude GST</option>
            </select>
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-gray-600">
              <tr>
                <th className="py-1 pr-2 font-medium">Description</th>
                <th className="py-1 pr-2 font-medium w-20">Qty</th>
                <th className="py-1 pr-2 font-medium w-32">Unit price</th>
                <th className="py-1 pr-2 font-medium w-36">GST</th>
                <th className="py-1 font-medium w-28 text-right">Amount</th>
                {isDraft && <th className="w-8" />}
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((line, i) => (
                <tr key={i} className="align-top">
                  <td className="py-1 pr-2">
                    <textarea aria-label={`Description of item ${i + 1}`} rows={1} className={INPUT} disabled={!isDraft} value={line.description} onChange={(e) => changeLine(i, { description: e.target.value })} />
                  </td>
                  <td className="py-1 pr-2">
                    <input aria-label={`Quantity of item ${i + 1}`} type="number" min="0" step="any" className={INPUT} disabled={!isDraft} value={line.quantity} onChange={(e) => changeLine(i, { quantity: Number(e.target.value) })} />
                  </td>
                  <td className="py-1 pr-2">
                    <input aria-label={`Unit price of item ${i + 1}`} inputMode="decimal" className={INPUT} disabled={!isDraft} placeholder="0.00" value={priceText[i] ?? ""} onChange={(e) => changePrice(i, e.target.value)} />
                  </td>
                  <td className="py-1 pr-2">
                    <select aria-label={`GST on item ${i + 1}`} className={INPUT} disabled={!isDraft} value={line.gst} onChange={(e) => changeLine(i, { gst: e.target.value === "free" ? "free" : "taxable" })}>
                      <option value="taxable">10% GST</option>
                      <option value="free">GST-free</option>
                    </select>
                  </td>
                  <td className="py-3 text-right whitespace-nowrap">{formatCents(Math.round(line.quantity * line.unit_cents))}</td>
                  {isDraft && (
                    <td className="py-2 text-center">
                      <button aria-label={`Remove item ${i + 1}`} onClick={() => removeLine(i)} className="text-gray-400 hover:text-red-700">×</button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {isDraft && <button onClick={addLine} className="text-sm underline mt-2" style={{ color: TEAL }}>+ Add item</button>}

        <div className="ml-auto mt-3 w-full sm:w-72 text-sm space-y-1">
          <div className="flex justify-between"><span>Subtotal (ex GST)</span><span>{formatCents(totals.subtotal_cents)}</span></div>
          <div className="flex justify-between"><span>GST</span><span>{formatCents(totals.gst_cents)}</span></div>
          <div className="flex justify-between font-semibold text-base border-t border-gray-200 pt-1"><span>Total (inc GST)</span><span>{formatCents(totals.total_cents)}</span></div>
          {invoice.amount_paid_cents > 0 && <div className="flex justify-between"><span>Paid</span><span>{formatCents(invoice.amount_paid_cents)}</span></div>}
          {owing > 0 && <div className="flex justify-between font-semibold"><span>Owing</span><span>{formatCents(owing)}</span></div>}
        </div>

        <div className="grid sm:grid-cols-2 gap-3 mt-4">
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Note on the invoice</span>
            <textarea className={`${INPUT} mt-1`} rows={2} disabled={!isDraft} value={invoice.notes ?? ""} onChange={(e) => change({ notes: e.target.value })} />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-gray-700">Internal note (never printed)</span>
            <textarea className={`${INPUT} mt-1`} rows={2} value={invoice.internal_note ?? ""} onChange={(e) => change({ internal_note: e.target.value })} />
          </label>
        </div>
      </div>

      {!isDraft && invoice.status !== "void" && (
        <div className="border border-gray-200 rounded-xl p-5 mt-4 bg-white">
          <h2 className="font-semibold mb-2" style={{ color: TEAL }}>Payments</h2>
          {payments.length === 0 && <p className="text-sm text-gray-500">Nothing received yet.</p>}
          {payments.map((p) => (
            <div key={p.id} className="flex justify-between items-center text-sm py-1 border-b border-gray-100">
              <span>{formatInvoiceDate(p.paid_on)}{p.method ? ` · ${p.method}` : ""}</span>
              <span className="flex items-center gap-3">
                {formatCents(Number(p.amount_cents))}
                <button onClick={() => removePayment(p.id)} disabled={!!busy} className="text-xs text-gray-500 underline">Remove</button>
              </span>
            </div>
          ))}
          {owing > 0 && (
            <div className="flex gap-2 flex-wrap items-end mt-3">
              <label className="text-sm">
                <span className="block text-gray-700">Amount</span>
                <input inputMode="decimal" className={`${INPUT} mt-1 w-32`} value={payAmount} placeholder={(owing / 100).toFixed(2)} onChange={(e) => setPayAmount(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="block text-gray-700">Date received</span>
                <input type="date" className={`${INPUT} mt-1`} value={payDate} onChange={(e) => setPayDate(e.target.value)} />
              </label>
              <label className="text-sm">
                <span className="block text-gray-700">How</span>
                <input className={`${INPUT} mt-1 w-40`} value={payMethod} onChange={(e) => setPayMethod(e.target.value)} />
              </label>
              <button onClick={addPayment} disabled={!!busy || !payAmount} className={BUTTON}>Record payment</button>
            </div>
          )}
        </div>
      )}

      {events.length > 0 && (
        <div className="mt-4 text-xs text-gray-500 space-y-0.5">
          <h2 className="font-semibold text-gray-600 text-sm mb-1">History</h2>
          {events.map((event) => (
            <div key={event.id}>
              {formatInvoiceDate(event.created_at.slice(0, 10))}: {EVENT_LABEL[event.action] ?? event.action}{event.actor ? ` by ${event.actor}` : ""}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
