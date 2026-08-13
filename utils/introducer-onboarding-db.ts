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

export type Application = {
  id: string;
  introducer_id: string | null;
  legal_name: string;
  email: string;
  firm_name: string | null;
  abn: string | null;
  phone: string | null;
  tier: "t1";
  state: OnboardingState;
  token_expires_at: string;
  id_check_result: string | null;
  id_checked_at: string | null;
  exam_score: number | null;
  exam_total: number | null;
  exam_passed_at: string | null;
  accreditation_no: string | null;
  certificate_path: string | null;
  created_at: string;
  updated_at: string;
  withdrawn_reason: string | null;
};

const COLUMNS =
  "id, introducer_id, legal_name, email, firm_name, abn, phone, tier, state, " +
  "token_expires_at, id_check_result, id_checked_at, exam_score, exam_total, " +
  "exam_passed_at, accreditation_no, certificate_path, created_at, updated_at, withdrawn_reason";

/** Why a token did not resolve. The page words each of these differently — a
 *  candidate whose link expired needs a different sentence to one who typoed. */
export type LookupFailure = "not_found" | "expired";

export async function findByToken(
  rawToken: string,
): Promise<{ ok: true; application: Application } | { ok: false; reason: LookupFailure }> {
  const { data, error } = await supabase
    .from("introducer_applications")
    .select(COLUMNS)
    .eq("token_hash", hashToken(rawToken))
    .maybeSingle();

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
  const { data, error } = await supabase
    .from("introducer_applications")
    .select(COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as Application) ?? null;
}

export async function listApplications(): Promise<Application[]> {
  const { data, error } = await supabase
    .from("introducer_applications")
    .select(COLUMNS)
    .order("created_at", { ascending: false });
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

  const { data, error } = await supabase
    .from("introducer_applications")
    .insert({
      legal_name: input.legalName.trim(),
      email: input.email.trim().toLowerCase(),
      firm_name: input.firmName?.trim() || null,
      abn: input.abn?.trim() || null,
      phone: input.phone?.trim() || null,
      notes: input.notes?.trim() || null,
      tier: "t1",
      state: "invited",
      token_hash: token.hash,
      token_expires_at: expires,
      created_by: input.createdBy,
    })
    .select(COLUMNS)
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
