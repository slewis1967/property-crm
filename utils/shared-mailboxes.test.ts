import { describe, expect, it } from "vitest";
import { accessibleOwners, mailboxesFor, sharedMailboxFor } from "./shared-mailboxes";
import { UNAUTHENTICATED_SENTINEL } from "./cf-access";

describe("shared mailboxes", () => {
  it("gives Sean and Glenn the Springboard mailbox, case-insensitively", () => {
    expect(mailboxesFor("sean.l@nextkey.com.au").map((m) => m.key)).toEqual(["springboard"]);
    expect(mailboxesFor(" Glenn.M@NextKey.com.au ").map((m) => m.key)).toEqual(["springboard"]);
  });

  it("gives non-members and the unauthenticated sentinel nothing", () => {
    expect(mailboxesFor("someone@example.com")).toEqual([]);
    expect(mailboxesFor(UNAUTHENTICATED_SENTINEL)).toEqual([]);
    expect(mailboxesFor(null)).toEqual([]);
    expect(sharedMailboxFor("someone@example.com", "springboard")).toBeNull();
  });

  it("resolves a mailbox by key only for members", () => {
    expect(sharedMailboxFor("glenn.m@nextkey.com.au", "springboard")?.address).toBe(
      "hello@springboardhomes.com.au",
    );
    expect(sharedMailboxFor("glenn.m@nextkey.com.au", "nope")).toBeNull();
    expect(sharedMailboxFor("glenn.m@nextkey.com.au", null)).toBeNull();
  });

  it("lists the owners a user may touch: themself plus their shared mailboxes", () => {
    expect(accessibleOwners("sean.l@nextkey.com.au")).toEqual([
      "sean.l@nextkey.com.au",
      "hello@springboardhomes.com.au",
    ]);
    expect(accessibleOwners(UNAUTHENTICATED_SENTINEL)).toEqual([UNAUTHENTICATED_SENTINEL]);
  });
});
