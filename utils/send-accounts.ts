/**
 * The business accounts a staff member can send an email from, each with the
 * From envelope, the signature it carries and where the sent copy is filed.
 * The composer's From picker lists these (GET /api/emails/sender) and
 * POST /api/emails sends with the one chosen (`from_identity`), so what the
 * user sees is exactly what goes out.
 *
 *   nextkey     → their own nextkey.com.au address + their own NextKey
 *                 signature (personal-sender.ts). Filed in their mailbox.
 *   springboard → hello@springboardhomes.com.au with the Springboard brand
 *                 signature: Glenn's name and work number, no NextKey logo or
 *                 disclaimer (brand firewall; Glenn is the only public
 *                 contact). Only for members of the Springboard shared
 *                 mailbox, and filed there so replies reach every member.
 *
 * Server-only (reads Supabase and env).
 */
import {
  defaultSignature,
  getOwnSignatureFields,
  hostSignature,
  type SignatureBlock,
} from "./email-signature";
import { resolveSender } from "./mail-owner";
import { MAIL_IDENTITY_LABELS, resolveIdentity, type MailIdentityKey } from "./mailIdentities";
import { personalSender } from "./personal-sender";
import { sharedMailboxFor } from "./shared-mailboxes";

export type SendAccount = {
  key: MailIdentityKey;
  /** Shown in the From picker. */
  label: string;
  fromEmail: string;
  fromName: string;
  /** owner_user_email for the sent row: the user, or the shared mailbox. */
  owner: string | null;
  /** Null when no signature is on file: the send must be refused. */
  signature: SignatureBlock | null;
};

export async function sendAccountsFor(user: string): Promise<SendAccount[]> {
  const accounts: SendAccount[] = [];

  const owner = await resolveSender(user);
  const own = owner ? await getOwnSignatureFields(owner) : null;
  const personal = owner ? personalSender(owner, own?.name) : null;
  const nk = resolveIdentity("nextkey");
  accounts.push({
    key: "nextkey",
    label: MAIL_IDENTITY_LABELS.nextkey,
    fromEmail: personal?.fromEmail ?? process.env.BREVO_SENDER_EMAIL ?? nk.fromEmail,
    fromName: personal?.fromName ?? process.env.BREVO_SENDER_NAME ?? nk.fromName,
    owner,
    signature: await defaultSignature(owner ?? user),
  });

  const sb = sharedMailboxFor(user, "springboard");
  if (sb) {
    const id = resolveIdentity("springboard");
    accounts.push({
      key: "springboard",
      label: MAIL_IDENTITY_LABELS.springboard,
      fromEmail: id.fromEmail,
      fromName: id.fromName,
      owner: sb.address,
      signature: await hostSignature({ email: user, brand: "springboard" }),
    });
  }

  return accounts;
}
