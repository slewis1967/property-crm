/**
 * tel: / sms: hrefs for the phone view (/m).
 *
 * Contact phones are stored however they were typed or imported: "0412 345 678",
 * "+61 412-345-678", "(07) 3123 4567", sometimes with a trailing note. A dialler
 * copes with most of that, but an sms: link with spaces or brackets can open an
 * empty compose screen on iOS, so both links are built from digits only (plus a
 * leading "+" when the number was stored in international form).
 */

/** Digits of a phone number, keeping a leading "+". Null when there aren't enough digits to dial. */
export function dialable(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 6) return null;
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

export function telHref(raw: string | null | undefined): string | null {
  const n = dialable(raw);
  return n ? `tel:${n}` : null;
}

export function smsHref(raw: string | null | undefined): string | null {
  const n = dialable(raw);
  return n ? `sms:${n}` : null;
}
