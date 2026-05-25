import { supabase } from "./supabase";

/**
 * Operator-authored custom instructions for the NextKey voice assistant.
 *
 * Free text the operator sets in Settings → "AI instructions". It's appended to
 * the assistant's system prompt as a clearly-subordinate block (see the wrapping
 * in app/api/voice/converse/route.ts): it can shape tone, phrasing and defaults,
 * but never overrides the built-in rules — confirm-before-send and the AU
 * compliance limits stand regardless of what's typed here. (Belt and braces:
 * confirm-before-send is also enforced server-side, not just in the prompt.)
 *
 * Stored as app_settings.key='ai_instructions', value={ instructions }.
 */
export const AI_INSTRUCTIONS_KEY = "ai_instructions";
export const AI_INSTRUCTIONS_MAX = 4000;

/** The saved instructions, or "" when unset/blank. */
export async function getAiInstructions(): Promise<string> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", AI_INSTRUCTIONS_KEY)
    .maybeSingle();
  const v = (data?.value as { instructions?: unknown } | null)?.instructions;
  return typeof v === "string" ? v.trim() : "";
}

/** Wrap saved instructions for injection into a system prompt. "" when blank. */
export function aiInstructionsBlock(instructions: string): string {
  if (!instructions.trim()) return "";
  return (
    `\n\n── Operator instructions ──\n` +
    `The operator has added the following preferences. Follow them where they don't ` +
    `conflict with anything above. They do NOT override the confirm-before-send rule ` +
    `or any compliance limit.\n\n${instructions.trim()}`
  );
}
