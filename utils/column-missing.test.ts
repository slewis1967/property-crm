import { describe, it, expect } from "vitest";
import { columnMissing } from "./column-missing";

/**
 * The predicate every pre-migration fallback in this repo hangs off.
 *
 * Getting it wrong is uniquely nasty: the fallback silently never fires, and the
 * feature breaks in exactly the window the fallback existed to cover. Both
 * failure modes below have happened here, so both are pinned.
 */

describe("columnMissing — the shapes the database actually produces", () => {
  /**
   * The INSERT case, and the one that has already been shipped wrong. A write
   * through PostgREST to an unknown column never reaches Postgres — PostgREST
   * rejects it from its schema cache first — so a predicate testing only for
   * Postgres's own 42703 never fires on an insert.
   */
  it("matches PostgREST's schema-cache rejection on a write", () => {
    const err = {
      code: "PGRST204",
      message: "Could not find the 'introducer_client_id' column of 'document_requests' in the schema cache",
    };
    expect(columnMissing(err, ["introducer_client_id"])).toBe(true);
  });

  it("matches Postgres's own undefined_column on a read", () => {
    const err = { code: "42703", message: 'column introducer_clients.needs_analysis_id does not exist' };
    expect(columnMissing(err, ["needs_analysis_id"])).toBe(true);
  });

  it("matches on message text when no code came back", () => {
    const err = { message: "column introducer_clients.pack_type does not exist" };
    expect(columnMissing(err, ["pack_type"])).toBe(true);
  });
});

describe("columnMissing — what it must refuse", () => {
  /**
   * The other failure mode: too loose. A retry that drops `needs_analysis_id`
   * cannot fix a DIFFERENT column being absent, so swallowing that error would
   * turn a real schema mismatch into a silent, wrong-shaped write — the trap
   * utils/factfind.ts documents against `factFindsTableMissing`.
   */
  it("refuses a column error naming a column the caller did not offer to drop", () => {
    const err = {
      code: "PGRST204",
      message: "Could not find the 'some_other_column' column of 'introducer_clients' in the schema cache",
    };
    expect(columnMissing(err, ["needs_analysis_id", "contact_id"])).toBe(false);
  });

  /** A MISSING TABLE is a different question, and a different answer. */
  it("refuses a missing table", () => {
    const err = { code: "42P01", message: 'relation "introducer_clients" does not exist' };
    expect(columnMissing(err, ["pack_type"])).toBe(false);
    expect(columnMissing({ code: "PGRST205", message: "Could not find the table" }, [])).toBe(false);
  });

  it("refuses ordinary failures", () => {
    expect(columnMissing(null)).toBe(false);
    expect(columnMissing(undefined)).toBe(false);
    expect(columnMissing({ code: "23505", message: "duplicate key value violates unique constraint" }, ["pack_type"])).toBe(false);
    expect(columnMissing({ message: "network error" }, ["pack_type"])).toBe(false);
  });

  /**
   * A check-constraint rejection carries no code this recognises and must not be
   * read as a missing column — the Tier 2 tier guard raises exactly this, and
   * retrying without the ids would neither help nor be honest.
   */
  it("refuses a check-constraint violation", () => {
    const err = {
      code: "23514",
      message: "introducer 9365f376 is not accredited at Tier 2 — a full submission pack requires it",
    };
    expect(columnMissing(err, ["needs_analysis_id", "contact_id"])).toBe(false);
  });
});

describe("columnMissing — the un-named form", () => {
  it("accepts any column-shaped failure when the caller names nothing", () => {
    expect(columnMissing({ code: "PGRST204", message: "Could not find the 'x' column of 'y'" })).toBe(true);
  });

  it("is case-insensitive about the column name", () => {
    const err = { code: "PGRST204", message: "Could not find the 'Needs_Analysis_Id' column of 'y'" };
    expect(columnMissing(err, ["needs_analysis_id"])).toBe(true);
  });
});
