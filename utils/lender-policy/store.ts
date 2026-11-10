/**
 * Lender policy storage — Supabase when it's there, the committed research
 * pack when it isn't.
 *
 * Server-only: imports the service-key Supabase client. Never import this from
 * a `"use client"` component — the pure half is `index.ts`.
 *
 * ── THE FALLBACK IS A FEATURE, NOT A STOPGAP ─────────────────────────────
 * `migrations/20260729_lender_policies.sql` may not have been applied yet, and
 * the whole reference library plus the matching engine still have to work. So
 * a missing table is not an error state: `loadPolicies()` returns the bundled
 * pack and flags `source: "pack"`, which the UI surfaces honestly ("read-only —
 * run the migration to enable edits"). What the table buys is WRITES: broker
 * corrections, field-level human confirmation, and version history.
 *
 * ── HUMAN CORRECTIONS OUTRANK RESEARCH ───────────────────────────────────
 * Field reviews live in their own table and are folded over the researched blob
 * on every read (`applyFieldReviews`). That ordering is deliberate: a later
 * automated research pass rewrites `data` wholesale, and if corrections lived
 * inside the blob they would be silently destroyed. A broker who checked the
 * actual policy document must never be overwritten by a model that read a
 * website.
 */

import { supabase } from "../supabase";
import { log } from "../logger";
import PACK from "./pack.generated";
import {
  brisbaneToday,
  hydratePolicy,
  lenderErrMessage,
  lenderPoliciesTableMissing,
} from "./index";
import type { Fact, LenderPolicy, LenderStatus, LenderTier } from "./types";
import { verifyPolicy } from "./verify";

export const MIGRATION_HINT =
  "Lender policy storage isn't set up yet — run migrations/20260729_lender_policies.sql " +
  "in the Supabase SQL editor. Until then the library is read-only, served from the " +
  "committed research pack.";

export type PolicySource = "supabase" | "pack";

export type LoadResult = {
  policies: LenderPolicy[];
  source: PolicySource;
  migrationNeeded: boolean;
  hint?: string;
};

// ─── Row mapping ────────────────────────────────────────────────────────────

type Row = {
  id: string;
  name: string;
  legal_name: string | null;
  tier: string;
  status: string;
  acl: string | null;
  abn: string | null;
  broker_site_url: string | null;
  policy_doc_url: string | null;
  funder: string | null;
  panels: string[] | null;
  data: Record<string, unknown> | null;
  version: number;
  effective_from: string | null;
  effective_to: string | null;
  researched_at: string | null;
  researched_by: string | null;
  gaps: string[] | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
};

export function rowToPolicy(row: Row): LenderPolicy {
  return hydratePolicy({
    ...(row.data ?? {}),
    id: row.id,
    name: row.name,
    legalName: row.legal_name,
    tier: row.tier as LenderTier,
    status: row.status as LenderStatus,
    acl: row.acl,
    abn: row.abn,
    brokerSiteUrl: row.broker_site_url,
    policyDocUrl: row.policy_doc_url,
    funder: row.funder,
    panels: row.panels,
    version: row.version,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to,
    researchedAt: row.researched_at,
    researchedBy: row.researched_by,
    gaps: row.gaps,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
  } as Partial<LenderPolicy> & { id: string; name: string });
}

export function policyToRow(policy: LenderPolicy, today: string) {
  const { counts } = verifyPolicy(policy, today);
  return {
    id: policy.id,
    name: policy.name,
    legal_name: policy.legalName ?? null,
    tier: policy.tier,
    status: policy.status,
    acl: policy.acl ?? null,
    abn: policy.abn ?? null,
    broker_site_url: policy.brokerSiteUrl ?? null,
    policy_doc_url: policy.policyDocUrl ?? null,
    funder: policy.funder ?? null,
    panels: policy.panels ?? null,
    data: {
      servicing: policy.servicing,
      lvr: policy.lvr,
      income: policy.income,
      employment: policy.employment,
      credit: policy.credit,
      security: policy.security,
      product: policy.product,
      residency: policy.residency,
    },
    version: policy.version,
    effective_from: policy.effectiveFrom,
    effective_to: policy.effectiveTo ?? null,
    researched_at: policy.researchedAt ?? null,
    researched_by: policy.researchedBy ?? null,
    gaps: policy.gaps ?? null,
    fields_total: counts.total,
    fields_verified: counts.verified + counts.humanConfirmed,
    fields_unverified: counts.unverified,
    reviewed_by: policy.reviewedBy ?? null,
    reviewed_at: policy.reviewedAt ?? null,
    updated_at: new Date().toISOString(),
  };
}

