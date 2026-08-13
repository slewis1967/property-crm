/**
 * Introducer portal — outbound email.
 *
 * All sends are TRANSACTIONAL, not commercial: a sign-in code, an invitation the
 * recipient agreed to receive, and updates on a referral they made. They
 * therefore do NOT pass `commercial: true` to Brevo — an unsubscribe must never
 * be able to block someone's own sign-in code. Any future marketing to
 * introducers is a different path with a different flag.
 *
 * SPRINGBOARD BRANDED, NOT NEXTKEY. An introducer refers clients to the
 * Springboard product and their client will only ever hear the name Springboard
 * — NextKey is the internal CRM and means nothing to them. Every introducer-
 * facing surface (this file, app/introducer/*) is therefore Springboard; the
 * staff side at /admin/introducers stays NextKey CRM because that IS the CRM.
 *
 * Brand: navy #020e40, amber #c7894e, logo at /api/portal/logo.
 *
 * SENDER: hello@springboardhomes.com.au, already a verified Brevo sender (it
 * powers the Springboard autoresponder and the document reminders), so no new
 * Brevo setup is needed. Sending these from the NextKey sender would put a name
 * the recipient doesn't recognise on their sign-in code — and mismatched
 * from-addresses are exactly what spam filters and phishing-aware humans react
 * to. See utils/mailIdentities.ts for the same split.
 */
import { sendBrevoEmail } from "./brevo";

const NAVY = "#020e40";
const AMBER = "#c7894e";

export function portalBaseUrl(): string {
  return (
    process.env.PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://crm.nextkey.com.au"
  ).replace(/\/+$/, "");
}

/** The Springboard from-envelope, mirroring utils/mailIdentities.ts. */
function springboardSender() {
  return {
    fromEmail: process.env.SPRINGBOARD_SENDER_EMAIL ?? "hello@springboardhomes.com.au",
    fromName: process.env.SPRINGBOARD_SENDER_NAME ?? "Springboard Homes",
  };
}

/**
 * The logo is served from /api/portal/logo — deliberately NOT a new endpoint
 * under /api/introducer. That path already carries a Cloudflare Access bypass
 * so it is publicly fetchable by Gmail's image proxy, which is the only way an
 * emailed logo renders at all.
 */
function logoUrl(): string {
  return `${portalBaseUrl()}/api/portal/logo`;
}

/**
 * Internal-only shell. The new-referral notice goes to OUR inbox, not an
 * introducer's, so it deliberately wears NextKey CRM chrome — dressing an
 * internal alert as Springboard would make the one email that tells us to act
 * look like the ones we send out.
 */
function internalShell(title: string, bodyHtml: string, footerNote: string): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f5f6f8;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f5f6f8;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
        <tr><td style="background:#1b1f44;padding:20px 28px;">
          <div style="color:#ffffff;font-size:17px;font-weight:600;letter-spacing:.2px;">NextKey CRM</div>
          <div style="color:#da9845;font-size:13px;margin-top:2px;">Introducer referrals</div>
        </td></tr>
        <tr><td style="padding:28px;color:#1f2430;font-size:15px;line-height:1.6;">
          <h1 style="margin:0 0 16px;font-size:19px;color:#1b1f44;">${title}</h1>
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

/**
 * Exported so utils/introducer-onboarding-email.ts can wear identical chrome.
 * Onboarding writes to someone who is NOT yet an introducer, so it lives in its
 * own module — but a second hand-rolled copy of this shell would drift, and an
 * applicant seeing one brand at invitation and a slightly different one at
 * accreditation is the same leak app/introducer/layout.tsx exists to prevent.
 *
 * `strapline` overrides the header caption: "Introducer Portal" is wrong for
 * someone who does not have one yet.
 */
