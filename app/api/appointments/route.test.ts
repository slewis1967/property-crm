import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/**
 * What the client is told when a meeting is booked in the CRM.
 *
 * On 8 Nov 2026 a client got eight "We've emailed you the joining link" texts
 * while no invite email reached her. The text now follows what the invite step
 * actually did, and unticking "notify the client" stops the text as well.
 */

const h = vi.hoisted(() => ({
  invite: { ok: true } as { ok: true; messageId?: string } | { ok: false; error: string },
  invites: [] as unknown[],
  sms: [] as Array<{ body: string; phone: string }>,
  logs: [] as Array<{ event: string; fields: Record<string, unknown> }>,
}));

vi.mock("../../../utils/cf-access", () => ({
  requireAuth: async () => "glenn.m@nextkey.com.au",
  userEmailFromRequest: async () => "glenn.m@nextkey.com.au",
}));

vi.mock("../../../utils/supabase", () => ({
  supabase: {
    from(table: string) {
      const api = {
        insert: () => api,
        select: () => api,
        eq: () => api,
        single: async () => ({ data: { id: "11111111-1111-1111-1111-111111111111" }, error: null }),
        maybeSingle: async () => ({ data: table === "contacts" ? { phone: "0400 000 000" } : null, error: null }),
      };
      return api;
    },
  },
}));

vi.mock("../../../utils/livekit", () => ({
  roomForContact: (id: string) => `contact-${id}`,
  livekitConfigured: () => true,
}));
vi.mock("../../../utils/guest-token", () => ({ signGuestToken: async () => "tok" }));
vi.mock("../../../utils/meeting-invite", () => ({
  sendMeetingInvite: async (o: unknown) => {
    h.invites.push(o);
    return h.invite;
  },
}));
vi.mock("../../../utils/brevo", () => ({ sendBrevoEmail: async () => ({ ok: true, messageId: "x" }) }));
vi.mock("../../../utils/sms", () => ({
  toE164AU: (p: string | null) => (p ? "+61400000000" : null),
  isOptedOut: async () => false,
  sendSms: async (o: { body: string; phone: string }) => {
    h.sms.push(o);
    return { ok: true };
  },
}));
vi.mock("../../../utils/logger", () => ({
  log: {
    info: (event: string, fields: Record<string, unknown>) => h.logs.push({ event, fields }),
    warn: () => undefined,
    error: () => undefined,
  },
}));

import { POST } from "./route";

const CONTACT = "49c5de46-a4a1-4f34-8a09-a76db86b6d82";

function book(extra: Record<string, unknown> = {}) {
  return POST(
    new NextRequest("https://crm.nextkey.com.au/api/appointments", {
      method: "POST",
      body: JSON.stringify({
        contact_id: CONTACT,
        contact_email: "client@example.com",
        contact_name: "Pat Client",
        host_email: "glenn.m@nextkey.com.au",
        title: "Meeting — Pat Client",
        start_time: "2026-11-20T09:00:00+10:00",
        end_time: "2026-11-20T10:00:00+10:00",
        ...extra,
      }),
    }),
  );
}

beforeEach(() => {
  process.env.MEETING_SMS_ENABLED = "true";
  h.invite = { ok: true, messageId: "m1" };
  h.invites.length = 0;
  h.sms.length = 0;
  h.logs.length = 0;
});

describe("POST /api/appointments: what the client hears", () => {
  it("invite sent: the text points at the email", async () => {
    const res = await book();
    const data = await res.json();
    expect(data.invite_sent).toBe(true);
    expect(h.sms).toHaveLength(1);
    expect(h.sms[0].body).toContain("emailed you the joining link");
  });

  it("invite failed: the text does not claim an email was sent", async () => {
    h.invite = { ok: false, error: "Brevo 400: bad sender" };
    const data = await (await book()).json();
    expect(data.invite_sent).toBe(false);
    expect(data.invite_warning).toContain("could not be sent");
    expect(h.sms).toHaveLength(1);
    expect(h.sms[0].body).not.toMatch(/emailed|inbox|spam/i);
  });

  it("notify unticked (send_invite: false): no email and no text", async () => {
    const data = await (await book({ send_invite: false })).json();
    expect(data.invite_requested).toBe(false);
    expect(h.invites).toHaveLength(0);
    expect(h.sms).toHaveLength(0);
    expect(data.sms_sent).toBe(false);
  });

  it("invite_contact: false (new-opportunity form) also sends no text", async () => {
    await book({ invite_contact: false });
    expect(h.invites).toHaveLength(0);
    expect(h.sms).toHaveLength(0);
  });

  it("phone call: phone wording, no joining link", async () => {
    await book({ meeting_kind: "phone" });
    expect(h.sms[0].body).toContain("your phone call with");
    expect(h.sms[0].body).not.toMatch(/joining link/i);
  });

  it("logs one line per booking with what reached the client, and no email address", async () => {
    h.invite = { ok: false, error: "Brevo 400: bad sender" };
    await book();
    const line = h.logs.find((l) => l.event === "appointments.created");
    expect(line?.fields).toMatchObject({
      by: "glenn.m@nextkey.com.au",
      contact_id: CONTACT,
      invite_requested: true,
      invite_sent: false,
      invite_errors: ["Brevo 400: bad sender"],
      sms_sent: true,
    });
    expect(JSON.stringify(line?.fields)).not.toContain("client@example.com");
  });
});
