/**
 * Sending identities for the CRM email composer.
 *
 * The CRM can send transactional mail from more than one verified Brevo
 * sender. Each identity is a `from` envelope (email + display name) plus a
 * human label for the composer's "From" dropdown.
 *
 *   - `nextkey`     — the historical default. from_email/from_name come from
 *                     BREVO_SENDER_EMAIL / BREVO_SENDER_NAME (the same env the
 *                     rest of the app already reads), so behaviour is unchanged
 *                     when no identity is chosen.
 *   - `springboard` — the Springboard Homes brand. from_email/from_name come
 *                     from SPRINGBOARD_SENDER_EMAIL / SPRINGBOARD_SENDER_NAME.
 *                     hello@springboardhomes.com.au is already a verified Brevo
 *                     sender (it powers the Springboard autoresponder), so no
 *                     new Brevo setup is required.
 *
 * The `from_email` / `from_name` resolution reads process.env and therefore
 * only yields real values on the server. Client code should treat identities
 * as opaque keys + labels; the send route resolves the envelope server-side.
 */

export const MAIL_IDENTITY_KEYS = ["nextkey", "springboard"] as const;
export type MailIdentityKey = (typeof MAIL_IDENTITY_KEYS)[number];

export const DEFAULT_IDENTITY_KEY: MailIdentityKey = "nextkey";

export type MailIdentity = {
  key: MailIdentityKey;
  /** Human label shown in the composer "From" dropdown. */
  label: string;
  /** Envelope from-address (resolved from env on the server). */
  fromEmail: string;
  /** Envelope from display-name (resolved from env on the server). */
  fromName: string;
};

/** Static labels — safe to reference on the client (no env access). */
export const MAIL_IDENTITY_LABELS: Record<MailIdentityKey, string> = {
  nextkey: "NextKey Property Strategists",
  springboard: "Springboard Homes",
};

/** Narrow an arbitrary value to a known identity key, else null. */
export function isMailIdentityKey(value: unknown): value is MailIdentityKey {
  return typeof value === "string" && (MAIL_IDENTITY_KEYS as readonly string[]).includes(value);
}

/**
 * Resolve an identity by key, falling back to the default (`nextkey`) for
 * unknown, null, or empty input. Reads env for the from-envelope, so call
 * this on the server (route handlers). The env fallbacks mirror the app's
 * existing defaults so `nextkey` preserves current behaviour exactly.
 */
export function resolveIdentity(key: string | null | undefined): MailIdentity {
  if (key === "springboard") {
    return {
      key: "springboard",
      label: MAIL_IDENTITY_LABELS.springboard,
      fromEmail: process.env.SPRINGBOARD_SENDER_EMAIL ?? "hello@springboardhomes.com.au",
      fromName: process.env.SPRINGBOARD_SENDER_NAME ?? "Springboard Homes",
    };
  }
  // Default identity (nextkey) — also the fallback for any unknown/empty key.
  return {
    key: "nextkey",
    label: MAIL_IDENTITY_LABELS.nextkey,
    fromEmail: process.env.BREVO_SENDER_EMAIL ?? "hello@nextkey.com.au",
    fromName: process.env.BREVO_SENDER_NAME ?? "NextKey Property Strategists",
  };
}
