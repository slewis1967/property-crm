/**
 * Server-side wrapper around the Anthropic API for adviser-facing AI features.
 *
 * Defaults: MODELS.smart at medium effort. Bump `effort` to "high"/"max" per call
 * site if quality matters more than cost, or pass `thinking: false` to run at low
 * effort for trivial calls.
 *
 * All calls go through aiCall(); features pass their own system + user prompts.
 * Server-only (process.env.ANTHROPIC_API_KEY).
 */
import { MODELS, aiText, aiErrorMessage, type AIEffort } from "./anthropic";

export type { AIEffort };

export type AICallOptions = {
  system: string;
  user: string;
  /** Length of the expected answer, in tokens. Room for thinking is added. */
  maxTokens?: number;
  /** Lower = faster + cheaper. Default "medium". */
  effort?: AIEffort;
  /** Set false to run at low effort for very simple calls. Default true. */
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
    return await aiText({
      model: MODELS.smart,
      system,
      user,
      maxTokens,
      effort,
      thinking,
    });
  } catch (error) {
    throw new Error(aiErrorMessage(error));
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
