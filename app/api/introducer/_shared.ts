/**
 * Shared helpers for the PUBLIC introducer portal API (app/api/introducer/*).
 * Not a route (underscore-prefixed).
 *
 * SEGREGATION IS ENFORCED HERE, ONCE. Route handlers never build their own
 * client query — they call `loadOwnClient`, which resolves the session first and
 * filters on the introducer id from that session. There is deliberately no
 * helper that fetches an introducer_clients row by id alone, so "forgot the
 * tenant filter" is not a mistake a future route can make in this directory.
 *
 * The rep-side routes that review, accept and unlock referrals live at
 * /api/admin/introducers/* instead, so they keep their Cloudflare Access auth
 * header — the same separation /api/sign vs /api/signature-requests had to make.
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { supabase } from "../../../utils/supabase";
import {
  resolveSession,
  sessionCookieName,
  type IntroducerIdentity,
} from "../../../utils/introducer-auth";
import type { ActiveGrant, OpenInfoRequest } from "../../../utils/introducer";

export type { IntroducerIdentity };

/** Columns the portal is allowed to read back. Mirrors toPortalView's whitelist. */
const CLIENT_COLUMNS =
  "id,client_ref,introducer_id,submitted_by,first_name,last_name,email,phone,dob,state,suburb,postcode," +
  "applicant2_first_name,applicant2_last_name,applicant2_email,applicant2_phone," +
  "employment_status,income_band,deposit_band,purchase_intent,timeframe,buying_in,notes," +
  "status,stage,message_to_introducer,submitted_at,consent_confirmed_at,created_at,updated_at";

/**
 * Resolve the signed-in introducer, or return the 401 the caller should return.
 *
 * Usage mirrors requireAuth() in utils/cf-access.ts:
 *   const auth = await requireIntroducer();
 *   if (auth instanceof NextResponse) return auth;
 */
export async function requireIntroducer(): Promise<IntroducerIdentity | NextResponse> {
  const jar = await cookies();
  const raw = jar.get(sessionCookieName())?.value ?? null;
  const identity = await resolveSession(raw);
  if (!identity) {
    return NextResponse.json(
      { ok: false, error: "Please sign in again.", code: "signed_out" },
      { status: 401 },
    );
  }
  return identity;
}

export type OwnClient = Record<string, unknown> & {
  id: string;
  introducer_id: string;
  status: string;
};

/**
 * Load one referral belonging to THIS introducer.
 *
 * Returns null for "not yours" and for "doesn't exist" alike — a distinct
 * "forbidden" would confirm that a given id exists in someone else's book.
 */
export async function loadOwnClient(
  identity: IntroducerIdentity,
  clientId: string,
): Promise<OwnClient | null> {
  if (!clientId || typeof clientId !== "string") return null;
  const { data, error } = await supabase
    .from("introducer_clients")
    .select(CLIENT_COLUMNS)
    .eq("id", clientId)
    .eq("introducer_id", identity.introducerId)
    .maybeSingle();
  if (error || !data) return null;
  // Double cast: the Supabase client can't infer a row shape from a select
  // string this long, so it falls back to a union that includes its error type.
  return data as unknown as OwnClient;
}

/** Every referral belonging to this introducer, newest activity first. */
export async function listOwnClients(identity: IntroducerIdentity) {
  const { data, error } = await supabase
    .from("introducer_clients")
    .select(CLIENT_COLUMNS)
    .eq("introducer_id", identity.introducerId)
    .order("updated_at", { ascending: false })
    .limit(500);
  if (error) return [];
  return (data ?? []) as unknown as OwnClient[];
}

/** The most recent usable unlock grant for a referral, if any. */
export async function activeGrantFor(clientId: string): Promise<ActiveGrant | null> {
  const { data, error } = await supabase
    .from("introducer_unlock_grants")
    .select("id,scope,fields,expires_at,consumed_at,revoked_at")
    .eq("client_id", clientId)
    .is("consumed_at", null)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as ActiveGrant;
}

/** Open "we need more from you" requests on a referral. */
export async function openInfoRequests(clientId: string): Promise<OpenInfoRequest[]> {
  const { data, error } = await supabase
    .from("introducer_info_requests")
    .select("id,fields,documents,status,message,due_at,created_at")
    .eq("client_id", clientId)
    .eq("status", "open")
    .order("created_at", { ascending: true });
  if (error) return [];
  return (data ?? []) as OpenInfoRequest[];
}

/**
 * Write an audit event. Best-effort by design: a failure to log must not fail
 * the user's action, but it IS logged to the platform log so a silently
 * unauditable period is visible rather than invisible.
 */
export async function logIntroducerEvent(entry: {
  clientId?: string | null;
  introducerId?: string | null;
  actorType: "introducer" | "staff" | "super_admin" | "system";
  actor: string;
  action: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await supabase.from("introducer_events").insert({
    client_id: entry.clientId ?? null,
    introducer_id: entry.introducerId ?? null,
    actor_type: entry.actorType,
    actor: entry.actor,
    action: entry.action,
    detail: entry.detail ?? {},
  });
  if (error) {
    console.error("[introducer] audit write failed", {
      action: entry.action,
      client_id: entry.clientId,
      error: error.message,
    });
  }
}

/** Parse a JSON body, or return the 400 the caller should return. */
export async function readJson(req: Request): Promise<Record<string, unknown> | NextResponse> {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") throw new Error("not an object");
    return body as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
}
