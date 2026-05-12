/**
 * Email signature appended to every outbound CRM email by /api/emails POST.
 *
 * Storage chain (first hit wins):
 *   1. app_settings table, key='email_signature' (editable in /settings)
 *   2. Env vars: SIGNATURE_NAME / TITLE / EMAIL / PHONE / WEB / DISCLAIMER
 *   3. Hardcoded defaults
 *
 * SaaS multi-tenant later: defaultSignature() takes a tenant_id, queries
 * tenant-scoped settings.
 */

import { supabase } from "./supabase";

export type SignatureFields = {
  name: string;
  title: string;
  email: string;
  phone: string;
  web: string;
  disclaimer: string;
  logo_url?: string;
  logo_height?: number; // px, defaults to 60 in render
};

export type SignatureBlock = {
  html: string;
  text: string;
};

const HARDCODED_DEFAULTS: SignatureFields = {
  name: "Sean Lewis",
  title: "Director, NextKey Property Strategists",
  email: "sean.l@nextkey.com.au",
  phone: "0477 007 785",
  web: "nextkey.com.au",
  disclaimer:
    "General advice only. NextKey Property Strategists is not a licensed financial planner, mortgage broker, real estate agent or solicitor. Always seek independent advice before making property investment decisions.",
};

function fromEnv(): Partial<SignatureFields> {
  return {
    name: process.env.SIGNATURE_NAME,
    title: process.env.SIGNATURE_TITLE,
    email: process.env.SIGNATURE_EMAIL ?? process.env.BREVO_SENDER_EMAIL,
    phone: process.env.SIGNATURE_PHONE,
    web: process.env.SIGNATURE_WEB,
    disclaimer: process.env.SIGNATURE_DISCLAIMER,
  };
}

/**
 * Resolve the signature for a given user. Lookup chain:
 *   1. email_user_aliases.signature for the given user_email (per-user storage)
 *   2. app_settings.email_signature (legacy shared signature, pre-2026-05-12)
 *   3. env vars
 *   4. Hardcoded defaults
 *
 * Pass `userEmail` whenever you know the sender; omit only for tooling/CRON
 * paths that don't have a user identity. The legacy shared signature stays
 * in place as a fallback so anyone whose per-user row is still empty gets
 * a working signature.
 */
export async function getSignatureFields(userEmail?: string): Promise<SignatureFields> {
  let dbFields: Partial<SignatureFields> = {};

  // 1. Per-user signature
  if (userEmail) {
    try {
      const { data } = await supabase
        .from("email_user_aliases")
        .select("signature")
        .eq("user_email", userEmail)
        .maybeSingle();
      if (data?.signature && typeof data.signature === "object") {
        dbFields = data.signature as Partial<SignatureFields>;
      }
    } catch {
      // Pre-migration — fall through
    }
  }

  // 2. Legacy shared signature — only consulted when the per-user lookup
  //    didn't find anything. Means "I haven't set up my own yet, use the
  //    shared one as a fallback" rather than overriding per-user values.
  if (Object.keys(dbFields).length === 0) {
    try {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", "email_signature")
        .maybeSingle();
      if (data?.value && typeof data.value === "object") {
        dbFields = data.value as Partial<SignatureFields>;
      }
    } catch {
      // app_settings table not migrated yet — silently fall through
    }
  }

  const env = fromEnv();
  return {
    name: dbFields.name || env.name || HARDCODED_DEFAULTS.name,
    title: dbFields.title || env.title || HARDCODED_DEFAULTS.title,
    email: dbFields.email || env.email || HARDCODED_DEFAULTS.email,
    phone: dbFields.phone || env.phone || HARDCODED_DEFAULTS.phone,
    web: dbFields.web || env.web || HARDCODED_DEFAULTS.web,
    disclaimer: dbFields.disclaimer || env.disclaimer || HARDCODED_DEFAULTS.disclaimer,
    logo_url: dbFields.logo_url || undefined,
    logo_height: typeof dbFields.logo_height === "number" ? dbFields.logo_height : undefined,
  };
}

/** Render a SignatureFields into HTML + plain-text bodies. */
export function renderSignature(f: SignatureFields): SignatureBlock {
  const logoH = typeof f.logo_height === "number" && f.logo_height > 0 ? f.logo_height : 60;
  const logoBlock = f.logo_url
    ? `<div style="margin-bottom:12px;"><img src="${escapeHtml(f.logo_url)}" alt="${escapeHtml(f.name)}" style="height:${logoH}px;width:auto;display:block;" /></div>`
    : "";
  const html = `
<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:13px;color:#374151;line-height:1.5;">
  ${logoBlock}
  <p style="margin:0 0 4px;font-weight:600;color:#111827;">${escapeHtml(f.name)}</p>
  <p style="margin:0 0 6px;color:#6b7280;">${escapeHtml(f.title)}</p>
  <p style="margin:0;color:#6b7280;">
    <a href="mailto:${escapeHtml(f.email)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(f.email)}</a>
    &nbsp;·&nbsp;
    <a href="tel:${escapeHtml(f.phone.replace(/\s/g, ""))}" style="color:#2563eb;text-decoration:none;">${escapeHtml(f.phone)}</a>
    &nbsp;·&nbsp;
    <a href="https://${escapeHtml(f.web)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(f.web)}</a>
  </p>
  ${f.disclaimer ? `<p style="margin:8px 0 0;font-size:11px;color:#9ca3af;font-style:italic;">${escapeHtml(f.disclaimer)}</p>` : ""}
</div>`.trim();

  const text = [
    "",
    "—",
    f.name,
    f.title,
    `${f.email} · ${f.phone} · ${f.web}`,
    f.disclaimer ? "" : null,
    f.disclaimer || null,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return { html, text };
}

/** Convenience: fetch + render in one call. */
export async function defaultSignature(userEmail?: string): Promise<SignatureBlock> {
  const fields = await getSignatureFields(userEmail);
  return renderSignature(fields);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
