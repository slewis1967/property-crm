"use client";

/**
 * Lender Policy library — every Australian home-loan lender we hold policy for,
 * searchable and filterable, with the state of the evidence shown on every row.
 *
 * The data-quality column is not decoration. This database is built by AI
 * research over public lender websites, and a broker deciding whether to lean
 * on a record needs to see at a glance how much of it survived verification.
 * A lender with two verified facts and thirty gaps must not look the same as
 * one with a full policy guide behind it.
 */

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  LENDER_TIERS,
  TIER_LABELS,
  type LenderStatus,
  type LenderTier,
} from "../../utils/lender-policy/types";

const TEAL = "#0F4C5C";

type Counts = {
  total: number;
  verified: number;
  humanConfirmed: number;
  unverified: number;
  notFound: number;
};

type LenderRow = {
  id: string;
  name: string;
  legalName: string | null;
  tier: LenderTier;
  status: LenderStatus;
  funder: string | null;
  brokerSiteUrl: string | null;
  policyDocUrl: string | null;
  effectiveFrom: string | null;
  researchedAt: string | null;
  gapCount: number;
  researchedFields: number;
  counts: Counts;
};

type Payload = {
  ok: boolean;
  lenders: LenderRow[];
  total: number;
  source: "supabase" | "pack";
  migrationNeeded: boolean;
  hint?: string;
  today: string;
  error?: string;
};

const STATUS_CHIP: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-800",
  paused: "bg-amber-100 text-amber-900",
  withdrawn: "bg-gray-200 text-gray-500 line-through",
  research_only: "bg-blue-100 text-blue-800",
};

/** Common policy fields a broker filters on when hunting for a lender. */
const QUICK_FILTERS: Array<{ path: string; label: string }> = [
  { path: "servicing.assessmentBufferPct", label: "Has assessment buffer" },
  { path: "servicing.dtiCap", label: "Has DTI cap" },
  { path: "lvr.maxLvrOwnerOccupiedPct", label: "Has max LVR" },
  { path: "income.rules", label: "Has income rules" },
  { path: "credit.paidDefaultsAccepted", label: "Has default policy" },
  { path: "product.minLoanAmount", label: "Has loan limits" },
];

