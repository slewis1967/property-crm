import { currentUserEmail } from "../../../utils/cf-access";
import { isSuperAdmin } from "../../../utils/super-admin";
import AdminIntroducers from "./AdminIntroducers";

// STAFF page — behind Cloudflare Access with the rest of the CRM. Deliberately
// at /admin/introducers, a different subtree from the public /introducer portal,
// so no future edit to the proxy carve-out can drag it outside the gate.
export const dynamic = "force-dynamic";

export const metadata = { title: "Introducers — NextKey CRM" };

export default async function AdminIntroducersPage() {
  const email = await currentUserEmail();
  return <AdminIntroducers viewerIsSuperAdmin={isSuperAdmin(email)} />;
}
