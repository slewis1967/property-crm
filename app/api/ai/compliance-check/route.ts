/**
 * Preview-time compliance check on outbound text.
 *
 * Wraps Claude as a single-pass reviewer for advisor-composed messages
 * (Smart Reply drafts, sequence templates, ad copy, etc.). Catches
 * common Australian property/SDA compliance pitfalls before send.
 *
 * Note: this is preview-time only — it does NOT replace the existing
 * Python-side `nextkey_compliance.scrub_builder_names` that gates the
 * actual outbound pipeline. Treat as belt-and-braces, not the only line.
 *
 * Request:  { text: string, channel?: "email" | "sms" | "social" }
 * Response: {
 *   ok: true,
 *   severity: "clean" | "warn" | "block",
 *   violations: [{
 *     type: string,           // short label, e.g. "guaranteed-return"
 *     snippet: string,        // the offending substring (verbatim from input)
 *     why: string,            // one-sentence explanation
 *     fix: string             // specific rewrite suggestion
 *   }],
 *   rewrite: string            // optional fully-rewritten safe version (or "")
 * }
 */
import { NextResponse } from "next/server";
import { aiCall } from "../../../../utils/ai";
import { getCachedOrGenerate } from "../../../../utils/ai-cache";

import { requireAuth } from "../../../../utils/cf-access";
export const dynamic = "force-dynamic";

const SYSTEM = `You're a compliance reviewer for an Australian property advisor (Sean, NextKey Property Strategists). You read draft outbound text — emails, SMS, ad copy, social posts — and flag risky language BEFORE it reaches a client.

Domain: residential property + Specialist Disability Accommodation (SDA / NDIS) in Australia. Sean is licensed in real estate but NOT a financial advisor or accountant.

Output STRICT JSON only — no preamble, no markdown fences:
{
  "severity": "clean" | "warn" | "block",
  "violations": [
    {
      "type": "<short kebab-case label>",
      "snippet": "<the offending substring, copied verbatim from input>",
      "why": "<one-sentence explanation>",
      "fix": "<concrete rewrite suggestion>"
    }
  ],
  "rewrite": "<optional fully-rewritten compliant version of the whole text, or empty string if not needed>"
}

Severity guide:
- "clean"  → no real issues. violations: [], rewrite: "".
- "warn"   → at least one issue Sean should consider before sending; not legally dangerous on its own. Rewrite is optional but helpful.
- "block"  → contains language that is misleading / unlicensed / regulator-risky and should NOT be sent without rewriting. Always provide a rewrite.

Things to flag:

1. **Competitor builders by name** — mentioning rival builders (e.g. "Metricon", "Henley", "Coral Homes") in a way that compares unfavourably. Rule of thumb: if Sean's saying anything beyond "we don't work with X", flag it.

2. **Guaranteed returns / yields** — anything that promises a specific dollar return, percentage growth, or rental yield as a certainty. Words like "guaranteed", "will get", "definitely", "always returns", "lock in X% growth" are red flags. Property markets fluctuate; nothing is guaranteed.

3. **Tax / financial advice** — specific claims about depreciation savings, negative gearing benefits, CGT treatment, SMSF strategy, retirement planning. Sean is not a tax agent or financial planner. Soft-promotional ("worth chatting to your accountant about") is fine; specific dollar/percentage claims are not.

4. **NDIS / SDA approval claims** — saying a property "is approved" or "will be approved" for SDA when approval is a participant-by-participant process. "SDA-compliant build" / "designed to SDA category X standards" is fine. "Your participant will be funded" / "this property is NDIS-approved for Sarah" is not.

5. **Misleading scarcity / urgency** — fake deadlines, "only 1 left" when there are more, "prices going up Monday" without basis.

6. **Promises about regulatory outcomes** — "council will approve", "loan will be approved", "this will pass building inspection" — beyond Sean's control.

7. **Personal data hygiene** — TFNs, full driver-licence numbers, passport numbers, full bank account numbers in outbound text. Flag for redaction.

DO NOT flag:
- Normal salesy enthusiasm ("great property", "well-priced", "strong rental area")
- Mentioning median prices / public market data
- Suggesting the recipient "speak to their accountant" / "get independent advice"
- Naming Sean's own employer / partners ("we work with [our partner builders]")
- General SDA terminology ("Improved Liveability", "Robust", "HPS")

Snippets must be quoted verbatim from the input — don't paraphrase. If the input is fine, return severity:"clean", violations:[], rewrite:"".`;

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await req.json();
    const text: string | undefined = body.text;
    const channel: string | undefined = body.channel;
    if (!text || typeof text !== "string") {
      return NextResponse.json({ ok: false, error: "text required" }, { status: 400 });
    }
    if (text.length > 8000) {
      return NextResponse.json(
        { ok: false, error: "text too long (max 8000 chars)" },
        { status: 400 },
      );
    }

    // Cache by exact text — repeat checks of the same draft are free
    const fingerprintInput = { v: 1, text, channel: channel || null };

    const userPrompt = [
      channel ? `Channel: ${channel}` : "",
      "",
      "DRAFT TO REVIEW:",
      text,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const result = await getCachedOrGenerate({
        kind: "compliance-check",
        refId: hash(text),
        fingerprintInput,
        maxAgeMs: 24 * 60 * 60 * 1000, // 1 day
        generate: () =>
          aiCall({
            system: SYSTEM,
            user: userPrompt,
            maxTokens: 2000,
            // Checks text against an enumerated, fully-specified rule
            // checklist — rule lookup, not open-ended reasoning. Thinking off.
            effort: "medium",
            thinking: false,
          }),
      });
      const parsed = parseResponse(result.text);
      if (!parsed) {
        return NextResponse.json(
          { ok: false, error: "AI response was not valid JSON" },
          { status: 500 },
        );
      }
      return NextResponse.json({ ok: true, ...parsed, cached: result.cached });
    } catch (e: any) {
      return NextResponse.json(
        { ok: false, error: e?.message ?? "Compliance check failed" },
        { status: 500 },
      );
    }
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Compliance check failed" },
      { status: 500 },
    );
  }
}

function parseResponse(raw: string):
  | {
      severity: "clean" | "warn" | "block";
      violations: Array<{ type: string; snippet: string; why: string; fix: string }>;
      rewrite: string;
    }
  | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const obj = JSON.parse(m[0]);
    const sev = ["clean", "warn", "block"].includes(obj.severity) ? obj.severity : "clean";
    const violations = Array.isArray(obj.violations)
      ? obj.violations.map((v: any) => ({
          type: String(v.type ?? "").trim(),
          snippet: String(v.snippet ?? "").trim(),
          why: String(v.why ?? "").trim(),
          fix: String(v.fix ?? "").trim(),
        }))
      : [];
    return {
      severity: sev,
      violations,
      rewrite: typeof obj.rewrite === "string" ? obj.rewrite : "",
    };
  } catch {
    return null;
  }
}

/** Cheap stable hash for cache key — avoids huge keys when caching by text. */
function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return (h >>> 0).toString(16).padStart(8, "0") + "-" + s.length.toString(16);
}
