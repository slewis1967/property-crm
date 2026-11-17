/**
 * Netlify functions in netlify/functions/ are bundled on their own, without
 * Next.js. Anything they import that reaches `next/*` crashes them on load
 * ("Cannot find module '/var/task/node_modules/next/server'"), and a background
 * function fails silently: the caller still gets its 202. That happened on
 * 17 Nov 2026 (partner-feasibility-background imported utils/rate-limit.ts).
 *
 * This walks every function's relative imports and fails on any `next` import.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "..");
const FUNCTIONS_DIR = path.join(ROOT, "netlify", "functions");

function nextImportsReachable(entry: string): string[] {
  const seen = new Set<string>();
  const hits: string[] = [];
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = fs.readFileSync(file, "utf8");
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
      const spec = m[1];
      if (spec === "next" || spec.startsWith("next/")) hits.push(`${path.relative(ROOT, file)} -> ${spec}`);
      if (!spec.startsWith(".")) continue;
      const base = path.resolve(path.dirname(file), spec);
      for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.mts`, path.join(base, "index.ts")]) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          visit(candidate);
          break;
        }
      }
    }
  };
  visit(entry);
  return hits;
}

describe("netlify/functions never import Next.js", () => {
  const files = fs.readdirSync(FUNCTIONS_DIR).filter((f) => /\.(m?ts|m?js)$/.test(f));
  it("finds the functions", () => {
    expect(files.length).toBeGreaterThan(0);
  });
  for (const f of files) {
    it(f, () => {
      expect(nextImportsReachable(path.join(FUNCTIONS_DIR, f))).toEqual([]);
    });
  }
});
