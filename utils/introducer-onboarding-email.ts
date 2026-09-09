/**
 * Introducer onboarding — outbound email.
 *
 * Separate from utils/introducer-email.ts because the recipient is different in
 * a way that matters: they are not an introducer, have signed nothing, and owe
 * us nothing. The tone reflects that. The chrome is shared (imported, not
 * copied) so the brand does not drift between invitation and accreditation.
 *
 * TRANSACTIONAL, NOT COMMERCIAL — but the line is finer here than for the portal
 * emails. This is the one send in the whole flow that goes to someone who has
 * not yet asked us for anything, so it is only ever sent to a person a super
 * admin has deliberately entered into the panel, one at a time. It is not a
 * campaign and must never become one: a bulk path to this function would be an
 * unsolicited commercial message under the Spam Act.
 */
import { sendBrevoEmail } from "./brevo";
import { shell, button } from "./introducer-email";
import { ROADMAP } from "./introducer-onboarding";

function springboardSender() {
  return {
    fromEmail: process.env.SPRINGBOARD_SENDER_EMAIL ?? "hello@springboardhomes.com.au",
    fromName: process.env.SPRINGBOARD_SENDER_NAME ?? "Springboard Homes",
  };
}

const firstName = (full: string) => full.trim().split(/\s+/)[0] || "there";

/** The steps, as a plain list, so the email says the same thing as the page. */
function stepList(): string {
  return `<ol style="margin:12px 0 0;padding-left:20px;color:#1f2430;">${ROADMAP.map(
    (s) => `<li style="margin:4px 0;">${s.title}</li>`,
  ).join("")}</ol>`;
}

/**
 * The first contact. Carries the flyer as the pitch and one personalised link
 * into the roadmap — deliberately ONE link, because an email with four calls to
 * action gets none of them clicked.
 */
export async function sendOnboardingInviteEmail(opts: {
  to: string;
  legalName: string;
  firmName?: string | null;
  rawToken: string;
  origin: string;
}) {
  const url = `${opts.origin.replace(/\/+$/, "")}/introducer/onboarding/${encodeURIComponent(opts.rawToken)}`;

  return sendBrevoEmail({
    to: [{ email: opts.to, name: opts.legalName }],
    ...springboardSender(),
    subject: "Becoming a Springboard introducer — start here",
    html: shell(
      "Your accreditation starts here",
      `<p>Hi ${firstName(opts.legalName)},</p>
       <p>We'd like to accredit ${opts.firmName ? `<strong>${opts.firmName}</strong>` : "you"} as a Springboard introducer,
          so you can refer clients to the Community Funding Program and follow their progress.</p>
       <p>Accreditation is genuinely a process rather than a form — there are six steps, and this link
          takes you to all of them and shows you where you are at any point:</p>
       ${stepList()}
       ${button(url, "Open your accreditation")}
       <p style="color:#6b7280;font-size:13px;">Work through it at your own pace; the link stays live and
          remembers where you got to. The course takes a few hours and the exam is 100% to pass, with as
          many attempts as you need.</p>`,
      `This link is personal to ${opts.to} — please don't forward it. If you weren't expecting this email, ignore it and nothing will happen.`,
      "Introducer accreditation",
    ),
    tags: ["introducer", "onboarding", "invite"],
  });
}

/** Sent when a step opens, so nobody has to remember to go back and check. */
export async function sendOnboardingStepEmail(opts: {
  to: string;
  legalName: string;
  rawToken: string;
  origin: string;
  heading: string;
  body: string;
  cta?: string;
}) {
  const url = `${opts.origin.replace(/\/+$/, "")}/introducer/onboarding/${encodeURIComponent(opts.rawToken)}`;

  return sendBrevoEmail({
    to: [{ email: opts.to, name: opts.legalName }],
    ...springboardSender(),
    subject: opts.heading,
    html: shell(
      opts.heading,
      `<p>Hi ${firstName(opts.legalName)},</p>
       <p>${opts.body}</p>
       ${button(url, opts.cta ?? "Continue your accreditation")}`,
      `This link is personal to ${opts.to} — please don't forward it.`,
      "Introducer accreditation",
    ),
    tags: ["introducer", "onboarding", "step"],
  });
}