// ─── The committed pack ─────────────────────────────────────────────────────

/** The research pack, hydrated. Never mutated — callers get fresh objects. */
export function packPolicies(): LenderPolicy[] {
  return PACK.map((p) => hydratePolicy(p as Partial<LenderPolicy> & { id: string; name: string }));
}

// ─── Field reviews ──────────────────────────────────────────────────────────

export type FieldReview = {
  lender_id: string;
  field_path: string;
  value: unknown;
  as_at: string;
  source_url: string | null;
  source_title: string | null;
  note: string | null;
  confirmed_by: string;
  confirmed_at: string;
};

/**
 * Fold broker confirmations over a researched policy.
 *
 * Each review replaces the fact at its path and stamps it `human_confirmed`,
 * which is the status `verify.ts` lets through without the plausibility and
 * confidence heuristics — a person with the document in front of them is a
 * better authority than a range check.
 */
export function applyFieldReviews(policy: LenderPolicy, reviews: FieldReview[]): LenderPolicy {
  if (reviews.length === 0) return policy;
  const next = { ...policy } as unknown as Record<string, unknown>;
  // A spread of `policy` is SHALLOW — `next.servicing` is still the caller's
  // object, so writing a confirmed fact into it would mutate the input. The
  // sections a review touches are therefore cloned before being written to.
  const cloned = new Set<string>();
  for (const review of reviews) {
    const [section, field] = review.field_path.split(".");
    if (!section || !field) continue;
    if (!cloned.has(section)) {
      const original = next[section];
      if (original && typeof original === "object") {
        next[section] = { ...(original as Record<string, unknown>) };
      }
      cloned.add(section);
    }
    const bag = next[section];
    if (!bag || typeof bag !== "object") continue;
    const fact: Fact<unknown> = {
      value: review.value ?? null,
      asAt: review.as_at,
      sourceUrl: review.source_url,
      sourceTitle: review.source_title,
      confidence: "high",
      status: "human_confirmed",
      note: review.note,
      updatedBy: review.confirmed_by,
      updatedAt: review.confirmed_at,
    };
    (bag as Record<string, unknown>)[field] = fact;
  }
  return next as unknown as LenderPolicy;
}

