/**
 * Shared OpenRouter client + helpers for all server-side AI features.
 *
 * OpenRouter exposes an OpenAI-compatible Chat Completions API, so we talk to
 * it through the `openai` SDK with a custom baseURL. This replaces the previous
 * direct Anthropic SDK integration — the model still defaults to the Claude
 * family (routed via OpenRouter) so the carefully-tuned compliance / advisor
 * prompts behave as before, but the transport and billing now go through
 * OpenRouter and the model is swappable with one env var.
 *
 * Server-only: reads process.env.OPENROUTER_API_KEY.
 *
 * Model selection (override per deploy via env):
 *   OPENROUTER_MODEL_SMART  — advisor-facing text + document extraction
 *   OPENROUTER_MODEL_FAST   — voice loop, compliance, parse/research, CSV mapping
 * Verify exact slugs at https://openrouter.ai/models before changing.
 */
import OpenAI from "openai";

/**
 * Lazily-constructed OpenRouter client.
 *
 * IMPORTANT: do NOT construct the OpenAI client at module load.
 *
 * The `openai` SDK constructor THROWS ("The OPENAI_API_KEY environment variable
 * is missing or empty…") when no apiKey is supplied. This module is imported —
 * directly or transitively — by ~two dozen server modules including the
 * app/settings server page and every /api/ai/* route, so an eager singleton
 * meant a single missing/rotated OPENROUTER_API_KEY (Netlify env in prod) threw
 * at IMPORT time, failing the build's page-data collection and 500-ing routes
 * before any handler ran. A total outage from one absent key.
 *
 * Instead we mirror utils/supabase.ts: log loudly if the key is absent and build
 * a non-throwing client with a placeholder key. Construction is deferred to the
 * first `getOpenRouter()` call and memoised. When the key is missing the request
 * still goes out and OpenRouter returns 401, which orErrorMessage() maps to a
 * clear "OPENROUTER_API_KEY is missing or invalid" — so the failure surfaces at
 * call-time as a handled error, not a boot crash.
 */
let _openrouter: OpenAI | null = null;

export function getOpenRouter(): OpenAI {
  if (_openrouter) return _openrouter;

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error(
      "[openrouter] OPENROUTER_API_KEY is not set — AI features (voice, compliance, " +
        "deal-analyser, document extraction) will fail at call-time with a 401. " +
        "Set it in .env.local (dev) or the Netlify dashboard (prod). " +
        "Serving in degraded mode rather than crashing every route.",
    );
  }

  _openrouter = new OpenAI({
    // Placeholder keeps the constructor from throwing when the key is unset;
    // a bogus token yields a 401 at request time (mapped by orErrorMessage).
    apiKey: apiKey || "unconfigured",
    baseURL: "https://openrouter.ai/api/v1",
    // OpenRouter uses these for attribution / its app-ranking dashboard. Harmless
    // if the site URL isn't set — falls back to the production CRM origin.
    defaultHeaders: {
      "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL ?? "https://crm.nextkey.com.au",
      "X-Title": "NextKey Property CRM",
    },
  });
  return _openrouter;
}

export const MODELS = {
  /** Higher-quality model for advisor-facing text + document extraction. */
  smart: process.env.OPENROUTER_MODEL_SMART ?? "anthropic/claude-sonnet-4",
  /** Cheap/fast model for the voice loop, compliance, parsing, CSV mapping. */
  fast: process.env.OPENROUTER_MODEL_FAST ?? "anthropic/claude-haiku-4.5",
} as const;

export type AIEffort = "low" | "medium" | "high" | "xhigh" | "max";

/** Map our effort scale onto OpenRouter's reasoning.effort (low|medium|high). */
function reasoningEffort(effort: AIEffort): "low" | "medium" | "high" {
  if (effort === "low") return "low";
  if (effort === "medium") return "medium";
  return "high"; // high | xhigh | max all collapse to OpenRouter's "high"
}

/**
 * Append OpenRouter's ":online" suffix to enable built-in web search for any
 * model. Used by the suburb / investment-case / cost-research features that
 * previously relied on Anthropic's server-side web_search tool.
 */
export function withWebSearch(model: string): string {
  return model.endsWith(":online") ? model : `${model}:online`;
}

export type OrTextOptions = {
  /** System prompt. */
  system?: string;
  /** Convenience single-turn user message (mutually exclusive with `messages`). */
  user?: string;
  /** Full message array for multi-turn calls (overrides `system`/`user`). */
  messages?: OpenAI.Chat.Completions.ChatCompletionMessageParam[];
  /** Defaults to MODELS.fast. Pass MODELS.smart (or any slug) to override. */
  model?: string;
  /** Cap on output tokens. */
  maxTokens?: number;
  /** Reasoning effort. Omit `thinking:false` to disable reasoning entirely. */
  effort?: AIEffort;
  /** Set false to disable reasoning for trivial calls. Default true. */
  thinking?: boolean;
  /** Enable OpenRouter web search (`:online`). Default false. */
  web?: boolean;
};

/**
 * Low-level chat call returning the raw OpenRouter completion. Use when you
 * need tool calls or finish_reason; most callers want orText() instead.
 *
 * `reasoning`, `plugins`, and the `:online` model suffix are OpenRouter
 * extensions the openai SDK doesn't type — hence the `as any` on the request.
 */
export async function orChat(
  body: Record<string, unknown>,
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return getOpenRouter().chat.completions.create(body as any) as Promise<
    OpenAI.Chat.Completions.ChatCompletion
  >;
}

/**
 * Run a single chat completion and return the assistant's text. Replaces the
 * old Anthropic aiCall() internals; keeps the same effort/thinking knobs.
 */
export async function orText(opts: OrTextOptions): Promise<string> {
  const {
    system,
    user,
    messages,
    model = MODELS.fast,
    maxTokens = 2000,
    effort = "medium",
    thinking = true,
    web = false,
  } = opts;

  const msgs: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = messages
    ? messages
    : [
        ...(system ? [{ role: "system" as const, content: system }] : []),
        { role: "user" as const, content: user ?? "" },
      ];

  const body: Record<string, unknown> = {
    model: web ? withWebSearch(model) : model,
    messages: msgs,
    max_tokens: maxTokens,
  };
  if (thinking) body.reasoning = { effort: reasoningEffort(effort) };

  const completion = await orChat(body);
  const text = completion.choices?.[0]?.message?.content;
  if (typeof text === "string" && text.trim()) return text.trim();

  const reason = completion.choices?.[0]?.finish_reason ?? "unknown";
  throw new Error(`AI returned no text (finish_reason=${reason}). Try increasing maxTokens.`);
}

/** Normalise OpenRouter/OpenAI SDK errors into a short, human message. */
export function orErrorMessage(error: unknown): string {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 401) return "OPENROUTER_API_KEY is missing or invalid";
    if (error.status === 429) return "AI rate-limited — try again in a moment";
    return `AI request failed (${error.status}): ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