/**
 * Send the confidentiality agreement out for electronic signature.
 *
 * Points at `/sign/<token>` — the document itself — rather than the onboarding
 * roadmap. Staff clicking "Send for e-signature" mean "put the agreement in
 * front of them", and one more hop through a progress page is one more place to
 * lose someone. They can still reach it from their onboarding link either way.
 */
export async function sendNdaSigningEmail(opts: {
  to: string;
  legalName: string;
  rawToken: string;
  origin: string;
}) {
  const url = `${opts.origin.replace(/\/+$/, "")}/sign/${encodeURIComponent(opts.rawToken)}`;

  return sendBrevoEmail({
    to: [{ email: opts.to, name: opts.legalName }],
    ...springboardSender(),
    subject: "Please sign your confidentiality agreement",
    html: shell(
      "Your confidentiality agreement",
      `<p>Hi ${firstName(opts.legalName)},</p>
       <p>Before we share the programme details with you, we both sign a mutual
          confidentiality agreement. It runs both ways: it covers what we tell you,
          and what you tell us.</p>
       <p>You'll read it in full and sign it on screen. Nothing is committed until
          you do.</p>
       ${button(url, "Read and sign the agreement")}`,
      `This link is personal to ${opts.to} — please don't forward it.`,
      "Introducer accreditation",
    ),
    tags: ["introducer", "onboarding", "nda"],
  });
}

/**
 * Send one of the two agreement documents out for signature.
 *
 * Points at `/sign/<token>` — the document itself — for the same reason the NDA
 * email does: staff clicking "Send for e-signature" mean "put it in front of
 * them", and one more hop through a progress page is one more place to lose
 * someone.
 *
 * SAYS WHICH DOCUMENT, AND WHETHER ANOTHER FOLLOWS. Two instruments are signed
 * here, one at a time, and someone who thinks they have finished when they have
 * signed the first will not come back for the second. `remaining` is what makes
 * that visible, so the email can promise the second one rather than spring it.
 */
export async function sendAgreementSigningEmail(opts: {
  to: string;
  legalName: string;
  label: string;
  rawToken: string;
  origin: string;
  accreditationNo?: string | null;
  remaining: number;
}) {
  const url = `${opts.origin.replace(/\/+$/, "")}/sign/${encodeURIComponent(opts.rawToken)}`;
  const more = opts.remaining > 1;

  return sendBrevoEmail({
    to: [{ email: opts.to, name: opts.legalName }],
    ...springboardSender(),
    subject: `Please sign your ${opts.label.toLowerCase()}`,
    html: shell(
      opts.label,
      `<p>Hi ${firstName(opts.legalName)},</p>
       <p>The last step of your accreditation is signing the introducer agreement and commission
          schedule${opts.accreditationNo ? `, which cite your accreditation number <strong>${opts.accreditationNo}</strong>` : ""}.</p>
       <p>You'll read the <strong>${opts.label}</strong> in full on screen and sign it there. Nothing is
          committed until you do.</p>
       ${
         more
           ? `<p style="color:#6b7280;font-size:13px;">There is one more document after this one. We'll
                bring it up as soon as this is signed — you don't need a second email.</p>`
           : `<p style="color:#6b7280;font-size:13px;">This is the last one. Your portal access opens as
                soon as it's executed.</p>`
       }
       ${button(url, `Read and sign the ${opts.label.toLowerCase()}`)}`,
      `This link is personal to ${opts.to} — please don't forward it.`,
      "Introducer accreditation",
    ),
    tags: ["introducer", "onboarding", "agreement"],
  });
}

/**
 * An amended document, and why it is being sent again.
 *
 * THE SUBJECT LINE HAS ONE JOB: stop this being read as a duplicate. Someone
 * who signed an agreement last week and sees another one will assume a system
 * glitch and leave it — so the reason leads, in the subject and in the first
 * line, and the mail says plainly that the earlier signature is not lost.
 */
