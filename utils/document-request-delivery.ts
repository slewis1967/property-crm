/**
 * Who actually receives a document-request link, and how the popover says so.
 *
 * Compliance requires each applicant to supply their OWN documents, so an
 * applicant with no address on file is a real gap the rep has to close by hand.
 * The popover used to hide that behind a single willSend flag: it went true as
 * soon as ANY applicant had an address, so the button read "Send links" while
 * only one person was actually emailed and the other silently got a link the
 * rep never delivered.
 *
 * Kept out of the component so the wording is unit-testable -- there is no
 * component-render setup in this repo (vitest runs in a node environment).
 */

export type Delivery = {
  /** Applicants who will be emailed their link automatically. */
  sendCount: number;
  /** Applicants who only get a link the rep must deliver themselves. */
  linkOnlyCount: number;
};

/** Split a set of applicant addresses into emailed vs link-only. Blank, missing
 *  and whitespace-only addresses all count as "no email on file". */
export function describeDelivery(emails: (string | null | undefined)[]): Delivery {
  const sendCount = emails.filter((e) => (e ?? "").trim()).length;
  return { sendCount, linkOnlyCount: emails.length - sendCount };
}

/** The action button's label. Never claims to be sending when part of the set is
 *  only getting a link: "Send 2 links", "Create link", "Send 1 link, create 1". */
export function deliveryActionLabel({ sendCount, linkOnlyCount }: Delivery): string {
  const noun = (n: number) => (n === 1 ? "link" : "links");
  if (sendCount && linkOnlyCount) {
    return `Send ${sendCount} ${noun(sendCount)}, create ${linkOnlyCount}`;
  }
  if (sendCount) return `Send ${noun(sendCount)}`;
  return `Create ${noun(linkOnlyCount)}`;
}
