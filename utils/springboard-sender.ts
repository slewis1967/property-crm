/**
 * Who Springboard's outbound mail comes from.
 *
 * The document-collection clients are SPRINGBOARD HOMES' — the community-funding
 * product — not NextKey's, and Your Loan Assist know this business through
 * Springboard and the COMP-8317 introducer chain. Mail that leaves from a
 * NextKey address confuses both the client and the Licensor about who they are
 * dealing with.
 *
 * hello@springboardhomes.com.au is a domain-authenticated sender on the shared
 * Brevo account. Every value is env-overridable so the identity can move
 * without a deploy.
 */

export function springboardSenderEmail(): string {
  return process.env.SPRINGBOARD_SENDER_EMAIL || "hello@springboardhomes.com.au";
}

export function springboardSenderName(): string {
  return process.env.SPRINGBOARD_SENDER_NAME || "Glenn Mayes — Springboard Homes";
}

export function springboardReplyTo(): string {
  return process.env.SPRINGBOARD_REPLY_TO || "hello@springboardhomes.com.au";
}
