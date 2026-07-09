import { NextResponse } from "next/server";
import type OpenAI from "openai";
import { orText, MODELS } from "../../../../utils/openrouter";
import { requireAuth } from "../../../../utils/cf-access";
import { log, errInfo } from "../../../../utils/logger";

export const dynamic = "force-dynamic";
// Web search + reasoning for a full report can run long; give it headroom.
export const maxDuration = 120;

/**
 * Planning Feasibility — AI-led, Australia-wide.
 *
 * Phases over one shared transcript (`messages`):
 *  - phase "interview": the AI identifies the LGA / planning scheme from the
 *    address (web search) and asks the advisor a small batch of targeted
 *    questions, or signals it has enough. Returns { status, understanding,
 *    questions[] }.
 *  - phase "prepare": runs the slow site I/O only (geocode + satellite tile),
 *    no model call, so the report request stays under the serverless function
 *    time cap. Returns { location, satellite } for the client to hand back.
 *  - phase "report": AI-only. Consumes `prepared` (location + satellite) and
 *    produces a comprehensive preliminary planning feasibility report as
 *    structured JSON (rendered client-side into the NextKey letterhead +
 *    print-to-PDF).
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
- Where a street address is available, use satellite/aerial imagery (e.g. Google Maps/Earth, Nearmap, Esri World Imagery) together with the cadastre to read the lot shape and dimensions, existing buildings and roof footprints, driveways and access, setbacks, vacant/backyard area, vegetation and the surrounding development pattern. A current satellite image of the site may be attached directly for you to analyse.
- Australian English and units (m², metres). Be practical, specific and honest about risk.`;

const INTERVIEW_SYS = `${COMMON_RULES}

TASK (interview phase): Based on the conversation so far, decide whether you have enough to write a comprehensive feasibility report, or whether you need more from the advisor. Use web search to pre-identify the council, planning scheme and likely zone from the address so your questions are sharp and you can pre-fill best-guesses.

When a full street address is provided, RESEARCH the publicly determinable facts yourself (council/LGA, zone, minimum lot size, overlays, and the lot size, dimensions and existing site layout from the cadastre and satellite/aerial imagery) — do NOT ask the advisor for anything you can research. Only ask about the advisor's development objective if it is genuinely unclear, or about private matters you cannot determine (e.g. an approval the advisor already holds, or the internal condition of a building). If the objective is clear or can be reasonably assumed (assess subdivision and additional-dwelling potential), return "status":"ready" with no questions and let the report do the work.

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

TASK (report phase): Produce a comprehensive PRELIMINARY planning feasibility report from everything gathered in the conversation. If a current satellite/aerial image of the site is attached to this conversation, analyse it and reflect what it shows — lot shape, existing buildings and roof footprints, driveways and access, setbacks, available vacant/backyard area, vegetation, and the surrounding development pattern — in the Subject Property and analysis sections. Use web search to ground the zone, overlays, minimum lot size / frontage / density controls, and the assessment pathway in the correct local scheme. Cover every objective the advisor raised (e.g. subdivision potential and likely yield, dual occupancy / duplex, subdividing an existing/approved duplex, additional or secondary dwellings, the assessment category and process, servicing, infrastructure charges, and the key site constraints and risks). Give a clear recommended pathway. Where a figure is not confirmed, state it must be verified with Council.

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

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 6000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** Best-effort geocode of an Australian address via OpenStreetMap Nominatim. */
async function geocodeAU(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
      address,
    )}&format=json&limit=1&countrycodes=au`;
    const res = await fetchWithTimeout(url, {
      headers: { "User-Agent": "NextKey-CRM-PlanningFeasibility/1.0 (sean.l@nextkey.com.au)" },
    });
    if (!res.ok) return null;
    const arr = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    const hit = arr?.[0];
    if (!hit?.lat || !hit?.lon) return null;
    const lat = parseFloat(hit.lat);
    const lng = parseFloat(hit.lon);
    return isFinite(lat) && isFinite(lng) ? { lat, lng } : null;
  } catch {
    return null;
  }
}

/** Fetch a current satellite tile (Esri World Imagery, keyless) as a data URL
 * so a vision-capable model can read the site. ~180 m span, centred on the lot. */
async function fetchSatelliteDataUrl(lat: number, lng: number): Promise<string | null> {
  try {
    const d = 0.0016;
    const bbox = `${lng - d},${lat - d},${lng + d},${lat + d}`;
    const url = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${bbox}&bboxSR=4326&imageSR=4326&size=800,600&format=jpg&f=image`;
    const res = await fetchWithTimeout(url, {}, 7000);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 1000) return null; // guard against tiny error responses
    return `data:image/jpeg;base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const phase: "interview" | "report" | "prepare" =
      body?.phase === "report" ? "report" : body?.phase === "prepare" ? "prepare" : "interview";
    const messages: Msg[] = Array.isArray(body?.messages) ? body.messages : [];

    // "prepare" only needs the address; interview/report need the transcript.
    if (phase !== "prepare" && messages.length === 0) {
      return NextResponse.json(
        { ok: false, error: "messages required" },
        { status: 400 },
      );
    }

    const address = typeof body?.address === "string" ? body.address.trim() : "";

    // The slow site I/O (geocode + satellite fetch) is gathered in a separate,
    // fast "prepare" call and handed back into the "report" call via
    // `body.prepared`, so the report request is AI-only and each request stays
    // under Netlify's ~26s function cap. When `prepared` is absent (older client)
    // we still compute inline for backward compatibility.
    const prepared = body?.prepared as
      | { location?: { lat: number; lng: number } | null; satellite?: string | null }
      | undefined;

    // "prepare": geocode the address + pull a current satellite tile. No model
    // call — fast. Timed so production logs show the real site-I/O cost.
    if (phase === "prepare") {
      const t0 = Date.now();
      let location: { lat: number; lng: number } | null = null;
      let satellite: string | null = null;
      if (address) {
        location = await geocodeAU(address);
        if (location) satellite = await fetchSatelliteDataUrl(location.lat, location.lng);
      }
      log.info("planning_feasibility.prepare_ms", {
        ms: Date.now() - t0,
        hasLocation: !!location,
        hasSatellite: !!satellite,
      });
      return NextResponse.json({ ok: true, location, satellite });
    }

    const system = phase === "report" ? REPORT_SYS : INTERVIEW_SYS;

    // Report: reuse the prepared site data; fall back to inline geocode only if
    // an older client didn't send it. The satellite image is returned to the
    // client for the map but is deliberately NOT sent to the report model —
    // vision on the ~180KB tile added ~10s of latency on its own.
    let location: { lat: number; lng: number } | null = null;
    if (phase === "report") {
      if (prepared && "location" in prepared) {
        location = prepared.location ?? null;
      } else if (address) {
        location = await geocodeAU(address);
      }
    }

    const chatMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: system },
      ...messages,
    ];

    // Report is AI-only (site I/O pre-fetched in "prepare"). We keep web search
    // on — it is the report's only grounding, and an ungrounded report that
    // invents planning figures is worse than a slow one. To claw back latency we
    // drop the satellite vision image (~10s) and lower effort/tokens. Interview
    // keeps its lighter settings.
    const modelT0 = Date.now();
    const text = await orText({
      model: MODELS.smart,
      web: true,
      effort: "medium",
      maxTokens: phase === "report" ? 6000 : 1500,
      messages: chatMessages,
    });
    log.info("planning_feasibility.model_ms", { phase, ms: Date.now() - modelT0 });

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
      const report =
        parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
      if (location) report.location = location; // authoritative coords for the map
      return NextResponse.json({ ok: true, report });
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
