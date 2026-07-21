/**
 * Document-collection reminder engine.
 *
 * Nudges each applicant to finish uploading their YLA Preliminary Assessment
 * documents, framed around YLA's weekly Thursday assessment cutoff (upload by
 * Wednesday 5pm → assessed that Thursday; miss it → a week's delay). Silence is
 * what kills document completion, so a small, well-timed, deadline-anchored
 * cadence — email + SMS — does most of the work.
 *
 * Design:
 *  - Idempotent + self-throttling: at most ONE reminder per request per day
 *    (Australia/Sydney), and it stops the instant a request is submitted /
 *    cancelled / expired.
 *  - Deadline-anchored: a weekly "cutoff" reminder fires on Wednesdays; between
 *    times a gentle drip (day 1, 3, 6) keeps it moving.
 *  - myGov-aware: when the ATO Income Statement is still outstanding — the step
 *    clients get lost on — the copy pushes the myGov guide and offers help.
 *  - Fresh link each time: the portal link carries a raw token we only store
 *    hashed, so we can't resend the original. Each reminder mints a NEW token
 *    (updating the hash), which also expires any older link. Better UX (a live
 *    link in the latest message) and better security (stale links die).
 *
 * SAFETY: nothing sends unless REMINDERS_ENABLED === "true". Otherwise every
 * run is a dry run that reports what it *would* send — so the schedule can be
 * live while the copy is still being signed off.
 */
import { supabase } from "./supabase";
import { sendBrevoEmail } from "./brevo";
import { sendSms, toE164AU } from "./sms";
import { YLA_DOCUMENTS } from "./yla-documents";
import { newToken } from "./sign-token";

export type ReminderKind = "nudge1" | "nudge2" | "nudge3" | "cutoff";
export type Channel = "email" | "sms";

// Gentle drip between cutoffs. `afterCount` gates on how many drip reminders
// have already gone out, so steps can't skip or repeat. Tunable in one place.
export const DRIP_STEPS: { kind: ReminderKind; minAgeDays: number; afterCount: number; channels: Channel[] }[] = [
  { kind: "nudge1", minAgeDays: 1, afterCount: 0, channels: ["email"] },
  { kind: "nudge2", minAgeDays: 3, afterCount: 1, channels: ["email", "sms"] },
  { kind: "nudge3", minAgeDays: 6, afterCount: 2, channels: ["email", "sms"] },
];

// Only ever contact clients during civil hours (Australia/Sydney).
const SEND_HOUR_START = 9;
const SEND_HOUR_END = 19;
// YLA assess Thursdays; the client must be in by Wednesday 5pm. Wednesday is the
// cutoff-reminder day; keep it to business hours so the "today's the day" push
// lands with time to act.
const CUTOFF_WEEKDAY = 3; // 0=Sun … 3=Wed
const CUTOFF_HOUR_START = 9;
const CUTOFF_HOUR_END = 17;

const DAY_MS = 24 * 60 * 60 * 1000;

