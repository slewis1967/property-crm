import { redirect } from "next/navigation";
import Frame from "../../Frame";
import { has, requirePartnerPage } from "../../session";
import ClientForm from "../ClientForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Add a client — Partner Portal" };

export default async function NewPartnerClientPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const identity = await requirePartnerPage();
  if (!has(identity, "clients")) redirect("/partner/account");
  const { next } = await searchParams;
  // Only ever back into the portal: an arbitrary `next` is an open redirect.
  const safeNext = next && next.startsWith("/partner/") && !next.startsWith("//") ? next : null;

  return (
    <Frame identity={identity}>
      <h1 className="mb-4 text-2xl font-semibold text-gray-900">Add a client</h1>
      <ClientForm mode="create" next={safeNext} accent={identity.branding.accentColor} />
    </Frame>
  );
}
