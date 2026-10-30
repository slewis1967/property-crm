/**
 * "Is this contact detail real?" for public, no-login lead forms (the self-book
 * page). Same rules as the NextKey Lead Check WordPress plugin on the marketing
 * sites (~/wp-plugins/nextkey-lead-check), so a fake refused there is refused
 * here. Sean's call (30 Oct 2026): check details are real, no SMS or email codes,
 * so this cannot prove a number or address belongs to the person.
 *
 * Server-side only: it pulls in node:dns and the 10,000-line throwaway list.
 */
import { promises as dns } from "node:dns";
import { DISPOSABLE_DOMAINS } from "./disposable-domains";
import { suggestEmailCorrection } from "./email-typo";

export type PhoneKind = "au_mobile" | "au_landline" | "overseas";

export type CheckResult = { ok: true; kind?: PhoneKind } | { ok: false; message: string };

/** Common made-up numbers, including the one we used to test forms with. */
const FAKE_NUMBERS = new Set([
  "0400000000", "0412345678", "0423456789", "0498765432", "0400123456", "0401234567", "0411222333",
]);

/** One digit repeated, or a straight run up or down: 00000000, 12345678, 98765432. */
function isFakePattern(digits: string): boolean {
  if (digits.length < 6) return false;
  if (/^(\d)\1+$/.test(digits)) return true;
  let up = true;
  let down = true;
  for (let i = 1; i < digits.length; i++) {
    const d = Number(digits[i]) - Number(digits[i - 1]);
    up = up && (d === 1 || d === -9);
    down = down && (d === -1 || d === 9);
  }
  return up || down;
}

/**
 * Australian numbers must be a 10-digit mobile (04) or landline (02/03/07/08) and
 * not an obvious fake. Overseas numbers need a leading + and 8–15 digits, because
 * some of our buyers are overseas.
 */
export function checkPhone(raw: string): CheckResult {
  const value = raw.trim();
  const digits = value.replace(/\D/g, "");
  if (!digits) return { ok: false, message: "Please enter your phone number." };

  const plus = value.startsWith("+");
  let national = digits;
  if (digits.startsWith("61") && (plus || digits.length === 11)) {
    national = `0${digits.slice(2)}`;
  } else if (plus) {
    if (digits.length < 8 || digits.length > 15 || isFakePattern(digits)) {
      return { ok: false, message: "Please enter a real phone number, including the country code." };
    }
    return { ok: true, kind: "overseas" };
  }

  if (national.length !== 10 || national[0] !== "0") {
    return {
      ok: false,
      message: "Please enter a 10-digit Australian number (mobiles start 04), or an overseas number starting with +.",
    };
  }
  if (FAKE_NUMBERS.has(national) || isFakePattern(national.slice(2))) {
    return { ok: false, message: "Please enter your real phone number so we can reach you." };
  }
  if (national[1] === "4") return { ok: true, kind: "au_mobile" };
  if (["2", "3", "7", "8"].includes(national[1])) return { ok: true, kind: "au_landline" };
  return { ok: false, message: "Please enter an Australian mobile (04…) or landline, or an overseas number starting with +." };
}

/** The DNS lookups {@link checkEmail} needs; swapped out in tests. */
export type MailResolver = {
  resolveMx: (domain: string) => Promise<unknown[]>;
  resolve4: (domain: string) => Promise<unknown[]>;
};

/** DNS answered and there is no such record. Anything else (timeout, SERVFAIL) is not an answer. */
function isNoRecord(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === "ENOTFOUND" || code === "ENODATA";
}

const DNS_TIMEOUT_MS = 3000;

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("dns timeout")), DNS_TIMEOUT_MS)),
  ]);
}

/**
 * Whether a domain can receive mail: MX records, or an A record as the fallback
 * mail host. Fails OPEN: only a clear "no such record" counts as no. A resolver
 * hiccup must never turn a genuine lead away.
 */
async function domainTakesMail(domain: string, resolver: MailResolver): Promise<boolean> {
  try {
    const mx = await withTimeout(resolver.resolveMx(domain));
    if (mx.length > 0) return true;
  } catch (err) {
    if (!isNoRecord(err)) return true;
  }
  try {
    const a = await withTimeout(resolver.resolve4(domain));
    return a.length > 0;
  } catch (err) {
    return !isNoRecord(err);
  }
}

/**
 * Refuses throwaway addresses, mistyped providers ("Did you mean gmail.com?") and
 * domains that can't receive mail. The typo hint blocks here, unlike the staff
 * signing panel where it only warns: nobody is reviewing a public form, and a
 * typo'd provider often accepts mail, so the invite would silently go to a stranger.
 */
export async function checkEmail(raw: string, resolver: MailResolver = dns): Promise<CheckResult> {
  const email = raw.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, message: "Please enter a valid email address." };
  }
  const domain = email.slice(at + 1);

  const suggestion = suggestEmailCorrection(email);
  if (suggestion) {
    return { ok: false, message: `Please check your email address. Did you mean ${suggestion}?` };
  }

  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    if (DISPOSABLE_DOMAINS.has(parts.slice(i).join("."))) {
      return { ok: false, message: "Please use your everyday email address, not a temporary one." };
    }
  }

  if (!(await domainTakesMail(domain, resolver))) {
    return { ok: false, message: "That email address can't receive mail. Please check it." };
  }
  return { ok: true };
}