export function shell(
  title: string,
  bodyHtml: string,
  footerNote?: string,
  strapline = "Introducer Portal",
): string {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f5f6f8;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#f5f6f8;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
        <tr><td style="background:${NAVY};padding:20px 28px;">
          <img src="${logoUrl()}" alt="Springboard Homes" height="30" style="height:30px;width:auto;display:block;border:0;" />
          <div style="color:${AMBER};font-size:13px;margin-top:8px;">${strapline}</div>
        </td></tr>
        <tr><td style="padding:28px;color:#1f2430;font-size:15px;line-height:1.6;">
          <h1 style="margin:0 0 16px;font-size:19px;color:${NAVY};">${title}</h1>
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid #eceef2;color:#6b7280;font-size:12px;line-height:1.5;">
          ${footerNote ?? "You are receiving this because you hold an introducer login with Springboard Homes."}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

export function button(href: string, label: string): string {
  return `<p style="margin:24px 0;"><a href="${href}" style="background:${AMBER};color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block;">${label}</a></p>`;
}

/**
 * Sign-in email. Carries BOTH credentials — the link for people reading mail on
 * the device they'll use, the code for people who aren't. Either works once.
 */
export async function sendIntroducerLoginEmail(opts: {
  to: string;
  name: string | null;
  linkToken: string;
  code: string;
  expiresAt: Date;
}) {
  const url = `${portalBaseUrl()}/api/introducer/verify?t=${encodeURIComponent(opts.linkToken)}`;
  const minutes = Math.max(1, Math.round((opts.expiresAt.getTime() - Date.now()) / 60_000));
  const greeting = opts.name ? `Hi ${opts.name.split(" ")[0]},` : "Hi,";

  return sendBrevoEmail({
    to: [{ email: opts.to, name: opts.name ?? undefined }],
    ...springboardSender(),
    subject: `Your Springboard introducer sign-in code: ${opts.code}`,
    html: shell(
      "Sign in to the Introducer Portal",
      `<p>${greeting}</p>
       <p>Use the button below to sign in. It expires in ${minutes} minutes and can only be used once.</p>
       ${button(url, "Sign in")}
       <p>Or enter this code on the sign-in page:</p>
       <p style="font-size:30px;letter-spacing:7px;font-weight:700;color:${NAVY};margin:8px 0 20px;">${opts.code}</p>
       <p style="color:#6b7280;font-size:13px;">If you didn't ask to sign in, you can ignore this email — nobody can access your account without this code.</p>`,
      "This is an automated sign-in email. Never forward it: anyone with this code can access your introducer account.",
    ),
    tags: ["introducer", "login"],
  });
}

/** Welcome / invitation email when Sean adds a new introducer login. */
export async function sendIntroducerInviteEmail(opts: {
  to: string;
  name: string | null;
  firmName: string;
  invitedBy: string;
}) {
  const url = `${portalBaseUrl()}/introducer`;
  const greeting = opts.name ? `Hi ${opts.name.split(" ")[0]},` : "Hi,";
  return sendBrevoEmail({
    to: [{ email: opts.to, name: opts.name ?? undefined }],
    ...springboardSender(),
    subject: "Your Springboard Introducer Portal access",
    html: shell(
      "Your introducer access is ready",
      `<p>${greeting}</p>
       <p>You now have access to the Springboard Introducer Portal for <strong>${opts.firmName}</strong>. You can use it to register clients and follow their progress.</p>
       ${button(url, "Open the portal")}
       <p>There is no password. Enter <strong>${opts.to}</strong> on the sign-in page and we'll email you a one-time code.</p>
       <p style="color:#6b7280;font-size:13px;">A quick note on how it works: once you submit a client's details they're locked, so the record we assess is exactly what you sent. If something needs correcting, ask us and we'll authorise the change. If we need anything further, you'll get an email and the portal will open just that part for you.</p>`,
      `Access granted by ${opts.invitedBy}. Please only submit client details where you have the client's consent to pass them to Springboard Homes.`,
    ),
    tags: ["introducer", "invite"],
  });
}

/** "We need more from you" — sent when staff open an information request. */
export async function sendInfoRequestEmail(opts: {
  to: string;
  name: string | null;
  clientRef: string;
  clientName: string;
  message: string;
  fieldLabels: string[];
  documentLabels: string[];
  clientId: string;
}) {
  const url = `${portalBaseUrl()}/introducer/clients/${opts.clientId}`;
  const greeting = opts.name ? `Hi ${opts.name.split(" ")[0]},` : "Hi,";
  const lists = [
    opts.fieldLabels.length
      ? `<p style="margin:12px 0 4px;font-weight:600;">Details needed</p><ul style="margin:0 0 12px;padding-left:20px;">${opts.fieldLabels.map((f) => `<li>${f}</li>`).join("")}</ul>`
      : "",
    opts.documentLabels.length
      ? `<p style="margin:12px 0 4px;font-weight:600;">Documents needed</p><ul style="margin:0 0 12px;padding-left:20px;">${opts.documentLabels.map((d) => `<li>${d}</li>`).join("")}</ul>`
      : "",
  ].join("");

  return sendBrevoEmail({
    to: [{ email: opts.to, name: opts.name ?? undefined }],
    ...springboardSender(),
    subject: `More information needed — ${opts.clientRef} (${opts.clientName})`,
    html: shell(
      "We need a little more information",
      `<p>${greeting}</p>
       <p>We're reviewing your referral <strong>${opts.clientRef} — ${opts.clientName}</strong> and need the following before we can go further.</p>
       <blockquote style="margin:16px 0;padding:12px 16px;background:#f5f6f8;border-left:3px solid ${AMBER};color:#1f2430;">${opts.message.replace(/</g, "&lt;")}</blockquote>
       ${lists}
       ${button(url, "Supply the details")}
       <p style="color:#6b7280;font-size:13px;">The portal will open just these items for you. The rest of the referral stays as you submitted it.</p>`,
    ),
    tags: ["introducer", "info-request"],
  });
}

/** Decision notice — accepted, declined, or a change we authorised. */
export async function sendReferralUpdateEmail(opts: {
  to: string;
  name: string | null;
  clientRef: string;
  clientName: string;
  headline: string;
  body: string;
  clientId: string;
}) {
  const url = `${portalBaseUrl()}/introducer/clients/${opts.clientId}`;
  const greeting = opts.name ? `Hi ${opts.name.split(" ")[0]},` : "Hi,";
  return sendBrevoEmail({
    to: [{ email: opts.to, name: opts.name ?? undefined }],
    ...springboardSender(),
    subject: `${opts.headline} — ${opts.clientRef} (${opts.clientName})`,
    html: shell(
      opts.headline,
      `<p>${greeting}</p>
       <p>${opts.body.replace(/</g, "&lt;")}</p>
       ${button(url, "View in the portal")}`,
    ),
    tags: ["introducer", "referral-update"],
  });
}

/** New-referral notification to the office, so a submission isn't sat on. */
export async function sendNewReferralNotice(opts: {
  to: string[];
  firmName: string;
  introducerName: string;
  clientRef: string;
  clientName: string;
  clientId: string;
}) {
  if (opts.to.length === 0) return { ok: false as const, error: "No recipients" };
  const url = `${portalBaseUrl()}/admin/introducers/submissions/${opts.clientId}`;
  return sendBrevoEmail({
    to: opts.to.map((email) => ({ email })),
    subject: `New introducer referral: ${opts.clientRef} — ${opts.clientName}`,
    html: internalShell(
      "New referral awaiting review",
      `<p><strong>${opts.firmName}</strong> (${opts.introducerName}) has submitted a client referral.</p>
       <p style="margin:4px 0;"><strong>${opts.clientRef}</strong> — ${opts.clientName}</p>
       <p style="color:#6b7280;font-size:13px;">Nothing has been created in the CRM yet. It stays in the review queue until it's accepted.</p>
       <p style="margin:24px 0;"><a href="${url}" style="background:#da9845;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block;">Review the referral</a></p>`,
      "Internal notification — NextKey CRM.",
    ),
    tags: ["introducer", "internal"],
  });
}
