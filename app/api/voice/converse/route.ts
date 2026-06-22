/**
 * POST /api/voice/converse
 *   Body: { transcript: string, history: Array<{role, content}> }
 *
 * The voice assistant's brain. Takes a transcribed user utterance + the
 * running conversation history, asks Claude Haiku to plan/execute, and
 * returns:
 *   { ok, reply: string, history: <updated>, side_effects: [...] }
 *
 * `reply` is the plain-text response the client should speak via
 * speechSynthesis. `side_effects` lists what actually happened (SMS sent,
 * task created, contact found) so the UI can render visual confirmation
 * alongside the spoken response.
 *
 * Tool inventory (MVP):
 *   - find_contact         lookup by name/phone/email, returns top match
 *   - log_call             append a dated note to a contact's notes field
 *   - create_task          add to tasks table with optional due_date
 *   - send_sms             ClickSend — requires confirmed=true
 *   - send_email           Brevo — requires confirmed=true
 *
 * Confirm-before-send: send_* tools accept a `confirmed: boolean` param.
 * Claude is told to set confirmed=false on first call (which only DRAFTS
 * the action) and to call again with confirmed=true after the user says
 * yes. The server enforces the rule — confirmed=false never actually fires.
 */
import { NextResponse } from "next/server";
import type OpenAI from "openai";
import { openrouter, MODELS, orErrorMessage } from "../../../../utils/openrouter";
import { supabase } from "../../../../utils/supabase";
import { sendBrevoEmail } from "../../../../utils/brevo";
import { defaultSignature } from "../../../../utils/email-signature";
import { userEmailFromRequest } from "../../../../utils/cf-access";
import { resolveSender } from "../../../../utils/mail-owner";
import { orSafe } from "../../../../utils/postgrest-safe";
import { getAiInstructions, aiInstructionsBlock } from "../../../../utils/ai-instructions";

import { requireAuth } from "../../../../utils/cf-access";
export const dynamic = "force-dynamic";

const MODEL = MODELS.fast;
const MAX_TOOL_ITERATIONS = 6;

