/**
 * Introducer onboarding — the runway an applicant walks before they are an
 * introducer at all.
 *
 * WHY THIS EXISTS SEPARATELY FROM utils/introducer.ts. That module governs a
 * firm we already have an agreement with. This one governs someone who might
 * become one: they have signed nothing, proved nothing, and passed nothing. The
 * two must not share a code path, because every function here has to assume the
 * caller is a stranger holding a link.
 *
 * THE ONE RULE. Identity is issued, never typed. Staff state the applicant's
 * legal name when they start the application; that name is what the exam invite
 * is signed with, what the certificate prints, and what the agreement is
 * executed in. At no point does the applicant type the name that ends up on
 * their accreditation. Everything in this file exists to keep that true.
 *
 * Pure functions only — no database, no network — so the state machine and the
 * invite crypto are unit-testable without either.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

/* ── the pipeline ────────────────────────────────────────────────────── */

export const ONBOARDING_STATES = [
  "invited",
  "nda_signed",
  "id_uploaded",
  "id_verified",
  "course_started",
  "exam_passed",
  "certificate_issued",
  "agreement_sent",
  "agreement_signed",
  "activated",
  "withdrawn",
] as const;

export type OnboardingState = (typeof ONBOARDING_STATES)[number];

/**
 * What the applicant sees. Deliberately fewer entries than there are states:
 * they do not need to know that `agreement_sent` and `agreement_signed` are
 * different rows in a table, only that there is a step called "Sign the
 * agreement" and whether they have done it.
 */
export type RoadmapStep = {
  key: string;
  title: string;
  /** Present tense, shown while this is the current step. */
  doing: string;
  /** Shown once it is behind them. */
  done: string;
  /** The states that mean this step is finished. */
  completedBy: readonly OnboardingState[];
};

export const ROADMAP: readonly RoadmapStep[] = [
  {
    key: "nda",
    title: "Sign the confidentiality agreement",
    doing: "Sign the mutual NDA so we can share the programme details with you.",
    done: "Confidentiality agreement signed.",
    completedBy: ["nda_signed", "id_uploaded", "id_verified", "course_started",
      "exam_passed", "certificate_issued", "agreement_sent", "agreement_signed", "activated"],
  },
  {
    key: "id",
    title: "Verify your identity",
    doing: "Upload the front and back of your driver licence.",
    done: "Identity verified.",
    completedBy: ["id_verified", "course_started", "exam_passed", "certificate_issued",
      "agreement_sent", "agreement_signed", "activated"],
  },
  {
    key: "course",
    title: "Complete the accreditation course",
    doing: "Work through the modules and pass the exam. It is 100% to pass, with as many attempts as you need.",
    done: "Accreditation exam passed.",
    completedBy: ["exam_passed", "certificate_issued", "agreement_sent", "agreement_signed", "activated"],
  },
  {
    key: "certificate",
    title: "Receive your certificate",
    doing: "We are issuing your accreditation certificate.",
    done: "Certificate issued.",
    completedBy: ["certificate_issued", "agreement_sent", "agreement_signed", "activated"],
  },
  {
    key: "agreement",
    title: "Sign the introducer agreement",
    doing: "Sign the referral agreement and commission schedule.",
    done: "Introducer agreement signed.",
    completedBy: ["agreement_signed", "activated"],
  },
  {
    key: "portal",
    title: "Get portal access",
    doing: "We are setting up your access.",
    done: "Portal access is live.",
    completedBy: ["activated"],
  },
] as const;

export type StepStatus = "done" | "current" | "upcoming";

export type RoadmapView = {
  key: string;
  title: string;
  detail: string;
  status: StepStatus;
};

/**
 * Render the roadmap for a given state. The first step not yet completed is
 * "current"; everything after it is "upcoming". A withdrawn application has no
 * current step — nothing is in progress, which is the honest way to show it.
 */
