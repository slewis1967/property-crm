/**
 * Server-issued broadcast-review token.
 *
 * The compliance review on /api/broadcast used to be skippable with a raw
 * client-supplied `acknowledge_violations: true` boolean — i.e. an operator
 * (or anything that reached the route) could send bulk email to every
 * contact without the AU-compliance review (Spam Act / ACL / NCCP) ever
 * running. A boolean is not an authorisation.
 *
 * Instead: when Phase 1 runs and flags violations (or the review service is
 * down), the server issues a short-lived HMAC token that binds:
 *   - the EXACT content that was reviewed (sha256 of subject+html+text)
 *   - the kind of override it authorises ("v" = violations, "o" = outage)
 *   - the operator it was issued to (CF-Access identity)
 *   - an expiry
 *
 * Phase 2 only proceeds on a clean review OR a valid token whose content
 * hash still matches the submitted copy and whose operator matches the
 * caller. Editing the copy after review invalidates the token (hash
 * mismatch) and forces a re-review. A forged `acknowledge_violations`
 * with no token just triggers a real review — it can no longer skip it.
 */
import { createHmac, createHash, timingSafeEqual } from "crypto";

// Falls back to the service key (always set server-side) so this works
// without new env configuration. Set BROADCAST_REVIEW_SECRET to rotate
// independently of the Supabase key.
const SECRET =
  process.env.BROADCAST_REVIEW_SECRET ??
  process.env.SUPABASE_SERVICE_KEY ??
  "";

const TTL_MS = 15 * 60 * 1000; // 15 min — long enough to read violations + decide.

export type ReviewKind = "v" | "o"; // violations | outage

interface TokenPayload {
  k: ReviewKind;
  h: string; // content hash
  op: string; // operator email
  exp: number; // epoch ms
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Stable hash of the exact reviewed copy, including the brand it was reviewed as.
 *
 * Brand is part of the bound content, not metadata beside it. Without it an
 * operator could review copy as Springboard — under Springboard's regulatory
 * identity, with Springboard's assumed facts — take the resulting override
 * token, and send the same words as NextKey. That is precisely the brand-firewall
 * breach this is meant to stop.
 *
 * Omitting `brand`, or passing "nextkey", hashes exactly as before, so tokens
 * already in flight and the existing tests are unaffected.
 */
export function contentHash(
  subject: string,
  htmlBody: string,
  textBody: string,
  brand?: string | null,
): string {
  const base = `${subject}\n${htmlBody}\n${textBody}`;
  return createHash("sha256")
    .update(brand && brand !== "nextkey" ? `${base}\n@${brand}` : base)
    .digest("hex");
}

export function issueReviewToken(
  kind: ReviewKind,
  hash: string,
  operator: string,
): string {
  const payload: TokenPayload = {
    k: kind,
    h: hash,
    op: operator,
    exp: Date.now() + TTL_MS,
  };
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(createHmac("sha256", SECRET).update(body).digest());
  return `${body}.${sig}`;
}

export type VerifyResult =
  | { ok: true; kind: ReviewKind }
  | { ok: false; reason: string };

/**
 * Verify a token against the copy + operator being submitted now.
 * Any tamper, expiry, operator mismatch, or content edit fails closed.
 */
export function verifyReviewToken(
  token: string | undefined | null,
  expectedHash: string,
  operator: string,
): VerifyResult {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return { ok: false, reason: "missing token" };
  }
  const [body, sig] = token.split(".");
  const expectedSig = b64url(createHmac("sha256", SECRET).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "bad signature" };
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
  } catch {
    return { ok: false, reason: "malformed payload" };
  }

  if (Date.now() > payload.exp) return { ok: false, reason: "token expired — re-run review" };
  if (payload.op !== operator) return { ok: false, reason: "token issued to a different operator" };
  if (payload.h !== expectedHash) {
    return { ok: false, reason: "copy changed since review — re-run review" };
  }
  return { ok: true, kind: payload.k };
}
