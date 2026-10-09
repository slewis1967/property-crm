import type { HelpSection } from "./types";

/** True when `pathname` is `prefix` itself or sits underneath it. */
function covers(prefix: string, pathname: string): boolean {
  if (prefix === "/") return pathname === "/";
  return pathname === prefix || pathname.startsWith(prefix + "/");
}

/**
 * The section for a page: the one whose path prefix is the longest match, so
 * "/tasks/archive" finds the archive section rather than Tasks.
 */
export function sectionForPath(
  sections: HelpSection[],
  pathname: string | null | undefined,
): HelpSection | null {
  if (!pathname) return null;
  let best: HelpSection | null = null;
  let bestLen = -1;
  for (const s of sections) {
    for (const p of s.paths) {
      if (covers(p, pathname) && p.length > bestLen) {
        best = s;
        bestLen = p.length;
      }
    }
  }
  return best;
}

/** Guides whose title, summary or steps mention every word of the query. */
export function searchGuides(sections: HelpSection[], query: string) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const hits: { section: HelpSection; guideId: string }[] = [];
  for (const section of sections) {
    for (const g of section.guides) {
      const hay = [section.label, g.title, g.summary, ...g.steps.map((s) => s.title)]
        .join(" ")
        .toLowerCase();
      if (words.every((w) => hay.includes(w))) hits.push({ section, guideId: g.id });
    }
  }
  return hits;
}
