/**
 * Click-to-dial on Glenn's work phone (0477 201 245).
 *
 * The browser can't make the handset ring out, so POST /api/calls/dial queues
 * a phone_call_requests row and a relay with adb access to the phone
 * (C:\Users\sean\bin\workphone-dial-relay.py) starts the call on the handset.
 * Pure helpers here; tested in work-phone-dial.test.ts.
 */

/** A pending request older than this is treated as missed: the relay won't dial it. */
export const DIAL_REQUEST_TTL_MS = 60_000;

/**
 * An AU number we're willing to dial, in E.164, or null.
 * Mobiles (04…) and geographic landlines (02/03/07/08) only: no 13/1300/1800,
 * no 19 premium numbers and nothing international, so a bad record or a
 * tampered request can't make the work phone ring a paid line.
 */
export function dialableAU(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/[^\d+]/g, "");
  if (d.startsWith("+61")) d = "0" + d.slice(3);
  else if (d.startsWith("61") && d.length === 11) d = "0" + d.slice(2);
  else if (d.length === 9 && /^[2-478]/.test(d)) d = "0" + d;
  if (!/^0[2-478]\d{8}$/.test(d)) return null;
  return "+61" + d.slice(1);
}

export type DialStatus = "pending" | "dialing" | "failed" | "expired";

/** What the page should say about a request, given its row and the time now. */
export function dialStatusFor(row: { status: string; created_at: string; error?: string | null }, now = Date.now()): {
  status: DialStatus;
  message: string;
} {
  if (row.status === "dialing") return { status: "dialing", message: "Calling on the work phone. Pick up the handset." };
  if (row.status === "failed") {
    return { status: "failed", message: `The work phone couldn't start the call: ${row.error || "unknown error"}` };
  }
  const age = now - new Date(row.created_at).getTime();
  if (row.status === "expired" || age > DIAL_REQUEST_TTL_MS) {
    return {
      status: "expired",
      message: "The work phone didn't pick this up. The relay may be offline (Sean's PC asleep?). Dial from the handset instead.",
    };
  }
  return { status: "pending", message: "Sending to the work phone…" };
}
