import { redirect } from "next/navigation";
import { currentPartner } from "./session";
import LoginForm from "./LoginForm";

// PUBLIC page — no Cloudflare Access identity. Reachable once the CF Access
// BYPASS app covers /partner and /api/partner (see isPublicPartnerRoute in
// proxy.ts). Renders standalone: no CRM chrome.
export const dynamic = "force-dynamic";

export default async function PartnerLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await currentPartner()) redirect("/partner/stock");
  const { error } = await searchParams;
  return <LoginForm initialError={error ?? null} />;
}
