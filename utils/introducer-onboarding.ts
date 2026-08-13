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
export type ExamInvite = {
  id: string;
  name: string;
  entity?: string;
  abn?: string;
  email: string;
  tier?: "t1";
  /** Days until the link stops working. */
  days?: number;
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
    tier: "t1" as const,
    exp: Math.floor(now / 1000) + (invite.days ?? 30) * 86400,
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
