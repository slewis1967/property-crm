/**
 * POST /api/ai/email-draft
 *   Body: { contact_id, instruction?, parent_email_id? }
 *   Returns: { ok: true, subject, body }
 *
 * Drafts an email from contact context. If `parent_email_id` is given, drafts
 * a reply to that email. If `instruction` is given, uses it as the topic hint
 * (e.g. "follow up on our last conversation", "send the SDA brochure").
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { aiCall } from "../../../../utils/ai";

export const dynamic = "force-dynamic";

const SYSTEM = `You are drafting an outbound email from Sean Lewis at NextKey Property Strategists. Use Australian English. Be concise and warm but professional — short paragraphs, no fluff.

Hard rules:
- Never use spruiker / urgency tactics ("limited spots", "guaranteed returns", "act now", "don't miss out", "spots filling fast"). NextKey doesn't sell that way.
- Never reveal specific builder names — NextKey's stock-builder relationships are anonymised by policy.
- Don't claim to be a financial planner / mortgage broker / solicitor — frame everything as advisory or general information.
- No emojis. No exclamation points unless the original conversation used them.

Output format — STRICT JSON, no markdown fence:
  {"subject": "...", "body": "..."}

The body should be plain text (paragraph breaks via two newlines). Sign off with "— Sean".`;

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { contact_id, instruction, parent_email_id } = body;
  if (!contact_id) {
    return NextResponse.json({ ok: false, error: "contact_id required" }, { status: 400 });
  }

  // Load contact + recent emails for context.
  const { data: contact } = await supabase
    .from("contacts")
    .select("name,full_name,email,buyer_type,preferred_state,state,budget_max,budget,timeframe,temperature,status,notes,lead_score")
    .eq("id", contact_id)
    .maybeSingle();
  if (!contact) {
    return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });
  }

  const { data: recentEmails } = await supabase
    .from("email_log")
    .select("direction,from_email,subject,body_text,sent_at,created_at")
    .eq("contact_id", contact_id)
    .order("created_at", { ascending: false })
    .limit(6);

  let parentEmail: { from_email: string; subject: string; body_text: string | null; sent_at: string | null } | null = null;
  if (parent_email_id) {
    const { data: parent } = await supabase
      .from("email_log")
      .select("from_email,subject,body_text,sent_at")
      .eq("id", parent_email_id)
      .maybeSingle();
    parentEmail = parent ?? null;
  }

  const contactName = contact.full_name || contact.name || "(unnamed)";
  const userPrompt = [
    "=== Contact ===",
    `Name: ${contactName}`,
    `Email: ${contact.email ?? "?"}`,
    `Buyer type: ${contact.buyer_type ?? "?"}`,
    `State: ${contact.preferred_state ?? contact.state ?? "?"}`,
    `Budget: ${contact.budget_max ?? contact.budget ?? "?"}`,
    `Timeframe: ${contact.timeframe ?? "?"}`,
    `Temperature: ${contact.temperature ?? "?"}`,
    `Status: ${contact.status ?? "?"}`,
    `Lead score: ${contact.lead_score ?? "?"}`,
    contact.notes ? `Notes:\n${contact.notes.slice(0, 600)}` : "",
    "",
    recentEmails && recentEmails.length > 0 ? "=== Recent emails (newest first) ===" : "",
    ...(recentEmails ?? []).map((e) => {
      const dir = e.direction === "inbound" ? "← from contact" : "→ from us";
      const when = e.sent_at ?? e.created_at;
      const dateStr = when ? new Date(when).toLocaleDateString("en-AU") : "?";
      return `- [${dateStr} ${dir}] ${e.subject}\n  ${(e.body_text ?? "").slice(0, 300)}`;
    }),
    "",
    parentEmail ? "=== Replying to this message ===" : "",
    parentEmail ? `From: ${parentEmail.from_email}` : "",
    parentEmail ? `Subject: ${parentEmail.subject}` : "",
    parentEmail ? `Body:\n${(parentEmail.body_text ?? "").slice(0, 1500)}` : "",
    "",
    "=== Your task ===",
    parentEmail
      ? `Draft a reply to the message above. ${instruction ? `Specific instruction: ${instruction}` : "Acknowledge what they said, then move the conversation forward."}`
      : `Draft a fresh email to ${contactName}. ${instruction ? `Topic: ${instruction}` : "Pick a sensible follow-up based on their stage and recent activity."}`,
  ].filter(Boolean).join("\n");

  let raw: string;
  try {
    raw = await aiCall({
      system: SYSTEM,
      user: userPrompt,
      maxTokens: 1500,
      effort: "medium",
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "AI request failed" },
      { status: 500 },
    );
  }

  // Parse JSON. Tolerate fences if the model adds them despite instructions.
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  let parsed: { subject?: string; body?: string };
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return NextResponse.json(
      { ok: false, error: "AI returned non-JSON output", raw: cleaned.slice(0, 500) },
      { status: 502 },
    );
  }
  if (!parsed.subject || !parsed.body) {
    return NextResponse.json(
      { ok: false, error: "AI output missing subject or body", raw: cleaned.slice(0, 500) },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, subject: parsed.subject, body: parsed.body });
}
