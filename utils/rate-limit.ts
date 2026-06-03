/**
 * In-memory rate limiter for API routes.
 *
 * Per-user sliding-window counter. Stays in-process — fine for Netlify's
 * single-instance-per-function model. For multi-region or long-tail
 * fairness, swap the Map for a Redis client.
 *
 * The intent here is cost-control, not security: we don't want a single
 * accidental loop to drain the Anthropic/Gemini budget overnight.
 * Adversarial bypasses are fine because the endpoints are also protected
 * by Cloudflare Access — a real attacker has already failed at the edge.
 *
 * Usage:
 *   const limited = enforceRateLimit(req, { windowMs: 60_000, max: 20 });
 *   if (limited) return limited;
 *   // ... expensive AI call ...
 */

import { NextResponse } from "next/server";

interface Bucket {
  count: number;
  resetAt: number;
}

const STORE = new Map<string, Bucket>();

// Periodic GC of expired buckets — keeps the Map from growing forever
// in long-running functions. Netlify functions have a 15-min hard limit
// so this is a 15-min sweep; cheap.
if (typeof setInterval !== "undefined") {
  const GC_MS = 5 * 60_000;
  setInterval(() => {
    const now = Date.now();
    for (const [k, b] of STORE) {
      if (b.resetAt < now) STORE.delete(k);
    }
  }, GC_MS).unref?.();
}

export interface RateLimitOptions {
  /** Window length in milliseconds (e.g. 60_000 = 1 min). */
  windowMs: number;
  /** Max requests per window per identity. */
  max: number;
  /** Custom key extractor. Defaults to the CF Access email header. */
  keyFn?: (req: Request) => string | null;
}

export function enforceRateLimit(
  req: Request,
  opts: RateLimitOptions,
): NextResponse | null {
  const identity =
    opts.keyFn?.(req) ??
    req.headers.get("cf-access-authenticated-user-email") ??
    "anon";
  const key = `${identity}:${req.url}`;
  const now = Date.now();

  let bucket = STORE.get(key);
  if (!bucket || bucket.resetAt < now) {
    bucket = { count: 0, resetAt: now + opts.windowMs };
    STORE.set(key, bucket);
  }
  bucket.count += 1;

  if (bucket.count > opts.max) {
    const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
    return NextResponse.json(
      {
        ok: false,
        error: "rate limit exceeded",
        retry_after_seconds: retryAfter,
      },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(opts.max),
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }
  return null;
}
