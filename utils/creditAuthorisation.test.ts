import { describe, it, expect } from "vitest";
import {
  CREDIT_AUTHORISATION_TEXT,
  creditAuthErrMessage,
  creditAuthorisationSummary,
  creditAuthorisationsTableMissing,
  emptyCreditAuthorisation,
  hydrateCreditAuthorisation,
  type CreditAuthorisationData,
} from "./creditAuthorisation";

/** A filled, signed authorisation. */
function signedAuthorisation(): CreditAuthorisationData {
  const d = emptyCreditAuthorisation();
  d.names = "John Smith & Jane Smith";
  d.address = "12 Example St, Brisbane QLD 4000";
  d.signatories = [
    { signed: true, date: "2026-07-10" },
    { signed: true, date: "2026-07-10" },
  ];
  d.status = "signed";
  return d;
}

describe("emptyCreditAuthorisation", () => {
  it("has blank fields, two unsigned blocks and draft status", () => {
    const d = emptyCreditAuthorisation();
    expect(d.names).toBe("");
    expect(d.address).toBe("");
    expect(d.status).toBe("draft");
    expect(d.signatories).toHaveLength(2);
    for (const s of d.signatories) {
      expect(s.signed).toBe(false);
      expect(s.date).toBe("");
    }
  });
});

describe("CREDIT_AUTHORISATION_TEXT (verbatim legal copy)", () => {
  it("reproduces the title and heading exactly", () => {
    expect(CREDIT_AUTHORISATION_TEXT.title).toBe(
      "Equifax Access Seeker Report – Client Privacy Consent Form",
    );
    expect(CREDIT_AUTHORISATION_TEXT.heading).toBe("Access Seeker Customer Authorisation");
  });

  it("opens the body on the lower-case 'authorise' (name/address slot in ahead)", () => {
    expect(CREDIT_AUTHORISATION_TEXT.body.startsWith("authorise Your Loan Assist")).toBe(true);
    // The source has an opening curly quote before The Broker with no closing one.
    expect(CREDIT_AUTHORISATION_TEXT.body).toContain("(hereinafter “The Broker)");
    expect(CREDIT_AUTHORISATION_TEXT.body).toContain("section 6L of the Privacy Act 1988 (Cth)");
  });

  it("has exactly six acknowledgements keyed (a)-(f)", () => {
    expect(CREDIT_AUTHORISATION_TEXT.acknowledgements.map((a) => a.key)).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
    ]);
  });

  it("keeps the two Equifax URLs verbatim for linking", () => {
    const byKey = Object.fromEntries(CREDIT_AUTHORISATION_TEXT.acknowledgements.map((a) => [a.key, a.text]));
    expect(byKey.d).toContain("https://www.equifax.com.au/privacy");
    expect(byKey.e).toContain("https://www.equifax.com.au/credit-reporting-policy");
    // The curly apostrophe in "Equifax’s" must survive verbatim.
    expect(byKey.e.startsWith("Equifax’s Credit Reporting Policy")).toBe(true);
  });
});

describe("creditAuthorisationSummary", () => {
  it("returns the trimmed names line", () => {
    const d = emptyCreditAuthorisation();
    d.names = "  John Smith  ";
    expect(creditAuthorisationSummary(d)).toBe("John Smith");
  });

  it("is empty when no name is entered", () => {
    expect(creditAuthorisationSummary(emptyCreditAuthorisation())).toBe("");
  });
});

