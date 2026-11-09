/**
 * Rebuilds utils/help/videos.json from the videos in public/help, so the help
 * panel knows which guides have a video and how long each runs. A video whose
 * name matches no guide is reported, because it would never be shown.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const OUT = path.join(REPO, "public", "help");
const SECTIONS = path.join(REPO, "utils", "help", "sections");

const known = new Set();
for (const f of fs.readdirSync(SECTIONS)) {
  const src = fs.readFileSync(path.join(SECTIONS, f), "utf8");
  for (const m of src.matchAll(/\bid:\s*"([a-z0-9-]+)"/g)) known.add(m[1]);
}

const manifest = {};
const files = fs.existsSync(OUT) ? fs.readdirSync(OUT).filter((f) => f.endsWith(".mp4")).sort() : [];
for (const f of files) {
  const id = f.slice(0, -4);
  if (!known.has(id)) {
    console.warn(`  public/help/${f} matches no guide id; it will not be shown`);
    continue;
  }
  const r = spawnSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path.join(OUT, f)],
    { encoding: "utf8" },
  );
  manifest[id] = { seconds: Math.round(parseFloat(r.stdout)) };
}
fs.writeFileSync(path.join(REPO, "utils", "help", "videos.json"), JSON.stringify(manifest, null, 2) + "\n");
console.log(`  ${Object.keys(manifest).length} of ${known.size} guides have a video`);