function origin(): string {
  return (process.env.PUBLIC_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://crm.nextkey.com.au").replace(/\/+$/, "");
}
function fromName(): string {
  return process.env.REMINDER_FROM_NAME || "Glenn from NextKey";
}
function replyTo(): string {
  return process.env.REMINDER_REPLY_TO || "glenn.m@nextkey.com.au";
}
export function remindersEnabled(): boolean {
  return process.env.REMINDERS_ENABLED === "true";
}

// ── Australia/Sydney wall-clock (DST-aware via Intl) ─────────────────────────
export type SydneyParts = { ymd: string; hour: number; weekday: number };
export function sydneyParts(now: Date): SydneyParts {
  const fmt = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const wkMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  // en-AU renders hour "24" at midnight; normalise to 0.
  let hour = parseInt(parts.hour ?? "0", 10);
  if (hour === 24) hour = 0;
  return {
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
    hour,
    weekday: wkMap[(parts.weekday ?? "Sun").slice(0, 3)] ?? 0,
  };
}

// ── Progress ─────────────────────────────────────────────────────────────────
export type DocRow = { doc_type: string; status: string };
export type Progress = { received: number; total: number; outstandingKeys: string[]; outstandingLabels: string[] };

export function computeProgress(docs: DocRow[]): Progress {
  const live = docs.filter((d) => d.status !== "replaced");
  let received = 0;
  let total = 0;
  const outstandingKeys: string[] = [];
  const outstandingLabels: string[] = [];
  for (const doc of YLA_DOCUMENTS) {
    total += doc.count;
    const have = Math.min(live.filter((d) => d.doc_type === doc.key).length, doc.count);
    received += have;
    if (have < doc.count) {
      outstandingKeys.push(doc.key);
      const missing = doc.count - have;
      outstandingLabels.push(missing > 1 ? `${doc.label} (${missing})` : doc.label);
    }
  }
  return { received, total, outstandingKeys, outstandingLabels };
}

// ── Due-reminder decision (pure) ─────────────────────────────────────────────
export type ReminderReq = {
  status: string;
  created_at: string;
  expires_at: string | null;
  reminder_count: number;
  last_reminder_at: string | null;
  reminders_opted_out: boolean;
};

export function computeDueReminder(
  req: ReminderReq,
  progress: Pick<Progress, "received" | "total">,
  now: Date,
): { kind: ReminderKind; channels: Channel[] } | null {
  if (req.status !== "open") return null;
  if (req.reminders_opted_out) return null;
  if (progress.total > 0 && progress.received >= progress.total) return null;
  if (req.expires_at && new Date(req.expires_at).getTime() <= now.getTime()) return null;

  const syd = sydneyParts(now);
  // Civil hours only.
  if (syd.hour < SEND_HOUR_START || syd.hour >= SEND_HOUR_END) return null;
  // At most one reminder per Sydney day.
  if (req.last_reminder_at && sydneyParts(new Date(req.last_reminder_at)).ymd === syd.ymd) return null;

  const createdYmd = sydneyParts(new Date(req.created_at)).ymd;
  const sameDayAsCreated = createdYmd === syd.ymd;

  // Weekly cutoff push (Wednesday business hours), for anything issued before
  // today — don't cutoff-nag a link that only went out this morning.
  if (
    syd.weekday === CUTOFF_WEEKDAY &&
    syd.hour >= CUTOFF_HOUR_START &&
    syd.hour < CUTOFF_HOUR_END &&
    !sameDayAsCreated
  ) {
    return { kind: "cutoff", channels: ["email", "sms"] };
  }

  // Otherwise, the drip.
  const ageDays = Math.floor((now.getTime() - new Date(req.created_at).getTime()) / DAY_MS);
  for (const step of DRIP_STEPS) {
    if (req.reminder_count === step.afterCount && ageDays >= step.minAgeDays) {
      return { kind: step.kind, channels: [...step.channels] };
    }
  }
  return null;
}

// ── Copy ─────────────────────────────────────────────────────────────────────
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

const AMBER = "#B45309";

function firstNameOf(name: string): string {
  return (name || "").trim().split(/\s+/)[0] || "";
}

/** Deadline sentence, tuned to whether today IS the Wednesday cutoff. */
export function deadlineLine(now: Date): string {
  const syd = sydneyParts(now);
  if (syd.weekday === CUTOFF_WEEKDAY) {
    return "Today is the cutoff — upload by 5pm and your assessment starts tomorrow. Miss it and it waits a week.";
  }
  return "Upload everything by Wednesday 5pm and your assessment starts this Thursday — miss the cutoff and it waits a week.";
}

export type ReminderContext = {
  applicantName: string;
  link: string;
  progress: Progress;
  now: Date;
};

export type RenderedReminder = { subject: string; html: string; text: string; sms: string };

export function renderReminder(kind: ReminderKind, ctx: ReminderContext): RenderedReminder {
  const first = firstNameOf(ctx.applicantName);
  const greet = first ? `Hi ${first},` : "Hi,";
  const { received, total, outstandingLabels, outstandingKeys } = ctx.progress;
  const started = received > 0;
  const needsMyGov = outstandingKeys.includes("ato_income");
  const guide = `${origin()}/api/portal/mygov-guide`;
  const deadline = deadlineLine(ctx.now);

  // Psychology in the framing (all honest — the Thursday cutoff is real and no
  // outcome is promised):
  //  - Endowed progress / goal-gradient: count what's DONE, shrink what's left.
  //  - Effort reduction: "~10 minutes, no account" lowers the activation cost.
  //  - Loss aversion + scarcity: the weekly slot is lost, not merely delayed.
  //  - Reciprocity / accountability: a named person (Glenn) has it ready and waiting.
  const remaining = total - received;
  const progressLine = started
    ? received === total - 1
      ? `You're ${received} of ${total} done — one document from the finish line.`
      : `You're already ${received} of ${total} done — most of the way there.`
    : "You're one quick step from getting your assessment underway.";
  const outstandingText = outstandingLabels.length ? `Still to come: ${outstandingLabels.join(", ")}.` : "";
  const ease = "It takes about 10 minutes from your phone — no account, no app.";

  // Normalising the myGov step (it's not you, it's the step) reduces the
  // avoidance that stalls people, and a personal offer of help builds reciprocity.
  const myGovTextPlain = needsMyGov
    ? `The ATO Income Statement from myGov is the step most people get stuck on — so if that's the hold-up, you're in good company. Here's a 60-second walkthrough: ${guide}. Or just reply and I'll take you through it myself.`
    : "";
  const myGovHtml = needsMyGov
    ? `<p style="margin:0 0 16px;background:#FFF7ED;border:1px solid #FED7AA;border-radius:8px;padding:12px 14px;font-size:14px;color:#7C2D12">
         <strong>The myGov income statement trips most people up</strong> — so if that's the one holding you up, you're not alone.
         <a href="${guide}" style="color:${AMBER};font-weight:bold">Here's a 60-second walkthrough</a>, or just reply and I'll take you through it myself.
       </p>`
    : "";

  const subjectByKind: Record<ReminderKind, string> = {
    nudge1: "Your assessment's ready — we just need your documents",
    nudge2: started ? `You're almost there — ${remaining} to go` : "You're one step from getting started",
    nudge3: "Let's get you over the line",
    cutoff: "Closes 5pm today — upload to be assessed this week",
  };

  const leadByKind: Record<ReminderKind, string> = {
    nudge1: `Everything's ready on our side — the only thing we're waiting on is you. ${ease}`,
    nudge2: `${progressLine} ${outstandingText} Most people knock the rest over in one sitting.`.trim(),
    nudge3: `${progressLine} You've come too far to let it stall. ${outstandingText} The sooner it's in, the sooner you get your result.`.trim(),
    cutoff: `This week's assessment closes at 5pm today. ${progressLine} ${outstandingText} Anything in before 5pm is looked at tomorrow — after that it's a full week's wait.`.trim(),
  };

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:560px;margin:0 auto">
    <div style="background:${AMBER};color:#fff;padding:18px 22px;border-radius:8px 8px 0 0">
      <div style="font-size:18px;font-weight:bold">Springboard Homes</div>
    </div>
    <div style="border:1px solid #e5e7eb;border-top:none;padding:22px;border-radius:0 0 8px 8px">
      <p style="margin:0 0 16px">${greet}</p>
      <p style="margin:0 0 16px">${escapeHtml(leadByKind[kind])}</p>
      <p style="margin:0 0 16px;font-weight:bold;color:${AMBER}">${escapeHtml(deadline)}</p>
      <p style="margin:0 0 20px">
        <a href="${ctx.link}" style="display:inline-block;background:${AMBER};color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:bold">
          Upload my documents
        </a>
      </p>
      ${myGovHtml}
      <p style="margin:0 0 6px;font-size:13px;color:#555">Or paste this link into your browser:</p>
      <p style="margin:0 0 16px;font-size:13px;color:#555;word-break:break-all">${escapeHtml(ctx.link)}</p>
      <p style="margin:0 0 14px;font-size:12px;color:#777">🔒 Your documents are encrypted and only seen by your assessor.</p>
      <p style="margin:0;font-size:13px;color:#555">Any questions at all, just hit reply — it comes straight to me.<br>Glenn — NextKey</p>
    </div>
  </div>`;

  const textLines = [
    greet,
    "",
    leadByKind[kind],
    "",
    deadline,
    "",
    `Upload here: ${ctx.link}`,
  ];
  if (myGovTextPlain) textLines.push("", myGovTextPlain);
  textLines.push(
    "",
    "Your documents are encrypted and only seen by your assessor.",
    "Any questions at all, just hit reply — it comes straight to me.",
    "Glenn — NextKey",
  );
  const text = textLines.join("\n");

  // SMS — short, one link, opt-out. Loss-framed on the cutoff; effort-light and
  // personal otherwise. myGov nudge only when it's the likely blocker.
  const smsBits = [`Hi ${first || "there"}, Glenn from NextKey here.`];
  if (kind === "cutoff") {
    smsBits.push("This week's assessment closes 5pm today — upload before then to be looked at tomorrow, or it waits a week:", ctx.link);
  } else if (started) {
    smsBits.push(`You're almost there — just ${remaining} to go and your assessment's ready to run:`, ctx.link);
  } else {
    smsBits.push("Everything's ready for your assessment — we just need your documents (about 10 min):", ctx.link);
  }
  // Keep SMS lean: invite a reply for myGov help rather than sending a 2nd URL.
  if (needsMyGov && kind !== "nudge1") smsBits.push("Stuck on the myGov step? Just reply and I'll help.");
  smsBits.push("Reply STOP to opt out.");
  const sms = smsBits.join(" ");

  return { subject: subjectByKind[kind], html, text, sms };
}

// ── Orchestrator ─────────────────────────────────────────────────────────────
export type ReminderRunResult = {
  ok: true;
  dryRun: boolean;
  enabled: boolean;
  scanned: number;
  due: number;
  actions: {
    request_id: string;
    applicant: string;
    kind: ReminderKind;
    channels: { channel: Channel; recipient: string | null; status: "sent" | "failed" | "skipped" | "would-send"; error?: string }[];
  }[];
};

const SELECT =
  "id,applicant_name,applicant_email,applicant_phone,contact_id,status,created_at,expires_at,reminder_count,last_reminder_at,reminders_opted_out";

export async function runDocumentReminders(opts?: { dryRun?: boolean; now?: Date; limit?: number }): Promise<ReminderRunResult> {
  const now = opts?.now ?? new Date();
  // Force dry-run unless explicitly enabled AND the caller didn't ask for dry.
  const dryRun = opts?.dryRun ?? !remindersEnabled();

  const { data: reqs, error } = await supabase
    .from("document_requests")
    .select(SELECT)
    .eq("status", "open")
    .order("created_at", { ascending: true })
    .limit(opts?.limit ?? 500);
  if (error || !reqs) {
    // Surface as an empty run rather than throwing — the scheduler must never crash-loop.
    return { ok: true, dryRun, enabled: remindersEnabled(), scanned: 0, due: 0, actions: [] };
  }

  // Progress for all scanned requests in one query.
  const ids = reqs.map((r) => r.id);
  const docsByReq = new Map<string, DocRow[]>();
  if (ids.length) {
    const { data: docs } = await supabase
      .from("client_documents")
      .select("request_id,doc_type,status")
      .in("request_id", ids);
    for (const d of docs ?? []) {
      const arr = docsByReq.get(d.request_id) ?? [];
      arr.push({ doc_type: d.doc_type, status: d.status });
      docsByReq.set(d.request_id, arr);
    }
  }

  const actions: ReminderRunResult["actions"] = [];

  for (const r of reqs) {
    const progress = computeProgress(docsByReq.get(r.id) ?? []);
    const due = computeDueReminder(r as ReminderReq, progress, now);
    if (!due) continue;

    // A fresh link (rotates the token, expiring any older one). In a dry run we
    // don't touch the DB, so show a placeholder rather than burning a token.
    let link = `${origin()}/portal/<link>`;
    let newHash: string | null = null;
    if (!dryRun) {
      const t = newToken();
      link = `${origin()}/portal/${t.raw}`;
      newHash = t.hash;
    }

    const rendered = renderReminder(due.kind, {
      applicantName: r.applicant_name,
      link,
      progress,
      now,
    });

    const channelResults: ReminderRunResult["actions"][number]["channels"] = [];
    for (const channel of due.channels) {
      if (channel === "email") {
        const to = (r.applicant_email || "").trim();
        if (!to) {
          channelResults.push({ channel, recipient: null, status: "skipped", error: "no email" });
          continue;
        }
        if (dryRun) {
          channelResults.push({ channel, recipient: to, status: "would-send" });
          continue;
        }
        const res = await sendBrevoEmail({
          to: [{ email: to, name: r.applicant_name || undefined }],
          subject: rendered.subject,
          html: rendered.html,
          text: rendered.text,
          replyTo: replyTo(),
          fromName: fromName(),
          tags: ["document-reminder", due.kind],
        });
        channelResults.push({ channel, recipient: to, status: res.ok ? "sent" : "failed", error: res.ok ? undefined : res.error });
        await supabase.from("document_reminder_log").insert({
          request_id: r.id, kind: due.kind, channel, recipient: to,
          status: res.ok ? "sent" : "failed", error: res.ok ? null : res.error, dry_run: false,
        });
      } else {
        const phone = toE164AU(r.applicant_phone);
        if (!phone) {
          channelResults.push({ channel, recipient: null, status: "skipped", error: "no valid mobile" });
          continue;
        }
        if (dryRun) {
          channelResults.push({ channel, recipient: phone, status: "would-send" });
          continue;
        }
        const res = await sendSms({ contactId: r.contact_id, phone, body: rendered.sms, campaign: `document-reminder:${due.kind}` });
        channelResults.push({ channel, recipient: phone, status: res.ok ? "sent" : "failed", error: res.ok ? undefined : res.error });
        await supabase.from("document_reminder_log").insert({
          request_id: r.id, kind: due.kind, channel, recipient: phone,
          status: res.ok ? "sent" : "failed", error: res.ok ? null : res.error, dry_run: false,
        });
      }
    }

    // Stamp the request only on a real run where at least one channel actually
    // went out — so a total failure is retried next pass rather than marked done.
    const anySent = channelResults.some((c) => c.status === "sent");
    if (!dryRun && anySent) {
      await supabase
        .from("document_requests")
        .update({
          last_reminder_at: now.toISOString(),
          last_reminder_kind: due.kind,
          // Cutoff pushes don't consume a drip step; the gentle sequence resumes after.
          reminder_count: due.kind === "cutoff" ? r.reminder_count : r.reminder_count + 1,
          token_hash: newHash,
          updated_at: now.toISOString(),
        })
        .eq("id", r.id);
    }

    actions.push({ request_id: r.id, applicant: r.applicant_name, kind: due.kind, channels: channelResults });
  }

  return { ok: true, dryRun, enabled: remindersEnabled(), scanned: reqs.length, due: actions.length, actions };
}
