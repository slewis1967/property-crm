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
import type { MailIdentityKey } from "./mailIdentities";

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

/**
 * The font every outward email is set in. Sean's standing rule (2 Nov 2026):
 * Arial on the body and the signature. Use this constant rather than retyping
 * a stack, so one place changes if the rule ever does.
 */
export const EMAIL_FONT = "Arial,Helvetica,sans-serif";

/**
 * Who signs Springboard-branded emails that aren't from a signed-in person
 * (self-book and Springboard-host meeting invites). Glenn is the only public
 * contact for buyers and leads, so it's his name and number under the
 * Springboard brand (Sean, 9 Nov 2026).
 */
export const SPRINGBOARD_SIGNATORY_EMAIL = "glenn.m@nextkey.com.au";

/** "0477201245" → "0477 201 245"; landlines "0755551234" → "07 5555 1234". Anything else unchanged. */
export function formatAuPhone(phone: string): string {
  const d = phone.replace(/[\s()-]/g, "");
  if (/^04\d{8}$/.test(d)) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  if (/^0[2378]\d{8}$/.test(d)) return `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}`;
  return phone;
}

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

/**
 * The signature saved for exactly this person, or null when they have none.
 * No fallback: the outward-email rule says an email carries the SENDER's
 * signature, and the shared/hardcoded fallbacks in getSignatureFields are
 * Sean's details, which would sign someone else's email as Sean.
 */
