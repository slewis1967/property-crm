/**
 * Records a "How do I do this?" walkthrough video.
 *
 *   node record.mjs <guide-id> [<guide-id> ...]     record the named guides
 *   node record.mjs --all                           record every scenario
 *
 * A scenario (scenarios/<guide-id>.mjs) is a list of steps. Each step has a
 * line of narration and the on-screen actions that go with it. For each step
 * the recorder speaks the line (Australian voice), shows it as a caption, and
 * drives a visible cursor through the actions, so picture and voice stay in
 * step without any hand editing. Output goes to public/help/<guide-id>.mp4
 * plus a .jpg poster; run manifest.mjs afterwards (record does it for you).
 *
 * SAFETY: the recorder only ever talks to a CRM running on this machine, and
 * refuses unless HELP_DEMO_DATA=1 is set (a scenario marked `noClientData`,
 * which only reads a page with no client records on it, is the one exception). Recordings are permanent pictures of
 * whatever is on screen, and scenarios click real buttons, so they must be
 * made against the demo database, never against live client records.
 */
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "..", "..");
const WORK = path.join(HERE, ".work");
const OUT = path.join(REPO, "public", "help");
const BASE = (process.env.HELP_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const VOICE = process.env.HELP_VOICE || "en-AU-WilliamNeural";
const SIZE = { width: 1280, height: 720 };

function fail(msg) {
  console.error(`\n  ${msg}\n`);
  process.exit(1);
}

const host = new URL(BASE).hostname;
if (host !== "localhost" && host !== "127.0.0.1") {
  fail(`Refusing to record against ${BASE}. The recorder only runs against a CRM on this machine.`);
}
const DEMO_DATA = process.env.HELP_DEMO_DATA === "1";
const DEMO_REFUSAL = [
  "set HELP_DEMO_DATA=1 once you have confirmed the local CRM is pointed at the demo",
  "database. Scenarios click real buttons and the video keeps whatever is on screen.",
  "(Only a scenario marked noClientData, which changes nothing and shows no client",
  "records, may be recorded without it.)",
].join(" ");

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: "utf8", ...opts });
  if (r.status !== 0) {
    throw new Error(`${cmd} failed (${r.status}): ${(r.stderr || r.stdout || "").slice(-600)}`);
  }
  return r.stdout;
}

/** Speak a line to an mp3 (cached by its text) and return its path + length. */
function narrate(text) {
  const dir = path.join(WORK, "voice");
  fs.mkdirSync(dir, { recursive: true });
  const key = createHash("sha1").update(`${VOICE}|${text}`).digest("hex").slice(0, 16);
  const file = path.join(dir, `${key}.mp3`);
  if (!fs.existsSync(file)) {
    run("python", ["-m", "edge_tts", "--voice", VOICE, "--rate=-4%", "--text", text, "--write-media", file]);
  }
  const seconds = parseFloat(
    run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]),
  );
  return { file, seconds };
}

/**
 * Runs inside every page before its own scripts. Draws the things a screen
 * recording needs and a headless browser lacks: a cursor, a click ripple, a
 * highlight ring, and the caption bar. The caption is kept in sessionStorage so
 * it survives moving from page to page mid-step.
 */
