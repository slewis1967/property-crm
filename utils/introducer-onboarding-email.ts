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
 * Accreditation passed. Separate from the step email because it is the one
 * moment in the flow worth marking — and because it carries the number they
 * will quote from then on.
 */
export async function sendAccreditationPassedEmail(opts: {
  to: string;
  legalName: string;
  accreditationNo: string;
  rawToken: string;
  origin: string;
}) {
  const url = `${opts.origin.replace(/\/+$/, "")}/introducer/onboarding/${encodeURIComponent(opts.rawToken)}`;

  return sendBrevoEmail({
    to: [{ email: opts.to, name: opts.legalName }],
    ...springboardSender(),
    subject: `You've passed — accreditation ${opts.accreditationNo}`,
    html: shell(
      "You're accredited",
      `<p>Hi ${firstName(opts.legalName)},</p>
       <p>You passed the Springboard introducer accreditation exam. Your certificate is attached to your
          accreditation page, and your number is:</p>
       <p style="margin:16px 0;font-size:20px;font-weight:700;letter-spacing:0.03em;color:#020e40;">${opts.accreditationNo}</p>
       <p>There's one step left — signing the introducer agreement and commission schedule. Once that's
          done your portal access opens automatically.</p>
       ${button(url, "Sign the agreement")}`,
      `This link is personal to ${opts.to} — please don't forward it.`,
      "Introducer accreditation",
    ),
    tags: ["introducer", "onboarding", "passed"],
  });
}
