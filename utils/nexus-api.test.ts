/**
 * Guards the deploy-fragility fix in utils/nexus-api.ts: a hung NEXUS upstream
 * must be bounded by an AbortController timeout, and a transient network
 * error / timeout must be retried exactly once — but a 4xx (a resolved
 * Response) must be returned as-is with no retry.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { nexusApi } from "./nexus-api";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.NEXUS_API_TIMEOUT_MS;
  vi.restoreAllMocks();
});

describe("nexusApi", () => {
  it("retries once on a network error, then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("network down"))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await nexusApi("/opportunities");
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry on a 4xx response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("bad", { status: 400 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await nexusApi("/leads");
    expect(res.status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborts a hung request via the timeout, retries once, then throws", async () => {
    process.env.NEXUS_API_TIMEOUT_MS = "20";
    // Never resolves on its own — only rejects when its abort signal fires.
    const fetchMock = vi.fn(
      (_url: string, opts: RequestInit) =>
        new Promise((_resolve, reject) => {
          opts.signal?.addEventListener("abort", () =>
            reject(new DOMException("The operation was aborted.", "AbortError")),
          );
        }),
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await expect(nexusApi("/pipelines")).rejects.toThrow();
    // One initial attempt + one retry.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("passes an abort signal to fetch for timeout enforcement", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await nexusApi("/activity");
    const passedInit = fetchMock.mock.calls[0][1] as RequestInit;
    expect(passedInit.signal).toBeInstanceOf(AbortSignal);
  });
});
