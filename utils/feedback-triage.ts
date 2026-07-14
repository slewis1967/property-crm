/**
 * Feedback triage — classify a user-submitted report with the FAST model.
 *
 * Server-only (imports the OpenRouter client). Returns a structured verdict the
 * autonomous agent then acts on. The single most important output is
 * `riskClass`: when true, the item touches authentication / access control /
 * data deletion / payments / outbound sending, and must NEVER be auto-shipped —
 * it is always held for human sign-off regardless of the fix-autonomy setting.
 */

import { orText, MODELS } from "./openrouter";
import type { FeedbackType, FeedbackPriority } from "./feedback";

export interface TriageResult {
  kind: FeedbackType;          // bug | feature | other (the AI's read)
  genuine: boolean;            // a real, actionable item in this app?
  severity: FeedbackPriority;  // low | medium | high
  riskClass: boolean;          // touches auth/access/delete/payments/sending → always hold
  summary: string;             // one-line neutral restatement
  analysis: string;            // short reasoning; for skips, WHY it isn't actionable
  confidence: number;          // 0..1
}

const SYSTEM = `You are the triage bot for the NextKey CRM — a Next.js + Supabase property CRM used by mortgage/property advisers in Australia.
A user has filed a feedback item. Classify it. Reply with STRICT JSON only, no prose, no code fences, matching exactly:
{
  "kind": "bug" | "feature" | "other",
  "genuine": boolean,
  "severity": "low" | "medium" | "high",
  "riskClass": boolean,
  "summary": string,
  "analysis": string,
  "confidence": number
}

Definitions:
- "kind": "bug" = something is broken/erroring/behaving wrong. "feature" = a request for new capability or an improvement. "other" = a question, confusion, praise, or anything not actionable as code.
- "genuine": true only if it is a real, actionable item about THIS CRM that an engineer could act on. false for spam, vague venting, duplicates of obvious non-issues, questions already answered by using the app, or anything out of scope (e.g. hardware, the user's email, external services).
- "severity": user impact — "high" = blocks core work or loses data; "medium" = notable friction; "low" = minor/cosmetic.
- "riskClass": true if FIXING or BUILDING this would plausibly touch any of: authentication, login, access control / permissions / sharing, deleting or purging data, payments / billing / financial transactions, or sending anything outbound (email / SMS / notifications). When unsure, set true. These are NEVER auto-shipped.
- "summary": one neutral sentence restating the item.
- "analysis": 1-3 sentences. For a genuine bug, the likely area/cause. For a feature, whether it seems worth doing. For a non-genuine item, exactly why it isn't actionable.
- "confidence": 0..1, your confidence in this classification.`;

/** Strip code fences / prose and parse the first JSON object in the text. */
function parseJson(raw: string): Record<string, unknown> {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end > start) s = s.slice(start, end + 1);
  return JSON.parse(s) as Record<string, unknown>;
}

const asKind = (v: unknown): FeedbackType =>
  v === "bug" || v === "feature" ? v : "other";
const asSeverity = (v: unknown): FeedbackPriority =>
  v === "high" || v === "low" ? v : "medium";

/**
 * Triage one feedback item. Throws on model/parse failure — callers should
 * treat triage as best-effort (leave the item `pending` for the routine to
 * retry) rather than failing the user's submission.
 */
export async function triageFeedback(input: {
  type: FeedbackType;
  title: string;
  details?: string | null;
  area?: string | null;
}): Promise<TriageResult> {
  const user =
    `User-selected type: ${input.type}\n` +
    `Title: ${input.title}\n` +
    `Details: ${input.details?.trim() || "(none)"}\n` +
    `Page/area: ${input.area?.trim() || "(unspecified)"}`;

  const raw = await orText({
    system: SYSTEM,
    user,
    model: MODELS.fast,
    maxTokens: 700,
    effort: "low",
  });

  const j = parseJson(raw);
  const confidence = typeof j.confidence === "number" ? Math.max(0, Math.min(1, j.confidence)) : 0.5;
  return {
    kind: asKind(j.kind),
    genuine: j.genuine === true,
    severity: asSeverity(j.severity),
    // Default to the safe side: if the model omits riskClass, treat as risky.
    riskClass: j.riskClass !== false,
    summary: typeof j.summary === "string" ? j.summary.trim() : input.title,
    analysis: typeof j.analysis === "string" ? j.analysis.trim() : "",
    confidence,
  };
}
