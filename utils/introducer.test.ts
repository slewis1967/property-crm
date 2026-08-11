import { describe, it, expect, afterEach } from "vitest";
import {
  evaluateEdit,
  pickEditableFields,
  missingRequiredFields,
  toPortalView,
  grantIsActive,
  normaliseAuPhone,
  introducerTablesMissing,
  INTRODUCER_FIELD_KEYS,
  type ActiveGrant,
  type OpenInfoRequest,
} from "./introducer";
import { isSuperAdmin, superAdminEmails } from "./super-admin";
import { isPublicIntroducerRoute } from "../proxy";

/**
 * The introducer portal's three promises, pinned as tests.
 *
 *   1. Segregation — enforced by query, tested at the route level, but the
 *      whitelist in toPortalView is what stops internal columns leaking into a
 *      response even when the query is right.
 *   2. Submit = lock — evaluateEdit is the app-side half of the lock (the
 *      database trigger is the other half). Every way through it is enumerated
 *      below, and so is every way it must refuse.
 *   3. One authority — isSuperAdmin fails closed, and the route carve-out can't
 *      accidentally exempt a staff path.
 *
 * If any of these break, the portal is still fully functional and quietly
 * wrong — which is exactly the sort of failure that needs a test rather than a
 * code review.
 */

const submitted = {
  status: "submitted",
  first_name: "Ada",
  last_name: "Lovelace",
  email: "ada@example.com",
  phone: "0400 000 000",
  suburb: null as string | null,
  postcode: null as string | null,
  notes: null as string | null,
};

function grant(over: Partial<ActiveGrant> = {}): ActiveGrant {
  return {
    id: "g1",
    scope: "fields",
    fields: ["phone"],
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    consumed_at: null,
    revoked_at: null,
    ...over,
  };
}

function infoRequest(over: Partial<OpenInfoRequest> = {}): OpenInfoRequest {
  return { id: "r1", fields: ["suburb"], documents: [], status: "open", ...over };
}

describe("pickEditableFields", () => {
  it("keeps only allow-listed keys", () => {
    const out = pickEditableFields({
      first_name: " Ada ",
      status: "accepted",
      opportunity_id: "opp_1",
      introducer_id: "someone-else",
    });
    expect(out).toEqual({ first_name: "Ada" });
  });

  it("normalises empty strings to null so blank-vs-missing is unambiguous", () => {
    expect(pickEditableFields({ suburb: "   " })).toEqual({ suburb: null });
  });

  it("ignores objects and arrays rather than passing them to the database", () => {
    expect(pickEditableFields({ notes: { $ne: null }, phone: ["0400"] })).toEqual({});
  });
});

describe("evaluateEdit — a draft", () => {
  it("allows anything", () => {
    const d = evaluateEdit({ status: "draft", first_name: "Ada" }, { first_name: "Grace" });
    expect(d.allowed).toBe(true);
  });
});

describe("evaluateEdit — a submitted referral", () => {
  it("refuses a change with no authorisation", () => {
    const d = evaluateEdit(submitted, { phone: "0411 111 111" });
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.blockedFields).toEqual(["phone"]);
  });

  it("ignores a no-op resave of the whole form", () => {
    const d = evaluateEdit(submitted, {
      first_name: "Ada",
      last_name: "Lovelace",
      email: "ada@example.com",
      phone: "0400 000 000",
    });
    expect(d.allowed).toBe(true);
  });

  it("treats whitespace-only differences as no change", () => {
    const d = evaluateEdit(submitted, { first_name: "  Ada  " });
    expect(d.allowed).toBe(true);
  });

  it("allows a change covered by an active grant, and marks it as such", () => {
    const d = evaluateEdit(submitted, { phone: "0411 111 111" }, { grant: grant() });
    expect(d).toMatchObject({ allowed: true, via: "grant", grantId: "g1" });
  });

  it("refuses fields the grant does not cover", () => {
    const d = evaluateEdit(submitted, { phone: "0411", email: "new@example.com" }, { grant: grant() });
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.blockedFields).toEqual(["email"]);
  });

  it("refuses a consumed, revoked or expired grant", () => {
    for (const dead of [
      grant({ consumed_at: new Date().toISOString() }),
      grant({ revoked_at: new Date().toISOString() }),
      grant({ expires_at: new Date(Date.now() - 1000).toISOString() }),
    ]) {
      expect(grantIsActive(dead)).toBe(false);
      expect(evaluateEdit(submitted, { phone: "0411" }, { grant: dead }).allowed).toBe(false);
    }
  });

  it("honours a full-scope grant", () => {
    const d = evaluateEdit(
      submitted,
      { phone: "0411", email: "new@example.com" },
      { grant: grant({ scope: "full", fields: [] }) },
    );
    expect(d).toMatchObject({ allowed: true, via: "grant" });
  });
});