describe("hydrateCreditAuthorisation", () => {
  it("returns a clean template for junk input", () => {
    expect(hydrateCreditAuthorisation(null)).toEqual(emptyCreditAuthorisation());
    expect(hydrateCreditAuthorisation("nope")).toEqual(emptyCreditAuthorisation());
    expect(hydrateCreditAuthorisation(undefined)).toEqual(emptyCreditAuthorisation());
  });

  it("backfills fields a stored blob never had", () => {
    const d = hydrateCreditAuthorisation({ names: "John Smith" });
    expect(d.names).toBe("John Smith");
    expect(d.address).toBe("");
    expect(d.signatories).toHaveLength(2);
    expect(d.status).toBe("draft");
  });

  it("pads a short signatories array back to two blocks", () => {
    const d = hydrateCreditAuthorisation({ signatories: [{ signed: true, date: "2026-07-10" }] });
    expect(d.signatories).toHaveLength(2);
    expect(d.signatories[0]).toEqual({ signed: true, date: "2026-07-10" });
    expect(d.signatories[1]).toEqual({ signed: false, date: "" });
  });

  it("rejects an invalid status and non-boolean signed flags", () => {
    const d = hydrateCreditAuthorisation({
      status: "maybe",
      signatories: [{ signed: "yes", date: 5 }, { signed: false, date: "" }],
    });
    expect(d.status).toBe("draft");
    expect(d.signatories[0]).toEqual({ signed: false, date: "" });
  });

  it("defaults signers to [] and parses stored signers, dropping malformed ones", () => {
    expect(hydrateCreditAuthorisation({ names: "x" }).signers).toEqual([]);
    const d = hydrateCreditAuthorisation({
      signers: [
        { name: "David Halliday", email: "david@example.com" },
        { name: "No Email" },
        null,
        { name: 5, email: "keep@example.com" }, // non-string name → ""
        { name: "", email: "" }, // fully empty → dropped
      ],
    });
    expect(d.signers).toEqual([
      { name: "David Halliday", email: "david@example.com" },
      { name: "No Email", email: "" },
      { name: "", email: "keep@example.com" },
    ]);
  });

  it("round-trips a filled form through JSON unchanged", () => {
    const d = signedAuthorisation();
    expect(hydrateCreditAuthorisation(JSON.parse(JSON.stringify(d)))).toEqual(d);
  });
});

describe("creditAuthErrMessage", () => {
  it("reads a Supabase PostgrestError, which is a plain object not an Error", () => {
    expect(creditAuthErrMessage({ message: "duplicate key value" }, "Save failed")).toBe("duplicate key value");
    expect(creditAuthErrMessage({ details: "Key (id) already exists" }, "Save failed")).toBe("Key (id) already exists");
    expect(creditAuthErrMessage({ hint: "Perhaps you meant id" }, "Save failed")).toBe("Perhaps you meant id");
    expect(creditAuthErrMessage({ code: "23505" }, "Save failed")).toBe("23505");
  });

  it("delegates Errors and unknown values to the shared helper", () => {
    expect(creditAuthErrMessage(new Error("boom"), "Save failed")).toBe("boom");
    expect(creditAuthErrMessage(null, "Save failed")).toBe("Save failed");
    expect(creditAuthErrMessage(42, "Save failed")).toBe("Save failed");
  });
});

describe("creditAuthorisationsTableMissing", () => {
  it("detects an unmigrated table", () => {
    expect(creditAuthorisationsTableMissing({ code: "42P01" })).toBe(true);
    expect(creditAuthorisationsTableMissing({ code: "PGRST205" })).toBe(true);
    expect(
      creditAuthorisationsTableMissing({
        message: "Could not find the table 'public.credit_authorisations' in the schema cache",
      }),
    ).toBe(true);
    expect(creditAuthorisationsTableMissing({ message: 'relation "credit_authorisations" does not exist' })).toBe(true);
  });

  it("does NOT treat a missing column as a missing table", () => {
    expect(
      creditAuthorisationsTableMissing({
        code: "PGRST204",
        message: "Could not find the 'names' column of 'credit_authorisations' in the schema cache",
      }),
    ).toBe(false);
    expect(
      creditAuthorisationsTableMissing({ code: "42703", message: "column credit_authorisations.names does not exist" }),
    ).toBe(false);
  });

  it("does not swallow unrelated failures", () => {
    expect(creditAuthorisationsTableMissing(null)).toBe(false);
    expect(creditAuthorisationsTableMissing({ code: "23505", message: "duplicate key value" })).toBe(false);
    expect(creditAuthorisationsTableMissing(new Error("fetch failed"))).toBe(false);
  });
});
