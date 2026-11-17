/**
 * POST /api/partner/agreement — the signed-in partner accepts the current
 * partner agreement for their firm.
 *   Body: { version, signerName, signerTitle, entityName, abn, readAgreement: true, hasAuthority: true }
 *
 * PUBLIC (session-scoped). The one partner API that works before the firm has
 * accepted (requirePartner allowWithoutAgreement); everything else is closed
 * until this succeeds.
 *
 * Order matters: the acceptance row (the signature record) is written FIRST,
 * then the firm is stamped. If the stamp fails, the evidence still exists and
 * a retry stamps it; the reverse order could open the portal with no record of
 * who agreed to what.
 */
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { clientIp } from "../../../../utils/partner-auth";
import {
  PARTNER_AGREEMENT_VERSION,
  formatAbn,
  parseAcceptance,
  renderAgreement,
  unfilledBlanks,
} from "../../../../utils/partner-agreement";
import { formatLongDateTime } from "../../../../utils/datetime";
import {
  partnerNotifyRecipients,
  sendAgreementAcceptedEmail,
  sendAgreementAcceptedNotice,
} from "../../../../utils/partner-email";
import { enforceRateLimit } from "../../../../utils/rate-limit";
import { logPartnerEvent, readJson, requirePartner } from "../_shared";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const limited = enforceRateLimit(req, {
    windowMs: 60_000,
    max: 10,
    keyFn: () => `partner-agreement:${clientIp(req) ?? "unknown"}`,
  });
  if (limited) return limited;

  const auth = await requirePartner({ allowWithoutAgreement: true });
  if (auth instanceof NextResponse) return auth;

  if (auth.agreementAccepted) {
    return NextResponse.json({ ok: true, alreadyAccepted: true });
  }

  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const parsed = parseAcceptance(body);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  const input = parsed.value;

  const agreementText = renderAgreement({
    entityName: input.entityName,
    abn: input.abn,
    noticeEmail: auth.email,
    tier: auth.tier,
    whiteLabel: auth.branding.whiteLabel,
  });
  const blanks = unfilledBlanks(agreementText);
  if (blanks.length > 0) {
    // A template edit that broke the fill-in must never be signed with gaps in it.
    console.error("[partner-agreement] unfilled blanks", blanks);
    return NextResponse.json({ ok: false, error: "The agreement could not be prepared. Please contact NextKey." }, { status: 500 });
  }
  const textSha256 = createHash("sha256").update(agreementText, "utf8").digest("hex");
  const acceptedAt = new Date().toISOString();

  const { data: row, error: insertErr } = await supabase
    .from("partner_agreement_acceptances")
    .insert({
      partner_id: auth.partnerId,
      partner_user_id: auth.userId,
      version: PARTNER_AGREEMENT_VERSION,
      agreement_text: agreementText,
      text_sha256: textSha256,
      signer_name: input.signerName,
      signer_title: input.signerTitle,
      signer_email: auth.email,
      entity_name: input.entityName,
      abn: input.abn,
      ip: clientIp(req),
      user_agent: (req.headers.get("user-agent") ?? "").slice(0, 400) || null,
      accepted_at: acceptedAt,
    })
    .select("id")
    .single();
  if (insertErr || !row) {
    console.error("[partner-agreement] acceptance insert failed", insertErr?.message);
    return NextResponse.json({ ok: false, error: "Could not record your acceptance. Please try again." }, { status: 500 });
  }

  const firmPatch: Record<string, unknown> = {
    agreement_ref: PARTNER_AGREEMENT_VERSION,
    agreement_signed_at: acceptedAt,
    updated_at: acceptedAt,
  };
  if (!auth.abn) firmPatch.abn = input.abn;
  const { error: stampErr } = await supabase.from("partners").update(firmPatch).eq("id", auth.partnerId);
  if (stampErr) {
    console.error("[partner-agreement] firm stamp failed", stampErr.message);
    return NextResponse.json({ ok: false, error: "Your acceptance was recorded but the portal could not be opened. Please try again." }, { status: 500 });
  }

  await logPartnerEvent({
    partnerId: auth.partnerId,
    actorType: "partner",
    actor: auth.email,
    action: "agreement_accepted",
    detail: {
      acceptance_id: row.id,
      version: PARTNER_AGREEMENT_VERSION,
      text_sha256: textSha256,
      signer_name: input.signerName,
      signer_title: input.signerTitle,
      entity_name: input.entityName,
      abn: input.abn,
    },
  });

  // Best-effort mail: the acceptance is already the business fact.
  const results = await Promise.allSettled([
    sendAgreementAcceptedEmail({
      to: auth.email,
      name: input.signerName,
      firmName: auth.firmName,
      entityName: input.entityName,
      version: PARTNER_AGREEMENT_VERSION,
      acceptedAt: formatLongDateTime(acceptedAt),
    }),
    sendAgreementAcceptedNotice({
      to: partnerNotifyRecipients(),
      firmName: auth.firmName,
      entityName: input.entityName,
      abn: formatAbn(input.abn),
      signer: `${input.signerName}, ${input.signerTitle} (${auth.email})`,
      version: PARTNER_AGREEMENT_VERSION,
    }),
  ]);
  for (const r of results) {
    if (r.status === "rejected") console.error("[partner-agreement] email failed", r.reason);
  }

  return NextResponse.json({ ok: true });
}
