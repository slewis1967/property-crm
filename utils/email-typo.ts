/**
 * "Did you mean gmail.com?" — catches a mistyped mailbox provider before a
 * signing link is sent to it. Pure (no imports), so the "use client" send modal
 * and any server route can share it.
 *
 * WHY THIS EXISTS: a typo'd provider domain does not bounce. `gmai.com`,
 * `gmial.com`, `hotmial.com` and friends are registered and accept mail, so
 * Brevo reports "delivered", the request sits at "Sent", and the client never
 * sees the link — while a link to their document sits in a stranger's mailbox.
 * Nothing downstream can detect it; the only place to stop it is before send.
 *
 * It is a WARNING, never a block. A business domain one letter away from a
 * provider is rare but real, and the person sending knows their client.
 */

/**
 * Providers we see in client email addresses. A domain in this list is never
 * flagged, which is why real providers that sit one edit from a bigger one
 * (mail.com, ymail.com, email.com vs gmail.com) are listed too.
 */
const KNOWN_DOMAINS = [
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "hotmail.com.au",
  "hotmail.co.uk",
  "outlook.com",
  "outlook.com.au",
  "live.com",
  "live.com.au",
  "msn.com",
  "yahoo.com",
  "yahoo.com.au",
  "yahoo.co.uk",
  "ymail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "mail.com",
  "email.com",
  "protonmail.com",
  "proton.me",
  "bigpond.com",
  "bigpond.com.au",
  "bigpond.net.au",
  "optusnet.com.au",
  "iinet.net.au",
  "internode.on.net",
  "tpg.com.au",
  "westnet.com.au",
  "ozemail.com.au",
];

/**
 * Short domains are too close to too many unrelated things for a one-edit
 * match to mean anything ("me.com" is one edit from half the internet).
 */
const MIN_MATCH_LENGTH = 8;

/**
 * True when `a` and `b` differ by exactly one edit: one character substituted,
 * inserted or deleted, or two adjacent characters swapped (the commonest typo,
 * and the reason plain Levenshtein is not enough — "gmial" is two edits there).
 */
function oneEditApart(a: string, b: string): boolean {
  if (a === b) return false;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > 1) return false;

  let i = 0;
  while (i < la && i < lb && a[i] === b[i]) i++;

  if (la === lb) {
    // Substitution, or a swap of the two characters at the first difference.
    if (a.slice(i + 1) === b.slice(i + 1)) return true;
    return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
  }
  // One is longer by a single character: skip it and the rest must match.
  return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

/**
 * The address the sender probably meant, or null when the domain looks fine.
 * Returns the whole corrected address (local part untouched) so the caller can
 * drop it straight into the field.
 */
export function suggestEmailCorrection(email: string): string | null {
  const trimmed = (email ?? "").trim();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return null;

  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1).toLowerCase();
  if (KNOWN_DOMAINS.includes(domain)) return null;

  for (const known of KNOWN_DOMAINS) {
    if (known.length < MIN_MATCH_LENGTH) continue;
    if (oneEditApart(domain, known)) return `${local}@${known}`;
  }
  return null;
}

/**
 * Strip the stray punctuation that comes along when an address is pasted out of
 * a list or a sentence ("a@b.com," / "a@b.com;"). The loose email check accepts
 * a trailing comma, so without this it is stored and sent as typed.
 */
export function tidyEmail(email: string): string {
  return (email ?? "").trim().replace(/[,;]+$/, "").trim();
}