// ── Tool definitions (OpenAI/OpenRouter function-calling format) ────────────
const TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "find_contact",
      description:
        "Look up a contact by name, phone number, or email. Returns the top match with id, full_name, phone, email, and a short summary of their last note. Use this first whenever the user mentions a person by name — you need their id before you can log calls, create tasks, or send messages to them.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Name, phone, or email to search." },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "log_call",
      description:
        "Append a dated call note to a contact. Use after the user describes a phone conversation they just had or wants to record. No confirmation needed — this is a low-risk write.",
      parameters: {
        type: "object",
        properties: {
          contact_id: { type: "string", description: "UUID from find_contact." },
          summary: { type: "string", description: "What was discussed, max ~500 chars." },
        },
        required: ["contact_id", "summary"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_task",
      description:
        "Create a task / reminder. Can be attached to a contact (use contact_id) or standalone. Use when the user says 'remind me to…' or 'add a task to…'.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "What to do." },
          contact_id: { type: "string", description: "Optional contact this task relates to." },
          due_date: {
            type: "string",
            description: "ISO date (YYYY-MM-DD) if the user specified one. Resolve relative phrases ('next Tuesday') to absolute dates yourself.",
          },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_sms",
      description:
        "Send an SMS via ClickSend. ALWAYS call this twice when the user asks to send a text:\n  1. First with confirmed=false — this drafts only, does NOT send. Then speak back the draft and ask 'send it?'.\n  2. Once the user says yes/confirm/send, call again with confirmed=true. Otherwise abandon.\nIf the user says 'and send it' / 'just do it' in the initial request, you may skip step 1 and call with confirmed=true directly.",
      parameters: {
        type: "object",
        properties: {
          contact_id: { type: "string", description: "UUID from find_contact." },
          message: { type: "string", description: "The SMS body, max 320 chars." },
          confirmed: { type: "boolean", description: "false = draft only, true = actually send." },
        },
        required: ["contact_id", "message", "confirmed"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_email",
      description:
        "Send an email via Brevo. Same two-step confirm pattern as send_sms — first call confirmed=false to draft + read back, second call confirmed=true to actually send.",
      parameters: {
        type: "object",
        properties: {
          contact_id: { type: "string", description: "UUID from find_contact." },
          subject: { type: "string" },
          body: { type: "string", description: "Plain text — signature is appended server-side." },
          confirmed: { type: "boolean", description: "false = draft only, true = actually send." },
        },
        required: ["contact_id", "subject", "body", "confirmed"],
      },
    },
  },
];

// ── Tool implementations (server-side) ─────────────────────────────────────

type ToolResult = { content: string; side_effect?: Record<string, unknown> };

async function findContact(query: string): Promise<ToolResult> {
  const q = query.trim();
  if (!q) return { content: "No query provided." };
  // Strip PostgREST .or() / ilike syntax chars before interpolation — handles
  // transcripts like "Smith, Jr." or "O'Brien" and prevents clause injection.
  // Phone lookup is unaffected because we digit-only it separately.
  const safe = orSafe(q);
  if (!safe) return { content: `No usable characters in query "${q}".` };
  const phoneDigits = q.replace(/\D/g, "");
  const orFilter = [
    `full_name.ilike.%${safe}%`,
    `name.ilike.%${safe}%`,
    `first_name.ilike.%${safe}%`,
    `email.ilike.%${safe}%`,
  ];
  if (phoneDigits.length >= 4) orFilter.push(`phone.ilike.%${phoneDigits}%`);

  const { data, error } = await supabase
    .from("contacts")
    .select("id,full_name,name,first_name,phone,email,temperature,status,notes")
    .or(orFilter.join(","))
    .limit(5);

  if (error) return { content: `Search error: ${error.message}` };
  if (!data || data.length === 0) return { content: `No contact found matching "${q}".` };

  const matches = data.map((c) => ({
    id: c.id,
    name: c.full_name || c.name || c.first_name || "(unnamed)",
    phone: c.phone,
    email: c.email,
    temperature: c.temperature,
    status: c.status,
    // First 300 chars of notes — gives Claude context for follow-ups without
    // dumping the entire archive history
    last_note: (c.notes || "").slice(0, 300) || null,
  }));
  return {
    content: JSON.stringify({ matches }, null, 2),
    side_effect: { kind: "find_contact", query: q, results: matches.length, top: matches[0] },
  };
}

async function logCall(contactId: string, summary: string): Promise<ToolResult> {
  const { data: contact, error: lookupErr } = await supabase
    .from("contacts")
    .select("id,full_name,name,notes")
    .eq("id", contactId)
    .maybeSingle();
  if (lookupErr || !contact) return { content: `Contact ${contactId} not found.` };

  const ts = new Date().toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
  const newEntry = `\n\n[${ts} · voice call note]\n${summary.trim()}`;
  const updated = (contact.notes || "") + newEntry;
  const { error: writeErr } = await supabase
    .from("contacts")
    .update({ notes: updated })
    .eq("id", contactId);
  if (writeErr) return { content: `Could not save: ${writeErr.message}` };
  return {
    content: `Note saved on ${contact.full_name || contact.name}.`,
    side_effect: { kind: "log_call", contact_id: contactId, contact_name: contact.full_name || contact.name, summary },
  };
}

async function createTask(args: { title: string; contact_id?: string; due_date?: string }): Promise<ToolResult> {
  const row: Record<string, unknown> = {
    title: args.title.trim().slice(0, 200),
    source: "voice",
  };
  if (args.contact_id) row.contact_id = args.contact_id;
  if (args.due_date) row.due_date = args.due_date;

  const { data, error } = await supabase
    .from("tasks")
    .insert(row)
    .select("id,title,due_date,contact_id")
    .single();
  if (error) return { content: `Task save failed: ${error.message}` };
  return {
    content: `Task created: "${data.title}"${data.due_date ? ` (due ${data.due_date})` : ""}.`,
    side_effect: { kind: "create_task", task_id: data.id, title: data.title, due_date: data.due_date },
  };
}

async function sendSms(args: { contact_id: string; message: string; confirmed: boolean }): Promise<ToolResult> {
  const { data: contact } = await supabase
    .from("contacts")
    .select("id,full_name,name,phone")
    .eq("id", args.contact_id)
    .maybeSingle();
  if (!contact) return { content: "Contact not found." };
  if (!contact.phone) return { content: `${contact.full_name || contact.name} has no phone number on file.` };

  if (!args.confirmed) {
    return {
      content: `DRAFT (not sent). Asking the user for confirmation before sending.\nTo: ${contact.full_name || contact.name} <${contact.phone}>\nMessage: ${args.message}`,
      side_effect: { kind: "draft_sms", contact_name: contact.full_name || contact.name, phone: contact.phone, message: args.message },
    };
  }

  // Actual send via ClickSend. Failures bubble up so Claude can apologise
  // verbally instead of pretending it worked.
  try {
    const sms = await import("../../../../utils/sms");
    const result = await sms.sendSms({
      contactId: args.contact_id,
      phone: contact.phone,
      body: args.message,
      campaign: "voice",
    });
    if (!result.ok) return { content: `Send failed: ${result.error}` };
    return {
      content: `SMS sent to ${contact.full_name || contact.name}.`,
      side_effect: { kind: "send_sms", contact_id: args.contact_id, message: args.message },
    };
  } catch (e) {
    return { content: `Send threw: ${e instanceof Error ? e.message : String(e)}` };
  }
}

async function sendEmail(args: { contact_id: string; subject: string; body: string; confirmed: boolean }, senderEmail: string | null): Promise<ToolResult> {
  const { data: contact } = await supabase
    .from("contacts")
    .select("id,full_name,name,email")
    .eq("id", args.contact_id)
    .maybeSingle();
  if (!contact) return { content: "Contact not found." };
  if (!contact.email) return { content: `${contact.full_name || contact.name} has no email on file.` };

  if (!args.confirmed) {
    return {
      content: `DRAFT (not sent). Asking the user for confirmation.\nTo: ${contact.full_name || contact.name} <${contact.email}>\nSubject: ${args.subject}\nBody preview: ${args.body.slice(0, 200)}${args.body.length > 200 ? "…" : ""}`,
      side_effect: { kind: "draft_email", contact_name: contact.full_name || contact.name, email: contact.email, subject: args.subject, body: args.body },
    };
  }

  // Wrap plain text body in minimal HTML + append the sender's signature
  const sig = await defaultSignature(senderEmail ?? undefined);
  const html = `<p>${args.body.replace(/\n\n+/g, "</p><p>").replace(/\n/g, "<br>")}</p>${sig.html}`;
  const result = await sendBrevoEmail({
    to: [{ email: contact.email, name: contact.full_name || contact.name || undefined }],
    subject: args.subject,
    html,
    tags: ["voice-send"],
  });
  if (!result.ok) return { content: `Send failed: ${result.error}` };
  // Log to email_log so the contact's history reflects it
  const ownerEmail = await resolveSender(senderEmail);
  await supabase.from("email_log").insert({
    contact_id: args.contact_id,
    direction: "outbound",
    to_email: contact.email,
    from_email: process.env.BREVO_SENDER_EMAIL ?? "info@nextkey.com.au",
    from_name: process.env.BREVO_SENDER_NAME ?? "NextKey Property Strategists",
    subject: args.subject,
    body_html: html,
    status: "sent",
    brevo_message_id: result.messageId,
    message_id: result.messageId,
    sent_by: senderEmail,
    owner_user_email: ownerEmail,
    is_read: true,
    tags: ["voice"],
    sent_at: new Date().toISOString(),
  });
  return {
    content: `Email sent to ${contact.full_name || contact.name}.`,
    side_effect: { kind: "send_email", contact_id: args.contact_id, subject: args.subject },
  };
}

// ── Dispatch ───────────────────────────────────────────────────────────────
async function dispatchTool(name: string, input: Record<string, unknown>, senderEmail: string | null): Promise<ToolResult> {
  switch (name) {
    case "find_contact": return findContact(String(input.query ?? ""));
    case "log_call":     return logCall(String(input.contact_id ?? ""), String(input.summary ?? ""));
    case "create_task":  return createTask({
      title: String(input.title ?? ""),
      contact_id: input.contact_id ? String(input.contact_id) : undefined,
      due_date: input.due_date ? String(input.due_date) : undefined,
    });
    case "send_sms":     return sendSms({
      contact_id: String(input.contact_id ?? ""),
      message: String(input.message ?? ""),
      confirmed: Boolean(input.confirmed),
    });
    case "send_email":   return sendEmail({
      contact_id: String(input.contact_id ?? ""),
      subject: String(input.subject ?? ""),
      body: String(input.body ?? ""),
      confirmed: Boolean(input.confirmed),
    }, senderEmail);
    default:             return { content: `Unknown tool: ${name}` };
  }
}

// ── Main endpoint ──────────────────────────────────────────────────────────
const SYSTEM = `You are NextKey's voice assistant — Sean and Glenn talk to you
through their browser, and your replies are spoken aloud via the browser's
text-to-speech. Keep replies short and conversational (1-2 sentences). No
markdown, no bullet lists, no emojis — they sound terrible when read out.

You have CRM tools for finding contacts, logging calls, creating tasks, and
sending SMS / email. Workflow:
  1. Find the contact first if the user mentions a name.
  2. For sends (SMS/email): call the tool with confirmed=false to draft.
     Read the draft back, ask "send it?" Wait for the user to confirm
     verbally before calling again with confirmed=true.
  3. If a tool returns an error, say what went wrong in plain language and
     suggest a next step.

When you don't have enough info (e.g. multiple contacts match), ask one
clarifying question. Don't dump the full list — pick the top hit and
confirm "did you mean X?" if there's ambiguity.

Today's date: ${new Date().toLocaleDateString("en-AU", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`;

// The history we accept back from the client is whatever we returned on the
// previous turn — but the client can also tamper with it. Validating defends
// against injecting fake tool results (e.g. "user already confirmed the SMS")
// that would prime the model to call confirmed=true without a real verbal yes.
// We only admit the three OpenAI message shapes we ourselves emit, and require
// each `tool` message to carry a tool_call_id (so a fabricated result can't
// dangle without a matching assistant tool_call).
type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

function sanitizeHistory(raw: unknown): ChatMessage[] {
  if (!Array.isArray(raw)) return [];
  const out: ChatMessage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const role = (item as { role?: unknown }).role;
    const content = (item as { content?: unknown }).content;

    if (role === "user") {
      if (typeof content === "string" && content) out.push({ role, content });
      continue;
    }

    if (role === "assistant") {
      const rawCalls = (item as { tool_calls?: unknown }).tool_calls;
      const tool_calls = Array.isArray(rawCalls)
        ? rawCalls
            .filter(
              (c): c is { id: string; type: "function"; function: { name: string; arguments: string } } =>
                c !== null &&
                typeof c === "object" &&
                typeof (c as { id?: unknown }).id === "string" &&
                (c as { type?: unknown }).type === "function" &&
                typeof (c as { function?: { name?: unknown } }).function?.name === "string" &&
                typeof (c as { function?: { arguments?: unknown } }).function?.arguments === "string",
            )
            .map((c) => ({
              id: c.id,
              type: "function" as const,
              function: { name: c.function.name, arguments: c.function.arguments },
            }))
        : [];
      const text = typeof content === "string" ? content : null;
      if (tool_calls.length > 0) {
        out.push({ role, content: text, tool_calls });
      } else if (text) {
        out.push({ role, content: text });
      }
      continue;
    }

    if (role === "tool") {
      const toolCallId = (item as { tool_call_id?: unknown }).tool_call_id;
      if (typeof toolCallId === "string" && toolCallId && typeof content === "string") {
        out.push({ role, tool_call_id: toolCallId, content });
      }
      continue;
    }
  }
  return out;
}

