/**
 * Which address a staff member's own email goes out from.
 *
 * Sean, 11 Nov 2026: "Send Email" on a client or opportunity page must send
 * from the address of the person who is logged in, not the shared NextKey
 * sender. Brevo only delivers from validated senders or authenticated
 * domains, so the user's address is used only when its domain is one Brevo
 * has authenticated (nextkey.com.au, checked 11 Nov 2026). Anyone else, and
 * system mail with no user, keeps the default sender.
 *
 * Pure: the route passes in the resolved user and their saved signature.
 */

/** Domains authenticated in the Brevo account (SPF/DKIM), so any mailbox on them can be the From. */
export function authenticatedSenderDomains(env: Record<string, string | undefined> = process.env): string[] {
  const raw = env.BREVO_AUTHENTICATED_DOMAINS?.trim() || "nextkey.com.au";
  return raw
    .split(/[,\s]+/)
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

export type PersonalSender = { fromEmail: string; fromName: string };

/**
 * The From envelope for a user's own send, or null when we can't send as them
 * (unknown user, or a domain Brevo hasn't authenticated).
 *
 * @param userEmail the registered CRM user (resolved alias), not a raw header
 * @param signatureName the name on that user's own saved signature, if any
 */
export function personalSender(
  userEmail: string | null | undefined,
  signatureName: string | null | undefined,
  domains: string[] = authenticatedSenderDomains(),
): PersonalSender | null {
  const email = userEmail?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  const domain = email.slice(email.lastIndexOf("@") + 1);
  if (!domains.includes(domain)) return null;
  const name = signatureName?.trim() || nameFromAddress(email);
  return { fromEmail: email, fromName: name };
}

/** "glenn.m@nextkey.com.au" → "Glenn M"; a fallback when no signature name is saved. */
export function nameFromAddress(email: string): string {
  const local = email.split("@")[0] ?? "";
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(" ");
}
