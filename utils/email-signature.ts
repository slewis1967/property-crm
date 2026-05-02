/**
 * Email signature appended to every outbound CRM email by /api/emails POST.
 *
 * Single-tenant for now (NextKey). When the SaaS shell goes multi-tenant,
 * this becomes a per-user setting on a `users` table — caller passes the
 * sender's user_id, this module fetches their personalised signature.
 */

export type SignatureBlock = {
  html: string;
  text: string;
};

const NAME = process.env.SIGNATURE_NAME ?? "Sean Lewis";
const TITLE = process.env.SIGNATURE_TITLE ?? "Director, NextKey Property Strategists";
const EMAIL = process.env.SIGNATURE_EMAIL ?? process.env.BREVO_SENDER_EMAIL ?? "sean.l@nextkey.com.au";
const PHONE = process.env.SIGNATURE_PHONE ?? "0477 007 785";
const WEB = process.env.SIGNATURE_WEB ?? "nextkey.com.au";

export function defaultSignature(): SignatureBlock {
  const html = `
<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:13px;color:#374151;line-height:1.5;">
  <p style="margin:0 0 4px;font-weight:600;color:#111827;">${escapeHtml(NAME)}</p>
  <p style="margin:0 0 6px;color:#6b7280;">${escapeHtml(TITLE)}</p>
  <p style="margin:0;color:#6b7280;">
    <a href="mailto:${escapeHtml(EMAIL)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(EMAIL)}</a>
    &nbsp;·&nbsp;
    <a href="tel:${escapeHtml(PHONE.replace(/\s/g, ""))}" style="color:#2563eb;text-decoration:none;">${escapeHtml(PHONE)}</a>
    &nbsp;·&nbsp;
    <a href="https://${escapeHtml(WEB)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(WEB)}</a>
  </p>
  <p style="margin:8px 0 0;font-size:11px;color:#9ca3af;font-style:italic;">
    General advice only. NextKey Property Strategists is not a licensed financial planner, mortgage broker, real estate agent or solicitor. Always seek independent advice before making property investment decisions.
  </p>
</div>`.trim();

  const text = [
    "",
    "—",
    NAME,
    TITLE,
    `${EMAIL} · ${PHONE} · ${WEB}`,
    "",
    "General advice only. NextKey Property Strategists is not a licensed financial planner, mortgage broker, real estate agent or solicitor.",
  ].join("\n");

  return { html, text };
}

/** Short one-line preview for the composer footer ("Signature: ... auto-appended"). */
export function signaturePreview(): string {
  return `${NAME} · ${TITLE} · ${EMAIL}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
