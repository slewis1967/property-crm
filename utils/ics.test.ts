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