export function roadmapFor(state: OnboardingState): RoadmapView[] {
  const stopped = state === "withdrawn";
  let currentTaken = false;

  return ROADMAP.map((step) => {
    const done = step.completedBy.includes(state);
    let status: StepStatus;
    if (done) {
      status = "done";
    } else if (!currentTaken && !stopped) {
      status = "current";
      currentTaken = true;
    } else {
      status = "upcoming";
    }
    return {
      key: step.key,
      title: step.title,
      detail: status === "done" ? step.done : step.doing,
      status,
    };
  });
}

/** How far along, as a fraction — for a progress bar, not for logic. */
export function roadmapProgress(state: OnboardingState): number {
  if (state === "withdrawn") return 0;
  const done = ROADMAP.filter((s) => s.completedBy.includes(state)).length;
  return Math.round((done / ROADMAP.length) * 100);
}

/* ── gates ───────────────────────────────────────────────────────────── */

/**
 * The state is the gate, not a label the UI paints. Every route asks one of
 * these before it acts, so holding a valid link is never on its own enough.
 */
export const canUploadId = (s: OnboardingState) => s === "nda_signed" || s === "id_uploaded";
export const canSitExam = (s: OnboardingState) =>
  s === "id_verified" || s === "course_started";
export const canSignAgreement = (s: OnboardingState) =>
  s === "certificate_issued" || s === "agreement_sent";
export const canActivate = (s: OnboardingState) => s === "agreement_signed";

/** Terminal states — nothing further happens without staff intervention. */
export const isFinished = (s: OnboardingState) => s === "activated" || s === "withdrawn";

/**
 * Forward-only. The application never walks backwards on its own; a staff
 * action that needs to undo something writes an event and sets the state
 * explicitly, which is why this is advisory and the database guard is not.
 */
export function isForwardTransition(from: OnboardingState, to: OnboardingState): boolean {
  if (to === "withdrawn") return from !== "activated";
  if (from === "withdrawn" || from === "activated") return false;
  return ONBOARDING_STATES.indexOf(to) > ONBOARDING_STATES.indexOf(from);
}

/* ── exam invites ────────────────────────────────────────────────────── */

/**
 * The accreditation site is a separate origin on separate infrastructure. Rather
 * than have it call back here to ask who a candidate is — which would need CORS,
 * a Cloudflare Access carve-out, and would take the exam down whenever the CRM
 * is down — we hand the candidate a signed assertion of their own identity and
 * let the exam verify it locally with a shared secret.
 *
 *   base64url(payload JSON) . base64url(HMAC-SHA256(payload, INVITE_SECRET))
 *
 * The candidate cannot alter the payload without invalidating the signature, and
 * cannot mint one without the secret. The verifier is `verifyInvite` in the
 * accreditation repo's netlify/functions/exam.mjs — the two must stay in step.
 */
export type IntroducerTier = "t1" | "t2";

export type ExamInvite = {
  id: string;
  name: string;
  entity?: string;
  abn?: string;
  email: string;
  tier?: IntroducerTier;
  /** Days until the link stops working. */
  days?: number;
  /**
   * Reopen the course for this invitation. FOUR things, not one:
   *
   *   1. the reading timer that holds each module's check;
   *   2. the cooling-off ladder between failed finals;
   *   3. the 24-hour lock after the fifth failure — and the progress wipe that
   *      comes with it, which is the only part that destroys rather than delays;
   *   4. the re-locking of modules a failed exam sends the candidate back
   *      through, for any module they have already attempted.
   *
   * It also stops the link clearing their progress. Every other re-issued link
   * is a deliberate fresh start — that is what stops a candidate wiping a
   * failed-attempt count by reopening a bookmark — but an override exists to
   * put someone back where they were, and wiping first would leave nothing to
   * reopen.
   *
   * WHAT IT IS NOT. A module the candidate has never opened stays locked, and
   * the pass mark is still 100%. This unsticks someone already in the material;
   * it does not shorten the course or hand anyone a pass.
   *
   * WHY IT RIDES INSIDE THE SIGNED TOKEN. All of that is enforced by the
   * course's own JavaScript against state on the candidate's device, so
   * anything the browser can be told, the candidate can tell it too. Carrying it
   * in the HMAC-signed payload makes it a decision Springboard made and signed —
   * the same reason the identity travels this way rather than being typed.
   *
   * It is deliberately NOT a site-wide setting. It is issued per invitation, by
   * a super-admin, and recorded on the application: a pass sat without the dwell
   * timer was sat under different conditions from every other one, and the
   * register has to be able to say which.
   */
  override?: boolean;
};

