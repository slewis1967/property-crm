/**
 * Introducer onboarding — database access.
 *
 * Server-only (imports the service-role Supabase client). The pure state
 * machine lives in ./introducer-onboarding; this file is only the reads and
 * writes.
 *
 * THE LOOKUP RULE. An applicant is identified by a raw token in a URL. We never
 * store that token — only its SHA-256 hash — so a database leak yields hashes
 * and not working links, exactly as the portal login and the e-signature flow
 * do. Every lookup therefore hashes what was presented and matches on the hash;
 * there is no query anywhere that takes a raw token.
 */

import { supabase } from "./supabase";
import { newToken, hashToken } from "./sign-token";
import type { OnboardingState } from "./introducer-onboarding";
import {
  introducerEntityColumnMissing,
  type BusinessDetails,
  type EntityType,
} from "./introducer-entity";

export type Application = {
  id: string;
  introducer_id: string | null;
  legal_name: string;
  email: string;
  firm_name: string | null;
  abn: string | null;
  phone: string | null;
  tier: "t1" | "t2";
  agreement_variant: "standard" | "paid";
  state: OnboardingState;
  token_expires_at: string;
  id_check_provider: string | null;
  id_check_reference: string | null;
  id_check_result: string | null;
  id_checked_at: string | null;
  id_checked_by: string | null;
  exam_score: number | null;
  exam_total: number | null;
  exam_passed_at: string | null;
  accreditation_no: string | null;
  certificate_path: string | null;
  /** Absent until 20260819_introducer_accreditation_expiry.sql runs. */
  certificate_issued_at?: string | null;
  accreditation_expires_at?: string | null;
  smsf_competency_expires_at?: string | null;
  /** Applicant-supplied. Absent until 20260814_introducer_entity_details.sql runs. */
  acn?: string | null;
  entity_type?: EntityType | null;
  registered_address?: string | null;
  business_details_at?: string | null;
  created_at: string;
  updated_at: string;
  withdrawn_reason: string | null;
};

const BASE_COLUMNS =
  "id, introducer_id, legal_name, email, firm_name, abn, phone, state, " +
  "tier, agreement_variant, token_expires_at, id_check_provider, id_check_reference, id_check_result, " +
  "id_checked_at, id_checked_by, exam_score, exam_total, " +
  "exam_passed_at, accreditation_no, certificate_path, created_at, updated_at, withdrawn_reason";

/** Added by `20260814_introducer_entity_details.sql`. Kept separate so a read
 *  can fall back while that SQL is pending. */
const ENTITY_COLUMNS = "acn, entity_type, registered_address, business_details_at";

/** Added by `20260813b_...` and `20260819_introducer_accreditation_expiry.sql`.
 *  Only the certificate path needs them, and it degrades to deriving the
 *  expiries from today if they are not there yet. */
const ACCREDITATION_COLUMNS =
  "certificate_issued_at, accreditation_expires_at, smsf_competency_expires_at";

/** Widest first. Each rung drops the most recent migration's columns, so a read
 *  keeps working against a database that is one or two migrations behind the
 *  deploy — the house rule being that code ships before the SQL is run. */
const COLUMN_LADDER = [
  `${BASE_COLUMNS}, ${ENTITY_COLUMNS}, ${ACCREDITATION_COLUMNS}`,
  `${BASE_COLUMNS}, ${ENTITY_COLUMNS}`,
  BASE_COLUMNS,
];

const COLUMNS = COLUMN_LADDER[0];

/** Why a token did not resolve. The page words each of these differently — a
 *  candidate whose link expired needs a different sentence to one who typoed. */
export type LookupFailure = "not_found" | "expired";

/**
 * Select once with the entity columns, and again without them if that
 * migration is still pending.
 *
 * The house rule is that code ships before the SQL is run, and onboarding is
 * the worst place to break it: an applicant holding a valid link would be told
 * "we can't open this" for a reason that has nothing to do with them.
 */
async function selectApplication<T>(
  run: (columns: string) => PromiseLike<{ data: T; error: unknown }>,
): Promise<{ data: T; error: unknown }> {
  let last: { data: T; error: unknown } | null = null;
  for (const columns of COLUMN_LADDER) {
    last = await run(columns);
    if (!last.error || !introducerEntityColumnMissing(last.error)) return last;
  }
  return last!;
}

