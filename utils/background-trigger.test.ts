import { describe, expect, it } from "vitest";
import { backgroundFunctionUrl, DEFAULT_BACKGROUND_ORIGIN } from "./background-trigger";

describe("backgroundFunctionUrl", () => {
  it("defaults to the site's netlify.app address, never the Cloudflare-protected host", () => {
    const url = backgroundFunctionUrl("/.netlify/functions/feasibility-background");
    expect(url.startsWith(DEFAULT_BACKGROUND_ORIGIN)).toBe(true);
    expect(url).not.toContain("crm.nextkey.com.au");
  });
  it("an explicit override wins", () => {
    expect(backgroundFunctionUrl("/x", "https://example.test/y")).toBe("https://example.test/y");
  });
});
