import { describe, it, expect } from "vitest";
import { outboundEmailLogRow } from "./email-log";

const base = {
  to: "client@example.com",
  toName: "A Client",
  subject: "Your Property Investment Analysis",
  html: "<p>hi</p>",
  fromEmail: "info@nextkey.com.au",
  fromName: "NextKey Property Strategists",
  sentBy: "sean@nextkey.com.au",
  ownerUserEmail: "sean@nextkey.com.au",
  contactId: "11111111-1111-1111-1111-111111111111",
  opportunityId: "opp-42",
  tags: ["pia-report"],
};

describe("outboundEmailLogRow", () => {
  it("stamps Brevo's messageId into both message_id and brevo_message_id on success", () => {
    const row = outboundEmailLogRow(base, {
      ok: true,
      messageId: "<202601011200.abc@smtp-relay.brevo.com>",
    });
    // message_id is the threadable key the inbound feeder matches In-Reply-To against.
    expect(row.message_id).toBe("<202601011200.abc@smtp-relay.brevo.com>");
    expect(row.brevo_message_id).toBe("<202601011200.abc@smtp-relay.brevo.com>");
    expect(row.direction).toBe("outbound");
    expect(row.status).toBe("sent");
    expect(row.error).toBeNull();
    expect(row.is_read).toBe(true);
    expect(typeof row.sent_at).toBe("string");
  });

  it("carries contact/opportunity linkage and recipient/sender fields through", () => {
    const row = outboundEmailLogRow(base, { ok: true, messageId: "<x@brevo>" });
    expect(row.contact_id).toBe(base.contactId);
    expect(row.opportunity_id).toBe(base.opportunityId);
    expect(row.to_email).toBe(base.to);
    expect(row.to_name).toBe(base.toName);
    expect(row.from_email).toBe(base.fromEmail);
    expect(row.owner_user_email).toBe(base.ownerUserEmail);
    expect(row.sent_by).toBe(base.sentBy);
    expect(row.tags).toEqual(["pia-report"]);
  });

  it("maps an empty messageId to null (sent but not threadable) rather than storing ''", () => {
    const row = outboundEmailLogRow(base, { ok: true, messageId: "" });
    expect(row.status).toBe("sent");
    expect(row.message_id).toBeNull();
    expect(row.brevo_message_id).toBeNull();
  });

  it("records a failed send with the error and no message_id / sent_at", () => {
    const row = outboundEmailLogRow(base, { ok: false, error: "Brevo 400: bad" });
    expect(row.status).toBe("failed");
    expect(row.error).toBe("Brevo 400: bad");
    expect(row.message_id).toBeNull();
    expect(row.sent_at).toBeNull();
  });

  it("defaults optional linkage/tags to null/[] when omitted", () => {
    const row = outboundEmailLogRow(
      {
        to: "x@y.com",
        subject: "s",
        html: "<p>h</p>",
        fromEmail: "info@nextkey.com.au",
        fromName: "NextKey",
      },
      { ok: true, messageId: "<z@brevo>" },
    );
    expect(row.contact_id).toBeNull();
    expect(row.opportunity_id).toBeNull();
    expect(row.thread_id).toBeNull();
    expect(row.in_reply_to).toBeNull();
    expect(row.tags).toEqual([]);
  });
});
