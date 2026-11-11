/**
 * GET /api/emails/sender: the business accounts the logged-in user can send
 * from (utils/send-accounts.ts), each with its From line and the signature it
 * appends, for the composer's From picker. POST /api/emails takes the chosen
 * key as `from_identity`.
 */
import { NextResponse } from "next/server";
import { requireAuth } from "../../../../utils/cf-access";
import { sendAccountsFor } from "../../../../utils/send-accounts";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const accounts = await sendAccountsFor(auth);
  return NextResponse.json({
    ok: true,
    accounts: accounts.map((a) => ({
      key: a.key,
      label: a.label,
      from_email: a.fromEmail,
      from_name: a.fromName,
      signature_html: a.signature?.html ?? null,
    })),
  });
}