describe("evaluateEdit — an open information request", () => {
  it("allows a requested field to be filled from blank", () => {
    const d = evaluateEdit(submitted, { suburb: "Ashgrove" }, { infoRequests: [infoRequest()] });
    expect(d).toMatchObject({ allowed: true, via: "info_request", infoRequestIds: ["r1"] });
  });

  it("refuses overwriting a field that was already submitted", () => {
    const d = evaluateEdit(
      submitted,
      { phone: "0411 111 111" },
      { infoRequests: [infoRequest({ fields: ["phone"] })] },
    );
    expect(d.allowed).toBe(false);
  });

  it("refuses a field the request never asked for", () => {
    const d = evaluateEdit(submitted, { postcode: "4060" }, { infoRequests: [infoRequest()] });
    expect(d.allowed).toBe(false);
    if (!d.allowed) expect(d.blockedFields).toEqual(["postcode"]);
  });

  it("refuses clearing a requested field — that isn't supplying information", () => {
    const withSuburb = { ...submitted, suburb: null };
    const d = evaluateEdit(withSuburb, { suburb: "" }, { infoRequests: [infoRequest()] });
    // No change at all (null -> null), so it's a no-op rather than a violation.
    expect(d.allowed).toBe(true);

    const filled = { ...submitted, suburb: "Ashgrove" };
    const clearing = evaluateEdit(filled, { suburb: "" }, { infoRequests: [infoRequest()] });
    expect(clearing.allowed).toBe(false);
  });

  it("ignores a closed request", () => {
    const d = evaluateEdit(
      submitted,
      { suburb: "Ashgrove" },
      { infoRequests: [infoRequest({ status: "answered" })] },
    );
    expect(d.allowed).toBe(false);
  });
});

describe("evaluateEdit — a closed referral", () => {
  it("refuses everything, grant or not", () => {
    for (const status of ["declined", "withdrawn"]) {
      const d = evaluateEdit({ ...submitted, status }, { phone: "0411" }, { grant: grant() });
      expect(d.allowed).toBe(false);
    }
  });
});

describe("missingRequiredFields", () => {
  it("lists what still blocks a submit", () => {
    const missing = missingRequiredFields({ first_name: "Ada", email: "  " });
    expect(missing).toContain("last_name");
    expect(missing).toContain("email");
    expect(missing).not.toContain("first_name");
    expect(missing).not.toContain("suburb"); // optional
  });
});

describe("toPortalView", () => {
  it("never leaks internal columns to the introducer", () => {
    const view = toPortalView({
      id: "c1",
      status: "accepted",
      first_name: "Ada",
      decision_reason: "Income too low — internal only",
      opportunity_id: "opp_123",
      contact_id: "con_123",
      introducer_id: "firm_1",
      consent_statement: "…",
    });
    const keys = Object.keys(view);
    for (const secret of ["decision_reason", "opportunity_id", "contact_id", "introducer_id"]) {
      expect(keys).not.toContain(secret);
    }
    expect(view.status_label).toBe("Accepted");
  });

  it("exposes every field the introducer supplied, so nothing they typed vanishes", () => {
    const view = toPortalView({ id: "c1", status: "draft" }) as Record<string, unknown>;
    for (const key of INTRODUCER_FIELD_KEYS) {
      expect(view).toHaveProperty(key);
    }
  });
});

