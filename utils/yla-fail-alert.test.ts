import { describe, it, expect } from "vitest";
import {
  householdName,
  groupFailuresByApplicant,
  buildFailAlert,
  buildFailTaskBody,
  URGENT_HEADERS,
  failAlertRecipients,
} from "./yla-fail-alert";
import { renderFixup, slotNameFromFilename, YLA_FORMAT_RULES, type Sibling, type FixupAction } from "./yla-remediation-email";
import { parseVisualVerdict, visualIssues, type DocVerdict } from "./yla-verification";

// The real case this was built for: NK-10017, Marcia (Applicant 1) passed,
// Mark (Applicant 2) uploaded his super statement into an ATO slot plus an ATO
// screenshot.
const siblings: Sibling[] = [
  { id: "req-marcia", applicant_name: "Marcia Libman", applicant_email: "marcia@example.com", created_at: "2026-09-03T04:02:15Z" },
  { id: "req-mark", applicant_name: "Mark Benjamin Libman", applicant_email: "mark@example.com", created_at: "2026-09-03T04:02:16Z" },
];
const verdict = (applicant: string, filename: string, issues: string[], docKey = "ato_income"): DocVerdict => ({
  docKey,
  applicant,
  filename,
  sizeBytes: 1000,
  issues,
  pass: issues.length === 0,
});
const docs: DocVerdict[] = [
  verdict("Applicant 1", "Payslip 1 - Libman (NK-10017).pdf", [], "payslip"),
  verdict("Applicant 2", "ATO Income Statement 1 - Libman (NK-10017).pdf", [
    "doesn't look like the expected document — it appears to be a superannuation statement",
  ]),
  verdict("Applicant 2", "ATO Income Statement 5 - Libman (NK-10017).pdf", ["looks like a phone/screen screenshot"]),
];
const fixups: FixupAction[] = [
  { requestId: "req-mark", applicant: "Mark Benjamin Libman", action: "emailed", to: "mark@example.com", docs: ["ATO Income Statement"] },
];
const NOW = new Date("2026-09-11T03:22:00Z"); // Fri 11 Sep, 1:22 pm AEST

describe("householdName", () => {
  it("shares one surname", () => {
    expect(householdName(["Marcia Libman", "Mark Benjamin Libman"])).toBe("Marcia & Mark Libman");
  });
  it("keeps both full names when surnames differ", () => {
    expect(householdName(["Jane Smith", "Tom Jones"])).toBe("Jane Smith & Tom Jones");
  });
  it("handles one applicant and blanks", () => {
    expect(householdName(["  Jane   Smith "])).toBe("Jane Smith");
    expect(householdName([""])).toBe("Applicant");
  });
});

describe("groupFailuresByApplicant", () => {
  it("attributes failing files to the right person by Applicant N, and skips a clean applicant", () => {
    const g = groupFailuresByApplicant(siblings, docs, fixups);
    expect(g).toHaveLength(1);
    expect(g[0]!.name).toBe("Mark Benjamin Libman");
    expect(g[0]!.docs.map((d) => d.slot)).toEqual(["ATO Income Statement 1", "ATO Income Statement 5"]);
    expect(g[0]!.clientEmail).toEqual({ sent: true, to: "mark@example.com" });
  });
  it("says why a client was NOT emailed", () => {
    const skipped: FixupAction[] = [{ requestId: "req-mark", applicant: "Mark", action: "skipped", reason: "no email" }];
    expect(groupFailuresByApplicant(siblings, docs, skipped)[0]!.clientEmail).toEqual({ sent: false, reason: "no email" });
    const dry: FixupAction[] = [{ requestId: "req-mark", applicant: "Mark", action: "would_email", to: "m@x", docs: [] }];
    expect(groupFailuresByApplicant(siblings, docs, dry)[0]!.clientEmail.sent).toBe(false);
  });
  it("gives a solo application every failing file regardless of label", () => {
    const solo = [siblings[0]!];
    const g = groupFailuresByApplicant(solo, [verdict("Marcia Libman", "Super Statement - Libman (NK-10017).pdf", ["not clearly legible"], "super_statement")], []);
    expect(g[0]!.name).toBe("Marcia Libman");
    expect(g[0]!.docs[0]!.slot).toBe("Super Statement");
  });
});

