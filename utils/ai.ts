/**
 * Server-side wrapper around the Anthropic SDK for adviser-facing AI features.
 *
 * Defaults: claude-opus-4-7 + adaptive thinking + medium effort. Adaptive
 * thinking lets Claude decide how much to reason per request; medium is a
 * good cost/quality balance for advisor-facing text — bump to "high" or "max"
 * per call site if quality matters more than cost.
 *
 * All calls go through aiCall(); features pass their own system + user
 * prompts. Server-only (process.env.ANTHROPIC_API_KEY).
 */
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export type AIEffort = "low" | "medium" | "high" | "xhigh" | "max";

export type AICallOptions = {
  system: string;
  user: string;
  /** Cap on output tokens. Adaptive thinking shares this budget — leave
   * generous headroom so the model has room to think AND respond. */
  maxTokens?: number;
  /** Lower = faster + cheaper. Default "medium". */
  effort?: AIEffort;
  /** Set false to disable thinking for very simple calls. Default true. */
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
    const response = await client.messages.create({
      model: "claude-opus-4-7",
      max_tokens: maxTokens,
      ...(thinking ? { thinking: { type: "adaptive" as const } } : {}),
      output_config: { effort },
      system,
      messages: [{ role: "user", content: user }],
    });

    for (const block of response.content) {
      if (block.type === "text") return block.text.trim();
    }
    return "";
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) {
      throw new Error("ANTHROPIC_API_KEY is missing or invalid");
    }
    if (error instanceof Anthropic.RateLimitError) {
      throw new Error("AI rate-limited — try again in a moment");
    }
    if (error instanceof Anthropic.APIError) {
      throw new Error(`AI request failed (${error.status}): ${error.message}`);
    }
    throw error;
  }
}

/** Compact helper that catches errors and returns a {ok|error} envelope so
 * route handlers can return a clean JSON response without try/catch noise. */
export async function aiCallEnvelope(opts: AICallOptions): Promise<
  { ok: true; text: string } | { ok: false; error: string }
> {
  try {
    return { ok: true, text: await aiCall(opts) };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "AI request failed" };
  }
}
