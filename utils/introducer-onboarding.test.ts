import { describe, it, expect } from "vitest";
import {
  ROADMAP,
  roadmapFor,
  roadmapProgress,
  canUploadId,
  canSitExam,
  canSignAgreement,
  canActivate,
  isFinished,
  isForwardTransition,
  mintExamInvite,
  addMonthsClamped,
  accreditationExpiries,
  isExpiredOn,
  daysUntil,
  verifyExamInvite,
  examInviteUrl,
  accreditationNumber,
  onboardingUrl,
  ONBOARDING_STATES,
  type OnboardingState,
} from "./introducer-onboarding";
import { isPublicIntroducerRoute } from "../proxy";

const SECRET = "test-secret-not-the-real-one";

/**
 * The onboarding promise, pinned as tests.
 *
 *   1. Identity is ISSUED. The name on the certificate comes from us, and an
 *      invite that has been edited must not verify.
 *   2. The state is the gate. Holding a link is never enough on its own.
 *   3. The roadmap never lies about where someone is.
 */

describe("the roadmap", () => {
  it("shows exactly one current step while the application is live", () => {
    for (const state of ONBOARDING_STATES) {
      if (state === "withdrawn" || state === "activated") continue;
      const current = roadmapFor(state).filter((s) => s.status === "current");
      expect(current, `state ${state}`).toHaveLength(1);
    }
  });

  it("has no current step once activated — everything is done", () => {
    const view = roadmapFor("activated");
    expect(view.every((s) => s.status === "done")).toBe(true);
    expect(roadmapProgress("activated")).toBe(100);
  });

  it("has no current step when withdrawn — nothing is in progress", () => {
    expect(roadmapFor("withdrawn").some((s) => s.status === "current")).toBe(false);
  });

  it("never goes backwards as the state advances", () => {
    const live = ONBOARDING_STATES.filter((s) => s !== "withdrawn");
    let last = -1;
    for (const state of live) {
      const done = roadmapFor(state).filter((s) => s.status === "done").length;
      expect(done, `state ${state} regressed`).toBeGreaterThanOrEqual(last);
      last = done;
    }
  });

  it("describes a completed step in the past tense and the current one as a task", () => {
    const view = roadmapFor("id_verified");
    const nda = view.find((s) => s.key === "nda")!;
    const course = view.find((s) => s.key === "course")!;
    expect(nda.status).toBe("done");
    expect(nda.detail).toMatch(/signed\.$/);
    expect(course.status).toBe("current");
    expect(course.detail).toMatch(/Work through/);
  });

  it("reports progress monotonically", () => {
    expect(roadmapProgress("invited")).toBe(0);
    expect(roadmapProgress("nda_signed")).toBeGreaterThan(roadmapProgress("invited"));
    expect(roadmapProgress("exam_passed")).toBeGreaterThan(roadmapProgress("id_verified"));
    expect(roadmapProgress("withdrawn")).toBe(0);
  });
});

describe("the state is the gate", () => {
  it("refuses an ID upload before the NDA is signed", () => {
    expect(canUploadId("invited")).toBe(false);
    expect(canUploadId("nda_signed")).toBe(true);
  });

  it("refuses the exam until identity is verified", () => {
    expect(canSitExam("id_uploaded")).toBe(false);   // uploaded is not verified
    expect(canSitExam("id_verified")).toBe(true);
  });

  it("refuses the agreement until the certificate is issued", () => {
    expect(canSignAgreement("exam_passed")).toBe(false);
    expect(canSignAgreement("certificate_issued")).toBe(true);
  });

  it("refuses activation until the agreement is signed", () => {
    for (const s of ONBOARDING_STATES) {
      expect(canActivate(s as OnboardingState), `state ${s}`).toBe(s === "agreement_signed");
    }
  });

  it("treats activated and withdrawn as finished", () => {
    expect(isFinished("activated")).toBe(true);
    expect(isFinished("withdrawn")).toBe(true);
    expect(isFinished("exam_passed")).toBe(false);
  });

  it("never lets an activated application move again", () => {
    for (const s of ONBOARDING_STATES) {
      expect(isForwardTransition("activated", s as OnboardingState), `to ${s}`).toBe(false);
    }
  });

  it("allows withdrawal from anywhere except activated", () => {
    expect(isForwardTransition("invited", "withdrawn")).toBe(true);
    expect(isForwardTransition("exam_passed", "withdrawn")).toBe(true);
    expect(isForwardTransition("activated", "withdrawn")).toBe(false);
  });

  it("refuses to walk the pipeline backwards", () => {
    expect(isForwardTransition("exam_passed", "id_verified")).toBe(false);
    expect(isForwardTransition("id_verified", "exam_passed")).toBe(true);
  });
});

