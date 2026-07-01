import { NextResponse } from "next/server";
import { orText, MODELS } from "../../../../utils/openrouter";
import { requireAuth } from "../../../../utils/cf-access";
import { log, errInfo } from "../../../../utils/logger";

export const dynamic = "force-dynamic";
// Web search + reasoning for a full report can run long; give it headroom.
export const maxDuration = 120;

/**
 * Planning Feasibility — AI-led, Australia-wide.
 *
 * Two phases over one shared transcript (`messages`):
 *  - phase "interview": the AI identifies the LGA / planning scheme from the
 *    address (web search) and asks the advisor a small batch of targeted
 *    questions, or signals it has enough. Returns { status, understanding,
 *    questions[] }.
 *  - phase "report": the AI produces a comprehensive preliminary planning
 *    feasibility report as structured JSON (rendered client-side into the
 *    NextKey letterhead + print-to-PDF).
 *
 * Australian context: the model adapts to the relevant state's planning system
 * (QLD City Plans / Reconfiguring a Lot; NSW LEP+DCP / DA+CDC / min lot size;
 * VIC planning schemes / VicSmart / ResCode; SA/WA/TAS/ACT/NT equivalents).
 * It must be honest about what requires council + town-planner verification.
 */

const COMMON_RULES = `You are a senior Australian town-planning research assistant working for NextKey Property Strategists. You help NextKey advisors assess the development potential of a property ANYWHERE in Australia (all states and territories).

Ground rules:
- Australia-wide. Identify the responsible local government (council/LGA) and its planning scheme from the address, and apply the correct STATE planning framework and terminology (e.g. QLD: planning scheme zones, Reconfiguring a Lot, code/impact assessable, accepted development; NSW: LEP/DCP, minimum lot size, Development Application vs Complying Development; VIC: planning scheme zones/overlays, VicSmart, ResCode/Clause 55, subdivision; SA: Planning & Design Code; WA: R-Codes / local planning scheme; TAS/ACT/NT equivalents).
- Use web search to ground zone, overlays, minimum lot size, and assessment pathways in the actual local scheme where you can, but NEVER invent specific figures. If a figure is not confirmed, say it must be verified with council.
- This is PRELIMINARY planning information for a professional advisor — NOT legal advice, NOT certified town-planning advice, NOT financial or investment advice. Flag clearly what needs a town planner, a survey, a title search, and a Council pre-lodgement enquiry.
- Australian English and units (m², metres). Be practical, specific and honest about risk.`;

const INTERVIEW_SYS = `${COMMON_RULES}

TASK (interview phase): Based on the conversation so far, decide whether you have enough to write a comprehensive feasibility report, or whether you need more from the advisor. Use web search to pre-identify the council, planning scheme and likely zone from the address so your questions are sharp and you can pre-fill best-guesses.

Ask ONLY for what you cannot reliably determine yourself or that depends on the advisor's objective — e.g. the development goal (subdivision / dual occupancy / additional or secondary dwelling / knock-down-rebuild), lot size & dimensions if not public, existing improvements or approvals, and any known constraints (easements, sewer/stormwater mains, flooding, heritage, slope, bushfire). Never ask more than 6 questions at once. Prefer 3-5.

Respond with ONLY a JSON object (no markdown, no prose, no code fences) of the form:
{
  "status": "questions" | "ready",
  "understanding": "one or two sentences summarising the property and the objective as you currently understand them",
  "questions": [
    {
      "id": "short_slug",
      "label": "the question in plain English for a property advisor",
      "why": "one short line on why it matters to the assessment",
      "placeholder": "an example of the kind of answer expected",
      "suggestion": "your best-guess answer from public info, or empty string if unknown"
    }
  ]
}
If you already have enough, return "status":"ready" with an empty "questions" array.`;

