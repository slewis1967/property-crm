/**
 * Stand-in for the NEXUS API while recording help videos.
 *
 * Several CRM pages read from NEXUS, which must never be called from the demo
 * environment (it sends real messages). This serves made-up answers instead.
 * Each file in mock-nexus/ default-exports a map of "METHOD /path" to a
 * handler `(req, url, body) => json`; a path may end in /* to match anything
 * under it. Unknown routes answer 404 and are logged, so a missing one is easy
 * to spot.
 *
 *   node mock-nexus.mjs        listens on http://127.0.0.1:8799
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.MOCK_NEXUS_PORT || 8799);

async function loadRoutes() {
  const routes = {};
  const dir = path.join(HERE, "mock-nexus");
  for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".mjs")).sort()) {
    // Re-imported with the file's modified time, so an edited or new route
    // file is picked up without restarting the server.
    const full = path.join(dir, f);
    const mod = await import(pathToFileURL(full).href + `?v=${fs.statSync(full).mtimeMs}`);
    Object.assign(routes, mod.default);
  }
  return routes;
}

function find(routes, method, pathname) {
  const exact = routes[`${method} ${pathname}`];
  if (exact) return exact;
  let best = null;
  for (const key of Object.keys(routes)) {
    const [m, p] = key.split(" ");
    if (m !== method || !p.endsWith("/*")) continue;
    const prefix = p.slice(0, -1);
    if (pathname.startsWith(prefix) && (!best || prefix.length > best.length)) best = { key, length: prefix.length };
  }
  return best ? routes[best.key] : null;
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    let raw = "";
    for await (const chunk of req) raw += chunk;
    let body = null;
    try {
      body = raw ? JSON.parse(raw) : null;
    } catch {
      body = raw;
    }
    const handler = find(await loadRoutes(), req.method, url.pathname);
    if (!handler) {
      console.log(`  404 ${req.method} ${url.pathname}${url.search}`);
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ detail: "not mocked" }));
      return;
    }
    try {
      const out = await handler(req, url, body);
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(out ?? { ok: true }));
    } catch (e) {
      console.log(`  500 ${req.method} ${url.pathname}: ${e.message}`);
      res.writeHead(500, { "content-type": "application/json" });
      res.end(JSON.stringify({ detail: e.message }));
    }
  })
  .listen(PORT, "127.0.0.1", () => console.log(`mock NEXUS on http://127.0.0.1:${PORT}`));
