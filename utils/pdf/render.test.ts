import { describe, expect, it, vi } from "vitest";

// Neither dependency is needed to exercise the retry policy, and both are
// absent outside a serverless build.
vi.mock("puppeteer-core", () => ({ default: { launch: vi.fn() } }));
vi.mock("@sparticuz/chromium", () => ({ default: {} }));

const { isTransientLaunchFailure, withLaunchRetry } = await import("./render");

/**
 * A packaging run failed with `spawn ETXTBSY` on 2026-07-27 and sent nothing:
 * @sparticuz/chromium was still writing its binary to /tmp when a concurrent
 * invocation tried to exec it. The next sweep recovered it two hours later.
 */
describe("isTransientLaunchFailure", () => {
  it("recognises the cold-start races", () => {
    expect(
      isTransientLaunchFailure(new Error("Failed to launch the browser process! spawn ETXTBSY")),
    ).toBe(true);
    expect(isTransientLaunchFailure(new Error("spawn EAGAIN"))).toBe(true);
    expect(isTransientLaunchFailure(new Error("EBUSY: resource busy or locked"))).toBe(true);
  });

  it("does NOT retry a real configuration failure", () => {
    // Retrying these turns a clear error into a slow one.
    expect(
      isTransientLaunchFailure(new Error("Failed to launch the browser process! spawn ENOENT")),
    ).toBe(false);
    expect(isTransientLaunchFailure(new Error("No local Chrome/Chromium found"))).toBe(false);
    expect(isTransientLaunchFailure("something odd")).toBe(false);
  });

  it("looks at the stack too, where puppeteer often hides the code", () => {
    const err = new Error("Failed to launch the browser process!");
    err.stack = "Error: Failed to launch\n  caused by: spawn ETXTBSY";
    expect(isTransientLaunchFailure(err)).toBe(true);
  });
});

describe("withLaunchRetry", () => {
  it("returns the browser once a transient failure clears", async () => {
    const waits: number[] = [];
    let calls = 0;
    const launch = vi.fn(async () => {
      calls++;
      if (calls < 3) throw new Error("spawn ETXTBSY");
      return "browser";
    });
    const got = await withLaunchRetry(launch, async (ms) => void waits.push(ms));
    expect(got).toBe("browser");
    expect(calls).toBe(3);
    expect(waits).toEqual([250, 750]);
  });

  it("gives up after the third attempt rather than looping", async () => {
    const launch = vi.fn(async () => {
      throw new Error("spawn ETXTBSY");
    });
    await expect(withLaunchRetry(launch, async () => {})).rejects.toThrow("ETXTBSY");
    expect(launch).toHaveBeenCalledTimes(3);
  });

  it("rethrows a non-transient failure immediately, without waiting", async () => {
    const launch = vi.fn(async () => {
      throw new Error("spawn ENOENT");
    });
    const wait = vi.fn(async () => {});
    await expect(withLaunchRetry(launch, wait)).rejects.toThrow("ENOENT");
    expect(launch).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  it("does not wait at all when the first attempt succeeds", async () => {
    const wait = vi.fn(async () => {});
    await expect(withLaunchRetry(async () => "ok", wait)).resolves.toBe("ok");
    expect(wait).not.toHaveBeenCalled();
  });
});
