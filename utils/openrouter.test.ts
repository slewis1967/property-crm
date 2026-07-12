/**
 * Guards the deploy-fragility fix in utils/openrouter.ts: importing the module
 * — and even calling getOpenRouter() — with OPENROUTER_API_KEY UNSET must NOT
 * throw. The client is lazy + non-throwing; a missing key surfaces only as a
 * call-time 401 (see orErrorMessage), never as an import/boot crash.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

describe("openrouter lazy client", () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env.OPENROUTER_API_KEY;
    vi.resetModules();
  });

  afterEach(() => {
    if (saved === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = saved;
    vi.restoreAllMocks();
  });

  it("imports without throwing when the key is unset", async () => {
    delete process.env.OPENROUTER_API_KEY;
    // Import at module load must not construct a throwing client.
    await expect(import("./openrouter")).resolves.toBeDefined();
  });

  it("getOpenRouter() returns a usable handle (no throw) with the key unset", async () => {
    delete process.env.OPENROUTER_API_KEY;
    // Silence the expected degraded-mode error log.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const mod = await import("./openrouter");
    const client = mod.getOpenRouter();

    // Usable, guarded handle — the failure only shows up when an AI call runs.
    expect(client).toBeDefined();
    expect(client.chat.completions.create).toBeTypeOf("function");
    // Degraded-mode warning was emitted loudly.
    expect(errSpy).toHaveBeenCalled();
  });

  it("memoises the client and constructs with the key when present", async () => {
    process.env.OPENROUTER_API_KEY = "sk-or-test";
    const mod = await import("./openrouter");
    const a = mod.getOpenRouter();
    const b = mod.getOpenRouter();
    expect(a).toBe(b); // same singleton across calls
  });

  it("maps a 401 to a clear missing-key message", async () => {
    const mod = await import("./openrouter");
    const OpenAI = (await import("openai")).default;
    const err = new OpenAI.APIError(401, undefined, "unauthorized", undefined);
    expect(mod.orErrorMessage(err)).toMatch(/OPENROUTER_API_KEY is missing or invalid/);
  });
});
