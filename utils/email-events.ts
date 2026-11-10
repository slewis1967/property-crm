/**
 * Did the client actually GET the email — and did they open it?
 *
 * The CRM could tell you an email was sent and nothing more. When a client says
 * "I never received it" there was no way to answer, so the honest reply was a
 * shrug. On 25 July a meeting invite was accepted by Gmail and never opened; it
 * took a manual dig through Brevo's API to establish that, by which point the
 * meeting had been missed.
 *
 * Brevo records the delivery lifecycle per message. This turns that event
 * stream into one row per email with a status you can act on.
 *
 * Split as usual: everything below `summariseEmailEvents` is pure and tested;
 * the network call is the last function in the file.
 */

/** Brevo's event vocabulary (the subset that tells us anything). */
export type RawEmailEvent = {
  email: string;
  date: string;
  subject?: string | null;
  event: string;
  messageId?: string | null;
  reason?: string | null;
};

export type EmailStatus =
  | "clicked"
  | "opened"
  | "delivered"
  | "sent"
  | "bounced"
  | "blocked"
  | "spam"
  | "failed";

export type EmailMessage = {
  subject: string;
  /** When we handed it to Brevo. */
  sentAt: string | null;
  /** When the receiving server accepted it. */
  deliveredAt: string | null;
  /** First open, if any. */
  openedAt: string | null;
  status: EmailStatus;
  /** Why it failed, in words a human can act on. Null when nothing went wrong. */
  problem: string | null;
};

/**
 * Worst-outcome-wins. A message that bounced after being "sent" is bounced; the
 * good events must never mask a failure.
 */
const FAILURE_RANK: Record<string, { status: EmailStatus; problem: string }> = {
  hardBounces: { status: "bounced", problem: "Hard bounce — the address doesn't exist or rejected us permanently." },
  softBounces: { status: "bounced", problem: "Soft bounce — mailbox full or temporarily unavailable." },
  blocked: { status: "blocked", problem: "Blocked — this address is on the suppression list." },
  spam: { status: "spam", problem: "Marked as spam by the recipient." },
  invalid: { status: "failed", problem: "Invalid address." },
  error: { status: "failed", problem: "The provider reported an error." },
  deferred: { status: "sent", problem: "Deferred by the receiving server — it may still arrive." },
};

const SUCCESS_ORDER: EmailStatus[] = ["sent", "delivered", "opened", "clicked"];

function isLater(a: string | null, b: string): boolean {
  return !a || b < a; // keep the EARLIEST for first-open semantics
}

/**
 * One row per message, newest first.
 *
 * Grouped by messageId where Brevo supplies one. Falling back to the subject
 * alone would merge a weekly reminder's separate sends into a single row and
 * make "delivered" look like it covered all of them.
 */
export function summariseEmailEvents(events: RawEmailEvent[]): EmailMessage[] {
  const byMessage = new Map<string, RawEmailEvent[]>();
  events.forEach((e, i) => {
    const key = e.messageId || `${e.subject ?? ""}|${e.date?.slice(0, 16) ?? i}`;
    const list = byMessage.get(key) ?? [];
    list.push(e);
    byMessage.set(key, list);
  });

  const out: EmailMessage[] = [];
  for (const group of byMessage.values()) {
    let subject = "";
    let sentAt: string | null = null;
    let deliveredAt: string | null = null;
    let openedAt: string | null = null;
    let success: EmailStatus = "sent";
    const failures: string[] = [];

    // Pass 1: gather. Deliberately order-independent — Brevo returns events
    // newest-first, and judging a deferral before seeing the later delivery
    // would report a healthy message as a problem.
    for (const e of group) {
      if (!subject && e.subject) subject = e.subject;
      switch (e.event) {
        case "requests":
          if (isLater(sentAt, e.date)) sentAt = e.date;
          break;
        case "delivered":
          if (isLater(deliveredAt, e.date)) deliveredAt = e.date;
          if (SUCCESS_ORDER.indexOf("delivered") > SUCCESS_ORDER.indexOf(success)) success = "delivered";
          break;
        case "opened":
        case "uniqueOpened":
          if (isLater(openedAt, e.date)) openedAt = e.date;
          if (SUCCESS_ORDER.indexOf("opened") > SUCCESS_ORDER.indexOf(success)) success = "opened";
          break;
        case "clicks":
        case "click":
          success = "clicked";
          break;
        default:
          if (FAILURE_RANK[e.event]) failures.push(e.event);
      }
    }

    // Pass 2: judge, now that the whole picture is in.
    const realFailure = failures.find((f) => !(f === "deferred" && deliveredAt));
    const failure = realFailure ? FAILURE_RANK[realFailure]! : null;

    out.push({
      subject: subject || "(no subject)",
      sentAt,
      deliveredAt,
      openedAt,
      status: failure ? failure.status : success,
      problem: failure ? failure.problem : null,
    });
  }

  return out.sort((a, b) => (b.sentAt ?? "").localeCompare(a.sentAt ?? ""));
}

/**
 * The one case worth calling out in the UI: it arrived, and they never opened
 * it. That's the Kim Ho signature — almost always spam or Promotions.
 *
 * NOT proof they didn't read it: Brevo's open pixel needs images to load, and
 * plenty of clients block them. Phrased as a prompt to check, never as a fact.
 */
export function deliveredButUnopened(m: EmailMessage): boolean {
  return m.status === "delivered" && !!m.deliveredAt && !m.openedAt;
}

/** Short label for a status chip. */
export function statusLabel(m: EmailMessage): string {
  switch (m.status) {
    case "clicked": return "Clicked";
    case "opened": return "Opened";
    case "delivered": return "Delivered";
    case "sent": return "Sent";
    case "bounced": return "Bounced";
    case "blocked": return "Blocked";
    case "spam": return "Spam";
    default: return "Failed";
  }
}

// ── I/O ──────────────────────────────────────────────────────────────────────

/**
 * Pull a contact's recent email events from Brevo.
 *
 * Returns [] rather than throwing on any failure: this decorates an opportunity
 * page, and a provider outage must never take the page down with it.
 */
export async function fetchEmailEvents(email: string, days = 60): Promise<RawEmailEvent[]> {
  const key = process.env.BREVO_API_KEY;
  if (!key || !email) return [];

  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  const qs = new URLSearchParams({
    email,
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
    limit: "100",
  });

  try {
    const res = await fetch(`https://api.brevo.com/v3/smtp/statistics/events?${qs}`, {
      headers: { "api-key": key, accept: "application/json" },
      next: { revalidate: 60 }, // a minute is fresh enough; don't hammer per render
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { events?: RawEmailEvent[] };
    return json.events ?? [];
  } catch {
    return [];
  }
}
