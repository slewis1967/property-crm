/**
 * Pre-configured rate limit presets for the AI endpoints.
 *
 * Each call costs Anthropic / Gemini tokens — a runaway tab or a loop
 * could burn the budget. The limits here are generous for normal use
 * (operator clicking around the UI, AI features invoked per page render)
 * but tight enough that a single bad script can't drain the account.
 */
import { enforceRateLimit, type RateLimitOptions } from "./rate-limit";
import { NextResponse } from "next/server";

/** 30 calls / minute per user — for most AI features. */
export const aiDefault: RateLimitOptions = { windowMs: 60_000, max: 30 };

/** 10 calls / minute — for expensive generation (email-draft, property-pitch, report). */
export const aiExpensive: RateLimitOptions = { windowMs: 60_000, max: 10 };

/** 5 calls / minute — for document extraction (PDFs can be long). */
export const aiExtract: RateLimitOptions = { windowMs: 60_000, max: 5 };

/**
 * Apply a limit; returns a NextResponse to return early, or null to continue.
 *   const limit = applyAiRateLimit(req, aiExpensive);
 *   if (limit) return limit;
 */
export function applyAiRateLimit(
  req: Request,
  opts: RateLimitOptions,
): NextResponse | null {
  return enforceRateLimit(req, opts);
}
