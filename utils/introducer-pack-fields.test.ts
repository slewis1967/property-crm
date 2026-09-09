import { describe, it, expect } from "vitest";
import {
  fieldsForPack,
  missingRequiredFields,
  pickEditableFields,
  INTRODUCER_FIELDS,
} from "./introducer";

/**
 * What each kind of pack asks the introducer for.
 *
 * A Tier 1 referral asks the whole "Their situation" block — coarse bands we
 * triage from and confirm with the client later. A Tier 2 pack asks none of it:
 * the Needs Analysis captures employment and income exactly per applicant,
 * savings as an asset, and intent and timeframe in the client's own words. A
 * band sitting beside an exact figure is two versions of one fact that can
 * disagree, with nothing to say which the assessor should believe.
 *
 * A pack's first page collects only what the rest of the process needs to work.
 */

/** Every field a full pack does NOT ask for. */
const SUPERSEDED = [
  "employment_status",
  "income_band",
  "deposit_band",
  "purchase_intent",
  "timeframe",
  "buying_in",
  "notes",
];

describe("fieldsForPack", () => {
  it("asks a referral for everything", () => {
    expect(fieldsForPack("referral")).toEqual(INTRODUCER_FIELDS);
  });

  it("does not ask a full pack for the bands it captures precisely", () => {
    const keys = fieldsForPack("full").map((f) => f.key);
    for (const k of SUPERSEDED) expect(keys).not.toContain(k);
  });

  /**
   * What survives is exactly what the rest of the process needs: a name to put
   * on the pack and the contact, an address to email the signing and upload
   * links to, a phone for the document request, and a state for the
   * opportunity. Plus the second applicant, who has to be seeded onto the Needs
   * Analysis.
   */
  it("still asks a full pack for what the process needs to run", () => {
    const keys = fieldsForPack("full").map((f) => f.key);
    for (const k of ["first_name", "last_name", "email", "phone", "state", "dob", "suburb", "postcode"]) {
      expect(keys).toContain(k);
    }
    expect(keys).toContain("applicant2_first_name");
    expect(keys).toContain("applicant2_email");
  });

  it("leaves a full pack with nothing from the situation block", () => {
    expect(fieldsForPack("full").filter((f) => f.group === "circumstances")).toEqual([]);
  });
});

describe("missingRequiredFields", () => {
  /* Everything a FULL PACK is required to carry, and nothing more. */
  const named = {
    first_name: "Ada",
    last_name: "Lovelace",
    email: "ada@example.com",
    phone: "0400 000 000",
    state: "QLD",
  };

  it("holds a referral to the bands", () => {
    const missing = missingRequiredFields({ ...named, pack_type: "referral" });
    // A referral is still held to the whole block.
    for (const k of ["employment_status", "income_band", "deposit_band", "purchase_intent", "timeframe"]) {
      expect(missing).toContain(k);
    }
  });

  /**
   * THE FAILURE THAT WOULD BE NASTIEST. If the form hides a field but submit
   * still demands it, the introducer is refused over something with no box on
   * screen to fix — an unwinnable form. So the two must read the same rule.
   */
  it("does not block a full pack on a band it was never shown", () => {
    expect(missingRequiredFields({ ...named, pack_type: "full" })).toEqual([]);
  });

  it("still blocks a full pack on the details it does ask for", () => {
    const missing = missingRequiredFields({ pack_type: "full", first_name: "Ada" });
    expect(missing).toContain("last_name");
    expect(missing).toContain("email");
    expect(missing).toContain("state");
  });

  /** A row with no pack_type at all is a referral, as it always was. */
  it("treats an unset pack_type as a referral", () => {
    expect(missingRequiredFields(named)).toContain("income_band");
  });
});

describe("what may still be STORED", () => {
  /**
   * Narrowing what is shown must not narrow the write allow-list. A referral
   * that already carries an income band and is later looked at as a pack keeps
   * it; silently dropping data the introducer typed would be worse than showing
   * a redundant field.
   */
  it("still accepts a band through the write filter", () => {
    const out = pickEditableFields({ income_band: "$90,000 – $120,000", first_name: "Ada" });
    expect(out.income_band).toBe("$90,000 – $120,000");
  });
});
