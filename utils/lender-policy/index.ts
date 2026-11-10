/**
 * Lender policy library — the pure, non-I/O half: normalising a raw record,
 * the table-missing guard, date handling, and the search/filter predicates the
 * reference UI runs on.
 *
 * Storage lives in `store.ts` (Supabase + the committed pack fallback); it is
 * kept separate so this module can be imported by client components without
 * dragging the service-key Supabase client into the browser bundle — the same
 * split as `paid-services.ts` vs `paid-service-balances.ts`.
 */

import type {
  Fact,
  LenderPolicy,
  LenderStatus,
  LenderTier,
  PolicySection,
} from "./types";
import { POLICY_SECTIONS } from "./types";

export * from "./types";

// ─── Dates ──────────────────────────────────────────────────────────────────

/**
 * Today in Australia/Brisbane as 'YYYY-MM-DD'.
 *
 * AEST/UTC+10, no DST — the same convention as `paid-services.ts`. Policy
 * as-at dates are calendar dates; comparing them against a UTC clock is how
 * "current" silently becomes "a day stale" either side of midnight.
 */
export function brisbaneToday(now: Date = new Date()): string {
  const brisbane = new Date(now.getTime() + 10 * 60 * 60 * 1000);
  return brisbane.toISOString().slice(0, 10);
}

// ─── Table-missing guard ────────────────────────────────────────────────────

/**
 * Deliberately narrow, for the reason documented on `factFindsTableMissing()`:
 * the obvious `does not exist` / `schema cache` substring test ALSO matches
 * column-level errors (PGRST204 / 42703), so a schema drift reports itself as
 * "run the migration" for a migration already applied. Match the table-level
 * codes only.
 */
export function lenderPoliciesTableMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "42P01" || code === "PGRST205";
}

export function lenderErrMessage(error: unknown): string {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  const m = (error as { message?: unknown }).message;
  return typeof m === "string" ? m : "Unknown error";
}

// ─── Normalising ────────────────────────────────────────────────────────────

const EMPTY_SECTIONS = () =>
  Object.fromEntries(POLICY_SECTIONS.map((s) => [s, {}])) as Pick<LenderPolicy, PolicySection>;

/**
 * Merge a stored/researched blob over the current template so an older record
 * still opens after the taxonomy grows — same contract as `hydrateFactFind()`.
 * A section that has never been researched becomes `{}`, not `undefined`, so
 * every consumer can do `policy.credit.maxDefaults` without a guard.
 */
export function hydratePolicy(raw: Partial<LenderPolicy> & { id: string; name: string }): LenderPolicy {
  const sections = EMPTY_SECTIONS();
  for (const key of POLICY_SECTIONS) {
    const stored = raw[key];
    sections[key] = { ...(sections[key] as object), ...(stored ?? {}) } as never;
  }
  return {
    id: raw.id,
    name: raw.name,
    legalName: raw.legalName ?? null,
    tier: (raw.tier ?? "other") as LenderTier,
    status: (raw.status ?? "active") as LenderStatus,
    acl: raw.acl ?? null,
    abn: raw.abn ?? null,
    brokerSiteUrl: raw.brokerSiteUrl ?? null,
    policyDocUrl: raw.policyDocUrl ?? null,
    funder: raw.funder ?? null,
    panels: raw.panels ?? null,
    ...sections,
    version: raw.version ?? 1,
    effectiveFrom: raw.effectiveFrom ?? null,
    effectiveTo: raw.effectiveTo ?? null,
    researchedAt: raw.researchedAt ?? null,
    researchedBy: raw.researchedBy ?? null,
    gaps: raw.gaps ?? null,
    reviewedBy: raw.reviewedBy ?? null,
    reviewedAt: raw.reviewedAt ?? null,
  };
}

/** Every fact on a policy, flattened to `[path, fact]` for the UI and search. */
export function policyFacts(policy: LenderPolicy): Array<[string, Fact<unknown>]> {
  const out: Array<[string, Fact<unknown>]> = [];
  for (const section of POLICY_SECTIONS) {
    const bag = (policy[section] ?? {}) as Record<string, unknown>;
    for (const [field, value] of Object.entries(bag)) {
      if (value && typeof value === "object" && "confidence" in value && "status" in value) {
        out.push([`${section}.${field}`, value as Fact<unknown>]);
      }
    }
  }
  return out;
}

