import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The director ID walkthrough gate.
 *
 * This is a privacy/correctness gate, not cosmetics: showing the walkthrough
 * early tells a client to go and obtain a government identifier they may never
 * be required to hold. Both conditions are load-bearing, and the failure
 * direction matters — every uncertain case must resolve to HIDDEN. Left
 * untested, a future refactor of the shared select (the same class of change
 * that silently broke the YLA sweep) could flip either one without a red test.
 */

const h = vi.hoisted(() => {
  const state: { result: { data: unknown; error: unknown }; captured: Record<string, unknown> } = {
    result: { data: null, error: null },
    captured: {},
  };
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) {
    builder[m] = (...args: unknown[]) => {
      state.captured[m] = args;
      return builder;
    };
  }
  builder.maybeSingle = () => Promise.resolve(state.result);
  const from = (table: string) => {
    state.captured.table = table;
    return builder;
  };
  return { state, supabase: { from } };
});

vi.mock("../../../utils/supabase", () => ({ supabase: h.supabase }));

import { trainingVideoReleased } from "./_shared";

const RELEASED = "2026-07-29T01:03:15.915+00:00";
const PA_BACK = "2026-07-29T02:00:00.000+00:00";

beforeEach(() => {
  h.state.result = { data: null, error: null };
  h.state.captured = {};
});

describe("trainingVideoReleased", () => {
  it("shows the walkthrough only when the rep released it AND the PA is back", async () => {
    h.state.result = {
      data: { training_video_released_at: RELEASED, pa_received_at: PA_BACK },
      error: null,
    };
    expect(await trainingVideoReleased("r1")).toBe(true);
  });

  it("hides it when the PA has not come back from YLA, even though a rep released it", async () => {
    // The exact state NK-10014 was left in, and the reason this gate exists.
    h.state.result = {
      data: { training_video_released_at: RELEASED, pa_received_at: null },
      error: null,
    };
    expect(await trainingVideoReleased("r1")).toBe(false);
  });

  it("hides it when the PA is back but no rep has released it", async () => {
    h.state.result = {
      data: { training_video_released_at: null, pa_received_at: PA_BACK },
      error: null,
    };
    expect(await trainingVideoReleased("r1")).toBe(false);
  });

  it("hides it when neither condition is met", async () => {
    h.state.result = {
      data: { training_video_released_at: null, pa_received_at: null },
      error: null,
    };
    expect(await trainingVideoReleased("r1")).toBe(false);
  });

  it("fails CLOSED when the query errors — e.g. the migration has not run yet", async () => {
    // A missing pa_received_at column reports 42703 here. Hidden is the only
    // safe answer: an un-migrated database must not serve the walkthrough.
    h.state.result = { data: null, error: { code: "42703", message: "column does not exist" } };
    expect(await trainingVideoReleased("r1")).toBe(false);
  });

  it("fails CLOSED when the request row is gone", async () => {
    h.state.result = { data: null, error: null };
    expect(await trainingVideoReleased("r1")).toBe(false);
  });

  it("reads both gate columns for the requested row", async () => {
    h.state.result = { data: { training_video_released_at: RELEASED, pa_received_at: PA_BACK }, error: null };
    await trainingVideoReleased("req-42");
    expect(h.state.captured.table).toBe("document_requests");
    expect(h.state.captured.select).toEqual(["training_video_released_at,pa_received_at"]);
    expect(h.state.captured.eq).toEqual(["id", "req-42"]);
  });
});
