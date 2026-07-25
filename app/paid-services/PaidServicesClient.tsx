"use client";

/**
 * Paid Accounts — every paid service the business runs on, what it costs, and
 * what needs attention today.
 *
 * The attention list at the top is the point of the page: it is computed from
 * the same rules as the email digest (utils/paid-services.ts), so the panel and
 * the inbox can never tell you different things. The "last automated check" line
 * is deliberately prominent — a payment-due alerter that has quietly stopped
 * running is worse than none, because you trust it.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BILLING_CYCLES,
  CRITICALITIES,
  SERVICE_CATEGORIES,
  SERVICE_STATUSES,
  type PaidService,
  type ServiceAttention,
  type Severity,
  type Summary,
} from "../../utils/paid-services";

const TEAL = "#0F4C5C";

type LastCheck = { at: string | null; dryRun: boolean | null; note: string | null };

type Payload = {
  ok: boolean;
  services: PaidService[];
  assessed: ServiceAttention[];
  summary: Summary | null;
  today: string;
  lastCheck: LastCheck;
  alertsEnabled: boolean;
  alertRecipient: string;
  migrationNeeded: boolean;
  hint?: string;
  error?: string;
};

const SEV_CHIP: Record<Severity, string> = {
  critical: "bg-red-100 text-red-800 border-red-200",
  warning: "bg-amber-100 text-amber-900 border-amber-200",
  info: "bg-gray-100 text-gray-700 border-gray-200",
};
const SEV_LABEL: Record<Severity, string> = {
  critical: "Action now",
  warning: "Coming up",
  info: "For info",
};
const STATUS_CHIP: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  trial: "bg-blue-100 text-blue-800",
  paused: "bg-gray-100 text-gray-600",
  cancelled: "bg-gray-200 text-gray-500 line-through",
};
const CRIT_CHIP: Record<string, string> = {
  critical: "bg-red-50 text-red-700 border-red-200",
  important: "bg-amber-50 text-amber-800 border-amber-200",
  optional: "bg-gray-50 text-gray-600 border-gray-200",
};
const CYCLE_LABEL: Record<string, string> = {
  monthly: "/mo",
  quarterly: "/qtr",
  annual: "/yr",
  usage: " usage",
  prepaid: " prepaid",
  one_off: " once",
};

function money(cost: number | null, currency: string, cycle: string): string {
  if (cost === null || cost === undefined) return "—";
  return `${currency === "AUD" ? "" : `${currency} `}$${cost.toLocaleString("en-AU", { maximumFractionDigits: 2 })}${CYCLE_LABEL[cycle] ?? ""}`;
}

function relative(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "unknown";
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  return `${Math.round(hrs / 24)} days ago`;
}

/** Due-date wording, from the reader's point of view rather than the DB's. */
function dueLabel(s: PaidService, today: string): { text: string; tone: string } {
  if (!s.next_due_date) return { text: "—", tone: "text-gray-400" };
  const days = Math.round(
    (Date.UTC(...(s.next_due_date.split("-").map(Number) as [number, number, number])) -
      Date.UTC(...(today.split("-").map(Number) as [number, number, number]))) /
      86400000,
  );
  const d = s.next_due_date;
  if (days < 0) return { text: `${d} · ${-days}d overdue`, tone: "text-red-700 font-semibold" };
  if (days === 0) return { text: `${d} · today`, tone: "text-red-700 font-semibold" };
  if (days <= 7) return { text: `${d} · in ${days}d`, tone: "text-amber-800 font-medium" };
  return { text: `${d} · in ${days}d`, tone: "text-gray-600" };
}

const emptyDraft = (): Partial<PaidService> => ({
  name: "",
  category: "other",
  status: "active",
  criticality: "important",
  billing_cycle: "monthly",
  currency: "AUD",
  auto_renew: true,
  alert_lead_days: 7,
});

