import { describe, it, expect } from "vitest";
import { buildIcs, icsBase64 } from "./ics";

const base = {
  uid: "appt-123@nextkey.com.au",
  start: "2026-07-20T04:00:00Z",
  end: "2026-07-20T04:30:00Z",
  title: "Meeting",
  dtstamp: "2026-07-18T00:00:00Z",
};

describe("buildIcs", () => {
  it("emits a well-formed REQUEST VCALENDAR with CRLF endings", () => {
    const ics = buildIcs(base);
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("METHOD:REQUEST");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT\r\nEND:VCALENDAR");
    expect(ics.endsWith("\r\n")).toBe(true);
  });

  it("formats DTSTART/DTEND/DTSTAMP as UTC basic format", () => {
    const ics = buildIcs(base);
    expect(ics).toContain("DTSTART:20260720T040000Z");
    expect(ics).toContain("DTEND:20260720T043000Z");
    expect(ics).toContain("DTSTAMP:20260718T000000Z");
  });

  it("escapes commas, semicolons, backslashes and newlines in text", () => {
    const ics = buildIcs({
      ...base,
      title: "Sean, Glenn; review",
      description: "Line one\nLine two \\ end",
    });
    expect(ics).toContain("SUMMARY:Sean\\, Glenn\\; review");
    expect(ics).toContain("DESCRIPTION:Line one\\nLine two \\\\ end");
  });

  it("includes organizer, attendees and a URL join link", () => {
    const ics = buildIcs({
      ...base,
      location: "https://crm.nextkey.com.au/join/abc",
      url: "https://crm.nextkey.com.au/join/abc",
      organizer: { name: "Sean Lewis", email: "sean.l@nextkey.com.au" },
      attendees: [{ name: "Jane Buyer", email: "jane@example.com" }],
    });
    // Long property lines are folded (leading-space continuations), so compare
    // against an unfolded copy.
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain("ORGANIZER;CN=Sean Lewis:mailto:sean.l@nextkey.com.au");
    expect(unfolded).toContain("ATTENDEE;CN=Jane Buyer;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:jane@example.com");
    expect(unfolded).toContain("URL:https://crm.nextkey.com.au/join/abc");
  });

  it("marks CANCEL method with CANCELLED status", () => {
    const ics = buildIcs({ ...base, method: "CANCEL", sequence: 1 });
    expect(ics).toContain("METHOD:CANCEL");
    expect(ics).toContain("STATUS:CANCELLED");
    expect(ics).toContain("SEQUENCE:1");
  });

  it("folds content lines longer than 75 octets with a leading space", () => {
    const ics = buildIcs({ ...base, description: "x".repeat(200) });
    const physicalLines = ics.split("\r\n");
    // Every physical line must be <= 75 octets.
    for (const line of physicalLines) {
      expect(Buffer.from(line, "utf8").length).toBeLessThanOrEqual(75);
    }
    // The description must survive an unfold (drop CRLF + leading space).
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain(`DESCRIPTION:${"x".repeat(200)}`);
  });

  it("throws on an invalid date", () => {
    expect(() => buildIcs({ ...base, start: "not-a-date" })).toThrow(/invalid date/);
  });

  it("icsBase64 round-trips back to the document", () => {
    const b64 = icsBase64(base);
    expect(Buffer.from(b64, "base64").toString("utf8")).toEqual(buildIcs(base));
  });
});

describe("multi-attendee meetings", () => {
  // Regression guard: the appointments route used to email attendees[0] only,
  // so a second applicant silently got nothing while the UI reported "sent".
  // Every recipient's .ics must list the whole roster, and every copy must
  // carry the SAME uid or each calendar treats it as a separate meeting.
  const roster = [
    { email: "a@example.com", name: "Applicant One" },
    { email: "b@example.com", name: "Applicant Two" },
    { email: "c@example.com" },
  ];

  // Long ATTENDEE lines are folded at 75 octets, so an address can be split
  // across a continuation line. Unfold before asserting on content.
  const unfold = (ics: string) => ics.replace(/\r\n /g, "");

  it("emits one ATTENDEE line per invitee", () => {
    const ics = buildIcs({ ...base, attendees: roster });
    const lines = ics.split("\r\n").filter((l) => l.startsWith("ATTENDEE"));
    expect(lines).toHaveLength(3);
    const flat = unfold(ics);
    expect(flat).toContain("mailto:a@example.com");
    expect(flat).toContain("mailto:b@example.com");
    expect(flat).toContain("mailto:c@example.com");
  });

  it("omits CN for an attendee with no name rather than emitting an empty one", () => {
    const ics = buildIcs({ ...base, attendees: [{ email: "c@example.com" }] });
    expect(ics).toContain("ATTENDEE;ROLE=REQ-PARTICIPANT");
    expect(ics).not.toContain("CN=;");
  });

  it("keeps one uid across the copies sent to different recipients", () => {
    const first = buildIcs({ ...base, attendees: roster });
    const second = buildIcs({ ...base, attendees: roster });
    const uidOf = (s: string) => s.split("\r\n").find((l) => l.startsWith("UID:"));
    expect(uidOf(first)).toBe(uidOf(second));
    expect(uidOf(first)).toBe("UID:appt-123@nextkey.com.au");
  });

  it("still round-trips through base64 with several attendees", () => {
    const b64 = icsBase64({ ...base, attendees: roster });
    const decoded = Buffer.from(b64, "base64").toString("utf8");
    expect(decoded.split("\r\n").filter((l) => l.startsWith("ATTENDEE"))).toHaveLength(3);
  });
});
