import { describe, it, expect } from "vitest";
import {
  authenticateExternal,
  assertNoForbiddenKeys,
  buildActivity,
  hashKey,
  isExternalApiRoute,
  parseKeyConfig,
  parsePaging,
  toExternalAppointment,
  toExternalContact,
  toExternalLead,
} from "./external-api";

const KEY = "nk_ext_" + "a".repeat(40);
const CONFIG = `regathered:${hashKey(KEY)}`;
const h = (o: Record<string, string>) => new Headers(o);

describe("authenticateExternal", () => {
  it("accepts the right bearer key and names the client", () => {
    expect(authenticateExternal(h({ authorization: `Bearer ${KEY}` }), CONFIG)).toEqual({ name: "regathered" });
    expect(authenticateExternal(h({ "x-api-key": KEY }), CONFIG)).toEqual({ name: "regathered" });
  });
  it("fails closed", () => {
    expect(authenticateExternal(h({ authorization: `Bearer ${KEY}` }), undefined)).toBeNull();
    expect(authenticateExternal(h({ authorization: `Bearer ${KEY}` }), "")).toBeNull();
    expect(authenticateExternal(h({ authorization: `Bearer ${KEY}x` }), CONFIG)).toBeNull();
    expect(authenticateExternal(h({}), CONFIG)).toBeNull();
    expect(authenticateExternal(h({ authorization: "Bearer short" }), CONFIG)).toBeNull();
  });
  it("ignores malformed config entries", () => {
    expect(parseKeyConfig("bad, x:notahash, ok:" + "b".repeat(64))).toEqual([{ name: "ok", hash: "b".repeat(64) }]);
  });
});

describe("routing + paging", () => {
  it("matches only the external prefix", () => {
    expect(isExternalApiRoute("/api/external/v1/leads")).toBe(true);
    expect(isExternalApiRoute("/api/externals")).toBe(false);
    expect(isExternalApiRoute("/api/contacts")).toBe(false);
  });
  it("clamps paging", () => {
    expect(parsePaging(new URLSearchParams("limit=9999&offset=-5"))).toEqual({ limit: 500, offset: 0 });
    expect(parsePaging(new URLSearchParams(""))).toEqual({ limit: 100, offset: 0 });
  });
});

describe("whitelists", () => {
  const sensitiveLead = {
    lead_id: "L1", full_name: "Jo Bloggs", email: "jo@example.com", ghl_stage: "Closed - Won",
    pipeline_id: "p1", created_at: "2026-11-01 10:00:00", tags: '["springboard","fb"]', score: 72,
    primary_contact_id: "c1", annual_income: 120000, date_of_birth: "1990-01-01", notes: "private",
    hecs_balance: 30000, message: "free text", budget: "$600k",
  };
  const pipelines = new Map([["p1", { id: "p1", name: "Springboard", stages: ["New Lead", "Closed Won", "Closed Lost"] }]]);

  it("lead keeps only approved fields and fills phone from contacts", () => {
    const out = toExternalLead(sensitiveLead, pipelines, () => "0400 000 000");
    expect(out).toMatchObject({
      id: "L1", name: "Jo Bloggs", phone: "0400 000 000", pipeline: "Springboard",
      stage: "Closed Won", stage_raw: "Closed - Won", tags: ["springboard", "fb"], created_at: "2026-11-01 10:00:00",
    });
    for (const k of ["annual_income", "date_of_birth", "notes", "hecs_balance", "message", "budget"]) {
      expect(out).not.toHaveProperty(k);
    }
    expect(() => assertNoForbiddenKeys(out)).not.toThrow();
  });

  it("contact and appointment drop notes and join links", () => {
    const c = toExternalContact({ id: "c1", full_name: "Jo", phone: "04", notes: "x", income: 1, tags: ["a"] });
    expect(c).not.toHaveProperty("notes");
    const a = toExternalAppointment({ id: "a1", event_title: "Call", location: "https://crm/join/secret", additional_notes: "x" });
    expect(a).not.toHaveProperty("location");
    expect(a).not.toHaveProperty("notes");
    expect(JSON.stringify(a)).not.toContain("secret");
  });

  it("tripwire throws on a forbidden key anywhere", () => {
    expect(() => assertNoForbiddenKeys({ leads: [{ id: 1, notes: "x" }] })).toThrow(/notes/);
    expect(() => assertNoForbiddenKeys({ a: { location: "u" } })).toThrow(/location/);
  });

  it("activity is newest first and content-free", () => {
    const act = buildActivity({
      createdAt: "2026-11-01T00:00:00Z",
      emails: [{ direction: "outbound", status: "sent", sent_at: "2026-11-02T00:00:00Z", subject: "secret" }],
      appointments: [{ id: "a1", start_time: "2026-11-05T00:00:00Z", status: "booked" }],
    });
    expect(act.map((e) => e.type)).toEqual(["appointment", "email", "lead_created"]);
    expect(JSON.stringify(act)).not.toContain("secret");
  });
});