const REPORT_SYS = `${COMMON_RULES}

TASK (report phase): Produce a comprehensive PRELIMINARY planning feasibility report from everything gathered in the conversation. Use web search to ground the zone, overlays, minimum lot size / frontage / density controls, and the assessment pathway in the correct local scheme. Cover every objective the advisor raised (e.g. subdivision potential and likely yield, dual occupancy / duplex, subdividing an existing/approved duplex, additional or secondary dwellings, the assessment category and process, servicing, infrastructure charges, and the key site constraints and risks). Give a clear recommended pathway. Where a figure is not confirmed, state it must be verified with Council.

Respond with ONLY a JSON object (no markdown, no prose, no code fences) matching EXACTLY this shape:
{
  "title": "Preliminary Planning Feasibility Assessment",
  "subtitle": "<full address> · <short scope> · <Council name>",
  "meta": {
    "scope": "one line describing what was assessed",
    "statusPills": [ { "label": "short status", "tone": "good|warn|bad|info" } ]
  },
  "keyStats": [ { "n": "value e.g. LDR or 650 m²", "l": "short label e.g. Zone" } ],
  "sections": [
    {
      "heading": "1. Executive Summary",
      "blocks": [
        { "type": "p", "text": "paragraph text (plain text, no markdown)" },
        { "type": "callout", "tone": "good|warn|bad|info", "title": "optional short title", "text": "the key message" },
        { "type": "bullets", "items": ["point one", "point two"] },
        { "type": "table", "columns": ["Column A", "Column B"], "rows": [["cell","cell"]] }
      ]
    }
  ],
  "disclaimer": "a professional disclaimer: preliminary desktop planning information only, not legal/financial/certified town-planning advice, figures to be confirmed with Council, a licensed surveyor and a qualified town planner before the client relies on it."
}

Rules for the report JSON:
- Provide up to 4 keyStats (e.g. Zone, Site area, Min lot size, Assessment pathway).
- Number the section headings (1., 2., 3. ...). Include at minimum: Executive Summary; Subject Property; Planning Framework (zone, controls, assessment pathway for the state); the objective analysis (e.g. Subdivision / Dwelling potential); Key Constraints & Risks; Recommended Next Steps.
- Use "callout" with tone "bad" for genuine red-flag risks, "warn" for cautions, "good" for favourable findings, "info" otherwise.
- Keep every string plain text (no markdown symbols); use the block types for structure.
- Be specific to the property and honest. Do not fabricate confirmed figures — mark unverified items clearly (e.g. "to be confirmed with Council").`;

/** Extract the first balanced JSON object from a model response (handles
 * stray prose or code fences around the JSON). */
function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json/gi, "```").trim();
  const fenced = cleaned.match(/```\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : cleaned;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("AI did not return JSON");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

type Msg = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const phase: "interview" | "report" = body?.phase === "report" ? "report" : "interview";
    const messages: Msg[] = Array.isArray(body?.messages) ? body.messages : [];

    if (messages.length === 0) {
      return NextResponse.json(
        { ok: false, error: "messages required" },
        { status: 400 },
      );
    }

    const system = phase === "report" ? REPORT_SYS : INTERVIEW_SYS;

    const text = await orText({
      model: MODELS.smart,
      web: true,
      effort: phase === "report" ? "high" : "medium",
      maxTokens: phase === "report" ? 9000 : 1500,
      messages: [{ role: "system", content: system }, ...messages],
    });

    let parsed: unknown;
    try {
      parsed = extractJson(text);
    } catch (e) {
      log.warn("planning_feasibility.parse_failed", { phase, ...errInfo(e) });
      return NextResponse.json(
        { ok: false, error: "The AI response could not be parsed. Please try again." },
        { status: 502 },
      );
    }

    if (phase === "report") {
      return NextResponse.json({ ok: true, report: parsed });
    }
    const p = (parsed ?? {}) as {
      status?: string;
      understanding?: string;
      questions?: unknown;
    };
    return NextResponse.json({
      ok: true,
      status: p.status === "ready" ? "ready" : "questions",
      understanding: typeof p.understanding === "string" ? p.understanding : "",
      questions: Array.isArray(p.questions) ? p.questions : [],
    });
  } catch (e) {
    log.error("planning_feasibility.failed", { ...errInfo(e) });
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Request failed" },
      { status: 500 },
    );
  }
}
