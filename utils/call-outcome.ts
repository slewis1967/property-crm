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

export type NoteEntry = {
  text: string;
  created_at: string;
  call?: CallOutcome;
  /** Set on notes written by Elvis's work-phone call recorder (C:/Users/sean/bin/glenn-call-recorder.py). */
  source?: string;
  /** `call-recordings/leads/<lead_id>/<file>.mp3` in the private Supabase bucket. Played via a signed URL. */
  recording_path?: string;
  transcript?: string;
};

export const RECORDING_BUCKET = "call-recordings";

/**
 * Splits a stored recording path into bucket-relative form, and refuses anything that is not
 * under this lead's own folder: the path comes from the notes blob, which any note writer can
 * set, so the signing route must not sign whatever it is handed.
 */
const LEAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function recordingObjectPath(recordingPath: unknown, leadId: string): string | null {
  if (typeof recordingPath !== "string") return null;
  // The lead id comes from the URL; it must be a plain UUID, or ".." could walk out of leads/<id>/.
  if (!LEAD_ID.test(leadId)) return null;
  const prefix = `${RECORDING_BUCKET}/leads/${leadId}/`;
  if (!recordingPath.startsWith(prefix)) return null;
  const rest = recordingPath.slice(prefix.length);
  if (!rest || rest.includes("/") || rest.includes("..") || !/^[\w.-]+\.(mp3|wav|m4a)$/.test(rest)) return null;
  return recordingPath.slice(RECORDING_BUCKET.length + 1);
}


export function isCallOutcome(value: unknown): value is CallOutcome {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(CALL_OUTCOMES, value);
}

export function callNote(outcome: CallOutcome, at: string): NoteEntry {
  return { text: `Call: ${CALL_OUTCOMES[outcome]}`, created_at: at, call: outcome };
}
