/**
 * Outcome of one sales call. Saved as an entry in the lead's notes array with a
 * `call` field, so it appears in the notes history and needs no new table.
 * NEXUS springboard_ads_agent.py reads these fields to judge which leads answer.
 */
export const CALL_OUTCOMES = {
  answered: "Answered",
  no_answer: "No answer",
  voicemail: "Voicemail",
  wrong_number: "Wrong number",
} as const;

export type CallOutcome = keyof typeof CALL_OUTCOMES;

export type NoteEntry = { text: string; created_at: string; call?: CallOutcome };

export function isCallOutcome(value: unknown): value is CallOutcome {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(CALL_OUTCOMES, value);
}

export function callNote(outcome: CallOutcome, at: string): NoteEntry {
  return { text: `Call: ${CALL_OUTCOMES[outcome]}`, created_at: at, call: outcome };
}
