import { describe, it, expect } from "vitest";
import { springboardSenderEmail, springboardSenderName } from "./springboard-sender";
import { nextThursday, buildYlaInvite, surnameOf, YLA_CALENDAR_TITLE, YLA_INVITE_EMAIL } from "./yla-submit";

describe("nextThursday", () => {
  it("returns the upcoming Thursday at 02:00 UTC", () => {
    const t = nextThursday(new Date("2026-07-22T05:00:00Z")); // Wed
    expect(t.getUTCDay()).toBe(4); // Thu
    expect(t.toISOString()).toBe("2026-07-23T02:00:00.000Z");
  });
  it("keeps today when it's Thursday before the slot", () => {
    expect(nextThursday(new Date("2026-07-23T01:00:00Z")).toISOString()).toBe("2026-07-23T02:00:00.000Z");
  });
  it("rolls to next week when Thursday's slot has passed", () => {
    expect(nextThursday(new Date("2026-07-23T03:00:00Z")).toISOString()).toBe("2026-07-30T02:00:00.000Z");
  });
});

describe("surnameOf", () => {
  it("uppercases the last name", () => {
    expect(surnameOf("David William Halliday")).toBe("HALLIDAY");
    expect(surnameOf("Cher")).toBe("CHER");
  });
});

describe("buildYlaInvite", () => {
  const invite = buildYlaInvite({
    primaryApplicant: "David Halliday",
    driveUrl: "https://drive.google.com/drive/folders/ABC",
    clientRef: "NK-10007",
    applicationId: "app-1",
    requestId: "req-1",
    now: new Date("2026-07-22T05:00:00Z"),
  });

  it("addresses YLA and carries the COMP-8317 title + client ref", () => {
    expect(invite.to).toBe(YLA_INVITE_EMAIL);
    expect(invite.subject).toContain(YLA_CALENDAR_TITLE);
    expect(invite.subject).toContain("HALLIDAY");
    expect(invite.subject).toContain("NK-10007");
  });

  it("uses YLA's SURNAME - <drive link> - body line", () => {
    expect(invite.bodyLine).toBe("HALLIDAY - https://drive.google.com/drive/folders/ABC -");
    expect(invite.text).toContain(invite.bodyLine);
  });

  it("produces a valid .ics inviting YLA with the title + drive link", () => {
    expect(invite.ics).toContain("BEGIN:VCALENDAR");
    expect(invite.ics).toContain(`SUMMARY:${YLA_CALENDAR_TITLE}`);
    expect(invite.ics).toContain(YLA_INVITE_EMAIL);
    expect(invite.ics).toContain("drive.google.com/drive/folders/ABC");
    expect(invite.icsBase64.length).toBeGreaterThan(0);
    expect(Buffer.from(invite.icsBase64, "base64").toString("utf8")).toContain("BEGIN:VCALENDAR");
  });

  it("stamps the event on the upcoming Thursday", () => {
    expect(invite.eventStart.getUTCDay()).toBe(4);
  });
});

describe("who the invite comes from", () => {
  const invite = buildYlaInvite({
    primaryApplicant: "David William Halliday",
    driveUrl: "https://drive.google.com/drive/folders/ABC",
    clientRef: "NK-10010",
    applicationId: null,
    requestId: "req-1",
    now: new Date("2026-07-22T05:00:00Z"),
  });

  /**
   * The client is Springboard's and YLA know this business through Springboard
   * and the COMP-8317 introducer chain. A NextKey organiser on the invite reads
   * to the Licensor as a forwarded invite from a third party.
   */
  it("names Springboard as the calendar organiser, not NextKey", () => {
    // iCalendar folds long lines (CRLF + a leading space); unfold before matching.
    const ics = invite.ics.split("\r\n ").join("");
    expect(ics).toContain(`ORGANIZER;CN=${springboardSenderName()}:mailto:${springboardSenderEmail()}`);
    expect(ics).not.toContain("nextkey.com.au");
    expect(ics).not.toContain("NextKey Property Strategists");
  });
});
