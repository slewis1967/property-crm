/**
 * One-time signing-token crypto for the e-signature flow.
 *
 * A signer is emailed a link `${origin}/sign/<raw-token>`. The RAW token is a
 * 256-bit random value, base64url-encoded — long enough that it can't be guessed
 * and safe to place in a URL path. We NEVER store the raw token: the database
 * holds only its SHA-256 hash (`token_hash`). To authenticate an incoming
 * request we hash the presented token and look the hash up. A database leak
 * therefore can't be replayed as a signing link — the attacker would have the
 * hashes, not the tokens.
 *
 * `hashToken` is deterministic (SHA-256, hex) so the same raw token always maps
 * to the same lookup key. `safeEqual` is a constant-time comparison used when we
 * compare two hashes, so token validity can't be probed with a timing side
 * channel. Pure + Node-crypto only, so it's unit-testable without a DB.
 */

import { randomBytes, createHash, timingSafeEqual } from "node:crypto";

export type NewToken = {
  /** The raw token — appears ONLY in the emailed link, never persisted. */
  raw: string;
  /** SHA-256 hex hash of `raw` — this is what the DB stores (token_hash). */
  hash: string;
};

/** 32 random bytes → a URL-safe base64url string (no padding). */
export function newToken(): NewToken {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

/** SHA-256 hex of a raw token. Deterministic — the DB lookup key. */
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/**
 * Constant-time string equality. Returns false (never throws) for length
 * mismatch or non-hex input, so it's safe to call on attacker-controlled data.
 * Used to compare two SHA-256 hex hashes without leaking timing information.
 */
export function safeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
