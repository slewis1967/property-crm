/**
 * Shared mailboxes in the CRM inbox.
 *
 * Personal mail is scoped to the signed-in user (email_log.owner_user_email =
 * their Cloudflare Access email). A shared mailbox is a business address that
 * several staff work together: its rows carry the mailbox ADDRESS as
 * owner_user_email — stamped by the NEXUS feeder elvis_springboard_inbound.py
 * for inbound mail, and by POST /api/emails for replies sent from the shared
 * view — and every member may read and triage them.
 *
 * Read/star/archive state lives on the row, so it is shared like a shared Gmail
 * inbox: if Glenn archives a Springboard thread it is archived for Sean too.
 *
 * Keep `address` in sync with SPRINGBOARD_IMAP_EMAIL on the feeder.
 */
import type { MailIdentityKey } from "./mailIdentities";

export type SharedMailbox = {
  /** URL key: /inbox?mailbox=<key>. */
  key: string;
  /** The mailbox address — also the owner_user_email stamped on its rows. */
  address: string;
  label: string;
  /** Sending identity for replies from this mailbox. */
  identity: MailIdentityKey;
  /** Cloudflare Access emails (lowercase) allowed to see it. */
  members: readonly string[];
};

export const SHARED_MAILBOXES: readonly SharedMailbox[] = [
  {
    key: "springboard",
    address: "hello@springboardhomes.com.au",
    label: "Springboard",
    identity: "springboard",
    members: ["sean.l@nextkey.com.au", "glenn.m@nextkey.com.au"],
  },
];

function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

/** Shared mailboxes this user is a member of. */
export function mailboxesFor(user: string | null | undefined): SharedMailbox[] {
  const u = norm(user);
  if (!u) return [];
  return SHARED_MAILBOXES.filter((m) => m.members.includes(u));
}

/** The shared mailbox with this key, or null if unknown or the user isn't a member. */
export function sharedMailboxFor(
  user: string | null | undefined,
  key: string | null | undefined,
): SharedMailbox | null {
  if (!key) return null;
  return mailboxesFor(user).find((m) => m.key === key) ?? null;
}

/** Every owner_user_email the user may read or mutate: their own plus each shared mailbox they belong to. */
export function accessibleOwners(user: string): string[] {
  return [user, ...mailboxesFor(user).map((m) => m.address)];
}
