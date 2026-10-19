import { describe, expect, it } from "vitest";
import { meetingInviteHtml } from "./meeting-invite";
import { buildIcs, DEFAULT_PRODID } from "./ics";

const base = {
  to: { email: "lead@example.com", name: "Pat Lead" },
  title: "Meeting with Pat Lead",
  start: "2026-10-20T09:00:00+10:00",
  end: "2026-10-20T09:30:00+10:00",
  joinUrl: "https://book.springboardhomes.com.au/join/tok",
  uid: "appt-1@springboardhomes.com.au",
};

describe("meeting invite branding", () => {
  it("uses Springboard navy + amber, never the NextKey teal, for a Springboard host", () => {
    const html = meetingInviteHtml({
      ...base,
      host: { email: "bookings@springboardhomes.com.au", displayName: "Springboard Homes", brand: "springboard" },
    });
    expect(html).toContain("#020e40");
    expect(html).toContain("#c7894e");
    expect(html).not.toMatch(/#0F4C5C/i);
    expect(html).not.toMatch(/nextkey/i);
  });

  it("keeps the NextKey teal for NextKey hosts", () => {
    const html = meetingInviteHtml({
      ...base,
      joinUrl: "https://crm.nextkey.com.au/join/tok",
      host: { email: "sean.l@nextkey.com.au", displayName: "Sean Lewis", brand: "nextkey" },
    });
    expect(html).toContain("#0F4C5C");
    expect(html).not.toContain("#020e40");
  });
});

describe(".ics PRODID", () => {
  const ev = { uid: "u1", start: base.start, end: base.end, title: "T", dtstamp: "2026-10-19T00:00:00Z" };

  it("defaults to the existing NextKey PRODID", () => {
    expect(buildIcs(ev)).toContain(`PRODID:${DEFAULT_PRODID}\r\n`);
  });

  it("can carry a Springboard PRODID with no NextKey in the file", () => {
    const ics = buildIcs({ ...ev, prodId: "-//Springboard Homes//Meeting//EN" });
    expect(ics).toContain("PRODID:-//Springboard Homes//Meeting//EN\r\n");
    expect(ics).not.toMatch(/nextkey/i);
  });
});
