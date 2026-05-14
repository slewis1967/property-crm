/**
 * Sanitize email HTML before rendering it in the inbox / contact viewers /
 * compose reply quote. Inbound `email_log.body_html` is attacker-controlled
 * (anyone with the recipient's address can send mail), so a `<script>` or
 * `<img onerror=…>` in a stored body would otherwise execute inside the
 * operator's CF-Access-authenticated session.
 *
 * Uses isomorphic-dompurify so the same helper works in client components
 * and any server-rendered HTML preview path.
 *
 * We deliberately KEEP common email-styling attributes (style, width,
 * height, bgcolor, etc.) and inline images via cid:/data:/https: — Brevo
 * and most mail clients rely on them and stripping breaks layout. We drop
 * <script>, <style>, <iframe>, <object>, <embed>, event handlers, and
 * unsafe href schemes.
 */
import DOMPurify from "isomorphic-dompurify";

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

export function sanitizeEmailHtml(html: string | null | undefined): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, CONFIG);
}
