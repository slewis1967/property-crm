import { currentUserEmail } from "../../../utils/cf-access";
import { isSuperAdmin } from "../../../utils/super-admin";
import { supabase } from "../../../utils/supabase";
import { feeRuleFromEnv } from "../../../utils/partner";
import AdminPartners from "./AdminPartners";

// STAFF page — behind Cloudflare Access with the rest of the CRM. Deliberately
// at /admin/partners, a different subtree from the public /partner portal, so
// no edit to the proxy carve-out can drag it outside the gate.
export const dynamic = "force-dynamic";
export const metadata = { title: "Partners — NextKey CRM" };

export default async function AdminPartnersPage() {
  const email = await currentUserEmail();
  // Recruitment prospects from /channel-partners, to pre-fill onboarding. That
  // table may not exist on every environment; an empty list is fine.
  const { data: prospects } = await supabase
    .from("channel_partners")
    .select("id,company,contact_name,email,phone")
    .order("company", { ascending: true });

  return (
    <AdminPartners
      viewerIsSuperAdmin={isSuperAdmin(email)}
      feeRule={feeRuleFromEnv()}
      prospects={(prospects ?? []) as { id: string; company: string; contact_name: string | null; email: string | null; phone: string | null }[]}
    />
  );
}
