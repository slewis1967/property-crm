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
  verifyExamInvite,
  examInviteUrl,
  accreditationNumber,
  onboardingUrl,
  ONBOARDING_STATES,
  type OnboardingState,
} from "./introducer-onboarding";

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

  it("cannot be talked into a tier we do not offer", () => {
    // Tier 2 carries the unresolved licensing exposure, so it is not issuable
    // even if a caller asks for it.
    const t = mintExamInvite({ ...base, tier: "t2" as unknown as "t1" }, SECRET);
    const v = verifyExamInvite(t, SECRET);
    if (v.ok) expect(v.payload.tier).toBe("t1");
  });

  it("builds a link the accreditation site will accept", () => {
    const t = mintExamInvite(base, SECRET);
    const url = examInviteUrl(t, "https://accred.example/");
    expect(url).toBe(`https://accred.example/?inv=${encodeURIComponent(t)}`);
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