function overlayScript() {
  const mount = () => {
    if (document.getElementById("__help_cursor")) return;
    const style = document.createElement("style");
    style.textContent = `
      #__help_cursor{position:fixed;left:0;top:0;width:22px;height:22px;z-index:2147483647;pointer-events:none;
        transform:translate(-100px,-100px);transition:none}
      #__help_ring{position:fixed;z-index:2147483646;pointer-events:none;border:3px solid #FFB627;border-radius:10px;
        box-shadow:0 0 0 4px rgba(255,182,39,.28);opacity:0;transition:opacity .2s, left .2s, top .2s, width .2s, height .2s}
      .__help_ripple{position:fixed;z-index:2147483646;pointer-events:none;width:14px;height:14px;border-radius:50%;
        background:rgba(255,182,39,.55);transform:translate(-50%,-50%) scale(1);animation:__help_rip .5s ease-out forwards}
      @keyframes __help_rip{to{transform:translate(-50%,-50%) scale(4.2);opacity:0}}
      #__help_caption{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483645;pointer-events:none;
        max-width:760px;background:rgba(15,23,42,.92);color:#fff;font:600 19px/1.35 system-ui,Segoe UI,sans-serif;
        padding:11px 18px;border-radius:12px;text-align:center;box-shadow:0 6px 24px rgba(0,0,0,.35);opacity:0;transition:opacity .2s}
      [data-help-button], nextjs-portal{display:none !important}
    `;
    document.documentElement.appendChild(style);
    const cur = document.createElement("div");
    cur.id = "__help_cursor";
    cur.innerHTML =
      '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 2l15 9-6.5 1.6L16 20l-3 1.4-3.4-7.3L5 18z" fill="#111" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    document.documentElement.appendChild(cur);
    const ring = document.createElement("div");
    ring.id = "__help_ring";
    document.documentElement.appendChild(ring);
    const cap = document.createElement("div");
    cap.id = "__help_caption";
    document.documentElement.appendChild(cap);

    const last = sessionStorage.getItem("__help_xy");
    if (last) {
      const [x, y] = last.split(",").map(Number);
      cur.style.transform = `translate(${x}px,${y}px)`;
    }
    const text = sessionStorage.getItem("__help_caption") || "";
    if (text) {
      cap.textContent = text;
      cap.style.opacity = "1";
    }
  };
  window.__helpCaption = (text) => {
    sessionStorage.setItem("__help_caption", text || "");
    const cap = document.getElementById("__help_caption");
    if (!cap) return;
    cap.textContent = text || "";
    cap.style.opacity = text ? "1" : "0";
  };
  window.__helpRing = (box) => {
    const ring = document.getElementById("__help_ring");
    if (!ring) return;
    if (!box) {
      ring.style.opacity = "0";
      return;
    }
    ring.style.left = `${box.x - 6}px`;
    ring.style.top = `${box.y - 6}px`;
    ring.style.width = `${box.width + 12}px`;
    ring.style.height = `${box.height + 12}px`;
    ring.style.opacity = "1";
  };
  window.addEventListener(
    "mousemove",
    (e) => {
      const cur = document.getElementById("__help_cursor");
      if (cur) cur.style.transform = `translate(${e.clientX}px,${e.clientY}px)`;
      sessionStorage.setItem("__help_xy", `${e.clientX},${e.clientY}`);
    },
    true,
  );
  window.addEventListener(
    "mousedown",
    (e) => {
      const r = document.createElement("div");
      r.className = "__help_ripple";
      r.style.left = `${e.clientX}px`;
      r.style.top = `${e.clientY}px`;
      document.documentElement.appendChild(r);
      setTimeout(() => r.remove(), 600);
    },
    true,
  );
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
}

/** The actions a scenario step can use. Each one moves the visible cursor. */
function helpers(page) {
  const pos = { x: SIZE.width / 2, y: SIZE.height / 2 };
  const resolve = (target) => (typeof target === "string" ? page.locator(target).first() : target);

  async function glide(target) {
    const loc = resolve(target);
    await loc.waitFor({ state: "visible", timeout: 15000 });
    await loc.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    const box = await loc.boundingBox();
    if (!box) throw new Error("target has no on-screen box");
    const x = box.x + Math.min(box.width / 2, 160);
    const y = box.y + box.height / 2;
    const steps = Math.max(12, Math.round(Math.hypot(x - pos.x, y - pos.y) / 22));
    await page.mouse.move(x, y, { steps });
    pos.x = x;
    pos.y = y;
    await page.evaluate((b) => window.__helpRing?.(b), box);
    await page.waitForTimeout(450);
    return loc;
  }
  const clearRing = () => page.evaluate(() => window.__helpRing?.(null)).catch(() => {});

  return {
    page,
    /** Move to a control and ring it, without clicking. */
    async point(target, holdMs = 900) {
      await glide(target);
      await page.waitForTimeout(holdMs);
      await clearRing();
    },
    async click(target) {
      await glide(target);
      await page.mouse.down();
      await page.mouse.up();
      await page.waitForTimeout(350);
      await clearRing();
    },
    /** Click into a field and type at a readable speed. */
    async type(target, text) {
      const loc = await glide(target);
      await page.mouse.down();
      await page.mouse.up();
      await clearRing();
      await loc.pressSequentially(text, { delay: 55 });
      await page.waitForTimeout(250);
    },
    async select(target, option) {
      const loc = await glide(target);
      await loc.selectOption(option);
      await page.waitForTimeout(400);
      await clearRing();
    },
    async goto(route) {
      await page.goto(BASE + route, { waitUntil: "networkidle" });
    },
    async scroll(dy) {
      await page.mouse.wheel(0, dy);
      await page.waitForTimeout(600);
    },
    pause: (ms) => page.waitForTimeout(ms),
  };
}

