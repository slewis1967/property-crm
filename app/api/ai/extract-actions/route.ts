import { NextResponse } from "next/server";
import { aiCall } from "../../../../utils/ai";

export const dynamic = "force-dynamic";

const SYSTEM = `You take a property advisor's free-form note about a contact interaction and extract structured actions.

Input: short text from Sean (the advisor) — e.g. "called Sarah, she wants to see Carseldine townhouse, asked about depreciation, wants to do a 4pm call Wednesday".

Output STRICT JSON only — no preamble, no markdown fences, no explanation. Format:
{
  "summary": "<one-line cleaned-up summary suitable for a CRM note>",
  "tasks": [{"title":"<short title>","due_date":"<ISO date or null>"}],
  "tags": ["<tag>", ...],
  "status_change": "<new status or null>",
  "calendar": {"title":"<event title>","when":"<ISO datetime or natural language>","with":"<contact name>"} | null,
  "temperature": "hot|warm|cold|null",
  "follow_up_in_days": <integer or null>
}

Rules:
- Only include actions that are clearly implied — don't invent.
- Tasks are concrete, advisor-facing TODOs (e.g. "Send Carseldine townhouse listing", not "follow up").
- Tags should be 1-3 short lowercase tags relevant to buyer profile or interest (e.g. "fhb", "townhouse", "qld", "depreciation-question").
- temperature only set if the note clearly signals it (a verbal "I'm ready to buy" → hot, "still researching" → warm, "not interested" → cold).
- calendar only if a specific time is mentioned. Convert relative dates (Wednesday, next week) to a date — assume today's date is today.
- All optional fields default to null/empty array if no clear signal.
- Don't echo the raw input verbatim — clean and condense.`;

export async function POST(req: Request) {
  try {
    const { contactId, noteText } = await req.json();
    if (!contactId || !noteText || typeof noteText !== "string") {
      return NextResponse.json(
        { ok: false, error: "contactId and noteText required" },
        { status: 400 },
      );
    }
    if (noteText.length > 5000) {
      return NextResponse.json(
        { ok: false, error: "noteText too long (max 5000 chars)" },
        { status: 400 },
      );
    }

    const userPrompt = [
      `Today's date: ${new Date().toISOString().slice(0, 10)}`,
      `Day of week: ${new Date().toLocaleDateString("en-AU", { weekday: "long" })}`,
      "",
      "ADVISOR NOTE:",
      noteText.trim(),
    ].join("\n");

    try {
      // Not cached — every note is unique and small.
      const text = await aiCall({
        system: SYSTEM,
        user: userPrompt,
        maxTokens: 1500,
        effort: "medium",
      });
      const parsed = parseExtraction(text);
      if (!parsed) {
        return NextResponse.json(
          { ok: false, error: "AI response was not valid JSON" },
          { status: 500 },
        );
      }
      return NextResponse.json({ ok: true, ...parsed });
    } catch (e: any) {
      return NextResponse.json(
        { ok: false, error: e?.message ?? "AI request failed" },
        { status: 500 },
      );
    }
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to extract actions" },
      { status: 500 },
    );
  }
}

function parseExtraction(text: string): any | null {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}
