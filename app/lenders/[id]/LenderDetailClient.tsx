"use client";

/**
 * One lender's full published policy, section by section.
 *
 * Every fact renders with its provenance attached — source link, as-at date,
 * and the verification verdict — because the value on its own is not the
 * product here. A buffer with no citation is a rumour; the citation is what
 * makes this a database a broker can defend a recommendation with.
 *
 * Unverified facts are shown, not hidden. They are still useful to a human who
 * can judge them; they are simply excluded from automated matching, and the
 * row says exactly why.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  POLICY_SECTIONS,
  SECTION_LABELS,
  TIER_LABELS,
  type Fact,
  type LenderPolicy,
  type PolicySection,
} from "../../../utils/lender-policy/types";
import { fieldLabel, formatFactValue } from "../../../utils/lender-policy";
import { ISSUE_LABELS, type VerificationIssue } from "../../../utils/lender-policy/verify";

const TEAL = "#0F4C5C";

type Payload = {
  ok: boolean;
  policy: LenderPolicy;
  issues: Record<string, VerificationIssue[]>;
  counts: { total: number; verified: number; humanConfirmed: number; unverified: number; notFound: number };
  source: "supabase" | "pack";
  today: string;
  error?: string;
};

const STATUS_CHIP: Record<string, { cls: string; label: string }> = {
  verified: { cls: "bg-emerald-100 text-emerald-800", label: "Verified" },
  human_confirmed: { cls: "bg-blue-100 text-blue-800", label: "Broker confirmed" },
  unverified: { cls: "bg-amber-100 text-amber-900", label: "Unverified" },
  not_found: { cls: "bg-gray-100 text-gray-600", label: "Not published" },
};

function isFact(v: unknown): v is Fact<unknown> {
  return typeof v === "object" && v !== null && "confidence" in v && "status" in v;
}

function ConfirmForm({
  lenderId,
  path,
  current,
  onDone,
}: {
  lenderId: string;
  path: string;
  current: Fact<unknown>;
  onDone: () => void;
}) {
  const [value, setValue] = useState(
    current.value === null || current.value === undefined
      ? ""
      : typeof current.value === "object"
        ? JSON.stringify(current.value)
        : String(current.value),
  );
  const [asAt, setAsAt] = useState(current.asAt ?? "");
  const [sourceUrl, setSourceUrl] = useState(current.sourceUrl ?? "");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setSaving(true);
    setError(null);
    // Preserve the original type: a number field confirmed as a string would
    // silently stop matching (the plausibility check only inspects numbers).
    let parsed: unknown = value;
    if (typeof current.value === "number") parsed = Number(value);
    else if (typeof current.value === "boolean") parsed = value === "true" || value === "Yes";
    else if (typeof current.value === "object" && current.value !== null) {
      try {
        parsed = JSON.parse(value);
      } catch {
        setError("That isn't valid JSON for this field.");
        setSaving(false);
        return;
      }
    }
    try {
      const res = await fetch(`/api/lenders/${lenderId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fieldPath: path, value: parsed, asAt, sourceUrl: sourceUrl || null, note: note || null }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Could not save");
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }, [asAt, current.value, lenderId, note, onDone, path, sourceUrl, value]);

  return (
    <div className="mt-2 space-y-2 rounded-md border border-blue-200 bg-blue-50 p-3">
      <p className="text-xs text-blue-900">
        Confirm this against the lender&apos;s actual policy document. A broker confirmation
        outranks the research, survives the next automated refresh, and still needs a date.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Value"
          className="min-w-[140px] flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
        />
        <input
          type="date"
          value={asAt}
          onChange={(e) => setAsAt(e.target.value)}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        />
      </div>
      <input
        value={sourceUrl}
        onChange={(e) => setSourceUrl(e.target.value)}
        placeholder="Source URL (the page you read it on)"
        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
      />
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
      />
      {error && <div className="text-xs text-red-700">{error}</div>}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={submit}
          disabled={saving || !asAt}
          className="rounded bg-blue-700 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Confirm"}
        </button>
        <button type="button" onClick={onDone} className="rounded px-3 py-1 text-xs text-gray-600">
          Cancel
        </button>
      </div>
    </div>
  );
}

function FactRow({
  lenderId,
  path,
  fact,
  issues,
  onChanged,
}: {
  lenderId: string;
  path: string;
  fact: Fact<unknown>;
  issues: VerificationIssue[];
  onChanged: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const chip = STATUS_CHIP[fact.status] ?? STATUS_CHIP.unverified;
  const field = path.split(".")[1] ?? path;

  return (
    <div className="border-t border-gray-100 px-4 py-3 first:border-t-0">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="min-w-[200px] flex-1 text-sm text-gray-700">{fieldLabel(field)}</span>
        <span className="font-medium text-gray-900">{formatFactValue(path, fact.value)}</span>
        <span className={`rounded px-1.5 py-0.5 text-[11px] ${chip.cls}`}>{chip.label}</span>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
        {fact.sourceUrl ? (
          <a
            href={fact.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-700 underline"
          >
            {fact.sourceTitle || "Source"}
          </a>
        ) : (
          <span className="text-amber-700">No source</span>
        )}
        <span>{fact.asAt ? `as at ${fact.asAt}` : "no as-at date"}</span>
        <span>confidence: {fact.confidence}</span>
        <button
          type="button"
          onClick={() => setConfirming((v) => !v)}
          className="text-blue-700 underline"
        >
          {confirming ? "Close" : "Confirm / correct"}
        </button>
      </div>

      {fact.note && <p className="mt-1 text-xs text-gray-600">{fact.note}</p>}

      {issues.length > 0 && (
        <p className="mt-1 text-xs text-amber-800">
          Excluded from matching — {issues.map((i) => ISSUE_LABELS[i]).join("; ")}.
        </p>
      )}

      {confirming && (
        <ConfirmForm
          lenderId={lenderId}
          path={path}
          current={fact}
          onDone={() => {
            setConfirming(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

export default function LenderDetailClient({ lenderId }: { lenderId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [researching, setResearching] = useState(false);
  const [researchNote, setResearchNote] = useState<string | null>(null);

  // No synchronous setState before the first `await` — this runs straight out
  // of a mount effect, and a synchronous set there trips
  // `react-hooks/set-state-in-effect` (a blocking CI lint rule) as well as
  // causing a cascading render. Errors are cleared on success instead.
  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/lenders/${lenderId}`);
      const json = (await res.json()) as Payload;
      if (!json.ok) throw new Error(json.error ?? "Could not load the lender");
      setData(json);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the lender");
    }
  }, [lenderId]);

  // Deferred out of the effect body: `react-hooks/set-state-in-effect` is a
  // blocking CI lint rule and traces straight through a call made in the body,
  // even an async one. A microtask puts the fetch after the commit.
  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  const research = useCallback(async () => {
    setResearching(true);
    setResearchNote(null);
    try {
      const res = await fetch("/api/lenders/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lenderId, apply: true }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        accepted?: number;
        rejected?: number;
        applied?: boolean;
        applyError?: string;
        error?: string;
      };
      if (!json.ok) throw new Error(json.error ?? "Research failed");
      setResearchNote(
        `${json.accepted} fact(s) accepted, ${json.rejected} rejected for missing, dead or implausible sources.` +
          (json.applied ? "" : ` Not saved: ${json.applyError ?? "storage unavailable"}.`),
      );
      await load();
    } catch (err) {
      setResearchNote(err instanceof Error ? err.message : "Research failed");
    } finally {
      setResearching(false);
    }
  }, [lenderId, load]);

  if (error) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-6">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
        <Link href="/lenders" className="mt-3 inline-block text-sm text-blue-700 underline">
          ← Back to the lender library
        </Link>
      </div>
    );
  }
  if (!data) return <div className="px-4 py-10 text-center text-sm text-gray-500">Loading…</div>;

  const p = data.policy;
  const verified = data.counts.verified + data.counts.humanConfirmed;

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <Link href="/lenders" className="text-sm text-blue-700 underline">
        ← Lender library
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold" style={{ color: TEAL }}>
            {p.name}
          </h1>
          <p className="text-sm text-gray-600">
            {TIER_LABELS[p.tier]}
            {p.legalName ? ` · ${p.legalName}` : ""}
            {p.funder ? ` · funded by ${p.funder}` : ""}
            {p.acl ? ` · ACL ${p.acl}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={research}
          disabled={researching}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:opacity-50"
        >
          {researching ? "Researching…" : "Re-research from public sources"}
        </button>
      </div>

      {researchNote && (
        <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900">
          {researchNote}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
        <span>
          <strong className="text-emerald-700">{verified}</strong> verified
        </span>
        <span>
          <strong className="text-amber-700">{data.counts.unverified}</strong> unverified
        </span>
        <span>
          <strong className="text-gray-700">{data.counts.notFound}</strong> not published
        </span>
        {p.researchedAt && <span className="text-gray-500">Researched {p.researchedAt}</span>}
        {p.policyDocUrl && (
          <a
            href={p.policyDocUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-700 underline"
          >
            Credit policy guide
          </a>
        )}
        {p.brokerSiteUrl && (
          <a
            href={p.brokerSiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-700 underline"
          >
            Broker site
          </a>
        )}
      </div>

      {p.gaps && p.gaps.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <h2 className="text-sm font-semibold text-amber-900">
            What this record does not establish
          </h2>
          <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-amber-900">
            {p.gaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 space-y-6">
        {POLICY_SECTIONS.map((section: PolicySection) => {
          const bag = (p[section] ?? {}) as Record<string, unknown>;
          const facts = Object.entries(bag).filter(([, v]) => isFact(v)) as Array<[string, Fact<unknown>]>;
          if (facts.length === 0) return null;
          return (
            <section key={section}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">
                {SECTION_LABELS[section]}
              </h2>
              <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                {facts.map(([field, fact]) => (
                  <FactRow
                    key={field}
                    lenderId={lenderId}
                    path={`${section}.${field}`}
                    fact={fact}
                    issues={data.issues[`${section}.${field}`] ?? []}
                    onChanged={load}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <p className="mt-8 text-xs text-gray-500">
        Internal research aid for licensed brokers, summarised from publicly published lender
        documents. Not a credit assessment, a pre-approval, or credit advice. Lender policy changes
        without notice — confirm against the lender&apos;s current policy before acting.
      </p>
    </div>
  );
}