/** Count of facts that carry a value at all — the "how researched is this?" number. */
export function researchedFieldCount(policy: LenderPolicy): number {
  return policyFacts(policy).filter(([, f]) => f.value !== null && f.value !== undefined).length;
}

// ─── Search / filter ────────────────────────────────────────────────────────

export type LenderFilter = {
  q?: string;
  tiers?: LenderTier[];
  statuses?: LenderStatus[];
  /** Only lenders with a verified value for every one of these paths. */
  hasFields?: string[];
};

/** Free-text search across the lender name and every fact's note/value. */
export function policyMatchesQuery(policy: LenderPolicy, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const haystack: string[] = [
    policy.name,
    policy.legalName ?? "",
    policy.funder ?? "",
    policy.tier,
    ...(policy.gaps ?? []),
  ];
  for (const [path, fact] of policyFacts(policy)) {
    haystack.push(path);
    if (fact.note) haystack.push(fact.note);
    if (fact.sourceTitle) haystack.push(fact.sourceTitle);
    if (typeof fact.value === "string") haystack.push(fact.value);
    if (Array.isArray(fact.value)) {
      for (const item of fact.value) {
        if (typeof item === "string") haystack.push(item);
      }
    }
  }
  return haystack.join("  ").toLowerCase().includes(needle);
}

export function filterPolicies(policies: LenderPolicy[], filter: LenderFilter): LenderPolicy[] {
  return policies.filter((p) => {
    if (filter.tiers?.length && !filter.tiers.includes(p.tier)) return false;
    if (filter.statuses?.length && !filter.statuses.includes(p.status)) return false;
    if (filter.hasFields?.length) {
      const facts = new Map(policyFacts(p));
      for (const path of filter.hasFields) {
        const f = facts.get(path);
        if (!f || f.value === null || f.value === undefined) return false;
      }
    }
    if (filter.q && !policyMatchesQuery(p, filter.q)) return false;
    return true;
  });
}

// ─── Display helpers ────────────────────────────────────────────────────────

/** Turn a camelCase field name into a readable label. */
export function fieldLabel(field: string): string {
  const spaced = field
    .replace(/([A-Z])/g, " $1")
    .replace(/\bPct\b/g, "%")
    .replace(/\bLvr\b/gi, "LVR")
    .replace(/\bLmi\b/gi, "LMI")
    .replace(/\bDti\b/gi, "DTI")
    .replace(/\bHem\b/gi, "HEM")
    .replace(/\bIo\b/g, "interest-only")
    .replace(/\bSmsf\b/gi, "SMSF")
    .replace(/\bAbn\b/gi, "ABN")
    .replace(/\bGst\b/gi, "GST")
    .replace(/\bNras\b/gi, "NRAS")
    .replace(/\bSda\b/gi, "SDA")
    .replace(/\bNdis\b/gi, "NDIS")
    .replace(/\bFirb\b/gi, "FIRB")
    .replace(/\bBnpl\b/gi, "BNPL")
    .replace(/\bHecs\b/gi, "HECS")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Render a fact's value for display. Percent-fraction fields are scaled. */
export function formatFactValue(path: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    if (typeof value[0] === "string") return (value as string[]).join(", ");
    return `${value.length} entries`;
  }
  if (typeof value === "number") {
    // Fractions stored 0–1 that read better as percentages.
    if (
      path.endsWith("rentShadingPct") ||
      path.endsWith("creditCardAssessmentPct") ||
      path.endsWith("genuineSavingsRequiredPct") ||
      path.endsWith("foreignIncomeShadingPct")
    ) {
      return `${Math.round(value * 1000) / 10}%`;
    }
    if (path.endsWith("Pct")) return `${Math.round(value * 100) / 100}%`;
    if (path.includes("Amount") || path.includes("LoanAmount")) {
      return `$${Math.round(value).toLocaleString("en-AU")}`;
    }
    return String(value);
  }
  return String(value);
}