export default function PaidServicesClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [flash, setFlash] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState<"attention" | "all" | string>("attention");

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/paid-services");
      const json = (await res.json()) as Payload;
      if (!json.ok) throw new Error(json.error || "Failed to load");
      setData(json);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Awaited inside an IIFE so setState lands post-await (avoids the
    // cascading-render lint from a bare synchronous call).
    (async () => {
      await load();
    })();
  }, [load]);

  async function act(id: string, body: Record<string, unknown>, label: string) {
    setBusy(id + label);
    try {
      const res = await fetch(`/api/paid-services/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Update failed");
      await load();
      setFlash(label === "paid" ? "Marked paid — next due date rolled forward." : "Saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy("");
    }
  }

  async function save(id: string | null, draft: Partial<PaidService>) {
    setBusy("save");
    try {
      const res = await fetch(id ? `/api/paid-services/${id}` : "/api/paid-services", {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Save failed");
      setEditing(null);
      setAdding(false);
      await load();
      setFlash("Saved.");
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy("");
    }
  }

  async function remove(s: PaidService) {
    if (!window.confirm(`Remove "${s.name}" from the register? This does not cancel the service.`)) return;
    setBusy(s.id + "del");
    try {
      const res = await fetch(`/api/paid-services/${s.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Delete failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy("");
    }
  }

  async function sendDigest() {
    if (!window.confirm(`Email the digest now to ${data?.alertRecipient ?? "the configured address"}?`)) return;
    setBusy("digest");
    try {
      const res = await fetch("/api/paid-services/alerts", { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Send failed");
      const r = json.result as { sent: boolean; flagged: number; reason?: string };
      setFlash(
        r.sent
          ? `Digest emailed to ${data?.alertRecipient} — ${r.flagged} account(s) flagged.`
          : `Nothing sent: ${r.reason ?? "nothing needs attention"}.`,
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy("");
    }
  }

  const attention = useMemo(
    () =>
      (data?.assessed ?? [])
        .filter((a) => !a.snoozed && a.worst && a.worst !== "info")
        .map((a) => ({ ...a, items: a.items.filter((i) => i.severity !== "info") })),
    [data],
  );
  const infoItems = useMemo(
    () => (data?.assessed ?? []).filter((a) => a.items.some((i) => i.severity === "info")),
    [data],
  );

  const shown = useMemo(() => {
    const all = data?.assessed ?? [];
    if (filter === "all") return all;
    if (filter === "attention") return all.filter((a) => a.items.length > 0);
    return all.filter((a) => a.service.category === filter);
  }, [data, filter]);

  if (loading) return <div className="p-6 text-gray-500">Loading paid accounts…</div>;

  const summary = data?.summary;
  const aud = summary?.spendByCurrency.find((c) => c.currency === "AUD");

  return (
    <div className="max-w-[1150px] mx-auto px-5 py-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: TEAL }}>
            Paid Accounts
          </h1>
          <p className="text-sm text-gray-500 mt-1 max-w-[70ch]">
            Every paid service the CRM and the business run on — what it costs, when it renews, and what needs you
            today. Anything at &ldquo;Action now&rdquo; or &ldquo;Coming up&rdquo; also goes out in the daily email digest.
          </p>
        </div>
        <button
          onClick={() => {
            setAdding(true);
            setEditing(null);
          }}
          className="px-4 py-2 rounded-lg text-white text-sm font-medium"
          style={{ backgroundColor: TEAL }}
        >
          + Add account
        </button>
      </div>

      {data?.migrationNeeded && (
        <div className="mt-4 p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
          <strong>Storage not set up yet.</strong> {data.hint}
        </div>
      )}
      {error && (
        <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 flex justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => setError("")} className="text-red-500 hover:text-red-700">
            ✕
          </button>
        </div>
      )}
      {flash && (
        <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 flex justify-between gap-3">
          <span>{flash}</span>
          <button onClick={() => setFlash("")} className="text-emerald-600 hover:text-emerald-800">
            ✕
          </button>
        </div>
      )}

      {/* Summary tiles */}
      <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile
          label="Needs attention"
          value={String(summary?.needingAttention ?? 0)}
          tone={summary && summary.criticalCount > 0 ? "bad" : summary && summary.needingAttention > 0 ? "warn" : "good"}
          sub={summary?.criticalCount ? `${summary.criticalCount} urgent` : "all clear"}
        />
        <Tile
          label="Committed spend"
          value={aud ? `$${Math.round(aud.monthly).toLocaleString("en-AU")}/mo` : "—"}
          sub={aud ? `$${Math.round(aud.annual).toLocaleString("en-AU")}/yr` : "no costs recorded yet"}
        />
        <Tile label="Active accounts" value={String(summary?.active ?? 0)} sub={`${summary?.total ?? 0} in the register`} />
        <Tile
          label="Not budgeted"
          value={String(summary?.unbudgeted ?? 0)}
          sub="usage / prepaid / no cost set"
          tone={summary && summary.unbudgeted > 0 ? "warn" : "good"}
        />
      </div>
      {summary && summary.spendByCurrency.length > 1 && (
        <p className="mt-2 text-xs text-gray-500">
          Also{" "}
          {summary.spendByCurrency
            .filter((c) => c.currency !== "AUD")
            .map((c) => `${c.currency} $${Math.round(c.monthly).toLocaleString("en-AU")}/mo`)
            .join(", ")}{" "}
          — totalled separately, no exchange rate is applied.
        </p>
      )}

      {/* Alert-channel health. A dead checker must be visible, not assumed. */}
      <div className="mt-4 p-3 rounded-lg border border-gray-200 bg-gray-50 text-sm flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-gray-700">
          <strong>Daily check:</strong>{" "}
          {data?.lastCheck.at ? (
            <>
              last ran {relative(data.lastCheck.at)}
              {data.lastCheck.dryRun ? " (dry run)" : ""}
              {data.lastCheck.note ? ` — ${data.lastCheck.note}` : ""}
            </>
          ) : (
            <span className="text-amber-800">has never run — the scheduled check hasn&apos;t reported in yet</span>
          )}
        </span>
        <span className={data?.alertsEnabled ? "text-emerald-700" : "text-amber-800"}>
          {data?.alertsEnabled
            ? `Emailing ${data.alertRecipient}`
            : "Email sending is OFF (set PAID_ALERTS_ENABLED=true) — checks still run as dry runs"}
        </span>
        <button
          onClick={sendDigest}
          disabled={busy === "digest"}
          className="ml-auto px-3 py-1.5 rounded-md border border-gray-300 bg-white text-gray-700 text-xs hover:bg-gray-100 disabled:opacity-50"
        >
          {busy === "digest" ? "Sending…" : "Send digest now"}
        </button>
      </div>

      {/* The point of the page */}
      <h2 className="mt-7 text-lg font-semibold text-gray-800">
        {attention.length > 0 ? `${attention.length} account${attention.length === 1 ? "" : "s"} need attention` : "Nothing needs attention"}
      </h2>
      {attention.length === 0 && (
        <p className="text-sm text-gray-500 mt-1">
          No payment due inside its alert window, no expiring card, no empty prepaid balance.
          {infoItems.length > 0 && " Some accounts are still missing a renewal date or cost — see below."}
        </p>
      )}
      <div className="mt-3 space-y-2">
        {attention.map((a) => (
          <div
            key={a.service.id}
            className={`p-3 rounded-lg border ${a.worst === "critical" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}
          >
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-[260px] flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border ${SEV_CHIP[a.worst ?? "info"]}`}>
                    {SEV_LABEL[a.worst ?? "info"]}
                  </span>
                  <span className="font-semibold text-gray-900">{a.service.name}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] uppercase border ${CRIT_CHIP[a.service.criticality] ?? ""}`}>
                    {a.service.criticality}
                  </span>
                </div>
                <ul className="mt-1.5 space-y-1">
                  {a.items.map((i, n) => (
                    <li key={n} className="text-sm text-gray-800">
                      <span className="font-medium">{i.headline}</span>
                      <span className="text-gray-600"> — {i.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-wrap gap-1.5 items-start">
                {a.service.vendor_url && (
                  <a
                    href={a.service.vendor_url}
                    target="_blank"
                    rel="noreferrer"
                    className="px-2.5 py-1 rounded-md bg-white border border-gray-300 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    Open billing ↗
                  </a>
                )}
                <button
                  onClick={() => act(a.service.id, { action: "mark_paid" }, "paid")}
                  disabled={busy === a.service.id + "paid"}
                  className="px-2.5 py-1 rounded-md text-white text-xs disabled:opacity-50"
                  style={{ backgroundColor: TEAL }}
                >
                  {busy === a.service.id + "paid" ? "…" : "Mark paid"}
                </button>
                <button
                  onClick={() => act(a.service.id, { action: "snooze", days: 7 }, "snooze")}
                  disabled={busy === a.service.id + "snooze"}
                  className="px-2.5 py-1 rounded-md bg-white border border-gray-300 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  Snooze 7d
                </button>
                <button
                  onClick={() => {
                    setEditing(a.service.id);
                    setAdding(false);
                  }}
                  className="px-2.5 py-1 rounded-md bg-white border border-gray-300 text-xs text-gray-700 hover:bg-gray-50"
                >
                  Edit
                </button>
              </div>
            </div>
            {editing === a.service.id && (
              <ServiceForm
                initial={a.service}
                busy={busy === "save"}
                onCancel={() => setEditing(null)}
                onSave={(d) => save(a.service.id, d)}
              />
            )}
          </div>
        ))}
      </div>

      {/* Add form */}
      {adding && (
        <div className="mt-6 p-4 rounded-lg border border-gray-200 bg-white">
          <h3 className="font-semibold text-gray-800">New paid account</h3>
          <ServiceForm initial={emptyDraft()} busy={busy === "save"} onCancel={() => setAdding(false)} onSave={(d) => save(null, d)} />
        </div>
      )}

      {/* The register */}
      <div className="mt-8 flex items-center gap-2 flex-wrap">
        <h2 className="text-lg font-semibold text-gray-800 mr-2">The register</h2>
        <Chip active={filter === "attention"} onClick={() => setFilter("attention")}>
          Flagged ({(data?.assessed ?? []).filter((a) => a.items.length > 0).length})
        </Chip>
        <Chip active={filter === "all"} onClick={() => setFilter("all")}>
          All ({data?.services.length ?? 0})
        </Chip>
        {(summary?.byCategory ?? []).map((c) => (
          <Chip key={c.category} active={filter === c.category} onClick={() => setFilter(c.category)}>
            {c.category} ({c.count})
          </Chip>
        ))}
      </div>

      <div className="mt-3 overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-sm min-w-[820px]">
          <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
            <tr>
              <th className="text-left px-3 py-2">Account</th>
              <th className="text-left px-3 py-2">Cost</th>
              <th className="text-left px-3 py-2">Next due</th>
              <th className="text-left px-3 py-2">Pays with</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="text-right px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((a) => {
              const s = a.service;
              const due = dueLabel(s, data?.today ?? "");
              return (
                <tr key={s.id} className="border-t border-gray-100 align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900 flex items-center gap-1.5 flex-wrap">
                      {s.name}
                      {a.snoozed && (
                        <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 text-[10px]">
                          snoozed to {s.snoozed_until}
                        </span>
                      )}
                      {a.worst && a.worst !== "info" && !a.snoozed && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${SEV_CHIP[a.worst]}`}>
                          {SEV_LABEL[a.worst]}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      {s.category}
                      {s.plan ? ` · ${s.plan}` : ""}
                      {s.criticality === "critical" ? " · critical to operations" : ""}
                    </div>
                    {a.items.some((i) => i.severity === "info") && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        {a.items
                          .filter((i) => i.severity === "info")
                          .map((i) => i.headline.replace(`${s.name} — `, ""))
                          .join(" · ")}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-700">
                    {money(s.cost, s.currency, s.billing_cycle)}
                    {s.balance_remaining !== null && s.balance_remaining !== undefined && (
                      <div className="text-xs text-gray-500">
                        bal {s.balance_remaining.toLocaleString("en-AU")} {s.balance_unit ?? s.currency}
                      </div>
                    )}
                  </td>
                  <td className={`px-3 py-2 whitespace-nowrap ${due.tone}`}>
                    {due.text}
                    {!s.auto_renew && <div className="text-xs text-gray-500">manual payment</div>}
                  </td>
                  <td className="px-3 py-2 text-gray-600 text-xs">
                    {s.payment_method ?? "—"}
                    {s.card_expiry && <div>exp {s.card_expiry}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] ${STATUS_CHIP[s.status] ?? "bg-gray-100"}`}>
                      {s.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {s.vendor_url && (
                      <a
                        href={s.vendor_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-[#0F4C5C] hover:underline mr-2"
                      >
                        billing ↗
                      </a>
                    )}
                    <button
                      onClick={() => {
                        setAdding(false);
                        setEditing(editing === s.id ? null : s.id);
                      }}
                      className="text-xs text-gray-600 hover:text-gray-900 mr-2"
                    >
                      {editing === s.id ? "close" : "edit"}
                    </button>
                    <button
                      onClick={() => remove(s)}
                      disabled={busy === s.id + "del"}
                      className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
                    >
                      remove
                    </button>
                    {editing === s.id && (
                      <div className="text-left mt-2">
                        <ServiceForm
                          initial={s}
                          busy={busy === "save"}
                          onCancel={() => setEditing(null)}
                          onSave={(d) => save(s.id, d)}
                        />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-gray-500">
                  {data?.services.length ? "Nothing in this view." : "No accounts recorded yet — add the first one."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-gray-500 max-w-[80ch]">
        Costs and renewal dates are whatever is recorded here — nothing reads the vendors&apos; billing systems, so a
        date is only as good as the last time it was updated. &ldquo;Mark paid&rdquo; rolls the next due date forward by
        the billing cycle. Never store card numbers or passwords in this register; the payment field is for a label like
        &ldquo;Amex ••1234&rdquo;.
      </p>
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "good" | "warn" | "bad" }) {
  const ring =
    tone === "bad" ? "border-red-200 bg-red-50" : tone === "warn" ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-white";
  return (
    <div className={`p-3 rounded-lg border ${ring}`}>
      <div className="text-xs text-gray-500 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold text-gray-900 mt-0.5">{value}</div>
      {sub && <div className="text-xs text-gray-500">{sub}</div>}
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1 rounded-full text-xs border ${active ? "bg-[#0F4C5C] text-white border-[#0F4C5C]" : "border-gray-300 text-gray-600 hover:bg-gray-50"}`}
    >
      {children}
    </button>
  );
}

/** One editor for both add and edit — the fields are identical. */
function ServiceForm({
  initial,
  busy,
  onSave,
  onCancel,
}: {
  initial: Partial<PaidService>;
  busy: boolean;
  onSave: (draft: Partial<PaidService>) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<Partial<PaidService>>(initial);
  const set = (k: keyof PaidService, v: unknown) => setD((p) => ({ ...p, [k]: v }));
  const numOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

  return (
    <div className="mt-3 p-3 rounded-lg bg-white border border-gray-200 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
      <Field label="Service name">
        <input className={inputCls} value={d.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Supabase" />
      </Field>
      <Field label="Category">
        <select className={inputCls} value={d.category ?? "other"} onChange={(e) => set("category", e.target.value)}>
          {SERVICE_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Status">
        <select className={inputCls} value={d.status ?? "active"} onChange={(e) => set("status", e.target.value)}>
          {SERVICE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Cost" hint="per billing cycle">
        <input
          className={inputCls}
          type="number"
          step="0.01"
          value={d.cost ?? ""}
          onChange={(e) => set("cost", numOrNull(e.target.value))}
          placeholder="0.00"
        />
      </Field>
      <Field label="Currency">
        <input className={inputCls} value={d.currency ?? "AUD"} onChange={(e) => set("currency", e.target.value.toUpperCase())} maxLength={3} />
      </Field>
      <Field label="Billing cycle">
        <select className={inputCls} value={d.billing_cycle ?? "monthly"} onChange={(e) => set("billing_cycle", e.target.value)}>
          {BILLING_CYCLES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Next due date" hint="what the alerts count down to">
        <input className={inputCls} type="date" value={d.next_due_date ?? ""} onChange={(e) => set("next_due_date", e.target.value || null)} />
      </Field>
      <Field label="Last paid">
        <input className={inputCls} type="date" value={d.last_paid_on ?? ""} onChange={(e) => set("last_paid_on", e.target.value || null)} />
      </Field>
      <Field label="Warn me this early" hint="days before due">
        <input
          className={inputCls}
          type="number"
          min={0}
          max={365}
          value={d.alert_lead_days ?? 7}
          onChange={(e) => set("alert_lead_days", numOrNull(e.target.value) ?? 7)}
        />
      </Field>

      <Field label="Pays with" hint="label only — never a card number">
        <input className={inputCls} value={d.payment_method ?? ""} onChange={(e) => set("payment_method", e.target.value)} placeholder="Amex ••1234" />
      </Field>
      <Field label="Card expires">
        <input className={inputCls} type="month" value={d.card_expiry ?? ""} onChange={(e) => set("card_expiry", e.target.value || null)} />
      </Field>
      <Field label="Auto-renew">
        <label className="flex items-center gap-2 h-9">
          <input type="checkbox" checked={d.auto_renew !== false} onChange={(e) => set("auto_renew", e.target.checked)} />
          <span className="text-gray-600 text-xs">{d.auto_renew === false ? "Off — needs manual payment" : "On"}</span>
        </label>
      </Field>

      <Field label="Prepaid balance" hint="for credit-based accounts">
        <input
          className={inputCls}
          type="number"
          step="0.01"
          value={d.balance_remaining ?? ""}
          onChange={(e) => set("balance_remaining", numOrNull(e.target.value))}
        />
      </Field>
      <Field label="Balance unit">
        <input className={inputCls} value={d.balance_unit ?? ""} onChange={(e) => set("balance_unit", e.target.value)} placeholder="AUD / credits" />
      </Field>
      <Field label="Warn below">
        <input
          className={inputCls}
          type="number"
          step="0.01"
          value={d.low_balance_threshold ?? ""}
          onChange={(e) => set("low_balance_threshold", numOrNull(e.target.value))}
        />
      </Field>

      <Field label="Plan">
        <input className={inputCls} value={d.plan ?? ""} onChange={(e) => set("plan", e.target.value)} placeholder="Pro / PLUS / Team" />
      </Field>
      <Field label="How critical">
        <select className={inputCls} value={d.criticality ?? "important"} onChange={(e) => set("criticality", e.target.value)}>
          {CRITICALITIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Account / login" hint="identifier, not a password">
        <input className={inputCls} value={d.account_ref ?? ""} onChange={(e) => set("account_ref", e.target.value)} />
      </Field>

      <Field label="Billing page URL" full>
        <input className={inputCls} value={d.vendor_url ?? ""} onChange={(e) => set("vendor_url", e.target.value)} placeholder="https://…" />
      </Field>
      <Field label="What it powers / what breaks without it" full>
        <textarea className={inputCls} rows={2} value={d.purpose ?? ""} onChange={(e) => set("purpose", e.target.value)} />
      </Field>
      <Field label="Notes" full>
        <textarea className={inputCls} rows={2} value={d.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
      </Field>

      <div className="md:col-span-3 flex gap-2 justify-end">
        <button onClick={onCancel} className="px-3 py-1.5 rounded-md border border-gray-300 text-gray-600 text-sm hover:bg-gray-50">
          Cancel
        </button>
        <button
          onClick={() => onSave(d)}
          disabled={busy || !(d.name ?? "").trim()}
          className="px-4 py-1.5 rounded-md text-white text-sm disabled:opacity-50"
          style={{ backgroundColor: TEAL }}
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

const inputCls = "w-full px-2.5 py-1.5 rounded-md border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F4C5C]/30";

function Field({
  label,
  hint,
  full,
  children,
}: {
  label: string;
  hint?: string;
  full?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={full ? "md:col-span-3" : ""}>
      <label className="block text-xs font-medium text-gray-600 mb-1">
        {label}
        {hint && <span className="font-normal text-gray-400"> · {hint}</span>}
      </label>
      {children}
    </div>
  );
}
