import { describe, it, expect } from "vitest";
import { ndaDataFor } from "./introducer-nda";
import { readyToIssue } from "./introducer-agreement";
import type { Application } from "./introducer-onboarding-db";

const app = (over: Partial<Application> = {}): Application =>
  ({
    id: "11111111-1111-4111-8111-111111111111",
    introducer_id: null,
    legal_name: "Glenn B Mayes",
    email: "glenn@example.com",
    firm_name: "G.B. Mayes Holdings",
    abn: "49 634 656 947",
    phone: null,
    tier: "t1",
    agreement_variant: "standard",
    state: "invited",
    token_expires_at: "2026-09-01T00:00:00.000Z",
    id_check_provider: null,
    id_check_reference: null,
    id_check_result: null,
    id_checked_at: null,
    id_checked_by: null,
    exam_score: null,
    exam_total: null,
    exam_passed_at: null,
    accreditation_no: null,
    certificate_path: null,
    created_at: "2026-08-13T07:59:00.000Z",
    ...over,
  }) as Application;

const ISSUED = "2026-08-14T01:00:00.000Z";

describe("ndaDataFor", () => {
  it("carries the identity staff issued, not anything the applicant typed", () => {
    const d = ndaDataFor(app(), ISSUED);
    expect(d.doc_type).toBe("introducer_nda");
    expect(d.legal_name).toBe("Glenn B Mayes");
    expect(d.email).toBe("glenn@example.com");
    expect(d.firm_name).toBe("G.B. Mayes Holdings");
    expect(d.abn).toBe("49 634 656 947");
  });

  it("leaves the accreditation number blank — the NDA is signed before the exam", () => {
    expect(ndaDataFor(app(), ISSUED).accreditation_no).toBe("");
  });

  it("is issuable despite that blank, unlike the later documents", () => {
    expect(readyToIssue(ndaDataFor(app(), ISSUED))).toEqual({ ok: true });
  });

  it("snapshots the issue date rather than reading the clock", () => {
    expect(ndaDataFor(app(), ISSUED).issued_at).toBe(ISSUED);
  });

  it("keeps the commercial variant so a standard NDA still reads standard later", () => {
    expect(ndaDataFor(app(), ISSUED).variant).toBe("standard");
    expect(ndaDataFor(app({ agreement_variant: "paid" }), ISSUED).variant).toBe("paid");
  });

  it("names the tier in the subtitle", () => {
    expect(ndaDataFor(app(), ISSUED).subtitle).toBe("Tier 1 accreditation");
    expect(ndaDataFor(app({ tier: "t2" }), ISSUED).subtitle).toBe("Tier 2 accreditation");
  });

  it("tolerates the nullable columns without writing 'null' into a contract", () => {
    const d = ndaDataFor(app({ firm_name: null, abn: null }), ISSUED);
    expect(d.firm_name).toBe("");
    expect(d.abn).toBe("");
    expect(readyToIssue(d)).toEqual({ ok: true });
  });

  it("refuses to issue when the applicant has no name or email to sign as", () => {
    expect(readyToIssue(ndaDataFor(app({ legal_name: "  " }), ISSUED)).ok).toBe(false);
    expect(readyToIssue(ndaDataFor(app({ email: "" }), ISSUED)).ok).toBe(false);
  });

  it("carries the licensor side of the agreement", () => {
    const d = ndaDataFor(app(), ISSUED);
    expect(d.licensor_name).toBe("G.B. Mayes Holdings Pty Ltd");
    expect(d.licence_ref).toBe("COMP-8317");
  });
});
