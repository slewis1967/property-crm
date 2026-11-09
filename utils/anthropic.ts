/**
 * Shared Anthropic client + helpers for all server-side AI features.
 *
 * Server-only: reads process.env.ANTHROPIC_API_KEY.
 *
 * Model selection (override per deploy via env, current-generation models only —
 * effort and adaptive thinking are assumed):
 *   ANTHROPIC_MODEL_SMART    — advisor-facing text, planning, lender research
 *   ANTHROPIC_MODEL_FAST     — voice loop, compliance, parsing, CSV mapping
 *   ANTHROPIC_MODEL_EXTRACT  — uploaded-document (PDF/image) reading
 */
import Anthropic from "@anthropic-ai/sdk";

/**
 * Lazily-constructed client.
 *
 * IMPORTANT: do NOT construct or call anything at module load. This module is
 * imported by ~two dozen server modules including the settings page and every
 * /api/ai/* route, so an AI key problem must surface at call-time as a handled
 * error, never as a boot or build failure. With the key unset the placeholder
 * gets a 401 from the API, which aiErrorMessage() maps to a safe message.
 */
let _client: Anthropic | null = null;

export function getAnthropic(): Anthropic {
  if (_client) return _client;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(
      "[anthropic] ANTHROPIC_API_KEY is not set — AI features (voice, compliance, " +
        "deal-analyser, document extraction) will fail at call-time with a 401. " +
        "Set it in .env.local (dev) or the Netlify dashboard (prod). " +
        "Serving in degraded mode rather than crashing every route.",
    );
  }

  _client = new Anthropic({ apiKey: apiKey || "unconfigured" });
  return _client;
}

const DEFAULT_SMART = "claude-sonnet-5-5";
const DEFAULT_FAST = "claude-haiku-5-5";

export const MODELS = {
  /** Higher-quality model for advisor-facing text. */
  smart: process.env.ANTHROPIC_MODEL_SMART ?? DEFAULT_SMART,
  /** Cheap/fast model for the voice loop, compliance, parsing, CSV mapping. */
  fast: process.env.ANTHROPIC_MODEL_FAST ?? DEFAULT_FAST,
  /** Uploaded-document reading: contracts, IDs, payslips. Accuracy-critical. */
  extract:
    process.env.ANTHROPIC_MODEL_EXTRACT ?? process.env.ANTHROPIC_MODEL_SMART ?? DEFAULT_SMART,
} as const;

export type AIEffort = "low" | "medium" | "high" | "xhigh" | "max";

/**
 * Current models think by default and thinking counts toward max_tokens, so a
 * cap sized only for the answer can stop before any text appears. Callers state
 * the size of the answer they expect; this room for thinking goes on top.
 * max_tokens is a ceiling, so unused room costs nothing.
 */
const THINKING_ROOM = 2000;

/** A long server-side search can pause; resume it this many times at most. */
const MAX_RESUMES = 3;

/**
 * Each search is billed and a Netlify function gets 60s, so searches are capped.
 * The basic tool version is deliberate: the newer one filters results by running
 * code, which adds time a 40-second report can't spare.
 */
const DEFAULT_MAX_SEARCHES = 3;

const WEB_SEARCH_USER_LOCATION = {
  type: "approximate",
  country: "AU",
  timezone: "Australia/Brisbane",
} as const;

/**
 * Models that can hand a safety-classifier decline to a fallback model on the
 * server. Haiku 5.5 has no fallback and must not be sent the parameter.
 */
function hasServerFallback(model: string): boolean {
  return /^claude-(sonnet-5-5|opus-5-5|opus-5|fable-5-1)$/.test(model);
}

export type AITextOptions = {
  /** System prompt. */
  system?: string;
  /** Convenience single-turn user message (mutually exclusive with `messages`). */
  user?: string;
  /** Full message array for multi-turn or multi-part calls (overrides `user`). */
  messages?: Anthropic.MessageParam[];
  /** Defaults to MODELS.fast. */
  model?: string;
  /** Length of the expected answer, in tokens. Room for thinking is added. */
  maxTokens?: number;
  /** How hard the model works. Lower is faster and cheaper. */
  effort?: AIEffort;
  /** Set false for trivial calls: the model runs at low effort. Default true. */
  thinking?: boolean;
  /** Enable Anthropic's web search tool. Default false. */
  web?: boolean;
  /** Cap on web searches for this call. */
  maxSearches?: number;
  /** JSON Schema the answer must match. Use when a malformed reply costs a lot. */
  jsonSchema?: Record<string, unknown>;
};

/**
 * The answer's text. With web search the model may narrate before it searches
 * ("I'll look that up"), and callers parse this as JSON or strip to the first
 * heading, so only the text after the last search counts. Citations split one
 * answer across several text blocks, so those are joined without a separator.
 */