async function loadFieldReviews(lenderIds?: string[]): Promise<Map<string, FieldReview[]>> {
  const byLender = new Map<string, FieldReview[]>();
  try {
    let query = supabase
      .from("lender_policy_field_reviews")
      .select("lender_id, field_path, value, as_at, source_url, source_title, note, confirmed_by, confirmed_at")
      .is("superseded_at", null);
    if (lenderIds?.length) query = query.in("lender_id", lenderIds);
    const { data, error } = await query.limit(5000);
    if (error) throw error;
    for (const r of (data ?? []) as FieldReview[]) {
      const list = byLender.get(r.lender_id) ?? [];
      list.push(r);
      byLender.set(r.lender_id, list);
    }
  } catch {
    // No reviews table yet, or it's unreadable. Corrections are an enhancement
    // over the research pack, never a prerequisite for reading it.
  }
  return byLender;
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function loadPolicies(): Promise<LoadResult> {
  try {
    const { data, error } = await supabase
      .from("lender_policies")
      .select("*")
      .is("effective_to", null)
      .order("name", { ascending: true })
      .limit(1000);
    if (error) throw error;

    const rows = (data ?? []) as Row[];
    // An applied-but-empty table means the pack was never imported. Serving an
    // empty library there would look identical to "no lenders exist", so fall
    // back to the pack and say so.
    if (rows.length === 0) {
      return { policies: packPolicies(), source: "pack", migrationNeeded: false };
    }

    const reviews = await loadFieldReviews();
    const policies = rows.map((row) => {
      const policy = rowToPolicy(row);
      return applyFieldReviews(policy, reviews.get(row.id) ?? []);
    });
    return { policies, source: "supabase", migrationNeeded: false };
  } catch (error) {
    if (lenderPoliciesTableMissing(error)) {
      return {
        policies: packPolicies(),
        source: "pack",
        migrationNeeded: true,
        hint: MIGRATION_HINT,
      };
    }
    log.error("lender_policy.load_failed", { error: lenderErrMessage(error) });
    // Any other failure still leaves the broker with the pack rather than a
    // blank screen — the data is static and correct-as-committed either way.
    return { policies: packPolicies(), source: "pack", migrationNeeded: false };
  }
}

export async function loadPolicy(id: string): Promise<{ policy: LenderPolicy | null; source: PolicySource }> {
  try {
    const { data, error } = await supabase
      .from("lender_policies")
      .select("*")
      .eq("id", id)
      .is("effective_to", null)
      .limit(1);
    if (error) throw error;
    const row = (data ?? [])[0] as Row | undefined;
    if (row) {
      const reviews = await loadFieldReviews([id]);
      return { policy: applyFieldReviews(rowToPolicy(row), reviews.get(id) ?? []), source: "supabase" };
    }
  } catch (error) {
    if (!lenderPoliciesTableMissing(error)) {
      log.error("lender_policy.load_one_failed", { id, error: lenderErrMessage(error) });
    }
  }
  const fromPack = packPolicies().find((p) => p.id === id) ?? null;
  return { policy: fromPack, source: "pack" };
}

// ─── Writes ─────────────────────────────────────────────────────────────────

export type UpsertResult = {
  ok: boolean;
  written: number;
  migrationNeeded?: boolean;
  hint?: string;
  error?: string;
};

/**
 * Upsert policies, archiving whatever they replace.
 *
 * The previous `data` blob is copied into `lender_policy_versions` BEFORE the
 * overwrite so "what did this lender's policy say when I recommended them?"
 * stays answerable. Best-effort: a failure to archive is logged but does not
 * block the write — losing the new research to protect the history would be
 * the wrong trade.
 */
export async function upsertPolicies(
  policies: LenderPolicy[],
  opts: { changedBy: string; reason: string },
): Promise<UpsertResult> {
  if (policies.length === 0) return { ok: true, written: 0 };
  const today = brisbaneToday();

  try {
    const ids = policies.map((p) => p.id);
    const { data: existing } = await supabase
      .from("lender_policies")
      .select("id, data, version, effective_from, effective_to")
      .in("id", ids);

    if (existing && existing.length > 0) {
      const archive = existing.map((row) => ({
        lender_id: row.id as string,
        version: (row.version as number) ?? 1,
        data: row.data ?? {},
        effective_from: row.effective_from ?? null,
        effective_to: today,
        changed_by: opts.changedBy,
        change_reason: opts.reason,
      }));
      const { error: archiveError } = await supabase
        .from("lender_policy_versions")
        .insert(archive);
      if (archiveError) {
        log.error("lender_policy.archive_failed", { error: lenderErrMessage(archiveError) });
      }
    }

    const bumped = new Map((existing ?? []).map((r) => [r.id as string, (r.version as number) ?? 1]));
    const rows = policies.map((p) => {
      const prior = bumped.get(p.id);
      return policyToRow({ ...p, version: prior ? prior + 1 : p.version }, today);
    });

    const { error } = await supabase.from("lender_policies").upsert(rows, { onConflict: "id" });
    if (error) throw error;
    return { ok: true, written: rows.length };
  } catch (error) {
    if (lenderPoliciesTableMissing(error)) {
      return { ok: false, written: 0, migrationNeeded: true, hint: MIGRATION_HINT };
    }
    return { ok: false, written: 0, error: lenderErrMessage(error) };
  }
}