const b64url = (b: Buffer | string) =>
  Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function mintExamInvite(invite: ExamInvite, secret: string, now = Date.now()): string {
  if (!secret) throw new Error("INVITE_SECRET is not set — cannot issue an exam invitation");
  if (!invite.id) throw new Error("an exam invite must carry the application id");
  if (!invite.name?.trim()) throw new Error("an exam invite must carry the applicant's legal name");
  if (!invite.email?.trim()) throw new Error("an exam invite must carry the applicant's email");

  const payload = {
    v: 1,
    id: invite.id,
    name: invite.name.trim(),
    entity: invite.entity?.trim() || "",
    abn: invite.abn?.trim() || "",
    email: invite.email.trim(),
    // Normalised rather than trusted: an unrecognised tier becomes t1, so a
    // typo cannot issue an invitation to a paper we do not offer.
    tier: invite.tier === "t2" ? ("t2" as const) : ("t1" as const),
    exp: Math.floor(now / 1000) + (invite.days ?? 30) * 86400,
    // Omitted rather than set to false, so a payload only ever carries claims
    // that were actually made — and an invitation issued before this existed
    // reads identically to an ordinary one issued after it.
    ...(invite.override ? { override: true as const } : {}),
  };

  const body = b64url(JSON.stringify(payload));
  const sig = b64url(createHmac("sha256", secret).update(body).digest());
  return `${body}.${sig}`;
}

/** The link we actually email. */
export function examInviteUrl(token: string, base?: string): string {
  const site = (base || process.env.ACCREDITATION_URL || "https://springboard-accreditation.netlify.app")
    .replace(/\/+$/, "");
  return `${site}/?inv=${encodeURIComponent(token)}`;
}

/**
 * Verify a token we minted. Used when the exam webhook reports a result, so a
 * forged webhook cannot advance an application that never sat anything.
 */
export function verifyExamInvite(
  token: string,
  secret: string,
  now = Date.now(),
): { ok: true; payload: Record<string, unknown> } | { ok: false; reason: string } {
  if (!secret) return { ok: false, reason: "invites are not configured" };
  if (typeof token !== "string" || !token.includes(".")) {
    return { ok: false, reason: "malformed invitation" };
  }

  const cut = token.lastIndexOf(".");
  const body = token.slice(0, cut);
  const expected = createHmac("sha256", secret).update(body).digest();

  let given: Buffer;
  try {
    given = Buffer.from(token.slice(cut + 1).replace(/-/g, "+").replace(/_/g, "/"), "base64");
  } catch {
    return { ok: false, reason: "malformed invitation" };
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: "signature does not verify" };
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed invitation" };
  }
  if (typeof payload.exp === "number" && now / 1000 > payload.exp) {
    return { ok: false, reason: "invitation expired" };
  }
  return { ok: true, payload };
}

/* ── accreditation numbers ───────────────────────────────────────────── */

/**
 * SBI-2026-0001. The sequence number comes from Postgres, never from a count of
 * existing rows — two candidates finishing in the same second would otherwise be
 * handed the same number.
 */
export function accreditationNumber(seq: number, year = new Date().getFullYear()): string {
  return `SBI-${year}-${String(seq).padStart(4, "0")}`;
}

/* ── how long an accreditation lasts ─────────────────────────────────── */