export async function findByToken(
  rawToken: string,
): Promise<{ ok: true; application: Application } | { ok: false; reason: LookupFailure }> {
  const { data, error } = await selectApplication((columns) =>
    supabase
      .from("introducer_applications")
      .select(columns)
      .eq("token_hash", hashToken(rawToken))
      .maybeSingle(),
  );

  if (error) throw error;
  if (!data) return { ok: false, reason: "not_found" };

  const app = data as unknown as Application;
  if (new Date(app.token_expires_at).getTime() < Date.now()) {
    // Deliberately still "expired" for a withdrawn application: we do not tell
    // an unknown caller that a particular person was stopped mid-pipeline.
    return { ok: false, reason: "expired" };
  }
  return { ok: true, application: app };
}

export async function findById(id: string): Promise<Application | null> {
  const { data, error } = await selectApplication((columns) =>
    supabase.from("introducer_applications").select(columns).eq("id", id).maybeSingle(),
  );
  if (error) throw error;
  return (data as unknown as Application) ?? null;
}

/**
 * Record the applicant's own business details.
 *
 * Applicant-writable, unlike everything else on this row — see the migration
 * for why that does not undercut "identity is issued, never typed". Refuses
 * once the agreement has gone out, because the agreement snapshots these and a
 * document that quietly disagrees with the record behind it is worse than one
 * that is merely out of date.
 */
