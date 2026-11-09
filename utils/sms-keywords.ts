/**
 * STOP / START reply handling, shared by every inbound-SMS webhook (ClickSend
 * and the work phone's SMS gateway) so an opt-out behaves the same whichever
 * way the reply arrived.
 */

const STOP_WORDS = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "OPTOUT", "OPT-OUT", "REMOVE"]);
// Only an explicit opt-in. "YES" and "SUBSCRIBE" used to count, which meant a client who had sent STOP
// and later replied "Yes, Tuesday works" was silently re-subscribed.
const START_WORDS = new Set(["START", "UNSTOP"]);

export type ReplyKeyword = "stop" | "start" | null;

/** A reply counts only when the whole message is the keyword ("Stop", "STOP!"), not a sentence containing it. */
export function replyKeyword(message: string): ReplyKeyword {
  const word = message.trim().toUpperCase().replace(/[^A-Z-]/g, "");
  if (STOP_WORDS.has(word)) return "stop";
  if (START_WORDS.has(word)) return "start";
  return null;
}
