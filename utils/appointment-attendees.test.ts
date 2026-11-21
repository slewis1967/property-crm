import { describe, expect, it } from "vitest";
import {
  buildAppointmentPayload,
  emailRecipients,
  mapsLink,
  meetingKindNoun,
  normaliseAttendees,
  parseMeetingKind,
  readAppointmentPayload,
  smsRecipients,
} from "./appointment-attendees";

describe("parseMeetingKind", () => {
  it("accepts the three kinds and defaults to video", () => {
    expect(parseMeetingKind("inspection")).toBe("inspection");
    expect(parseMeetingKind("phone")).toBe("phone");
    expect(parseMeetingKind("video")).toBe("video");
    expect(parseMeetingKind("zoom")).toBe("video");
    expect(parseMeetingKind(undefined)).toBe("video");
  });
  it("names each kind", () => {
    expect(meetingKindNoun("inspection")).toBe("on-site inspection");
    expect(meetingKindNoun("phone")).toBe("phone call");
    expect(meetingKindNoun("video")).toBe("meeting");
  });
});

describe("normaliseAttendees", () => {
  it("keeps rows with an email or a mobile, and normalises the mobile", () => {
    const out = normaliseAttendees([
      { email: "kim@example.com", displayName: "Kim Lee", phone: "0412 345 678" },
      { phone: "0498765432", displayName: "Builder" },
      { email: "not-an-email", displayName: "Nobody" },
      { displayName: "Name only" },
    ]);
    expect(out).toEqual([
      { email: "kim@example.com", name: "Kim Lee", phone: "+61412345678" },
      { email: null, name: "Builder", phone: "+61498765432" },
    ]);
  });
  it("drops duplicates by email (any case) and phone-only duplicates by number", () => {
    const out = normaliseAttendees([
      { email: "a@x.com" },
      { email: "A@X.com" },
      { phone: "0400000001" },
      { phone: "+61400000001" },
    ]);
    expect(out).toHaveLength(2);
  });
  it("ignores non-arrays", () => {
    expect(normaliseAttendees(undefined)).toEqual([]);
  });
});

describe("emailRecipients", () => {
  it("returns only attendees with an email", () => {
    const out = emailRecipients([
      { email: "a@x.com", name: "A", phone: null },
      { email: null, name: "B", phone: "+61400000002" },
    ]);
    expect(out).toEqual([{ email: "a@x.com", name: "A" }]);
  });
});

describe("smsRecipients", () => {
  const contact = { email: "client@x.com", name: "Client", phone: "0411111111" };

  it("uses the contact's mobile on file when their own row has none", () => {
    const out = smsRecipients([{ email: "client@x.com", name: "Client", phone: null }], contact);
    expect(out).toEqual([{ phone: "+61411111111", name: "Client", email: "client@x.com", isContact: true }]);
  });

  it("texts every attendee with a mobile, plus the contact, each number once", () => {
    const out = smsRecipients(
      [
        { email: "client@x.com", name: "Client", phone: "+61411111111" },
        { email: "partner@x.com", name: "Partner", phone: "+61422222222" },
        { email: "noone@x.com", name: "No mobile", phone: null },
      ],
      contact,
    );
    expect(out.map((r) => r.phone)).toEqual(["+61411111111", "+61422222222"]);
    expect(out[0].isContact).toBe(true);
    expect(out[1].isContact).toBe(false);
  });

  it("still texts the contact when they aren't on the attendee list", () => {
    const out = smsRecipients([{ email: "partner@x.com", name: "Partner", phone: "+61422222222" }], contact);
    expect(out.map((r) => r.phone)).toEqual(["+61422222222", "+61411111111"]);
    expect(out[1].isContact).toBe(true);
  });

  it("with no contact (personal entry) texts only attendees", () => {
    const out = smsRecipients([{ email: null, name: "X", phone: "+61433333333" }], null);
    expect(out).toHaveLength(1);
  });
});

describe("payload round trip", () => {
  it("reads back what it stored", () => {
    const attendees = [{ email: "a@x.com", name: "A", phone: "+61400000003" }];
    const p = buildAppointmentPayload("inspection", attendees);
    expect(readAppointmentPayload(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });
  it("ignores Cal.com payloads and nulls", () => {
    expect(readAppointmentPayload(null)).toBeNull();
    expect(readAppointmentPayload({ triggerEvent: "BOOKING_CREATED" })).toBeNull();
  });
});

describe("mapsLink", () => {
  it("encodes the address", () => {
    expect(mapsLink("12 Example St, Palm Beach QLD")).toBe(
      "https://www.google.com/maps/search/?api=1&query=12%20Example%20St%2C%20Palm%20Beach%20QLD",
    );
  });
});