describe("exam invites — identity is issued, not typed", () => {
  const base = { id: "app-1", name: "Jane Smith", entity: "Smith Advisory Pty Ltd",
                 abn: "12 345 678 901", email: "jane@example.com.au" };

  it("round-trips a minted invite", () => {
    const t = mintExamInvite(base, SECRET);
    const v = verifyExamInvite(t, SECRET);
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.payload.name).toBe("Jane Smith");
      expect(v.payload.id).toBe("app-1");
      expect(v.payload.tier).toBe("t1");
    }
  });

  it("refuses an invite whose payload has been edited", () => {
    const t = mintExamInvite(base, SECRET);
    const [body, sig] = t.split(".");
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    p.name = "Someone Else";
    const forged = Buffer.from(JSON.stringify(p)).toString("base64url") + "." + sig;
    const v = verifyExamInvite(forged, SECRET);
    expect(v.ok).toBe(false);
  });

  it("refuses an invite signed with a different secret", () => {
    const t = mintExamInvite(base, "some-other-secret");
    expect(verifyExamInvite(t, SECRET).ok).toBe(false);
  });

  it("refuses an expired invite", () => {
    const t = mintExamInvite({ ...base, days: 1 }, SECRET);
    const later = Date.now() + 2 * 86400 * 1000;
    const v = verifyExamInvite(t, SECRET, later);
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.reason).toMatch(/expired/);
  });

  it("refuses garbage without throwing", () => {
    for (const junk of ["", "notatoken", "a.b", "....", "x".repeat(500)]) {
      expect(() => verifyExamInvite(junk, SECRET)).not.toThrow();
      expect(verifyExamInvite(junk, SECRET).ok).toBe(false);
    }
  });

  it("will not mint without an identity to assert", () => {
    expect(() => mintExamInvite({ ...base, name: "  " }, SECRET)).toThrow(/legal name/);
    expect(() => mintExamInvite({ ...base, email: "" }, SECRET)).toThrow(/email/);
    expect(() => mintExamInvite({ ...base, id: "" }, SECRET)).toThrow(/application id/);
  });

  it("will not mint without a secret — never issues an unsigned invite", () => {
    expect(() => mintExamInvite(base, "")).toThrow(/INVITE_SECRET/);
  });

  it("issues a Tier 2 invitation when one is asked for", () => {
    // Tier 2 became offerable on 13 August 2026, when the credit-licensing
    // advice cleared it. Before that it was refused outright.
    const v = verifyExamInvite(mintExamInvite({ ...base, tier: "t2" }, SECRET), SECRET);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.payload.tier).toBe("t2");
  });

  it("falls back to Tier 1 on anything it does not recognise", () => {
    // A typo must never widen someone's authority, so an unknown tier resolves
    // downwards rather than erroring or passing through.
    for (const junk of ["t3", "T2", "", "tier2", null, 2]) {
      const v = verifyExamInvite(
        mintExamInvite({ ...base, tier: junk as unknown as "t1" }, SECRET),
        SECRET,
      );
      expect(v.ok, String(junk)).toBe(true);
      if (v.ok) expect(v.payload.tier, String(junk)).toBe("t1");
    }
  });

  it("does not mention waiting periods unless they were waived", () => {
    // An ordinary invitation asserts nothing about the waits, so the course
    // falls back to enforcing them. `waive: false` would be a claim; absence is
    // not.
    const v = verifyExamInvite(mintExamInvite(base, SECRET), SECRET);
    expect(v.ok).toBe(true);
    if (v.ok) expect("waive" in v.payload).toBe(false);

    const off = verifyExamInvite(mintExamInvite({ ...base, waive: false }, SECRET), SECRET);
    expect(off.ok).toBe(true);
    if (off.ok) expect("waive" in off.payload).toBe(false);
  });

  it("carries a waiver of the waiting periods, signed", () => {
    const v = verifyExamInvite(mintExamInvite({ ...base, waive: true }, SECRET), SECRET);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.payload.waive).toBe(true);
  });

  it("refuses a waiver bolted onto a token we signed without one", () => {
    // The whole reason the waiver travels inside the payload: the waits are
    // enforced in the candidate's own browser, so the only thing stopping them
    // switching the waits off is that they cannot re-sign the claim.
    const t = mintExamInvite(base, SECRET);
    const [body, sig] = t.split(".");
    const p = JSON.parse(Buffer.from(body, "base64url").toString());
    p.waive = true;
    const forged = Buffer.from(JSON.stringify(p)).toString("base64url") + "." + sig;
    expect(verifyExamInvite(forged, SECRET).ok).toBe(false);
  });

  it("builds a link the accreditation site will accept", () => {
    const t = mintExamInvite(base, SECRET);
    const url = examInviteUrl(t, "https://accred.example/");
    expect(url).toBe(`https://accred.example/?inv=${encodeURIComponent(t)}`);
  });
});

