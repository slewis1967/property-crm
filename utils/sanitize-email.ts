/**
 * Sanitize email HTML before rendering it in the inbox / contact viewers /
 * compose reply quote, and before persisting operator-typed /broadcast copy.
 * Inbound `email_log.body_html` is attacker-controlled (anyone with the
 * recipient's address can send mail), so a `<script>` or `<img onerror=…>` in a
 * stored body would otherwise execute inside the operator's CF-Access session.
 *
 * We deliberately KEEP common email-styling attributes (style, width, height,
 * bgcolor, etc.) and inline images via cid:/data:/https: — Brevo and most mail
 * clients rely on them and stripping breaks layout. We drop <script>, <style>,
 * <iframe>, <object>, <embed>, event handlers, and unsafe href schemes.
 *
 * DOMPurify (isomorphic-dompurify) is loaded LAZILY. On the server it pulls in
 * jsdom, whose dependency chain fails to resolve in the Netlify serverless
 * bundle and throws at *import* time — which previously crashed /api/broadcast
 * (its only server-side caller) with a 500 before anything could send. Requiring
 * it inside the function keeps that failure from crashing module load, and lets
 * the server fall back to a minimal strip. The attacker-controlled inbox paths
 * are client components that run in the browser, where DOMPurify works natively
 * (no jsdom) — so they keep the full sanitizer. The only path that ever reaches
 * the fallback is the trusted, operator-authored /broadcast copy behind CF Access.
 */

const CONFIG = {
  FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "button", "textarea", "select", "option", "meta", "link", "base"],
  FORBID_ATTR: [
    "onload", "onerror", "onclick", "onmouseover", "onmouseout", "onmousedown",
    "onmouseup", "onkeydown", "onkeyup", "onkeypress", "onfocus", "onblur",
    "onchange", "onsubmit", "onreset", "onselect", "onabort", "ondrag",
    "ondrop", "onpaste", "oncopy", "oncut",
  ],
  ALLOW_DATA_ATTR: false,
  // Allow http/https/mailto/tel/cid/data: image schemes only. Drop javascript:/vbscript:.
  ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|cid|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
};

/** Dependency-free fallback strip for runtimes where DOMPurify/jsdom can't load
 * (Netlify functions). Adequate because the only caller that reaches it is the
 * trusted, operator-authored /broadcast copy — not attacker input. */
function basicStripHtml(html: string): string {
  return html
    // dangerous elements + their content
    .replace(/<\s*(script|style|iframe|object|embed|form|textarea|select)\b[\s\S]*?<\/\s*\1\s*>/gi, "")
    // standalone / void dangerous tags
    .replace(/<\s*(script|style|iframe|object|embed|meta|link|base|input|button)\b[^>]*>/gi, "")
    // inline event handlers (onclick=…, onerror=…)
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    // neutralise javascript:/vbscript: URIs in href/src
    .replace(/((?:href|src)\s*=\s*["']?)\s*(?:javascript|vbscript):[^"'>\s]*/gi, "$1#");
}

export function sanitizeEmailHtml(html: string | null | undefined): string {
  if (!html) return "";
  try {
    // Lazy require — see file header: keeps a broken server-side jsdom chain
    // from throwing at module import and taking the whole route down.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("isomorphic-dompurify");
    const DOMPurify = mod?.default ?? mod;
    return DOMPurify.sanitize(html, CONFIG);
  } catch {
    return basicStripHtml(html);
  }
}
