import { describe, it, expect } from "vitest";
import { formatMeetingWhen, meetingSmsBody } from "./meeting-sms";

describe("formatMeetingWhen", () => {
  it("reads the AEST wall clock, not the server's", () => {
    // Kim Ho's meeting: 2026-07-26T23:00Z is 9am Monday 27 July in Brisbane.
    // Formatting in UTC would have told her Sunday the 26th at 11pm.
    expect(formatMeetingWhen("2026-07-26T23:00:00+00:00")).toBe("Mon 27 Jul at 9am");
  });
  it("includes minutes only when there are any", () => {
    expect(formatMeetingWhen("2026-07-28T01:30:00Z")).toBe("Tue 28 Jul at 11:30am");
    expect(formatMeetingWhen("2026-07-28T01:00:00Z")).toBe("Tue 28 Jul at 11am");
  });
  it("handles noon and midnight without printing 0", () => {
    expect(formatMeetingWhen("2026-07-28T02:00:00Z")).toBe("Tue 28 Jul at 12pm");
    expect(formatMeetingWhen("2026-07-28T14:00:00Z")).toBe("Wed 29 Jul at 12am");
  });
  it("rolls the date over correctly across the UTC boundary", () => {
    // 14:00Z onwards is already tomorrow in Brisbane.
    expect(formatMeetingWhen("2026-07-31T14:30:00Z")).toBe("Sat 1 Aug at 12:30am");
  });
});

describe("meetingSmsBody", () => {
  const base = { startISO: "2026-07-26T23:00:00+00:00", hostName: "Springboard Homes" };

  it("leads with the day and time, and says where the link is", () => {
    const body = meetingSmsBody({ ...base, firstName: "Kim" });
    expect(body).toContain("Mon 27 Jul at 9am");
    expect(body).toContain("Springboard Homes");
    // The whole point of the second channel: tell them to go look in spam.
    expect(body).toMatch(/spam or promotions/i);
  });

  it("carries an opt-out, because an unsolicited SMS without one breaches the Spam Act", () => {
    expect(meetingSmsBody({ ...base, firstName: "Kim" })).toMatch(/reply stop/i);
  });

  it("uses the first name only", () => {
    expect(meetingSmsBody({ ...base, firstName: "Kim Oanh" })).toContain("Hi Kim,");
  });

  it("degrades cleanly with no name — never 'Hi ,'", () => {
    const body = meetingSmsBody({ ...base, firstName: null });
    expect(body).not.toContain("Hi ,");
    expect(body.startsWith("your meeting")).toBe(true);
  });

  it("contains no link — a link is what makes an SMS read as a scam", () => {
    expect(meetingSmsBody({ ...base, firstName: "Kim" })).not.toMatch(/https?:\/\//);
  });

  it("stays within two SMS segments", () => {
    // 306 chars = 2 GSM-7 segments. Longer costs a third and gets truncated by
    // some handsets.
    expect(meetingSmsBody({ ...base, firstName: "Kim" }).length).toBeLessThanOrEqual(306);
  });
});
