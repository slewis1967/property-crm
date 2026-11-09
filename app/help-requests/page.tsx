import { currentUserEmail } from "../../utils/cf-access";
import { isSuperAdmin } from "../../utils/super-admin";
import { HELP_RULES } from "../../utils/help/requests";
import HelpRequestsClient from "./HelpRequestsClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Help requests — NextKey CRM" };

export default async function HelpRequestsPage() {
  const email = await currentUserEmail();
  return <HelpRequestsClient viewerIsSuperAdmin={isSuperAdmin(email)} rules={HELP_RULES} />;
}