describe("how long an accreditation lasts", () => {
  it("runs 12 months, with the SMSF competency at 6", () => {
    const e = accreditationExpiries("2026-08-14");
    expect(e.accreditationExpiresAt).toBe("2027-08-14");
    expect(e.smsfCompetencyExpiresAt).toBe("2027-02-14");
  });

  it("clamps to the end of the month rather than rolling over", () => {
    // The case the certificate calls out by name: 31 August + 6 months prints
    // 28 February, not 3 March.
    expect(addMonthsClamped("2026-08-31", 6)).toBe("2027-02-28");
    expect(addMonthsClamped("2026-08-31", 12)).toBe("2027-08-31");
    expect(addMonthsClamped("2026-10-31", 6)).toBe("2027-04-30");
    // And a leap February takes the 29th.
    expect(addMonthsClamped("2027-08-31", 6)).toBe("2028-02-29");
  });

  it("crosses the year boundary", () => {
    expect(addMonthsClamped("2026-11-30", 6)).toBe("2027-05-30");
    expect(addMonthsClamped("2026-12-31", 12)).toBe("2027-12-31");
    expect(addMonthsClamped("2026-09-15", 6)).toBe("2027-03-15");
  });

  it("refuses anything that is not a calendar day", () => {
    for (const junk of ["", "2026-8-14", "14/08/2026", "2026-08-14T00:00:00Z"]) {
      expect(() => addMonthsClamped(junk, 12)).toThrow(/YYYY-MM-DD/);
    }
  });

  it("is good on the expiry day itself and expired the day after", () => {
    expect(isExpiredOn("2027-08-14", "2027-08-13")).toBe(false);
    expect(isExpiredOn("2027-08-14", "2027-08-14")).toBe(false);
    expect(isExpiredOn("2027-08-14", "2027-08-15")).toBe(true);
  });

  it("does not treat a missing expiry as an expired one", () => {
    // Everyone accredited before these dates were recorded has no date on their
    // row. Reading that as expired would lock them all out on deploy day.
    expect(isExpiredOn(null, "2027-08-15")).toBe(false);
    expect(isExpiredOn(undefined, "2027-08-15")).toBe(false);
    expect(isExpiredOn("", "2027-08-15")).toBe(false);
  });

  it("counts the days left", () => {
    expect(daysUntil("2026-08-20", "2026-08-19")).toBe(1);
    expect(daysUntil("2026-08-19", "2026-08-19")).toBe(0);
    expect(daysUntil("2026-08-18", "2026-08-19")).toBe(-1);
    expect(daysUntil("2027-08-14", "2026-08-14")).toBe(365);
  });
});

describe("accreditation numbers", () => {
  it("pads to a stable width", () => {
    expect(accreditationNumber(1, 2026)).toBe("SBI-2026-0001");
    expect(accreditationNumber(437, 2026)).toBe("SBI-2026-0437");
  });
});

describe("onboarding links", () => {
  it("escapes the token and does not double up the slash", () => {
    expect(onboardingUrl("a/b+c", "https://crm.example/")).toBe(
      "https://crm.example/introducer/onboarding/a%2Fb%2Bc");
  });
});

describe("route safety", () => {
  it("puts the onboarding page inside the public bypass", () => {
    // The applicant is a stranger holding a link — they have no CF Access
    // identity and never will, so the page must be reachable without one.
    expect(isPublicIntroducerRoute("/introducer/onboarding/abc123")).toBe(true);
    expect(isPublicIntroducerRoute("/introducer/onboarding/abc/def")).toBe(true);
  });

  it("keeps the staff application routes OUT of the bypass", () => {
    // `/introducers`.startsWith(`/introducer`) is true, which is exactly how a
    // staff route gets accidentally exposed. The onboarding work adds a new
    // staff endpoint under that near-identical prefix, so pin it.
    expect(isPublicIntroducerRoute("/admin/introducers")).toBe(false);
    expect(isPublicIntroducerRoute("/api/admin/introducers/applications")).toBe(false);
    expect(isPublicIntroducerRoute("/introducers")).toBe(false);
  });
});

describe("roadmap wiring", () => {
  it("every step is completed by activation", () => {
    for (const step of ROADMAP) {
      expect(step.completedBy, `step ${step.key}`).toContain("activated");
    }
  });

  it("every completedBy entry is a real state", () => {
    for (const step of ROADMAP) {
      for (const s of step.completedBy) {
        expect(ONBOARDING_STATES, `step ${step.key}`).toContain(s);
      }
    }
  });
});
