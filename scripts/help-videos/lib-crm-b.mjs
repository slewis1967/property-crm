/**
 * Shared bits for the crm-b help video scenarios (kept outside scenarios/ so
 * `record.mjs --all` does not mistake it for a scenario).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const fixture = (name) => path.join(HERE, "fixtures", "crm-b", name);

/** Ids of the shared demo contacts (seed/00-core.sql). */
export const CONTACT = {
  olivia: "d0000000-0000-4000-8000-000000000001",
  noah: "d0000000-0000-4000-8000-000000000004",
};

export const json = (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify(body) });

/**
 * The contact page asks the AI service for a brief, a next step and property
 * matches as soon as it opens. The demo has no AI key, so those three browser
 * calls are answered here with made-up text; otherwise the page shows a red
 * "AI service isn't configured" line that staff never see in normal use.
 */
export async function mockContactAi(page) {
  await page.route("**/api/ai/contact-brief", (r) =>
    r.fulfill(json({ ok: true, text: "Looking to buy in Queensland. A good next step is a short call to confirm budget and timeframe." })));
  await page.route("**/api/ai/suggest-action", (r) =>
    r.fulfill(json({ ok: true, text: "Book a 15 minute call to confirm budget and timeframe." })));
  await page.route("**/api/ai/contact-matches", (r) => r.fulfill(json({ ok: true, matches: [] })));
}

/**
 * Two screens print a real staff address that is built into the CRM (the
 * default sender line on the email pop-up, and the host list on Schedule
 * meeting). The videos must not show real people, so the text on screen is
 * swapped for the demo user. Nothing is sent either way.
 */
export async function showDemoSender(page) {
  await page.evaluate(() => {
    for (const p of document.querySelectorAll("p")) {
      if (/^From:\s/.test(p.textContent || "")) p.textContent = "From: demo@example.com";
    }
    for (const sel of document.querySelectorAll("select")) {
      const opts = [...sel.options];
      if (!opts.some((o) => /@/.test(o.textContent || ""))) continue;
      opts.forEach((o, i) => {
        if (i === 0) o.textContent = "Demo Broker (demo@example.com)";
        else o.remove();
      });
    }
  });
}

/**
 * The CRM's security header only lets the browser talk to the real file
 * store. In the demo the file store is the local one on 127.0.0.1:54321, so
 * a file upload from the browser is blocked before it starts. For the
 * recording, the browser's upload is passed through the CRM's own address and
 * forwarded from here to the local demo file store, so the upload really
 * happens (locally). Call it, then load the page again.
 */
export async function allowLocalStorage(page) {
  await page.addInitScript(() => {
    const STORE = "http://127.0.0.1:54321/";
    const real = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.startsWith(STORE)) return real(input, init);
      const via = "/__demo_storage/" + url.slice(STORE.length);
      return real(typeof input === "string" || input instanceof URL ? via : new Request(via, input), init);
    };
  });
  await page.route("**/__demo_storage/**", async (route) => {
    const u = new URL(route.request().url());
    const res = await route.fetch({ url: "http://127.0.0.1:54321/" + u.pathname.replace("/__demo_storage/", "") + u.search });
    await route.fulfill({ response: res });
  });
}
