import { MODELS, orText } from "./openrouter";

export type ViolationSeverity = "high" | "medium" | "low";

export interface Violation {
  law: string;
  severity: ViolationSeverity;
  snippet: string;
  reason: string;
  fix: string;
}

export interface ComplianceReviewResult {
  violations: Violation[];
  reviewed_at: string;
  model: string;
  raw_response?: string;
}

const MODEL = MODELS.fast;

const SYSTEM = `You are a compliance reviewer for NextKey Property Strategists (Queensland-based,
NOT licensed under NCCP, NOT a real estate agent, NOT a financial planner). You are reviewing
the subject and body of an outbound bulk email BEFORE it is sent to NextKey's contact list.

Your only job: flag wording that risks breach of Australian law. Be specific. Quote the exact
snippet. Do not flag style or tone.

Laws to apply:

1. Australian Consumer Law (ACL) s.18 — misleading or deceptive conduct.
   Common breaches: "guaranteed", "no risk", "can't lose", "best in market" without evidence.

2. ACL s.29 — false or misleading representations about price, value, performance, or future matters.
   Common breaches: specific yield/growth claims without disclaimer (e.g. "10% returns"), comparisons
   to other investments without basis, future projections stated as facts.

3. National Consumer Credit Protection Act 2009 (NCCP).
   NextKey does NOT hold an Australian Credit Licence. The copy must NOT cross into credit advice.
   Examples of breach: "we'll get you a loan at X%", "refinance with us", "we can arrange your
   mortgage", recommending a specific lender or rate.

4. Queensland Property Occupations Act 2014.
   NextKey is a property STRATEGIST, not a licensed real estate agent. The copy must NOT cross
   into licensed real estate work. Examples of breach: "we will sell your property", "we'll
   appraise your home", offering to act as buyer's agent without licence.

5. Spam Act 2003.
   The footer + unsubscribe link is added automatically by the send engine — DON'T flag missing
   unsubscribe/sender info; that part is handled. But DO flag if the body itself promises something
   inconsistent with opt-out rights (e.g. "you cannot unsubscribe").

6. Financial planning.
   NextKey is NOT a licensed financial planner. Examples of breach: "invest your super in this",
   "this is the best place for your retirement savings", any tailored personal financial advice.

7. Privacy Act 1988.
   Flag if the body claims something untrue about data handling, or asks the contact to share
   data in a way that violates APP collection limits.

DO NOT flag:
- The footer text (added automatically).
- Generic disclaimers already present (e.g. "general information only").
- Tone, brevity, grammar, marketing style.
- Spelling errors.
- Anything that isn't a legal compliance issue.

Severity:
  high   = Sending this as-is is likely to draw a regulator complaint or a breach claim. Block.
  medium = A reasonable lawyer would advise rewording. Warn.
  low    = Borderline / edge case. Note for review.

OUTPUT — STRICT JSON. No code fences, no preamble, no commentary outside the JSON object.

{
  "violations": [
    {
      "law": "<short label e.g. 'ACL s.29' or 'NCCP — unlicensed credit advice'>",
      "severity": "high" | "medium" | "low",
      "snippet": "<the exact phrase from the email that triggered this>",
      "reason": "<1 sentence: what's wrong with it>",
      "fix": "<1 sentence: how to reword>"
    }
  ]
}

If the copy is clean, output: {"violations": []}`;

/**
 * Strip content that's irrelevant to compliance review but can dominate token
 * count: base64-encoded inline images, <script>/<style> blocks, and a final
 * char cap. Keeps the visible HTML structure + copy so the reviewer can still
 * see link text, list items, etc.
 *
 * Without this, a pasted HTML email with inline base64 images can run into
 * the hundreds of thousands of tokens and blow Haiku's 200k context window.
 */
function sanitizeForReview(html: string, maxChars = 40000): string {
  let s = html
    .replace(/data:[^;]+;base64,[A-Za-z0-9+/=\s]+/g, "[stripped:base64-image]")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  if (s.length > maxChars) {
    s = s.slice(0, maxChars) + `\n[...truncated for review at ${maxChars} chars...]`;
  }
  return s;
}

