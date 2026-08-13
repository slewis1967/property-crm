/**
 * Creating a single contact — the one definition.
 *
 * Until now the only way to add one person was a side effect of something else
 * (completing a compliance document, or a lead self-booking), so an advisor on
 * the phone with a new person had no way to get them into the CRM. The bulk CSV
 * importer was the only front door and it is not usable mid-call.
 *
 * `email` is the identity key. There is no unique index on `contacts.email`, so
 * the lookup tolerates duplicates rather than assuming they can't happen: it
 * takes the earliest matching row instead of erroring, because two people
 * sharing an email is a data-quality problem, not a reason to refuse a booking.
 *
 * Finding never overwrites an existing contact's fields. A half-filled form
 * typed under time pressure must not be able to blank out details captured
 * properly earlier.
 */
import { supabase } from "./supabase";

export type NewContactInput = {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  buyer_type?: string | null;
  preferred_state?: string | null;
  budget_max?: number | null;
  timeframe?: string | null;
  temperature?: string | null;
  source?: string | null;
  status?: string | null;
};

export type ContactResolution =
  | { ok: true; id: string; created: boolean }
  | { ok: false; error: string };

/** Lowercased + trimmed, or null when there's nothing usable. */
export function normaliseEmail(raw: string | null | undefined): string | null {
  const e = (raw ?? "").trim().toLowerCase();
  return e ? e : null;
}

/**
 * Deliberately permissive — this guards a CRM field, not an auth boundary. It
 * rejects the fat-finger cases (no @, no dot, stray spaces) and nothing more;
 * refusing an unusual-but-valid address mid-call is the worse failure.
 */
export function looksLikeEmail(raw: string | null | undefined): boolean {
  const e = normaliseEmail(raw);
  return !!e && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

/** First word of a full name — what the `first_name` column holds elsewhere. */
export function firstNameOf(fullName: string | null | undefined): string | null {
  const f = (fullName ?? "").trim().split(/\s+/)[0];
  return f || null;
}

/**
 * The column shape every contact writer uses. Mirrors the bulk importer's
 * mapping (`app/api/contacts/bulk-insert`), including the deliberate
 * `preferred_state` → `state` mirror, so a contact created here is
 * indistinguishable from an imported one.
 */
export function contactRecord(input: NewContactInput, nowIso: string) {
  const fullName = (input.full_name ?? "").trim() || null;
  return {
    full_name: fullName,
    name: fullName,
    first_name: firstNameOf(fullName),
    email: normaliseEmail(input.email),
    phone: input.phone?.trim() || null,
    buyer_type: input.buyer_type || null,
    preferred_state: input.preferred_state || null,
    state: input.preferred_state || null,
    budget_max: input.budget_max ?? null,
    timeframe: input.timeframe || null,
    temperature: input.temperature || "warm",
    source: input.source || "crm_manual",
    status: input.status || "new",
    created_at: nowIso,
    updated_at: nowIso,
  };
}

/**
 * Find a contact by email, or create one. Never throws — callers get a result
 * they can act on, because the two existing callers want opposite things: the
 * public booking route proceeds with an unlinked booking rather than fail,
 * while the CRM wants to tell the operator it didn't work.
 */
export async function findOrCreateContactByEmail(
  input: NewContactInput,
): Promise<ContactResolution> {
  const email = normaliseEmail(input.email);
  if (!email) return { ok: false, error: "An email address is required to create a contact." };

  try {
    // limit(1) rather than maybeSingle(): with no unique index, a duplicate
    // email would make maybeSingle() error and take the booking down with it.
    const { data: existing, error: findErr } = await supabase
      .from("contacts")
      .select("id")
      .eq("email", email)
      .order("created_at", { ascending: true })
      .limit(1);
    if (findErr) return { ok: false, error: findErr.message };
    const found = existing?.[0]?.id as string | undefined;
    if (found) return { ok: true, id: found, created: false };

    const { data: created, error: insErr } = await supabase
      .from("contacts")
      .insert(contactRecord({ ...input, email }, new Date().toISOString()))
      .select("id")
      .single();
    if (insErr) return { ok: false, error: insErr.message };
    const id = (created as { id: string } | null)?.id;
    if (!id) return { ok: false, error: "Contact was not created." };
    return { ok: true, id, created: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Contact lookup failed." };
  }
}
