import { describe, it, expect } from "vitest";
import { sanitizeBrokers } from "./brokers";

let n = 0;
const genId = () => `id-${++n}`;

describe("sanitizeBrokers", () => {
  it("keeps valid brokers, coerces optional fields, defaults active", () => {
    const out = sanitizeBrokers(
      [{ name: " Acme Finance ", email: "a@acme.com", company: " Acme ", reference: "COMP-1", notes: "" }],
      genId,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: "Acme Finance", email: "a@acme.com", company: "Acme", reference: "COMP-1", notes: null, active: true });
    expect(out[0].id).toBeTruthy();
  });

  it("drops rows with no name or an invalid email", () => {
    const out = sanitizeBrokers(
      [{ name: "", email: "a@b.com" }, { name: "X", email: "not-an-email" }, { name: "Ok", email: "ok@b.com" }],
      genId,
    );
    expect(out.map((b) => b.name)).toEqual(["Ok"]);
  });

  it("dedupes by email and preserves existing ids", () => {
    const out = sanitizeBrokers(
      [{ id: "keep-me", name: "One", email: "dup@b.com" }, { name: "Two", email: "DUP@b.com" }],
      genId,
    );
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("keep-me");
  });

  it("respects active:false", () => {
    const out = sanitizeBrokers([{ name: "Off", email: "o@b.com", active: false }], genId);
    expect(out[0].active).toBe(false);
  });

  it("returns [] for non-arrays", () => {
    expect(sanitizeBrokers(null, genId)).toEqual([]);
    expect(sanitizeBrokers("nope", genId)).toEqual([]);
  });
});
