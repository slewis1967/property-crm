import Frame from "../Frame";
import { requireSignedInPartnerPage } from "../session";
import { supabase } from "../../../utils/supabase";
import { PARTNER_AGREEMENT_VERSION, formatAbn, renderAgreement } from "../../../utils/partner-agreement";
import { formatLongDateTime } from "../../../utils/datetime";
import AgreementText from "./AgreementText";
import AcceptForm from "./AcceptForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Partner agreement — Partner Portal" };

/**
 * Before acceptance: the agreement (with this firm's tier filled in) and the
 * acceptance form. Every other portal page redirects here until then.
 * After acceptance: the text exactly as accepted, read back from the
 * acceptance record rather than re-rendered from today's code.
 */
export default async function PartnerAgreementPage() {
  const identity = await requireSignedInPartnerPage();

  if (identity.agreementAccepted) {
    const { data } = await supabase
      .from("partner_agreement_acceptances")
      .select("agreement_text,signer_name,signer_title,entity_name,abn,accepted_at,version")
      .eq("partner_id", identity.partnerId)
      .eq("version", PARTNER_AGREEMENT_VERSION)
      .order("accepted_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return (
      <Frame identity={identity}>
        <h1 className="text-2xl font-semibold text-gray-900">Partner agreement</h1>
        {data ? (
          <p className="mt-1 text-sm text-gray-600">
            Accepted for <strong>{data.entity_name}</strong> (ABN {formatAbn(data.abn)}) by {data.signer_name},{" "}
            {data.signer_title}, on {formatLongDateTime(data.accepted_at)}. Version {data.version}.
          </p>
        ) : (
          <p className="mt-1 text-sm text-gray-600">
            Your firm&apos;s signed agreement ({identity.agreementRef}
            {identity.agreementSignedAt ? `, ${formatLongDateTime(identity.agreementSignedAt)}` : ""}) is held by
            NextKey. Ask your NextKey contact for a copy.
          </p>
        )}
        {data && <AgreementText text={data.agreement_text} />}
      </Frame>
    );
  }

  const preview = renderAgreement({
    entityName: null,
    abn: identity.abn,
    noticeEmail: identity.email,
    tier: identity.tier,
    whiteLabel: identity.branding.whiteLabel,
  });

  return (
    <Frame identity={identity} locked>
      <h1 className="text-2xl font-semibold text-gray-900">Before you start: the partner agreement</h1>
      <p className="mt-1 max-w-3xl text-sm text-gray-600">
        {identity.firmName} needs to accept the NextKey Channel Partner Agreement ({PARTNER_AGREEMENT_VERSION}) before
        your team can use the portal. Please read it in full. It must be accepted by someone authorised to sign for
        your firm; once it is accepted, everyone on your team can use the portal.
      </p>
      <AgreementText text={preview} />
      <AcceptForm
        version={PARTNER_AGREEMENT_VERSION}
        defaultName={identity.fullName ?? ""}
        defaultAbn={identity.abn ? formatAbn(identity.abn) : ""}
        email={identity.email}
        accent={identity.branding.accentColor}
      />
    </Frame>
  );
}
