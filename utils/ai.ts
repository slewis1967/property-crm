/**
 * Server-side wrapper around OpenRouter for adviser-facing AI features.
 *
 * Defaults: MODELS.smart (Claude Sonnet via OpenRouter) + reasoning at medium
 * effort. Bump `effort` to "high"/"max" per call site if quality matters more
 * than cost, or pass `thinking: false` to disable reasoning for trivial calls.
 *
 * All calls go through aiCall(); features pass their own system + user prompts.
 * Server-only (process.env.OPENROUTER_API_KEY). The public API (aiCall /
 * aiCallEnvelope / AICallOptions / AIEffort) is unchanged from the previous
 * Anthropic implementation, so existing callers need no edits.
 */
import { MODELS, orText, orErrorMessage, type AIEffort } from "./openrouter";

export type { AIEffort };

export type AICallOptions = {
  system: string;
  user: string;
  /** Cap on output tokens. Reasoning shares this budget — leave generous
   * headroom so the model has room to think AND respond. */
  maxTokens?: number;
  /** Lower = faster + cheaper. Default "medium". */
  effort?: AIEffort;
  /** Set false to disable reasoning for very simple calls. Default true. */
  thinking?: boolean;
};

export async function aiCall({
  system,
  user,
  maxTokens = 2000,
  effort = "medium",
  thinking = true,
}: AICallOptions): Promise<string> {
  try {
    return await orText({
      model: MODELS.smart,
      system,
      user,
      maxTokens,
      effort,
      thinking,
    });
  } catch (error) {
    throw new Error(orErrorMessage(error));
  }
}

/** Compact helper that catches errors and returns a {ok|error} envelope so
 * route handlers can return a clean JSON response without try/catch noise. */
export async function aiCallEnvelope(opts: AICallOptions): Promise<
  { ok: true; text: string } | { ok: false; error: string }
> {
  try {
    return { ok: true, text: await aiCall(opts) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "AI request failed" };
  }
}