export async function saveBusinessDetails(
  id: string,
  details: BusinessDetails,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await supabase
    .from("introducer_applications")
    .update({
      entity_type: details.entity_type,
      firm_name: details.firm_name,
      abn: details.abn,
      acn: details.acn || null,
      registered_address: details.registered_address,
      business_details_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    if (introducerEntityColumnMissing(error)) {
      return {
        ok: false,
        error:
          "Business details are not switched on yet — run migrations/20260814_introducer_entity_details.sql.",
      };
    }
    throw error;
  }
  return { ok: true };
}

export async function listApplications(): Promise<Application[]> {
  const { data, error } = await selectApplication((columns) =>
    supabase
      .from("introducer_applications")
      .select(columns)
      .order("created_at", { ascending: false }),
  );
  if (error) throw error;
  return (data as unknown as Application[]) ?? [];
}

export type NewApplication = {
  legalName: string;
  email: string;
  firmName?: string | null;
  abn?: string | null;
  phone?: string | null;
  notes?: string | null;
  createdBy: string;
  tier?: "t1" | "t2";
  variant?: "standard" | "paid";
  /** How long the onboarding link stays good for. */
  days?: number;
};

/**
 * Start an application and return the RAW token exactly once. It is never
 * readable again — if the applicant loses the link a fresh one is minted, which
 * is a deliberate cost so that "resend" is a recorded action rather than a
 * lookup of something we should not be holding.
 */
export async function createApplication(
  input: NewApplication,
): Promise<{ application: Application; rawToken: string }> {
  const token = newToken();
  const expires = new Date(Date.now() + (input.days ?? 30) * 86_400_000).toISOString();

  const row = {
    legal_name: input.legalName.trim(),
    email: input.email.trim().toLowerCase(),
    firm_name: input.firmName?.trim() || null,
    abn: input.abn?.trim() || null,
    phone: input.phone?.trim() || null,
    notes: input.notes?.trim() || null,
    tier: input.tier === "t2" ? "t2" : "t1",
    agreement_variant: input.variant === "paid" ? "paid" : "standard",
    state: "invited",
    token_hash: token.hash,
    token_expires_at: expires,
    created_by: input.createdBy,
  };

  // BASE_COLUMNS, not the fallback wrapper: retrying an INSERT is not the same
  // as retrying a SELECT, and a new application is nothing to gamble on. The
  // entity columns are null on a row this new regardless.
  const { data, error } = await supabase
    .from("introducer_applications")
    .insert(row)
    .select(BASE_COLUMNS)
    .single();

  if (error) throw error;
  return { application: data as unknown as Application, rawToken: token.raw };
}

/** Mint a new link for an existing application, invalidating the old one. */
export async function reissueToken(
  id: string,
  days = 30,
): Promise<string> {
  const token = newToken();
  const { error } = await supabase
    .from("introducer_applications")
    .update({
      token_hash: token.hash,
      token_expires_at: new Date(Date.now() + days * 86_400_000).toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
  return token.raw;
}

export async function setState(
  id: string,
  state: OnboardingState,
  extra: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await supabase
    .from("introducer_applications")
    .update({ state, ...extra })
    .eq("id", id);
  if (error) throw error;
}

/**
 * Record one exam attempt.
 *
 * EVERY attempt is written, pass or fail, because the accreditation register
 * has to be able to answer "how many goes did this take" — and because an
 * introducer who passed on the sixth attempt having failed five red-line
 * questions is a different risk to one who passed first time.
 *
 * The attempts live in `introducer_events`, which is append-only at the database
 * level, rather than in a column that the next attempt overwrites. The
 * application row keeps only the passing result, for querying.
 *
 * Idempotent on paperId: the webhook can be delivered more than once, and a
 * duplicate delivery must not add a second attempt or re-fire the pass.
 */
export async function recordExamAttempt(
  applicationId: string,
  attempt: {
    paperId: string;
    tier: string;
    score: number;
    total: number;
    passed: boolean;
    missedModules?: string[];
    redLineModules?: string[];
    itemIds?: string[];
    markedAt?: string;
    integrity?: unknown;
    /** The sitting ran with the course's waiting periods switched off. */
    waived?: boolean;
  },
): Promise<{ duplicate: boolean }> {
  // limit(1) rather than maybeSingle() alone: if a duplicate ever did slip
  // through, maybeSingle() would throw on the second delivery and turn a
  // harmless repeat into a 500. We only need to know whether any exists.
  const { data: seen } = await supabase
    .from("introducer_events")
    .select("id")
    .eq("action", "exam_attempt")
    .contains("detail", { application_id: applicationId, paper_id: attempt.paperId })
    .limit(1);

  if (seen && seen.length > 0) return { duplicate: true };

  await logOnboardingEvent(applicationId, "system", null, "exam_attempt", {
    paper_id: attempt.paperId,
    tier: attempt.tier,
    score: attempt.score,
    total: attempt.total,
    passed: attempt.passed,
    missed_modules: attempt.missedModules ?? [],
    red_line_modules: attempt.redLineModules ?? [],
    item_ids: attempt.itemIds ?? [],
    marked_at: attempt.markedAt ?? new Date().toISOString(),
    integrity: attempt.integrity ?? null,
    waiting_periods_waived: attempt.waived === true,
  });

  return { duplicate: false };
}

/**
 * Allocate (or re-read) this application's accreditation number.
 *
 * Delegates to a SQL function because the allocation must be atomic and
 * idempotent together: the webhook can be delivered twice, and two deliveries
 * racing must not burn two numbers. See allocate_accreditation_number in the
 * migration — it locks the row, and returns the existing number unchanged if
 * one has already been issued.
 */
export async function allocateAccreditationNumber(applicationId: string): Promise<string> {
  const { data, error } = await supabase.rpc("allocate_accreditation_number", {
    p_application_id: applicationId,
  });
  if (error) throw error;
  return String(data);
}

/**
 * Append to the shared introducer audit trail. That table is append-only at the
 * database level, so onboarding events sit alongside referral events in one
 * chronology rather than in a second log nobody thinks to read.
 */
export async function logOnboardingEvent(
  applicationId: string,
  actorType: "staff" | "super_admin" | "system" | "applicant",
  actor: string | null,
  action: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await supabase.from("introducer_events").insert({
    client_id: null,
    introducer_id: null,
    actor_type: actorType === "applicant" ? "introducer" : actorType,
    actor,
    action,
    detail: { ...detail, application_id: applicationId },
  });
  // An audit write must never take down the action it is recording, but it must
  // be loud — a silent catch here is how audit trails quietly stop working.
  if (error) console.error("[onboarding] audit write failed", action, error.message);
}