describe("normaliseAuPhone", () => {
  it("normalises the forms people actually type", () => {
    for (const input of ["0400 000 000", "0400000000", "+61400000000", "61 400 000 000"]) {
      expect(normaliseAuPhone(input)).toBe("+61400000000");
    }
  });

  it("returns null for something that isn't an AU number", () => {
    expect(normaliseAuPhone("12345")).toBeNull();
    expect(normaliseAuPhone("not a phone")).toBeNull();
  });
});

describe("introducerTablesMissing", () => {
  it("recognises the table-level codes", () => {
    expect(introducerTablesMissing({ code: "42P01" })).toBe(true);
    expect(introducerTablesMissing({ code: "PGRST205" })).toBe(true);
  });

  /**
   * The trap CLAUDE.md records against factFindsTableMissing: a column-level
   * error must NOT report itself as "run the migration" for a migration that
   * has already been run, or the real schema mismatch never gets found.
   */
  it("does not match column-level errors, or no error at all", () => {
    expect(introducerTablesMissing({ code: "42703" })).toBe(false);
    expect(introducerTablesMissing({ code: "PGRST204" })).toBe(false);
    expect(introducerTablesMissing(null)).toBe(false);
    expect(introducerTablesMissing(undefined)).toBe(false);
    expect(introducerTablesMissing({})).toBe(false);
  });
});

describe("isSuperAdmin", () => {
  const original = process.env.SUPER_ADMIN_EMAILS;
  afterEach(() => {
    if (original === undefined) delete process.env.SUPER_ADMIN_EMAILS;
    else process.env.SUPER_ADMIN_EMAILS = original;
  });

  it("defaults to Sean when unconfigured", () => {
    delete process.env.SUPER_ADMIN_EMAILS;
    expect(superAdminEmails().has("sean.l@nextkey.com.au")).toBe(true);
    expect(isSuperAdmin("sean.l@nextkey.com.au")).toBe(true);
  });

  it("is case- and whitespace-insensitive", () => {
    process.env.SUPER_ADMIN_EMAILS = " Sean.L@NextKey.com.au ";
    expect(isSuperAdmin("sean.l@nextkey.com.au")).toBe(true);
  });

  it("fails closed on anything unexpected", () => {
    process.env.SUPER_ADMIN_EMAILS = "sean.l@nextkey.com.au";
    expect(isSuperAdmin("")).toBe(false);
    expect(isSuperAdmin(null)).toBe(false);
    expect(isSuperAdmin(undefined)).toBe(false);
    // The sentinel utils/cf-access.ts returns for an unauthenticated caller.
    expect(isSuperAdmin("__unauthenticated__@invalid")).toBe(false);
    expect(isSuperAdmin("glenn@nextkey.com.au")).toBe(false);
  });
});

describe("isPublicIntroducerRoute", () => {
  it("exempts the portal and its API", () => {
    expect(isPublicIntroducerRoute("/introducer")).toBe(true);
    expect(isPublicIntroducerRoute("/introducer/clients")).toBe(true);
    expect(isPublicIntroducerRoute("/introducer/clients/abc")).toBe(true);
    expect(isPublicIntroducerRoute("/api/introducer/clients")).toBe(true);
  });

  /**
   * The trap this whole naming scheme exists to avoid: a bare startsWith
   * would exempt every staff route beginning with "introducer", stripping
   * Cloudflare Access from the review queue and the onboarding endpoint.
   */
  it("does NOT exempt the staff routes", () => {
    expect(isPublicIntroducerRoute("/introducers")).toBe(false);
    expect(isPublicIntroducerRoute("/admin/introducers")).toBe(false);
    expect(isPublicIntroducerRoute("/admin/introducers/submissions/abc")).toBe(false);
    expect(isPublicIntroducerRoute("/api/admin/introducers")).toBe(false);
    expect(isPublicIntroducerRoute("/api/admin/introducers/submissions/abc/unlock")).toBe(false);
    expect(isPublicIntroducerRoute("/api/introducers")).toBe(false);
  });
});
