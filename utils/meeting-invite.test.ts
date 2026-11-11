import { beforeEach, describe, expect, it, vi } from "vitest";

// Saved signatures, keyed by lower-case user email. Mirrors email_user_aliases.
const rows: Record<string, unknown> = {};
const sent: Array<{ subject: string; html: string; fromEmail?: string }> = [];

vi.mock("./supabase", () => ({
  supabase: {
    from() {
      let email = "";
      const api = {
        select: () => api,
        ilike: (_col: string, val: string) => ((email = val.toLowerCase()), api),
        maybeSingle: () =>
          Promise.resolve({ data: rows[email] ? { signature: rows[email] } : null, error: null }),
      };
      return api;
    },
  },
}));

vi.mock("./brevo", () => ({
  sendBrevoEmail: async (o: { subject: string; html: string; fromEmail?: string }) => {
    sent.push(o);
    return { ok: true, messageId: "m1" };
  },
}));

import { sendMeetingInvite, meetingInviteHtml } from "./meeting-invite";
import { formatAuPhone, renderSignature, SPRINGBOARD_EMAIL_LOGO_URL } from "./email-signature";
import { buildIcs, DEFAULT_PRODID } from "./ics";

const GLENN = {
  name: "Glenn Mayes",
  title: "Director",
  email: "glenn.m@nextkey.com.au",
  phone: "0477201245",
  web: "nextkey.com.au",
  logo_url: "https://example.supabase.co/storage/v1/object/public/property-media/signature/glenn.png",
  disclaimer: "General advice only. NextKey Property Strategists is not a licensed financial planner.",
};
const SEAN = { ...GLENN, name: "Sean Lewis", email: "sean.l@nextkey.com.au", phone: "0477 007 785" };

const base = {
  to: { email: "client@example.com", name: "Pat Client" },
  title: "Strategy call",
  start: "2026-11-20T09:00:00+10:00",
  end: "2026-11-20T10:00:00+10:00",
  uid: "appt-1@nextkey.com.au",
};

beforeEach(() => {
  for (const k of Object.keys(rows)) delete rows[k];
  sent.length = 0;
});

describe("meeting invites follow the outward-email rule", () => {
  it("is set in Arial, with no system-font stack", () => {
    const html = meetingInviteHtml({ ...base, host: { email: SEAN.email, displayName: "Sean Lewis", brand: "nextkey" } });
    expect(html).toContain("font-family:Arial,Helvetica,sans-serif");
    expect(html).not.toMatch(/-apple-system|Segoe UI|Roboto/);
  });

  it("a NextKey invite carries the host's own signature, not Sean's", async () => {
    rows["glenn.m@nextkey.com.au"] = GLENN;
    rows["sean.l@nextkey.com.au"] = SEAN;
    const r = await sendMeetingInvite({ ...base, host: { email: GLENN.email, displayName: "Glenn Mayes", brand: "nextkey" } });
    expect(r.ok).toBe(true);
    expect(sent[0].html).toContain("Glenn Mayes");
    expect(sent[0].html).toContain("0477 201 245");
    expect(sent[0].html).not.toContain("Sean Lewis");
    expect(sent[0].html).not.toContain("0477 007 785");
  });

  it("a Springboard invite is signed by Glenn under the Springboard brand, with nothing NextKey", async () => {
    rows["glenn.m@nextkey.com.au"] = GLENN;
    const r = await sendMeetingInvite({
      ...base,
      host: { email: "bookings@springboardhomes.com.au", displayName: "Springboard Homes", brand: "springboard" },
    });
    expect(r.ok).toBe(true);
    const html = sent[0].html;
    expect(html).toContain("Glenn Mayes");
    expect(html).toContain("Springboard Homes");
    expect(html).toContain("springboardhomes.com.au");
    expect(html).toContain("0477 201 245");
    expect(html).not.toMatch(/nextkey/i);
    // The only image is the Springboard logo, from the Springboard site (never the NextKey logo).
    const imgs = [...html.matchAll(/<img[^>]*src="([^"]+)"/g)].map((m) => m[1]);
    expect(imgs).toEqual([SPRINGBOARD_EMAIL_LOGO_URL]);
    expect(SPRINGBOARD_EMAIL_LOGO_URL).toMatch(/^https:\/\/springboardhomes\.com\.au\//);
  });

  it("refuses to send when the sender has no signature on file", async () => {
    rows["sean.l@nextkey.com.au"] = SEAN; // present, but must NOT be borrowed
    const r = await sendMeetingInvite({ ...base, host: { email: "chris@nextkey.com.au", displayName: "Chris", brand: "nextkey" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("no email signature on file for chris@nextkey.com.au");
    expect(sent).toHaveLength(0);
  });

  it("refuses a Springboard invite when Glenn's signature is missing", async () => {
    const r = await sendMeetingInvite({
      ...base,
      host: { email: "bookings@springboardhomes.com.au", displayName: "Springboard Homes", brand: "springboard" },
    });
    expect(r.ok).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it("update and cancel emails are signed too", async () => {
    rows["sean.l@nextkey.com.au"] = SEAN;
    await sendMeetingInvite({ ...base, kind: "cancel", sequence: 5, host: { email: SEAN.email, displayName: "Sean Lewis", brand: "nextkey" } });
    expect(sent[0].subject).toBe("Cancelled: Strategy call");
    expect(sent[0].html).toContain("Sean Lewis");
  });
});

describe("signature rendering", () => {
  it("formats AU numbers and sets the block in Arial", () => {
    expect(formatAuPhone("0477201245")).toBe("0477 201 245");
    expect(formatAuPhone("0755551234")).toBe("07 5555 1234");
    expect(formatAuPhone("+61 477 201 245")).toBe("+61 477 201 245");
    const { html, text } = renderSignature({ ...GLENN, title: "", web: "" });
    expect(html).toContain("font-family:Arial,Helvetica,sans-serif");
    expect(html).toContain('href="tel:0477201245"');
    expect(text).toContain("glenn.m@nextkey.com.au · 0477 201 245");
    expect(text).not.toContain(" ·  · ");
  });
});

// Brand colours / PRODID (from the Springboard book-domain PR).
const brandBase = {
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
      ...brandBase,
      host: { email: "bookings@springboardhomes.com.au", displayName: "Springboard Homes", brand: "springboard" },
    });
    expect(html).toContain("#020e40");
    expect(html).toContain("#c7894e");
    expect(html).not.toMatch(/#0F4C5C/i);
    expect(html).not.toMatch(/nextkey/i);
  });

  it("keeps the NextKey teal for NextKey hosts", () => {
    const html = meetingInviteHtml({
      ...brandBase,
      joinUrl: "https://crm.nextkey.com.au/join/tok",
      host: { email: "sean.l@nextkey.com.au", displayName: "Sean Lewis", brand: "nextkey" },
    });
    expect(html).toContain("#0F4C5C");
    expect(html).not.toContain("#020e40");
  });
});

describe(".ics PRODID", () => {
  const ev = { uid: "u1", start: brandBase.start, end: brandBase.end, title: "T", dtstamp: "2026-10-19T00:00:00Z" };

  it("defaults to the existing NextKey PRODID", () => {
    expect(buildIcs(ev)).toContain(`PRODID:${DEFAULT_PRODID}\r\n`);
  });

  it("can carry a Springboard PRODID with no NextKey in the file", () => {
    const ics = buildIcs({ ...ev, prodId: "-//Springboard Homes//Meeting//EN" });
    expect(ics).toContain("PRODID:-//Springboard Homes//Meeting//EN\r\n");
    expect(ics).not.toMatch(/nextkey/i);
  });
});