function buildUserMessage(subject: string, html_body: string, text_body: string): string {
  const sanitized_html = sanitizeForReview(html_body);
  const sanitized_text = text_body.length > 10000
    ? text_body.slice(0, 10000) + "\n[...truncated...]"
    : text_body;
  return [
    "=== EMAIL SUBJECT ===",
    subject,
    "",
    "=== EMAIL HTML BODY (sanitized: base64/scripts/styles/comments stripped) ===",
    sanitized_html,
    "",
    sanitized_text ? "=== EMAIL PLAIN-TEXT BODY ===" : "",
    sanitized_text,
    "",
    "Review against the laws in your instructions. Output strict JSON.",
  ]
    .filter(Boolean)
    .join("\n");
}

function parseViolations(text: string): Violation[] {
  let s = text.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }
  try {
    const obj = JSON.parse(s) as { violations?: unknown };
    const arr: unknown[] = Array.isArray(obj?.violations) ? obj.violations : [];
    return arr
      .filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null)
      .map((v): Violation => ({
        law: String(v.law ?? "").slice(0, 120),
        severity: (["high", "medium", "low"].includes(v.severity as string)
          ? (v.severity as ViolationSeverity)
          : "medium"),
        snippet: String(v.snippet ?? "").slice(0, 400),
        reason: String(v.reason ?? "").slice(0, 400),
        fix: String(v.fix ?? "").slice(0, 400),
      }))
      .filter((v) => v.law && v.snippet);
  } catch {
    return [];
  }
}

/* ── Deal-analyser operator notes ──────────────────────────────────────────
 * The operator can add free-text "changes / extra information" that prints in a
 * CLIENT'S investment report. Same AU-law lens as broadcast copy, but tuned for a
 * short note and it also returns a compliant rewrite to offer the operator. */

export interface NoteReviewResult {
  violations: Violation[];
  /** A compliant rewrite of the note that keeps the intent; "" when already clean. */
  suggestion: string;
  reviewed_at: string;
  model: string;
}

const NOTE_SYSTEM = `You are a compliance reviewer for NextKey Property Strategists (Queensland, NOT
licensed under NCCP, NOT a real estate agent, NOT a financial planner). You are reviewing a short
free-text note an operator wants to ADD TO A CLIENT'S property investment report.

Flag wording that risks breach of Australian law. Quote the exact snippet. Don't flag tone/style.

Laws:
1. ACL s.18 — misleading/deceptive conduct ("guaranteed", "no risk", "can't lose").
2. ACL s.29 — false/misleading claims about price, value, performance or FUTURE matters; specific
   yield/growth claims stated as fact or without disclaimer; unfounded comparisons.
3. NCCP 2009 — no credit licence: must not give credit advice / recommend a loan, lender or rate.
4. QLD Property Occupations Act 2014 — strategist, not a licensed agent: must not offer to sell,
   appraise, or act as buyer's agent.
5. Spam Act / Privacy Act 1988 — no untrue data-handling claims.
6. Financial planning — not licensed: no personal financial/super/retirement advice.

Then SUGGESTION: a compliant rewrite of the whole note that keeps the operator's intent but removes
the breach (soften absolutes, add "general information only", strip credit/financial advice, frame
projections as estimates). If the note is already clean, suggestion = "".

OUTPUT — STRICT JSON, no code fences, no commentary:
{"violations":[{"law":"...","severity":"high"|"medium"|"low","snippet":"...","reason":"...","fix":"..."}],"suggestion":"<compliant rewrite or empty>"}`;

export async function reviewDealNote(note: string): Promise<NoteReviewResult> {
  const text = await orText({
    model: MODEL,
    maxTokens: 1200,
    thinking: false,
    system: NOTE_SYSTEM,
    user: `NOTE TO REVIEW:\n${note.slice(0, 4000)}\n\nOutput strict JSON.`,
  });
  let suggestion = "";
  try {
    const s = text.startsWith("```") ? text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "") : text;
    const obj = JSON.parse(s) as { suggestion?: unknown };
    suggestion = typeof obj.suggestion === "string" ? obj.suggestion.trim() : "";
  } catch { /* leave blank */ }
  return { violations: parseViolations(text), suggestion, reviewed_at: new Date().toISOString(), model: MODEL };
}

export async function reviewBroadcastCopy(args: {
  subject: string;
  html_body: string;
  text_body: string;
}): Promise<ComplianceReviewResult> {
  const text = await orText({
    model: MODEL,
    maxTokens: 2000,
    thinking: false,
    system: SYSTEM,
    user: buildUserMessage(args.subject, args.html_body, args.text_body),
  });

  return {
    violations: parseViolations(text),
    reviewed_at: new Date().toISOString(),
    model: MODEL,
    raw_response: text,
  };
}
