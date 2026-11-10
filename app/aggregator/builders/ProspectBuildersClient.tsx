"use client";

import { useEffect, useState } from "react";
import { errMessage } from "../../../utils/errors";
import {
  STATUS_LABEL,
  stockDomainsFor,
  type ProspectAction,
  type ProspectBuilder,
  type ProspectStatus,
} from "../../../utils/prospect-builders";

type Filter = "open" | ProspectStatus;

const STATUS_PILL: Record<ProspectStatus, string> = {
  prospect: "bg-gray-100 text-gray-700",
  agreement_requested: "bg-amber-100 text-amber-800",
  agreement_signed: "bg-blue-100 text-blue-800",
  onboarded: "bg-emerald-100 text-emerald-800",
};

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("en-AU", {
        timeZone: "Australia/Brisbane",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

/** Tells BuildersClient to reload after a prospect is onboarded. */
export const BUILDERS_CHANGED_EVENT = "builders:changed";

export default function ProspectBuildersClient() {
  const [items, setItems] = useState<ProspectBuilder[] | null>(null);
  const [tableMissing, setTableMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [collapsed, setCollapsed] = useState(false);

  const load = async () => {
    setError(null);
    try {
      const res = await fetch("/api/aggregator/prospect-builders");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setTableMissing(!!json.tableMissing);
      setItems(json.items ?? []);
    } catch (e) {
      setError(errMessage(e, "Load failed"));
    }
  };

  useEffect(() => {
    queueMicrotask(() => load());
  }, []);

  const act = async (p: ProspectBuilder, action: ProspectAction) => {
    if (
      action === "onboard" &&
      !confirm(
        `Onboard ${p.company}?\n\nThis adds them to the Builders list as an active stock supplier` +
          (stockDomainsFor(p).length
            ? ` receiving stocklists from ${stockDomainsFor(p).join(", ")}.`
            : ". No email domain is known yet — add sender domains on their builder card so stocklists match."),
      )
    )
      return;
    setBusy(p.id);
    try {
      const res = await fetch(`/api/aggregator/prospect-builders/${p.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setItems((prev) => prev?.map((x) => (x.id === p.id ? json.prospect : x)) ?? prev);
      if (action === "onboard") window.dispatchEvent(new Event(BUILDERS_CHANGED_EVENT));
    } catch (e) {
      alert(errMessage(e, "Update failed"));
      await load();
    } finally {
      setBusy(null);
    }
  };

  if (error) return <div className="text-red-600 p-4">⚠ {error}</div>;
  if (items === null) return <div className="text-gray-500 p-4 italic">Loading prospects…</div>;

  const counts = items.reduce(
    (acc, p) => ({ ...acc, [p.status]: (acc[p.status] ?? 0) + 1 }),
    {} as Partial<Record<ProspectStatus, number>>,
  );
  const openCount = items.length - (counts.onboarded ?? 0);
  const shown = items.filter((p) => (filter === "open" ? p.status !== "onboarded" : p.status === filter));

  const tabs: { key: Filter; label: string; n: number }[] = [
    { key: "open", label: "In progress", n: openCount },
    { key: "prospect", label: STATUS_LABEL.prospect, n: counts.prospect ?? 0 },
    { key: "agreement_requested", label: STATUS_LABEL.agreement_requested, n: counts.agreement_requested ?? 0 },
    { key: "agreement_signed", label: STATUS_LABEL.agreement_signed, n: counts.agreement_signed ?? 0 },
    { key: "onboarded", label: STATUS_LABEL.onboarded, n: counts.onboarded ?? 0 },
  ];

  return (
    <section className="mb-10">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <button type="button" onClick={() => setCollapsed((c) => !c)} className="flex items-center gap-2 text-left">
          <h2 className="text-xl font-bold text-gray-800">Prospect builders</h2>
          <span className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700">{openCount} in progress</span>
          <span className="text-gray-400 text-sm">{collapsed ? "▸" : "▾"}</span>
        </button>
        <p className="text-xs text-gray-500">
          Agreement requested → agreement signed → onboarded. Onboarded firms move to the stock builders below.
        </p>
      </div>

      {!collapsed && (
        <>
          {tableMissing && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-lg p-3 mb-3">
              The prospect builders table doesn&apos;t exist yet — run{" "}
              <code className="font-mono">migrations/20260914b_prospect_builders.sql</code>.
            </div>
          )}

          <div className="flex flex-wrap gap-1 mb-3">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setFilter(t.key)}
                className={`px-3 py-1 rounded-full text-xs font-medium border ${
                  filter === t.key
                    ? "bg-gray-900 text-white border-gray-900"
                    : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50"
                }`}
              >
                {t.label} <span className="opacity-70">({t.n})</span>
              </button>
            ))}
          </div>

          {shown.length === 0 && !tableMissing && (
            <div className="bg-white border border-dashed border-gray-300 rounded-xl p-8 text-center text-gray-500 text-sm">
              Nothing in this stage.
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2">
            {shown.map((p) => (
              <ProspectCard key={p.id} p={p} busy={busy === p.id} onAction={(a) => act(p, a)} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function ProspectCard({
  p,
  busy,
  onAction,
}: {
  p: ProspectBuilder;
  busy: boolean;
  onAction: (a: ProspectAction) => void;
}) {
  const timeline = [
    p.agreement_requested_at && `Requested ${fmtDate(p.agreement_requested_at)}`,
    p.agreement_signed_at && `Signed ${fmtDate(p.agreement_signed_at)}`,
    p.onboarded_at && `Onboarded ${fmtDate(p.onboarded_at)}`,
  ].filter(Boolean);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm flex flex-col">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-gray-800">{p.company}</h3>
          <p className="text-xs text-gray-500">
            {[p.category, p.location].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_PILL[p.status]}`}>
          {STATUS_LABEL[p.status]}
        </span>
      </div>

      {p.contacts.length > 0 && (
        <ul className="text-sm space-y-1.5 mb-2">
          {p.contacts.map((c, i) => (
            <li key={i} className="text-gray-700">
              {(c.name || c.role) && (
                <span className="font-medium">
                  {c.name ?? ""}
                  {c.role && <span className="font-normal text-gray-500">{c.name ? `, ${c.role}` : c.role}</span>}
                </span>
              )}
              <span className="flex flex-wrap gap-x-3 text-xs">
                {c.email && (
                  <a href={`mailto:${c.email}`} className="text-blue-700 hover:underline break-all">
                    {c.email}
                  </a>
                )}
                {c.phone && (
                  <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="text-blue-700 hover:underline">
                    {c.phone}
                  </a>
                )}
                {c.phone_alt && (
                  <a href={`tel:${c.phone_alt.replace(/[^\d+]/g, "")}`} className="text-blue-700 hover:underline">
                    {c.phone_alt}
                  </a>
                )}
              </span>
              {c.notes && <span className="block text-xs text-gray-500">{c.notes}</span>}
            </li>
          ))}
        </ul>
      )}

      <dl className="grid grid-cols-1 gap-1 text-xs text-gray-600 mb-2">
        {p.website && (
          <Row label="Website">
            <a href={p.website} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline break-all">
              {p.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
            </a>
          </Row>
        )}
        {p.stock_types && <Row label="Stock">{p.stock_types}</Row>}
        {p.commission_notes && <Row label="Terms">{p.commission_notes}</Row>}
        {p.signup_method && <Row label="Sign-up">{p.signup_method}</Row>}
        {p.next_action && p.status === "prospect" && <Row label="Next">{p.next_action}</Row>}
        {p.source_url && (
          <Row label="Source">
            <a href={p.source_url} target="_blank" rel="noreferrer" className="text-blue-700 hover:underline break-all">
              {p.source_url.replace(/^https?:\/\/(www\.)?/, "")}
            </a>
          </Row>
        )}
      </dl>

      {p.verification_notes && (
        <p className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded px-2 py-1 mb-2">
          ⚠ {p.verification_notes}
        </p>
      )}
      {p.notes && <p className="text-xs text-gray-600 whitespace-pre-line mb-2">{p.notes}</p>}

      <div className="mt-auto pt-2 border-t border-gray-100 flex flex-wrap items-center gap-2">
        {p.status === "prospect" && (
          <ActionButton busy={busy} onClick={() => onAction("request_agreement")} className="bg-amber-500 hover:bg-amber-600">
            Agreement requested
          </ActionButton>
        )}
        {p.status === "agreement_requested" && (
          <ActionButton busy={busy} onClick={() => onAction("mark_signed")} className="bg-blue-600 hover:bg-blue-700">
            Agreement signed
          </ActionButton>
        )}
        {p.status === "agreement_signed" && (
          <ActionButton busy={busy} onClick={() => onAction("onboard")} className="bg-emerald-600 hover:bg-emerald-700">
            Onboarded
          </ActionButton>
        )}
        {(p.status === "agreement_requested" || p.status === "agreement_signed") && (
          <button
            type="button"
            onClick={() => onAction("undo")}
            disabled={busy}
            className="px-2 py-1 text-xs text-gray-500 hover:text-gray-800 disabled:opacity-50"
          >
            Undo
          </button>
        )}
        {p.status === "onboarded" && (
          <span className="text-xs text-emerald-700">✓ Receiving stock — managed in the builders list below</span>
        )}
        {timeline.length > 0 && <span className="ml-auto text-xs text-gray-400">{timeline.join(" · ")}</span>}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-16 shrink-0 text-gray-400 uppercase font-semibold">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function ActionButton({
  busy,
  onClick,
  className,
  children,
}: {
  busy: boolean;
  onClick: () => void;
  className: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`px-3 py-1.5 text-white text-xs font-medium rounded disabled:opacity-50 ${className}`}
    >
      {busy ? "Saving…" : children}
    </button>
  );
}
