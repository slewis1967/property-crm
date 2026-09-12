/**
 * Channel-partner portal — outbound email.
 *
 * All TRANSACTIONAL (sign-in codes, an invitation the firm asked for, updates on
 * a deal they opened), so none pass `commercial: true` — an unsubscribe must
 * never be able to block someone's own sign-in code.
 *
 * NEXTKEY BRANDED, always — including for white-labelled firms. The recipients
 * are the partner's own staff, who know us as NextKey; white-label dresses the
 * portal screen they show their clients, not our mail to them. And the sender
 * has to be a Brevo-validated address, which a partner's domain is not.
 * Sender = the `nextkey` identity from utils/mailIdentities.ts.
 */
import { sendBrevoEmail } from "./brevo";
import { resolveIdentity } from "./mailIdentities";
import { portalBaseUrl } from "./introducer-email";
import { NEXTKEY_BRANDING } from "./partner";

const NAVY = NEXTKEY_BRANDING.primaryColor;
const AMBER = NEXTKEY_BRANDING.accentColor;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function sender() {
  const id = resolveIdentity("nextkey");
  return { fromEmail: id.fromEmail, fromName: id.fromName };
}

function shell(title: string, bodyHtml: string, footerNote: string, strapline = "Partner Portal"): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f5f6f8;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f5f6f8;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
        <tr><td style="background:${NAVY};padding:20px 28px;">
          <div style="color:#ffffff;font-size:17px;font-weight:600;letter-spacing:.2px;">NextKey</div>
          <div style="color:${AMBER};font-size:13px;margin-top:2px;">${strapline}</div>
        </td></tr>
        <tr><td style="padding:28px;color:#1f2430;font-size:15px;line-height:1.6;">
          <h1 style="margin:0 0 16px;font-size:19px;color:${NAVY};">${title}</h1>
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid #eceef2;color:#6b7280;font-size:12px;line-height:1.5;">
          ${footerNote}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

function button(href: string, label: string): string {
  return `<p style="margin:24px 0;"><a href="${href}" style="background:${AMBER};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block;">${label}</a></p>`;
}

function greeting(name: string | null): string {
  return name ? `Hi ${esc(name.split(" ")[0])},` : "Hi,";
}

/** Sign-in email with both credentials; either works once. */
export async function sendPartnerLoginEmail(opts: {
  to: string;
  name: string | null;
  linkToken: string;
  code: string;
  expiresAt: Date;
}) {
  // Lands on a confirm page, not the redeeming API — see app/api/partner/verify.
  const url = `${portalBaseUrl()}/partner/verify?t=${encodeURIComponent(opts.linkToken)}`;
  const minutes = Math.max(1, Math.round((opts.expiresAt.getTime() - Date.now()) / 60_000));
  return sendBrevoEmail({
    to: [{ email: opts.to, name: opts.name ?? undefined }],
    ...sender(),
    subject: `Your NextKey partner sign-in code: ${opts.code}`,
    html: shell(
      "Sign in to the Partner Portal",
      `<p>${greeting(opts.name)}</p>
       <p>Use the button below, then press <strong>Sign in</strong> on the page it opens. It expires in ${minutes} minutes and can only be used once.</p>
       ${button(url, "Sign in")}
       <p>Or enter this code on the sign-in page:</p>
       <p style="font-size:30px;letter-spacing:7px;font-weight:700;color:${NAVY};margin:8px 0 20px;">${opts.code}</p>
       <p style="color:#6b7280;font-size:13px;">If you didn't ask to sign in, you can ignore this email — nobody can access your account without this code.</p>`,
      "This is an automated sign-in email. Never forward it: anyone with this code can access your partner account.",
    ),
    tags: ["partner", "login"],
  });
}

