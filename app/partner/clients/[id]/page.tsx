import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Frame from "../../Frame";
import { has, requirePartnerPage } from "../../session";
import { formatAud } from "../../../../utils/partner";
import { listOwnDeals, loadOwnClient, toClientView, toDealView } from "../../../api/partner/_shared";
import ClientForm from "../ClientForm";
import ArchiveToggle from "./ArchiveToggle";

export const dynamic = "force-dynamic";
export const metadata = { title: "Client — Partner Portal" };

export default async function PartnerClientPage({ params }: { params: Promise<{ id: string }> }) {
  const identity = await requirePartnerPage();
  if (!has(identity, "clients")) redirect("/partner/account");

  const { id } = await params;
  const row = await loadOwnClient(identity, id);
  if (!row) notFound();
  const client = toClientView(row);
  const showFees = has(identity, "referral_fee");
  const deals = has(identity, "deals")
    ? (await listOwnDeals(identity, { clientId: id })).map((d) => toDealView(d, { showFees }))
    : [];

  return (
    <Frame identity={identity}>
      <Link href="/partner/clients" className="text-sm text-gray-600 hover:text-gray-900">← Clients</Link>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-gray-900">{client.name}</h1>
        <div className="flex gap-2">
          {client.status === "active" && (
            <Link href="/partner/stock" className="rounded-lg px-3 py-2 text-sm font-semibold text-white" style={{ background: identity.branding.accentColor }}>
              Find a lot
            </Link>
          )}
          <ArchiveToggle clientId={client.id} archived={client.status === "archived"} />
        </div>
      </div>

      <h2 className="mb-2 mt-6 text-lg font-semibold text-gray-900">Deals</h2>
      {deals.length === 0 ? (
        <p className="text-sm text-gray-600">No hold requests yet.</p>
      ) : (
        <ul className="mb-6 divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {deals.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <Link href={`/partner/deals/${d.id}`} className="font-medium hover:underline">
                {d.lotRef} · {[d.lot.suburb, d.lot.state].filter(Boolean).join(", ")}
              </Link>
              <span className="text-gray-600">{d.stageLabel}</span>
              <span>{d.price ? formatAud(d.price) : ""}</span>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mb-2 mt-6 text-lg font-semibold text-gray-900">Details</h2>
      <ClientForm mode="edit" client={client} accent={identity.branding.accentColor} />
    </Frame>
  );
}
