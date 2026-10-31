/**
 * Guards utils/anthropic.ts: importing or calling it with the key unset must not
 * throw (a missing key can't take the CRM down), plus the request shapes and the
 * answer handling every AI feature relies on. The API itself is mocked.
 */
import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SAVED = process.env.ANTHROPIC_API_KEY;

function apiError(status: number, message: string) {
  return new Anthropic.APIError(status, undefined, message, new Headers());
}

function reply(content: unknown[], stop_reason = "end_turn") {
  return { content, stop_reason };
}
const text = (t: string) => ({ type: "text", text: t });

async function load() {
  vi.resetModules();
  return import("./anthropic");
}

async function mocked(...responses: unknown[]) {
  const mod = await load();
  const client = mod.getAnthropic();
  const create = vi.spyOn(client.messages, "create");
  const beta = vi.spyOn(client.beta.messages, "create");
  for (const r of responses) {
    create.mockResolvedValueOnce(r as never);
    beta.mockResolvedValueOnce(r as never);
  }
  return { mod, create, beta };
}

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "sk-ant-test";
  delete process.env.ANTHROPIC_MODEL_SMART;
  delete process.env.ANTHROPIC_MODEL_FAST;
  delete process.env.ANTHROPIC_MODEL_EXTRACT;
});
afterEach(() => {
  vi.restoreAllMocks();
  if (SAVED === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = SAVED;
});

describe("lazy client", () => {
  it("imports and builds without a key", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const mod = await load();
    expect(mod.getAnthropic()).toBeDefined();
    expect(mod.MODELS.fast).toBe("claude-haiku-5-5");
    expect(mod.MODELS.smart).toBe("claude-sonnet-5-5");
    expect(mod.MODELS.extract).toBe("claude-sonnet-5-5");
  });

  it("memoises the client", async () => {
    const mod = await load();
    expect(mod.getAnthropic()).toBe(mod.getAnthropic());
  });

  it("takes model overrides from the environment", async () => {
    process.env.ANTHROPIC_MODEL_SMART = "claude-opus-5-5";
    const mod = await load();
    expect(mod.MODELS.smart).toBe("claude-opus-5-5");
    expect(mod.MODELS.extract).toBe("claude-opus-5-5");
  });
});

describe("aiText requests", () => {
  it("sends system top-level, adds thinking room and sets effort", async () => {
    const { mod, create } = await mocked(reply([text("hi")]));
    await expect(
      mod.aiText({ system: "S", user: "U", maxTokens: 500, effort: "high" }),
    ).resolves.toBe("hi");
    const body = create.mock.calls[0]![0] as unknown as Record<string, unknown>;
    expect(body.system).toBe("S");
    expect(body.max_tokens).toBe(2500);
    expect(body.output_config).toEqual({ effort: "high" });
    expect(body.messages).toEqual([{ role: "user", content: "U" }]);
    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("thinking");
  });

  it("runs at low effort when thinking is off", async () => {
    const { mod, create } = await mocked(reply([text("hi")]));
    await mod.aiText({ user: "U", thinking: false, effort: "high" });
    const body = create.mock.calls[0]![0] as unknown as Record<string, unknown>;
    expect(body.output_config).toEqual({ effort: "low" });
  });

  it("adds a capped web search located in Australia", async () => {
    const { mod, create } = await mocked(reply([text("hi")]));
    await mod.aiText({ user: "U", web: true });
    const body = create.mock.calls[0]![0] as unknown as { tools: Record<string, unknown>[] };
    expect(body.tools[0]).toMatchObject({
      type: "web_search_20250305",
      name: "web_search",
      max_uses: 3,
      user_location: { country: "AU" },
    });
  });

  it("passes a JSON schema through alongside effort", async () => {
    const { mod, create } = await mocked(reply([text("{}")]));
    const schema = { type: "object" };
    await mod.aiText({ user: "U", effort: "high", jsonSchema: schema });
    const body = create.mock.calls[0]![0] as unknown as Record<string, unknown>;
    expect(body.output_config).toEqual({
      effort: "high",
      format: { type: "json_schema", schema },
    });
  });

  it("uses the server fallback on Sonnet and never on Haiku", async () => {
    const a = await mocked(reply([text("ok")]));
    await a.mod.aiText({ user: "U", model: a.mod.MODELS.smart });
    expect(a.beta).toHaveBeenCalledTimes(1);
    expect(a.create).not.toHaveBeenCalled();
    expect(a.beta.mock.calls[0]![0]).toMatchObject({
      fallbacks: "default",
      betas: ["server-side-fallback-2026-07-01"],
    });

    const b = await mocked(reply([text("ok")]));
    await b.mod.aiText({ user: "U", model: b.mod.MODELS.fast });
    expect(b.create).toHaveBeenCalledTimes(1);
    expect(b.beta).not.toHaveBeenCalled();
    expect(b.create.mock.calls[0]![0]).not.toHaveProperty("fallbacks");
  });
});