function QualityBar({ counts }: { counts: Counts }) {
  const verified = counts.verified + counts.humanConfirmed;
  if (counts.total === 0) {
    return <span className="text-xs text-gray-400">Not researched</span>;
  }
  const pct = Math.round((verified / counts.total) * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full ${pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-400"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="whitespace-nowrap text-xs text-gray-600">
        {verified} verified
        {counts.unverified > 0 ? ` · ${counts.unverified} unverified` : ""}
      </span>
    </div>
  );
}

export default function LendersClient() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [tier, setTier] = useState<LenderTier | "">("");
  const [hasField, setHasField] = useState("");
  const [importing, setImporting] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (tier) params.set("tier", tier);
      if (hasField) params.set("has", hasField);
      const res = await fetch(`/api/lenders?${params.toString()}`);
      const json = (await res.json()) as Payload;
      if (!json.ok) throw new Error(json.error ?? "Could not load the lender library");
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the lender library");
    } finally {
      setLoading(false);
    }
  }, [q, tier, hasField]);

  useEffect(() => {
    const timer = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [load, q]);

  const runImport = useCallback(async () => {
    setImporting(true);
    setImportNote(null);
    try {
      const res = await fetch("/api/lenders/import", { method: "POST" });
      const json = (await res.json()) as { ok: boolean; imported?: number; error?: string };
      setImportNote(
        json.ok
          ? `Imported ${json.imported} lender records into the database.`
          : (json.error ?? "Import failed"),
      );
      if (json.ok) await load();
    } catch {
      setImportNote("Import failed");
    } finally {
      setImporting(false);
    }
  }, [load]);

  const totals = useMemo(() => {
    const rows = data?.lenders ?? [];
    return rows.reduce(
      (acc, row) => ({
        verified: acc.verified + row.counts.verified + row.counts.humanConfirmed,
        unverified: acc.unverified + row.counts.unverified,
        gaps: acc.gaps + row.gapCount,
      }),
      { verified: 0, unverified: 0, gaps: 0 },
    );
  }, [data]);

  const byTier = useMemo(() => {
    const groups = new Map<LenderTier, LenderRow[]>();
    for (const row of data?.lenders ?? []) {
      const list = groups.get(row.tier) ?? [];
      list.push(row);
      groups.set(row.tier, list);
    }
    return LENDER_TIERS.filter((t) => groups.has(t)).map((t) => [t, groups.get(t)!] as const);
  }, [data]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: TEAL }}>
            Lender Policy
          </h1>
          <p className="mt-1 max-w-3xl text-sm text-gray-600">
            Published lending policy for Australian home-loan lenders, sourced from public broker
            policy documents. Every value carries the page it was read on and the date it was
            current.
          </p>
        </div>
        <Link
          href="/lenders/match"
          className="rounded-lg px-4 py-2 text-sm font-medium text-white"
          style={{ backgroundColor: TEAL }}
        >
          Match a client scenario →
        </Link>
      </div>

      {/* The boundary, stated where it can't be missed. */}
      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>Internal research aid — not credit advice.</strong> This is a broker&apos;s reference
        summary of publicly published lender policy. It is not a credit assessment, a pre-approval,
        or a recommendation to a client, and lender policy changes without notice. Confirm anything
        you rely on against the lender&apos;s current policy document before acting on it.
      </div>

      {data?.source === "pack" && (
        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <div className="font-medium">Reading the committed research pack (read-only).</div>
          <p className="mt-1">
            {data.migrationNeeded
              ? "Lender policy storage isn't set up yet — run migrations/20260729_lender_policies.sql in the Supabase SQL editor, then import the pack to enable broker corrections and version history."
              : "The database is empty, so the library is being served from the committed research pack. Import it to enable broker corrections and version history."}
          </p>
          <button
            type="button"
            onClick={runImport}
            disabled={importing}
            className="mt-2 rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-800 disabled:opacity-50"
          >
            {importing ? "Importing…" : "Import research pack into the database"}
          </button>
          {importNote && <div className="mt-2 text-xs">{importNote}</div>}
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search lenders, policy notes, professions…"
          className="min-w-[240px] flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <select
          value={tier}
          onChange={(e) => setTier(e.target.value as LenderTier | "")}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">All tiers</option>
          {LENDER_TIERS.map((t) => (
            <option key={t} value={t}>
              {TIER_LABELS[t]}
            </option>
          ))}
        </select>
        <select
          value={hasField}
          onChange={(e) => setHasField(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Any policy data</option>
          {QUICK_FILTERS.map((f) => (
            <option key={f.path} value={f.path}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {data && (
        <div className="mb-4 flex flex-wrap gap-4 text-sm text-gray-600">
          <span>
            <strong className="text-gray-900">{data.lenders.length}</strong> lender
            {data.lenders.length === 1 ? "" : "s"} shown
            {data.lenders.length !== data.total ? ` of ${data.total}` : ""}
          </span>
          <span>
            <strong className="text-emerald-700">{totals.verified}</strong> verified facts
          </span>
          <span>
            <strong className="text-amber-700">{totals.unverified}</strong> unverified (excluded
            from matching)
          </span>
          <span>
            <strong className="text-gray-900">{totals.gaps}</strong> recorded gaps
          </span>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {loading && !data && <div className="py-10 text-center text-sm text-gray-500">Loading…</div>}

      {data && data.lenders.length === 0 && !loading && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm text-gray-600">
          No lenders match those filters.
        </div>
      )}

      <div className="space-y-6">
        {byTier.map(([t, rows]) => (
          <section key={t}>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {TIER_LABELS[t]} ({rows.length})
            </h2>
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              {rows.map((row, i) => (
                <Link
                  key={row.id}
                  href={`/lenders/${row.id}`}
                  className={`flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-gray-50 ${
                    i > 0 ? "border-t border-gray-100" : ""
                  }`}
                >
                  <div className="min-w-[180px] flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{row.name}</span>
                      {row.status !== "active" && (
                        <span
                          className={`rounded px-1.5 py-0.5 text-[11px] ${STATUS_CHIP[row.status] ?? ""}`}
                        >
                          {row.status.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                    {row.funder && (
                      <div className="text-xs text-gray-500">Funded by {row.funder}</div>
                    )}
                  </div>
                  <QualityBar counts={row.counts} />
                  <div className="w-24 text-right text-xs text-gray-500">
                    {row.gapCount > 0 ? `${row.gapCount} gaps` : "—"}
                  </div>
                  <div className="w-24 text-right text-xs text-gray-400">
                    {row.researchedAt ?? "—"}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
