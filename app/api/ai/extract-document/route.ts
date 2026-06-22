/**
 * Extract structured data from an uploaded document (PDF or image) using
 * Claude's native PDF / vision support.
 *
 * Request:
 *   { fileBase64: string, mediaType: "application/pdf" | "image/jpeg" | "image/png" | "image/webp",
 *     contactId?: string, hint?: string }
 *
 * Response (success):
 *   { ok: true,
 *     document_type: string,
 *     parties: string[],
 *     key_dates: { label: string, date: string }[],
 *     key_amounts: { label: string, amount: string }[],
 *     summary: string,
 *     suggested_tags: string[],
 *     suggested_tasks: { title: string, due_date: string | null }[],
 *     suggested_notes_text: string }
 *
 * The output JSON shape was deliberately chosen so the front-end can map
 * suggested_tags/_tasks/_notes_text straight into the existing
 * /api/ai/quick-log-apply endpoint. Document storage isn't included in v1
 * — the advisor keeps the original locally; we just save the extraction.
 */
import { NextResponse } from "next/server";
import { MODELS, orChat, orErrorMessage } from "../../../../utils/openrouter";

import { requireAuth } from "../../../../utils/cf-access";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60; // Netlify default 10s — bump for large PDFs

const SYSTEM = `You extract structured data from a property advisor's documents — typically contracts, contracts of sale, ID docs, finance approvals, building/pest reports, deposit slips, or general correspondence.

Read the document carefully. Output STRICT JSON only — no preamble, no markdown fences:

{
  "document_type": "<short label, e.g. 'Contract of Sale', 'Pre-approval letter', 'ID document', 'Building report', 'Deposit receipt', 'Generic correspondence'>",
  "parties": ["<name and role, e.g. 'Sarah Brown (purchaser)', 'NextKey Pty Ltd (vendor)'>"],
  "key_dates": [{"label": "<e.g. Settlement, Cooling-off expires, Finance approval deadline>", "date": "<YYYY-MM-DD or natural-language>"}],
  "key_amounts": [{"label": "<e.g. Purchase price, Deposit, Stamp duty>", "amount": "<as written in doc, e.g. '$680,000', '$34,000 (5%)'>"}],
  "summary": "<2-3 sentence plain-English summary of what this document is and the operative terms>",
  "suggested_tags": ["<lowercase tag>", ...],
  "suggested_tasks": [{"title": "<concrete action>", "due_date": "<ISO date or null>"}],
  "suggested_notes_text": "<one-paragraph note suitable for appending to a contact's note history; mentions the doc type + key terms>"
}

Rules:
- Only include facts that are CLEARLY in the document. Don't invent.
- If a section has no relevant content, return an empty array (or empty string for summary/notes).
- Tasks should be specific advisor actions (e.g. "Diary settlement on 14 Mar", "Confirm finance pre-approval expiry"). Don't invent.
- Tags lowercase, 1-3 words each (e.g. "contract", "settlement-mar-14", "$680k", "qld").
- Dates: prefer ISO YYYY-MM-DD where the doc gives a precise date; otherwise natural-language is OK.
- Don't expose any unredacted personal IDs (license numbers, passport, TFN) in tags or summary — keep those out unless absolutely critical to the action.`;

export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await req.json();
    const fileBase64: string | undefined = body.fileBase64;
    const mediaType: string | undefined = body.mediaType;
    const hint: string | undefined = body.hint;

    if (!fileBase64 || !mediaType) {
      return NextResponse.json(
        { ok: false, error: "fileBase64 and mediaType required" },
        { status: 400 },
      );
    }
    const allowed = new Set([
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
    if (!allowed.has(mediaType)) {
      return NextResponse.json(
        { ok: false, error: `Unsupported media type: ${mediaType}` },
        { status: 400 },
      );
    }

    // Sanity-check size — base64-encoded payload >> raw bytes. Cap at ~30MB raw.
    const approxRawBytes = (fileBase64.length * 3) / 4;
    if (approxRawBytes > 30 * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, error: "File too large (>30 MB)" },
        { status: 413 },
      );
    }

    const dataUrl = `data:${mediaType};base64,${fileBase64}`;
    const isPdf = mediaType === "application/pdf";

    // OpenRouter multimodal content: images use `image_url`; PDFs use a `file`
    // part + the file-parser plugin. `engine: "native"` defers to the model's
    // own document support (the Claude default has it) and is the cheapest path.
    const sourceBlock = isPdf
      ? {
          type: "file" as const,
          file: { filename: "document.pdf", file_data: dataUrl },
        }
      : {
          type: "image_url" as const,
          image_url: { url: dataUrl },
        };

    const userInstruction = hint
      ? `Hint from advisor: ${hint}\n\nExtract the structured data per the system prompt.`
      : `Extract the structured data per the system prompt.`;

    const chatBody: Record<string, unknown> = {
      model: MODELS.smart,
      // Reasoning tokens share this budget on OpenRouter, so leave generous
      // headroom — a dense multi-page PDF can spend a lot thinking before it
      // emits the ~4k-token JSON, and a too-tight cap returns empty content
      // (misreported as "document may be empty or unreadable").
      max_tokens: 12000,
      reasoning: { effort: "medium" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: [sourceBlock, { type: "text", text: userInstruction }],
        },
      ],
    };
    if (isPdf) chatBody.plugins = [{ id: "file-parser", pdf: { engine: "native" } }];

    const response = await orChat(chatBody);
    const raw = response.choices?.[0]?.message?.content ?? "";
    if (!raw) {
      return NextResponse.json(
        { ok: false, error: "AI returned no text. The document may be empty or unreadable." },
        { status: 500 },
      );
    }

    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) {
      return NextResponse.json(
        { ok: false, error: "AI response was not valid JSON", raw_excerpt: raw.slice(0, 500) },
        { status: 500 },
      );
    }
    let parsed: any;
    try {
      parsed = JSON.parse(m[0]);
    } catch (e: any) {
      return NextResponse.json(
        { ok: false, error: `JSON parse failed: ${e?.message ?? "unknown"}`, raw_excerpt: raw.slice(0, 500) },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      document_type: parsed.document_type ?? "",
      parties: Array.isArray(parsed.parties) ? parsed.parties : [],
      key_dates: Array.isArray(parsed.key_dates) ? parsed.key_dates : [],
      key_amounts: Array.isArray(parsed.key_amounts) ? parsed.key_amounts : [],
      summary: typeof parsed.summary === "string" ? parsed.summary : "",
      suggested_tags: Array.isArray(parsed.suggested_tags) ? parsed.suggested_tags : [],
      suggested_tasks: Array.isArray(parsed.suggested_tasks) ? parsed.suggested_tasks : [],
      suggested_notes_text:
        typeof parsed.suggested_notes_text === "string" ? parsed.suggested_notes_text : "",
    });
  } catch (e) {
    const msg = orErrorMessage(e);
    const status = /rate-limited/.test(msg) ? 429 : 500;
    return NextResponse.json({ ok: false, error: msg }, { status });
  }
}
