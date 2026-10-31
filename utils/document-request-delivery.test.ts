import { describe, it, expect } from "vitest";
import { describeDelivery, deliveryActionLabel } from "./document-request-delivery";

const label = (emails: (string | null | undefined)[]) =>
  deliveryActionLabel(describeDelivery(emails));

describe("describeDelivery", () => {
  it("counts a blank, missing or whitespace-only address as link-only", () => {
    expect(describeDelivery(["a@b.com", ""])).toEqual({ sendCount: 1, linkOnlyCount: 1 });
    expect(describeDelivery(["a@b.com", null])).toEqual({ sendCount: 1, linkOnlyCount: 1 });
    expect(describeDelivery(["a@b.com", undefined])).toEqual({ sendCount: 1, linkOnlyCount: 1 });
    expect(describeDelivery(["a@b.com", "   "])).toEqual({ sendCount: 1, linkOnlyCount: 1 });
  });

  it("counts every applicant when all have an address", () => {
    expect(describeDelivery(["a@b.com", "c@d.com"])).toEqual({ sendCount: 2, linkOnlyCount: 0 });
  });

  it("counts none when nobody has an address", () => {
    expect(describeDelivery(["", ""])).toEqual({ sendCount: 0, linkOnlyCount: 2 });
  });
});

describe("deliveryActionLabel", () => {
  // The bug this guards: applicant 1 had an address and applicant 2 did not, so
  // the button read "Send links" and the rep believed both had been emailed.
  it("does not claim to send when only one of two applicants is emailed", () => {
    expect(label(["a@b.com", ""])).toBe("Send 1 link, create 1");
    expect(label(["", "c@d.com"])).toBe("Send 1 link, create 1");
  });

  it("says send when everyone is emailed", () => {
    expect(label(["a@b.com"])).toBe("Send link");
    expect(label(["a@b.com", "c@d.com"])).toBe("Send links");
  });

  it("says create when nobody is emailed", () => {
    expect(label([""])).toBe("Create link");
    expect(label(["", ""])).toBe("Create links");
  });
});
