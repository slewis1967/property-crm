import { describe, it, expect } from "vitest";
import {
  complianceEntity,
  entityPreamble,
  COMPLIANCE_ENTITIES,
} from "./compliance-entity";
import { buildSystem } from "./compliance-review";
import { MAIL_IDENTITY_KEYS } from "./mailIdentities";

describe("complianceEntity", () => {
  it("resolves springboard", () => {
    expect(complianceEntity("springboard").name).toBe("Springboard Homes");
  });

  // The default is load-bearing: every broadcast reviewed before brand existed
  // was reviewed as NextKey, and a caller that hasn't been updated must keep
  // getting exactly that rather than silently switching identity.
  it.each([undefined, null, "", "nextkey", "bogus", "NEXTKEY"])(
    "resolves %o to nextkey",
    (value) => {
      expect(complianceEntity(value as string | null | undefined).name).toBe(
        "NextKey Property Strategists",
      );
    },
  );

  it("covers every mail identity, so a new sender cannot exist without an entity", () => {
    for (const key of MAIL_IDENTITY_KEYS) {
      expect(COMPLIANCE_ENTITIES[key]).toBeDefined();
      expect(COMPLIANCE_ENTITIES[key].identity.length).toBeGreaterThan(0);
    }
  });
});

describe("entityPreamble", () => {
  it("names the right business and never the other one", () => {
    const nk = entityPreamble("nextkey");
    const sb = entityPreamble("springboard");
    expect(nk).toContain("NextKey Property Strategists");
    expect(nk).not.toContain("Springboard");
    expect(sb).toContain("Springboard Homes");
    expect(sb).not.toContain("NextKey");
  });

  it("states both businesses are unlicensed — the fact the whole review turns on", () => {
    for (const brand of MAIL_IDENTITY_KEYS) {
      expect(entityPreamble(brand)).toContain("NOT licensed under NCCP");
    }
  });

  it("gives Springboard its assumed facts, including who holds the credit licence", () => {
    const sb = entityPreamble("springboard");
    expect(sb).toContain("CONTEXT YOU MUST ASSUME");
    expect(sb).toContain("477483");
    expect(sb).toContain("Your Loan Assist");
  });

  // NextKey's prompt has never carried an assumptions block. Adding one would
  // change how already-approved NextKey copy reviews, so it must stay absent.
  it("adds no assumptions block to NextKey", () => {
    expect(entityPreamble("nextkey")).not.toContain("CONTEXT YOU MUST ASSUME");
  });
});

describe("buildSystem", () => {
  it("keeps the shared rules identical across brands", () => {
    const shared = [
      "Australian Consumer Law",
      "National Consumer Credit Protection Act 2009",
      "Queensland Property Occupations Act 2014",
      "Spam Act 2003",
      "Privacy Act 1988",
      "OUTPUT — STRICT JSON",
    ];
    for (const brand of MAIL_IDENTITY_KEYS) {
      const sys = buildSystem(brand);
      for (const s of shared) expect(sys).toContain(s);
    }
  });

  it("differs between brands only in the preamble", () => {
    const nk = buildSystem("nextkey");
    const sb = buildSystem("springboard");
    expect(nk).not.toEqual(sb);
    const tail = (s: string) => s.slice(s.indexOf("Your only job:"));
    expect(tail(nk)).toEqual(tail(sb));
  });

  it("an unknown brand builds NextKey's prompt exactly", () => {
    expect(buildSystem("bogus")).toEqual(buildSystem("nextkey"));
    expect(buildSystem(undefined)).toEqual(buildSystem("nextkey"));
  });
});