export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const { transcript, history } = await req.json();
    if (!transcript || typeof transcript !== "string") {
      return NextResponse.json({ ok: false, error: "transcript required" }, { status: 400 });
    }

    const senderEmail = userEmailFromRequest(req);
    // Operator's custom instructions (Settings → AI instructions), appended as a
    // subordinate block — can't override confirm-before-send or compliance limits.
    const system = SYSTEM + aiInstructionsBlock(await getAiInstructions());
    const messages: ChatMessage[] = [
      { role: "system", content: system },
      ...sanitizeHistory(history),
      { role: "user", content: transcript },
    ];

    const sideEffects: Record<string, unknown>[] = [];
    let finalText = "";

    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await openrouter.chat.completions.create({
        model: MODEL,
        max_tokens: 1024,
        tools: TOOLS,
        messages,
      });

      const msg = response.choices?.[0]?.message;
      const toolCalls = msg?.tool_calls ?? [];
      const turnText = (msg?.content ?? "").trim();

      // Append the assistant turn to history regardless of tool use — the
      // conversation must include the assistant tool_calls and the matching
      // `tool` messages on the next turn.
      messages.push({
        role: "assistant",
        content: msg?.content ?? null,
        ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
      });

      if (toolCalls.length === 0) {
        finalText = turnText;
        break;
      }

      // Run all tool calls in this turn, then send results back to the model
      for (const tc of toolCalls) {
        if (tc.type !== "function") continue;
        let input: Record<string, unknown> = {};
        try {
          input = JSON.parse(tc.function.arguments || "{}");
        } catch {
          input = {};
        }
        const result = await dispatchTool(tc.function.name, input, senderEmail);
        if (result.side_effect) sideEffects.push(result.side_effect);
        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result.content,
        });
      }
    }

    // The returned history must NOT include the system prompt — the client
    // sends it back next turn and we re-prepend a fresh one (with current
    // AI instructions + date). Stripping it also keeps SYSTEM off the wire.
    const returnedHistory = messages.filter((m) => m.role !== "system");

    return NextResponse.json({
      ok: true,
      reply: finalText || "Sorry, I didn't get that.",
      history: returnedHistory,
      side_effects: sideEffects,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: orErrorMessage(e) },
      { status: 500 },
    );
  }
}