/**
 * Accreditation runs 12 months; the SMSF competency inside it runs 6.
 *
 * They are deliberately different clocks. M4 — superannuation and SMSF — is 23%
 * of the Tier 1 exam and the part of the training most likely to go stale, so
 * the competency is re-tested twice as often as the accreditation around it.
 * Two dates, never one derived from the other at the point of use.
 */
export const ACCREDITATION_MONTHS = 12;
export const SMSF_COMPETENCY_MONTHS = 6;

/**
 * Add whole months to a calendar date, clamping to the end of the target month.
 *
 * 31 August + 6 months is 28 February, not 3 March. JavaScript's own date
 * arithmetic rolls over — `new Date(2026, 7, 31)` with the month set forward
 * lands in the following month — and a certificate that prints an expiry three
 * days after the one on the register is the kind of discrepancy that gets
 * noticed at exactly the wrong moment.
 *
 * Takes and returns "YYYY-MM-DD". No instants, no timezones: an expiry is a
 * calendar date, and the day it falls on must not depend on where the server is.
 */
export function addMonthsClamped(day: string, months: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) throw new Error(`addMonthsClamped needs YYYY-MM-DD, got ${JSON.stringify(day)}`);

  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);

  const total = (y * 12 + (mo - 1)) + months;
  const ty = Math.floor(total / 12);
  const tm = total % 12;

  // Day 0 of the NEXT month is the last day of this one.
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  const td = Math.min(d, lastDay);

  return `${String(ty).padStart(4, "0")}-${String(tm + 1).padStart(2, "0")}-${String(td).padStart(2, "0")}`;
}

/**
 * The two expiry dates that follow from a certificate's issue date.
 *
 * `issuedOnDay` is the BUSINESS calendar day the certificate was issued —
 * `businessDayKey(certificate_issued_at)` — not a UTC one. A certificate issued
 * at 9am Brisbane is issued on the 14th; taken as UTC it was issued at 11pm on
 * the 13th, and both expiries would then be a day early.
 */
export function accreditationExpiries(issuedOnDay: string): {
  accreditationExpiresAt: string;
  smsfCompetencyExpiresAt: string;
} {
  return {
    accreditationExpiresAt: addMonthsClamped(issuedOnDay, ACCREDITATION_MONTHS),
    smsfCompetencyExpiresAt: addMonthsClamped(issuedOnDay, SMSF_COMPETENCY_MONTHS),
  };
}

/**
 * Expired on `today`? Inclusive of the expiry day itself — an accreditation
 * that expires on the 14th is still good ON the 14th, which is how every
 * expiry date a person has ever read one behaves.
 *
 * A missing date is NOT treated as expired. Every introducer accredited before
 * expiries were recorded has no date on their row, and locking all of them out
 * of the portal on the day this shipped would be a worse failure than the one
 * it is preventing. `hasExpiry` is how a caller tells the two apart.
 */
export function isExpiredOn(expiry: string | null | undefined, today: string): boolean {
  if (!expiry) return false;
  return expiry < today;
}

/** Whole days from `today` to `expiry`. Negative once it is behind us. */
export function daysUntil(expiry: string, today: string): number {
  const a = Date.parse(`${today}T00:00:00Z`);
  const b = Date.parse(`${expiry}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

/* ── misc ────────────────────────────────────────────────────────────── */

/** Applicant-facing link into the roadmap. */
export function onboardingUrl(rawToken: string, origin: string): string {
  return `${origin.replace(/\/+$/, "")}/introducer/onboarding/${encodeURIComponent(rawToken)}`;
}

/** Same shape as the portal's own check, so a missing migration reads clearly. */
export function onboardingTablesMissing(err: unknown): boolean {
  const msg = typeof err === "string" ? err : (err as { message?: string })?.message || "";
  return /introducer_applications|introducer_identity_documents/.test(msg) &&
    /does not exist|schema cache|relation/i.test(msg);
}
