import { describe, it, expect } from "vitest";
import { htmlToSnippet } from "./email-snippet";

describe("htmlToSnippet", () => {
  it("returns empty string for nullish/empty input", () => {
    expect(htmlToSnippet(null)).toBe("");
    expect(htmlToSnippet(undefined)).toBe("");
    expect(htmlToSnippet("")).toBe("");
  });

  it("strips tags and collapses whitespace", () => {
    expect(htmlToSnippet("<p>Hello   <b>there</b></p>\n<p>friend</p>")).toBe("Hello there friend");
  });

  it("drops <style> blocks entirely", () => {
    expect(htmlToSnippet("<style>p{color:red}</style><p>Body copy</p>")).toBe("Body copy");
  });

  it("decodes common entities", () => {
    expect(htmlToSnippet("Ben &amp; Jerry&#39;s &lt;here&gt;")).toBe("Ben & Jerry's <here>");
  });

  it("truncates with an ellipsis past maxLen", () => {
    const out = htmlToSnippet("<p>" + "a".repeat(200) + "</p>", 100);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBe(101); // 100 chars + ellipsis
  });

  it("does not append an ellipsis when within maxLen", () => {
    expect(htmlToSnippet("<p>short</p>", 100)).toBe("short");
  });
});
