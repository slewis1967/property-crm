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
  const base = { startISO: "2026-07-26T23:00:00+00:00", hostName: "Springboard Homes", emailed: true };

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

  it("never claims an email was sent when the invite did not go (8 Nov 2026)", () => {
    const body = meetingSmsBody({ ...base, firstName: "Sonia", emailed: false });
    expect(body).toContain("Mon 27 Jul at 9am");
    expect(body).not.toMatch(/emailed|inbox|spam/i);
    expect(body).toMatch(/reply stop/i);
  });

  it("a phone call says phone call and never mentions a joining link", () => {
    const sent = meetingSmsBody({ ...base, firstName: "Kim", medium: "phone" });
    expect(sent).toContain("your phone call with Springboard Homes");
    expect(sent).toContain("emailed you the details");
    expect(sent).not.toMatch(/joining link|meeting/i);
    const unsent = meetingSmsBody({ ...base, firstName: "Kim", medium: "phone", emailed: false });
    expect(unsent).not.toMatch(/emailed|link/i);
  });

  it("an on-site inspection names the address and never mentions a joining link", () => {
    const body = meetingSmsBody({
      ...base,
      firstName: "Kim",
      medium: "inspection",
      address: "12 Example St, Palm Beach",
    });
    expect(body).toContain("your on-site inspection at 12 Example St, Palm Beach with Springboard Homes");
    expect(body).toContain("emailed you the details");
    expect(body).not.toMatch(/joining link/i);
  });

  it("an update gives the new time, a cancellation never points at an email", () => {
    const upd = meetingSmsBody({ ...base, firstName: "Kim", kind: "update" });
    expect(upd).toContain("has changed. It is now Mon 27 Jul at 9am");
    expect(upd).toContain("updated joining link");
    const cancel = meetingSmsBody({ ...base, firstName: "Kim", kind: "cancel", medium: "inspection", address: "1 A St" });
    expect(cancel).toContain("your on-site inspection at 1 A St with Springboard Homes on Mon 27 Jul at 9am has been cancelled");
    expect(cancel).not.toMatch(/emailed/i);
  });
});