describe("buildFailAlert", () => {
  const mail = buildFailAlert({
    household: "Marcia & Mark Libman",
    clientRef: "NK-10017",
    applicants: groupFailuresByApplicant(siblings, docs, fixups),
    missing: [],
    crmUrl: "https://crm.example/opportunities/opp-1",
    verifiedAt: NOW,
  });
  it("puts URGENT and the client's name in the subject", () => {
    expect(mail.subject).toBe("URGENT — Marcia & Mark Libman (NK-10017): documents failed YLA check");
  });
  it("lists each failing file with its reason, and what the client was told", () => {
    expect(mail.text).toContain("ATO Income Statement 1 — doesn't look like the expected document — it appears to be a superannuation statement");
    expect(mail.text).toContain("ATO Income Statement 5 — looks like a phone/screen screenshot");
    expect(mail.text).toContain("Mark Benjamin Libman has been emailed a fresh upload link");
    expect(mail.text).toContain("Nothing has been sent to YLA");
    expect(mail.text).toContain("https://crm.example/opportunities/opp-1");
  });
  it("reports the time in Brisbane time", () => {
    expect(mail.text).toMatch(/11 Sept?,? 1:22\s?pm/i);
  });
  it("surfaces our own blockers separately from the client's", () => {
    const m = buildFailAlert({
      household: "Jane Smith",
      clientRef: null,
      applicants: [],
      missing: ["Needs Analysis is not signed"],
      crmUrl: "https://crm.example/document-requests",
      verifiedAt: NOW,
    });
    expect(m.subject).toBe("URGENT — Jane Smith: documents failed YLA check");
    expect(m.text).toContain("ALSO BLOCKING — OURS TO FIX");
    expect(m.text).toContain("Needs Analysis is not signed");
  });
  it("escapes client-supplied text in the HTML", () => {
    const m = buildFailAlert({
      household: "<b>x</b>",
      clientRef: null,
      applicants: [],
      missing: [],
      crmUrl: "https://crm.example",
      verifiedAt: NOW,
    });
    expect(m.html).not.toContain("<b>x</b>");
    expect(m.html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});

describe("urgent delivery", () => {
  it("marks the email high-importance for every major client", () => {
    expect(URGENT_HEADERS["X-Priority"]).toMatch(/^1/);
    expect(URGENT_HEADERS.Importance).toBe("High");
  });
  it("goes to Sean and Glenn by default", () => {
    const prev = process.env.YLA_FAIL_ALERT_TO;
    delete process.env.YLA_FAIL_ALERT_TO;
    expect(failAlertRecipients()).toEqual(["sean.l@nextkey.com.au", "glenn.m@nextkey.com.au"]);
    process.env.YLA_FAIL_ALERT_TO = "a@x.com, b@x.com";
    expect(failAlertRecipients()).toEqual(["a@x.com", "b@x.com"]);
    if (prev === undefined) delete process.env.YLA_FAIL_ALERT_TO;
    else process.env.YLA_FAIL_ALERT_TO = prev;
  });
});

describe("buildFailTaskBody", () => {
  it("carries the same facts as the email", () => {
    const body = buildFailTaskBody({ applicants: groupFailuresByApplicant(siblings, docs, fixups), missing: [], verifiedAt: NOW });
    expect(body).toContain("Mark Benjamin Libman:");
    expect(body).toContain("ATO Income Statement 1 — doesn't look like the expected document");
    expect(body).toContain("Client emailed mark@example.com");
    expect(body).toContain("Closes itself when the set passes");
  });
});

describe("client fixup email", () => {
  it("names the exact slot to replace and states YLA's format", () => {
    const e = renderFixup({ applicantName: "Mark Benjamin Libman", link: "https://crm.example/portal/tok", flagged: docs.filter((d) => !d.pass) });
    expect(e.text).toContain("Hi Mark,");
    expect(e.text).toContain("• ATO Income Statement 1 — doesn't look like the expected document — it appears to be a superannuation statement.");
    expect(e.text).toContain("• ATO Income Statement 5 — looks like a phone/screen screenshot.");
    for (const rule of YLA_FORMAT_RULES) expect(e.text).toContain(rule);
    expect(e.text).toContain("press Replace");
    expect(e.html).toContain("https://crm.example/portal/tok");
  });
  it("slotNameFromFilename strips the surname and reference", () => {
    expect(slotNameFromFilename("ATO Income Statement 5 - Libman (NK-10017).pdf")).toBe("ATO Income Statement 5");
    expect(slotNameFromFilename("Photo ID 2 Back - Libman (NK-10017).pdf")).toBe("Photo ID 2 Back");
    expect(slotNameFromFilename("weird.pdf")).toBe("weird");
  });
});

describe("visual check names what a wrong document actually is", () => {
  it("adds the model's identification to the wrong-type issue", () => {
    const v = parseVisualVerdict(
      '{"legible":true,"correctType":false,"actualDocument":"a superannuation statement.","isScreenshot":false,"rotated":false}',
    );
    expect(visualIssues(v)).toEqual(["doesn't look like the expected document — it appears to be a superannuation statement"]);
  });
  it("falls back to the plain wording when the model doesn't say", () => {
    const v = parseVisualVerdict('{"legible":true,"correctType":false,"actualDocument":"","isScreenshot":false,"rotated":false}');
    expect(visualIssues(v)).toEqual(["doesn't look like the expected document"]);
  });
});