export async function getOwnSignatureFields(userEmail: string): Promise<SignatureFields | null> {
  try {
    const { data } = await supabase
      .from("email_user_aliases")
      .select("signature")
      .ilike("user_email", userEmail)
      .maybeSingle();
    const sig = data?.signature as Partial<SignatureFields> | null | undefined;
    if (!sig || typeof sig !== "object" || !sig.name || !sig.email) return null;
    return {
      name: sig.name,
      title: sig.title ?? "",
      email: sig.email,
      phone: sig.phone ?? "",
      web: sig.web ?? "",
      disclaimer: sig.disclaimer ?? "",
      logo_url: sig.logo_url || undefined,
      logo_height: typeof sig.logo_height === "number" ? sig.logo_height : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * The signature for an email sent as a meeting host.
 *   - NextKey host → that host's own saved signature.
 *   - Springboard host → Glenn's name and number under the Springboard brand,
 *     with no NextKey logo, title or disclaimer (brand firewall).
 * Returns null when there's no signature on file, and the caller must not send.
 */
export async function hostSignature(host: { email: string; brand: MailIdentityKey }): Promise<SignatureBlock | null> {
  if (host.brand === "springboard") {
    const glenn = await getOwnSignatureFields(SPRINGBOARD_SIGNATORY_EMAIL);
    if (!glenn) return null;
    return renderSpringboardSignature({
      name: glenn.name,
      title: "Springboard Homes",
      email: process.env.SPRINGBOARD_SENDER_EMAIL ?? "hello@springboardhomes.com.au",
      phone: glenn.phone,
      web: "springboardhomes.com.au",
      disclaimer: "",
    });
  }
  const own = await getOwnSignatureFields(host.email);
  return own ? renderSignature(own) : null;
}

/** Render a SignatureFields into HTML + plain-text bodies. */
export function renderSignature(f: SignatureFields): SignatureBlock {
  const phone = f.phone ? formatAuPhone(f.phone) : "";
  const logoH = typeof f.logo_height === "number" && f.logo_height > 0 ? f.logo_height : 60;
  const logoBlock = f.logo_url
    ? `<div style="margin-bottom:12px;"><img src="${escapeHtml(f.logo_url)}" alt="${escapeHtml(f.name)}" style="height:${logoH}px;width:auto;display:block;" /></div>`
    : "";
  const html = `
<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;font-family:${EMAIL_FONT};font-size:13px;color:#374151;line-height:1.5;">
  ${logoBlock}
  <p style="margin:0 0 4px;font-weight:600;color:#111827;">${escapeHtml(f.name)}</p>
  ${f.title ? `<p style="margin:0 0 6px;color:#6b7280;">${escapeHtml(f.title)}</p>` : ""}
  <p style="margin:0;color:#6b7280;">
    ${[
      `<a href="mailto:${escapeHtml(f.email)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(f.email)}</a>`,
      phone ? `<a href="tel:${escapeHtml(phone.replace(/\s/g, ""))}" style="color:#2563eb;text-decoration:none;">${escapeHtml(phone)}</a>` : "",
      f.web ? `<a href="https://${escapeHtml(f.web)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(f.web)}</a>` : "",
    ].filter(Boolean).join(" &nbsp;·&nbsp; ")}
  </p>
  ${f.disclaimer ? `<p style="margin:8px 0 0;font-size:11px;color:#9ca3af;font-style:italic;">${escapeHtml(f.disclaimer)}</p>` : ""}
</div>`.trim();

  const text = [
    "",
    "—",
    f.name,
    f.title || null,
    [f.email, phone, f.web].filter(Boolean).join(" · "),
    f.disclaimer ? "" : null,
    f.disclaimer || null,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return { html, text };
}

/**
 * The Springboard Homes logo for emails: served from the Springboard booking
 * from springboardhomes.com.au so nothing in a Springboard email
 * points at a NextKey address. 656x202 PNG, transparent background.
 */
export const SPRINGBOARD_EMAIL_LOGO_URL =
  process.env.SPRINGBOARD_EMAIL_LOGO_URL ?? "https://springboardhomes.com.au/wp-content/uploads/2026/06/springboard-logo-v2.png";

const SB_NAVY = "#020e40";
const SB_AMBER = "#c7894e";

/**
 * The Springboard brand signature: logo on the left, an amber rule, then the
 * signatory's name and contact lines in the brand navy. Table layout with
 * inline styles so Gmail, Outlook and phone mail apps all keep it together.
 * Plain brand only: no NextKey logo, title or disclaimer, and no finance or
 * licensing claims (see springboardSignatureFields).
 */
export function renderSpringboardSignature(f: SignatureFields): SignatureBlock {
  const phone = f.phone ? formatAuPhone(f.phone) : "";
  const link = `color:${SB_NAVY};text-decoration:none;`;
  const label = `color:${SB_AMBER};font-weight:700;padding-right:6px;`;
  const row = (k: string, v: string) =>
    `<tr><td style="${label}font-size:12px;">${k}</td><td style="font-size:13px;">${v}</td></tr>`;
  const rows = [
    phone ? row("P", `<a href="tel:${escapeHtml(phone.replace(/\s/g, ""))}" style="${link}">${escapeHtml(phone)}</a>`) : "",
    row("E", `<a href="mailto:${escapeHtml(f.email)}" style="${link}">${escapeHtml(f.email)}</a>`),
    f.web ? row("W", `<a href="https://${escapeHtml(f.web)}" style="${link}">${escapeHtml(f.web)}</a>`) : "",
  ].join("");

  const html = `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;border-collapse:collapse;font-family:${EMAIL_FONT};color:${SB_NAVY};line-height:1.45;">
  <tr>
    <td style="padding:4px 18px 4px 0;vertical-align:middle;">
      <a href="https://${escapeHtml(f.web || "springboardhomes.com.au")}" style="text-decoration:none;"><img src="${escapeHtml(SPRINGBOARD_EMAIL_LOGO_URL)}" alt="Springboard Homes" width="170" height="52" style="display:block;width:170px;height:52px;border:0;" /></a>
    </td>
    <td style="padding:2px 0 2px 18px;vertical-align:middle;border-left:3px solid ${SB_AMBER};">
      <div style="font-size:16px;font-weight:700;color:${SB_NAVY};margin:0;">${escapeHtml(f.name)}</div>
      <div style="font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:${SB_AMBER};margin:2px 0 8px;">${escapeHtml(f.title || "Springboard Homes")}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:${EMAIL_FONT};">${rows}</table>
    </td>
  </tr>
</table>`.trim();

  const text = [
    "",
    "—",
    f.name,
    f.title || "Springboard Homes",
    phone ? `P ${phone}` : null,
    `E ${f.email}`,
    f.web ? `W ${f.web}` : null,
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

/**
 * Build the Springboard-brand signature fields for a user.
 *
 * We keep the sender's personal name + phone (so the recipient still sees who
 * wrote it) but swap the brand identity to Springboard Homes.
 *
 * COMPLIANCE: this is a plain brand signature only. It deliberately carries NO
 * finance/credit-licensing claims, credit-licence numbers, or guarantees —
 * Springboard finance messaging is licensing-sensitive and a signature must
 * not assert regulated claims. `disclaimer` is intentionally left empty.
 */
export async function springboardSignatureFields(userEmail?: string): Promise<SignatureFields> {
  const base = await getSignatureFields(userEmail);
  return {
    name: base.name,
    title: "Springboard Homes",
    email: process.env.SPRINGBOARD_SENDER_EMAIL ?? "hello@springboardhomes.com.au",
    phone: base.phone,
    web: "springboardhomes.com.au",
    disclaimer: "",
  };
}

/**
 * Resolve + render the signature for a given sending identity.
 *   - `nextkey`     → the user's existing NextKey signature (unchanged).
 *   - `springboard` → the plain Springboard brand signature.
 */
export async function signatureForIdentity(
  identity: MailIdentityKey,
  userEmail?: string,
): Promise<SignatureBlock> {
  if (identity === "springboard") {
    return renderSpringboardSignature(await springboardSignatureFields(userEmail));
  }
  return defaultSignature(userEmail);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