export function answerText(content: Anthropic.ContentBlock[]): string {
  let start = 0;
  content.forEach((block, i) => {
    if (block.type === "server_tool_use" || block.type === "web_search_tool_result") {
      start = i + 1;
    }
  });
  return content
    .slice(start)
    .flatMap((block) => (block.type === "text" ? [block.text] : []))
    .join("")
    .trim();
}

/** Run a single request and return the answer's text. */
export async function aiText(opts: AITextOptions): Promise<string> {
  const {
    system,
    user,
    messages,
    model = MODELS.fast,
    maxTokens = 2000,
    effort = "medium",
    thinking = true,
    web = false,
    maxSearches = DEFAULT_MAX_SEARCHES,
    jsonSchema,
  } = opts;

  const conversation: Anthropic.MessageParam[] = messages
    ? [...messages]
    : [{ role: "user", content: user ?? "" }];

  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: maxTokens + THINKING_ROOM,
    messages: conversation,
    output_config: {
      effort: thinking ? effort : "low",
      ...(jsonSchema ? { format: { type: "json_schema" as const, schema: jsonSchema } } : {}),
    },
    ...(system ? { system } : {}),
    ...(web
      ? {
          tools: [
            {
              type: "web_search_20250305" as const,
              name: "web_search" as const,
              max_uses: maxSearches,
              user_location: WEB_SEARCH_USER_LOCATION,
            },
          ],
        }
      : {}),
  };

  for (let resumes = 0; resumes <= MAX_RESUMES; resumes++) {
    const response = await sendMessage(params);

    if (response.stop_reason === "pause_turn") {
      // Re-send as-is; the API sees the trailing search and carries on.
      conversation.push({ role: "assistant", content: response.content });
      continue;
    }
    if (response.stop_reason === "refusal") {
      throw new Error("The AI declined this request.");
    }

    const text = answerText(response.content);
    if (text) return text;
    throw new Error(
      `AI returned no text (stop_reason=${response.stop_reason ?? "unknown"}). Try increasing maxTokens.`,
    );
  }
  throw new Error("The AI search took too long — please try again.");
}

async function sendMessage(
  params: Anthropic.MessageCreateParamsNonStreaming,
): Promise<Anthropic.Message> {
  const client = getAnthropic();
  if (!hasServerFallback(params.model)) return client.messages.create(params);
  const response = await client.beta.messages.create({
    ...(params as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming),
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
  });
  return response as unknown as Anthropic.Message;
}

/** A PDF, as a content block. `base64` excludes any data-URL prefix. */
export function pdfBlock(base64: string, title?: string): Anthropic.DocumentBlockParam {
  return {
    type: "document",
    source: { type: "base64", media_type: "application/pdf", data: base64 },
    ...(title ? { title } : {}),
  };
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

/** An image, as a content block. Throws on types the API can't read (e.g. HEIC). */
export function imageBlock(mediaType: string, base64: string): Anthropic.ImageBlockParam {
  const type = mediaType.toLowerCase();
  if (!(IMAGE_TYPES as readonly string[]).includes(type)) {
    throw new Error(`Unsupported image type: ${mediaType}`);
  }
  return { type: "image", source: { type: "base64", media_type: type as ImageType, data: base64 } };
}

/**
 * Normalise API errors into a short, USER-SAFE message.
 *
 * The full error is logged server-side (Netlify function logs) for debugging,
 * but the returned string never contains provider internals — billing text,
 * dashboard URLs, key names, token accounting — because callers surface it
 * straight to the browser.
 */
export function aiErrorMessage(error: unknown): string {
  // Always capture the real detail server-side — logging must never throw.
  try {
    console.error(
      "[AI] request failed:",
      error instanceof Error ? (error.stack ?? error.message) : String(error),
    );
  } catch {
    /* noop */
  }

  const msg = error instanceof Error ? error.message : String(error);
  const looksLikeBilling =
    /credit|billing|quota|insufficient|payment|anthropic\.com|api[\s_-]?key|usage limits|afford/i.test(
      msg,
    );

  if (error instanceof Anthropic.APIError) {
    if (error.status === 401 || error.status === 403)
      return "The AI service isn't configured correctly — please contact support.";
    // An empty credit balance arrives as a 400 and a spend cap as a 429.
    if (looksLikeBilling) return "The AI is temporarily unavailable — please try again shortly.";
    if (error.status === 429 || error.status === 529)
      return "The AI is busy right now — please try again in a moment.";
    return "The AI request failed — please try again.";
  }

  // Non-API errors are usually our own (safe) messages, but redact anything that
  // looks like a leaked provider/billing/credential detail just in case.
  if (looksLikeBilling) return "The AI is temporarily unavailable — please try again shortly.";
  return msg;
}