describe("aiText answers", () => {
  it("ignores thinking blocks", async () => {
    const { mod } = await mocked(reply([{ type: "thinking", thinking: "", signature: "x" }, text("answer")]));
    await expect(mod.aiText({ user: "U" })).resolves.toBe("answer");
  });

  it("drops narration before a search and joins cited text", async () => {
    const { mod } = await mocked(
      reply([
        text("I'll look that up."),
        { type: "server_tool_use", id: "s1", name: "web_search", input: {} },
        { type: "web_search_tool_result", tool_use_id: "s1", content: [] },
        text('{"rate":'),
        text("6.1}"),
      ]),
    );
    await expect(mod.aiText({ user: "U", web: true })).resolves.toBe('{"rate":6.1}');
  });

  it("resumes a paused search with the paused turn appended", async () => {
    const paused = [{ type: "server_tool_use", id: "s1", name: "web_search", input: {} }];
    const { mod, create } = await mocked(reply(paused, "pause_turn"), reply([text("done")]));
    await expect(mod.aiText({ user: "U", web: true })).resolves.toBe("done");
    expect(create).toHaveBeenCalledTimes(2);
    const body = create.mock.calls[1]![0] as unknown as { messages: unknown[] };
    expect(body.messages).toEqual([
      { role: "user", content: "U" },
      { role: "assistant", content: paused },
    ]);
  });

  it("gives up after repeated pauses", async () => {
    const p = reply([], "pause_turn");
    const { mod, create } = await mocked(p, p, p, p, p);
    await expect(mod.aiText({ user: "U", web: true })).rejects.toThrow("took too long");
    expect(create).toHaveBeenCalledTimes(4);
  });

  it("throws on a refusal and on an empty answer", async () => {
    const a = await mocked(reply([], "refusal"));
    await expect(a.mod.aiText({ user: "U" })).rejects.toThrow("declined");
    const b = await mocked(reply([{ type: "thinking", thinking: "", signature: "x" }], "max_tokens"));
    await expect(b.mod.aiText({ user: "U" })).rejects.toThrow("stop_reason=max_tokens");
  });
});

describe("content blocks", () => {
  it("builds a PDF block", async () => {
    const mod = await load();
    expect(mod.pdfBlock("QUJD", "a.pdf")).toEqual({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: "QUJD" },
      title: "a.pdf",
    });
  });

  it("builds image blocks and refuses types the API can't read", async () => {
    const mod = await load();
    expect(mod.imageBlock("IMAGE/PNG", "QUJD").source).toEqual({
      type: "base64",
      media_type: "image/png",
      data: "QUJD",
    });
    expect(() => mod.imageBlock("image/heic", "QUJD")).toThrow("Unsupported");
  });
});

describe("aiErrorMessage", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("never shows provider details to the user", async () => {
    const { aiErrorMessage } = await load();
    expect(aiErrorMessage(apiError(401, "invalid x-api-key"))).toMatch(/configured/);
    expect(aiErrorMessage(apiError(400, "Your credit balance is too low to access the Anthropic API."))).toMatch(
      /temporarily unavailable/,
    );
    expect(aiErrorMessage(apiError(400, "You have reached your specified API usage limits"))).toMatch(
      /temporarily unavailable/,
    );
    expect(aiErrorMessage(apiError(429, "You have reached your API usage limits"))).toMatch(
      /temporarily unavailable/,
    );
    expect(aiErrorMessage(apiError(429, "rate limited"))).toMatch(/busy/);
    expect(aiErrorMessage(apiError(529, "overloaded"))).toMatch(/busy/);
    expect(aiErrorMessage(apiError(400, "messages.0: bad"))).toMatch(/request failed/);
    expect(aiErrorMessage(new Error("billing: visit console.anthropic.com"))).toMatch(/temporarily/);
  });

  it("passes our own safe messages through", async () => {
    const { aiErrorMessage } = await load();
    expect(aiErrorMessage(new Error("The AI declined this request."))).toBe("The AI declined this request.");
  });
});