async function recordOne(id) {
  const file = path.join(HERE, "scenarios", `${id}.mjs`);
  if (!fs.existsSync(file)) throw new Error(`no scenario at scenarios/${id}.mjs`);
  const scenario = (await import(pathToFileURL(file).href)).default;
  if (!DEMO_DATA && !scenario.noClientData) throw new Error(`refused: ${DEMO_REFUSAL}`);

  // Voice first: each step is held on screen for at least as long as its line.
  const lines = scenario.steps.map((s) => narrate(s.say));

  const rawDir = path.join(WORK, "raw", id);
  fs.rmSync(rawDir, { recursive: true, force: true });
  fs.mkdirSync(rawDir, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: SIZE,
    deviceScaleFactor: 1,
    locale: "en-AU",
    timezoneId: "Australia/Brisbane",
    recordVideo: { dir: rawDir, size: SIZE },
  });
  await context.addInitScript(overlayScript);
  const page = await context.newPage();
  const started = Date.now();
  const h = helpers(page);
  page.on("dialog", (d) => d.accept().catch(() => {}));

  await h.goto(scenario.start);
  await page.waitForTimeout(700);
  const trim = (Date.now() - started) / 1000;

  const cues = [];
  try {
    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i];
      const at = (Date.now() - started) / 1000;
      cues.push({ at: at - trim, ...lines[i] });
      await page.evaluate((t) => window.__helpCaption?.(t), step.say);
      const began = Date.now();
      if (step.do) await step.do(h);
      const hold = lines[i].seconds * 1000 + 450 - (Date.now() - began);
      if (hold > 0) await page.waitForTimeout(hold);
    }
    await page.evaluate(() => window.__helpCaption?.(""));
    await page.waitForTimeout(700);
  } finally {
    await context.close();
    await browser.close();
  }
  const total = (Date.now() - started) / 1000 - trim;
  const raw = path.join(rawDir, fs.readdirSync(rawDir).find((f) => f.endsWith(".webm")));

  fs.mkdirSync(OUT, { recursive: true });
  const mp4 = path.join(OUT, `${id}.mp4`);
  const args = ["-y", "-ss", trim.toFixed(2), "-i", raw];
  for (const c of cues) args.push("-i", c.file);
  const mix = cues
    .map((c, i) => `[${i + 1}:a]adelay=${Math.round(c.at * 1000)}:all=1[a${i}]`)
    .concat(`${cues.map((_, i) => `[a${i}]`).join("")}amix=inputs=${cues.length}:normalize=0[aout]`)
    .join(";");
  args.push(
    "-filter_complex", mix, "-map", "0:v", "-map", "[aout]",
    "-t", total.toFixed(2),
    "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-pix_fmt", "yuv420p", "-r", "20",
    "-c:a", "aac", "-b:a", "64k", "-ac", "1",
    "-movflags", "+faststart", mp4,
  );
  run("ffmpeg", args);
  run("ffmpeg", ["-y", "-ss", "1.5", "-i", mp4, "-frames:v", "1", "-q:v", "4", path.join(OUT, `${id}.jpg`)]);
  const kb = Math.round(fs.statSync(mp4).size / 1024);
  console.log(`  ${id}: ${total.toFixed(0)}s, ${kb} KB`);
}

const argv = process.argv.slice(2);
const ids = argv.includes("--all")
  ? fs.readdirSync(path.join(HERE, "scenarios")).filter((f) => f.endsWith(".mjs")).map((f) => f.slice(0, -4))
  : argv;
if (ids.length === 0) fail("Name a guide id, or pass --all.");

let failed = 0;
for (const id of ids) {
  try {
    await recordOne(id);
  } catch (e) {
    failed++;
    console.error(`  ${id}: FAILED: ${e.message}`);
  }
}
run("node", [path.join(HERE, "manifest.mjs")], { stdio: "inherit" });
process.exit(failed ? 1 : 0);