/** Sent when staff give a person at a partner firm a login. */
export async function sendPartnerInviteEmail(opts: {
  to: string;
  name: string | null;
  firmName: string;
  invitedBy: string;
}) {
  const url = `${portalBaseUrl()}/partner`;
  return sendBrevoEmail({
    to: [{ email: opts.to, name: opts.name ?? undefined }],
    ...sender(),
    subject: "Your NextKey Partner Portal access",
    html: shell(
      "Your partner access is ready",
      `<p>${greeting(opts.name)}</p>
       <p>You now have access to the NextKey Partner Portal for <strong>${esc(opts.firmName)}</strong>. Browse our current stock, see your referral fee on every lot, register your clients and request holds.</p>
       ${button(url, "Open the portal")}
       <p>There is no password. Enter <strong>${esc(opts.to)}</strong> on the sign-in page and we'll email you a one-time code.</p>
       <p style="color:#6b7280;font-size:13px;">Builder, estate and lot details are released by the NextKey team once a hold is in place for your client.</p>`,
      `Access granted by ${esc(opts.invitedBy)}. Only enter a client's details where they have agreed to you passing them to NextKey.`,
    ),
    tags: ["partner", "invite"],
  });
}

/** Deal update to the partner — hold granted, details released, stage moved. */
export async function sendDealUpdateEmail(opts: {
  to: string;
  name: string | null;
  lotRef: string;
  clientName: string;
  headline: string;
  body: string;
  enquiryId: string;
}) {
  const url = `${portalBaseUrl()}/partner/deals/${opts.enquiryId}`;
  return sendBrevoEmail({
    to: [{ email: opts.to, name: opts.name ?? undefined }],
    ...sender(),
    subject: `${opts.headline} — ${opts.lotRef} (${opts.clientName})`,
    html: shell(
      esc(opts.headline),
      `<p>${greeting(opts.name)}</p>
       <p>${esc(opts.body)}</p>
       ${button(url, "View the deal")}`,
      "You are receiving this because you hold a NextKey Partner Portal login.",
    ),
    tags: ["partner", "deal-update"],
  });
}

/**
 * Internal: a partner asked for a hold. Goes to OUR inbox, so it names the lot's
 * supplier — the one place outside the CRM those details appear, deliberately,
 * because whoever actions it needs to call the builder.
 */
export async function sendHoldRequestNotice(opts: {
  to: string[];
  firmName: string;
  requestedBy: string;
  clientName: string;
  lotRef: string;
  lotLabel: string;
  supplier: string;
  partnerNote: string | null;
}) {
  if (opts.to.length === 0) return { ok: false as const, error: "No recipients" };
  const url = `${portalBaseUrl()}/admin/partners`;
  return sendBrevoEmail({
    to: opts.to.map((email) => ({ email })),
    ...sender(),
    subject: `Partner hold request: ${opts.lotRef} for ${opts.firmName}`,
    html: shell(
      "New hold request",
      `<p><strong>${esc(opts.firmName)}</strong> (${esc(opts.requestedBy)}) has asked for a hold.</p>
       <p style="margin:4px 0;"><strong>${esc(opts.lotRef)}</strong> — ${esc(opts.lotLabel)}</p>
       <p style="margin:4px 0;">Supplier: ${esc(opts.supplier)}</p>
       <p style="margin:4px 0;">Client: ${esc(opts.clientName)}</p>
       ${opts.partnerNote ? `<blockquote style="margin:16px 0;padding:12px 16px;background:#f5f6f8;border-left:3px solid ${AMBER};">${esc(opts.partnerNote)}</blockquote>` : ""}
       <p style="color:#6b7280;font-size:13px;">Confirm availability with the supplier, then grant or decline the hold in the CRM. Nothing has been sent to the partner beyond "requested".</p>
       ${button(url, "Open partner requests")}`,
      "Internal notification — NextKey CRM.",
      "Partner requests",
    ),
    tags: ["partner", "internal"],
  });
}

/** Who hears about new hold requests. Env-fixed, never request-supplied. */
export function partnerNotifyRecipients(): string[] {
  const raw = (process.env.PARTNER_NOTIFY_EMAILS ?? "sean.l@nextkey.com.au").trim();
  return raw.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}
