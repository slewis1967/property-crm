/**
 * Derive a short plain-text preview from an email's HTML body.
 *
 * Strips <style> blocks and tags, decodes a handful of common entities,
 * collapses whitespace, and truncates to `maxLen`. Used server-side to render
 * a one-line snippet in the drafts list without shipping full HTML to the
 * client. Pure + deterministic so it's easy to unit test.
 */
export function htmlToSnippet(html: string | null | undefined, maxLen = 100): string {
  if (!html) return "";
  const text = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trimEnd() + "…";
}