/** Contract text goes into an HTML email — escape it rather than trusting it. */
function escapeHtml(v: string): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

export async function sendAmendedDocumentEmail(opts: {
  to: string;
  legalName: string;
  rawToken: string;
  origin: string;
  docLabel: string;
  reason: string;
  signedOn: string;
}) {
  const url = `${opts.origin.replace(/\/+$/, "")}/sign/${encodeURIComponent(opts.rawToken)}`;

  return sendBrevoEmail({
    to: [{ email: opts.to, name: opts.legalName }],
    ...springboardSender(),
    subject: `Please re-sign: we have corrected your ${opts.docLabel}`,
    html: shell(
      `A corrected ${opts.docLabel}`,
      `<p>Hi ${firstName(opts.legalName)},</p>
       <p>We have found an error in the ${escapeHtml(opts.docLabel)}${
         opts.signedOn ? ` you signed on ${escapeHtml(opts.signedOn)}` : " you signed"
       }, and need you to sign a corrected version. This is not a duplicate and it is not a system
          error — please do not ignore it.</p>
       <p><strong>What was wrong:</strong> ${escapeHtml(opts.reason)}</p>
       <p>Nothing you have already done is lost. The version you signed is kept with your records,
          and it remains the agreement between us until you sign this one. The correction is
          highlighted at the top of the document.</p>
       ${button(url, `Read and sign the corrected ${opts.docLabel.toLowerCase()}`)}
       <p>If anything in it is not what you understood, reply to this email before signing rather
          than after.</p>`,
      `This link is personal to ${opts.to} — please don't forward it.`,
      "Introducer accreditation",
    ),
    tags: ["introducer", "onboarding", "amendment"],
  });
}

/**
 * Accreditation passed. Separate from the step email because it is the one
 * moment in the flow worth marking — and because it carries the number they
 * will quote from then on.
 *
 * CARRIES THE CERTIFICATE, when there is one. This used to say the certificate
 * was "attached to your accreditation page" and attach nothing, which sent a
 * newly accredited person off to fetch the one document they actually want —
 * and left them with nothing at all on the day the link in this email went
 * stale. A certificate is a thing you keep, so it is sent as a file.
 *
 * `certificate` is optional because the two callers arrive here at different
 * moments: the exam webhook fires on the pass itself, when the number exists
 * and the PDF does not, and the certificate route fires once it has rendered
 * one. The copy says which of those happened rather than promising an
 * attachment that is not there.
 */
export async function sendAccreditationPassedEmail(opts: {
  to: string;
  legalName: string;
  accreditationNo: string;
  rawToken: string;
  origin: string;
  certificate?: { filename: string; base64: string };
}) {
  const url = `${opts.origin.replace(/\/+$/, "")}/introducer/onboarding/${encodeURIComponent(opts.rawToken)}`;

  return sendBrevoEmail({
    to: [{ email: opts.to, name: opts.legalName }],
    ...springboardSender(),
    subject: `You've passed — accreditation ${opts.accreditationNo}`,
    html: shell(
      "You're accredited",
      `<p>Hi ${firstName(opts.legalName)},</p>
       <p>You passed the Springboard introducer accreditation exam. ${
         opts.certificate
           ? "Your certificate is attached to this email — keep a copy."
           : "Your certificate is being prepared and will follow shortly."
       } Your number is:</p>
       <p style="margin:16px 0;font-size:20px;font-weight:700;letter-spacing:0.03em;color:#020e40;">${opts.accreditationNo}</p>
       <p>There's one step left — signing the introducer agreement and commission schedule. Once that's
          done your portal access opens automatically.</p>
       ${button(url, "Sign the agreement")}`,
      `This link is personal to ${opts.to} — please don't forward it.`,
      "Introducer accreditation",
    ),
    attachments: opts.certificate
      ? [{ name: opts.certificate.filename, content: opts.certificate.base64 }]
      : undefined,
    tags: ["introducer", "onboarding", "passed"],
  });
}
