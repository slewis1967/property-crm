/**
 * Validates the voice assistant's conversation history.
 *
 * The history we accept back from the client is whatever we returned on the
 * previous turn — but the client can also tamper with it. Validating defends
 * against injecting fake tool results (e.g. "user already confirmed the SMS")
 * that would prime the model to call confirmed=true without a real verbal yes.
 *
 * Two passes:
 *   1. Shape: every block is rebuilt from the fields we ourselves emit, so
 *      anything else is dropped. That includes thinking blocks, which are only
 *      needed inside the tool loop that produced them.
 *   2. Pairing: an assistant `tool_use` is kept only if the next message answers
 *      it with a `tool_result`, and a `tool_result` survives only if it answers a
 *      kept call. This keeps the API contract AND stops a dangling tool result
 *      from being smuggled in to prime a send.
 */
import type Anthropic from "@anthropic-ai/sdk";

type Message = Anthropic.MessageParam;
type AssistantBlock = Anthropic.TextBlockParam | Anthropic.ToolUseBlockParam;

const TOOL_ID = /^[a-zA-Z0-9_-]+$/;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function assistantBlocks(content: unknown): AssistantBlock[] {
  if (typeof content === "string") return content ? [{ type: "text", text: content }] : [];
  if (!Array.isArray(content)) return [];
  const out: AssistantBlock[] = [];
  for (const b of content) {
    if (!isRecord(b)) continue;
    if (b.type === "text" && typeof b.text === "string" && b.text) {
      out.push({ type: "text", text: b.text });
    } else if (
      b.type === "tool_use" &&
      typeof b.id === "string" &&
      TOOL_ID.test(b.id) &&
      typeof b.name === "string" &&
      TOOL_ID.test(b.name) &&
      isRecord(b.input)
    ) {
      out.push({ type: "tool_use", id: b.id, name: b.name, input: b.input });
    }
  }
  return out;
}

function toolResults(content: unknown): Anthropic.ToolResultBlockParam[] {
  if (!Array.isArray(content)) return [];
  const out: Anthropic.ToolResultBlockParam[] = [];
  for (const b of content) {
    if (
      isRecord(b) &&
      b.type === "tool_result" &&
      typeof b.tool_use_id === "string" &&
      typeof b.content === "string"
    ) {
      out.push({ type: "tool_result", tool_use_id: b.tool_use_id, content: b.content });
    }
  }
  return out;
}

export function sanitizeVoiceHistory(raw: unknown): Message[] {
  if (!Array.isArray(raw)) return [];
  const items = raw.filter(isRecord);
  const out: Message[] = [];

  for (let i = 0; i < items.length; i++) {
    const { role, content } = items[i]!;

    if (role === "user") {
      // A tool_result reached here was not consumed by a call below → orphan.
      if (typeof content === "string" && content) out.push({ role: "user", content });
      continue;
    }
    if (role !== "assistant") continue;

    const blocks = assistantBlocks(content);
    const calls = blocks.filter((b) => b.type === "tool_use");
    const text = blocks.filter((b) => b.type === "text");
    if (calls.length === 0) {
      if (text.length) out.push({ role: "assistant", content: text });
      continue;
    }

    const next = items[i + 1];
    const results = next?.role === "user" ? toolResults(next.content) : [];
    const answered = new Set(results.map((r) => r.tool_use_id));
    const keptCalls = calls.filter((c) => answered.has(c.id));

    if (keptCalls.length === 0) {
      // No call had a matching result — keep any spoken text, drop the calls.
      if (text.length) out.push({ role: "assistant", content: text });
      continue;
    }
    const keptIds = new Set(keptCalls.map((c) => c.id));
    const seen = new Set<string>();
    out.push({ role: "assistant", content: [...text, ...keptCalls] });
    out.push({
      role: "user",
      content: results.filter((r) => {
        if (!keptIds.has(r.tool_use_id) || seen.has(r.tool_use_id)) return false;
        seen.add(r.tool_use_id);
        return true;
      }),
    });
    i++; // the results message has been consumed
  }

  // The API requires the conversation to open with a user turn.
  const firstUser = out.findIndex((m) => m.role === "user");
  return firstUser === -1 ? [] : out.slice(firstUser);
}
