import Link from "next/link";
import { redirect } from "next/navigation";
import Frame from "../Frame";
import { has, requirePartnerPage } from "../session";
import { formatAud } from "../../../utils/partner";
import { listOwnClients, listOwnDeals, toClientView } from "../../api/partner/_shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clients — Partner Portal" };

export default async function PartnerClientsPage() {
  const identity = await requirePartnerPage();
  if (!has(identity, "clients")) redirect("/partner/account");

  const [rows, deals] = await Promise.all([listOwnClients(identity), listOwnDeals(identity)]);
  const clients = rows.map(toClientView);
  const openByClient = new Map<string, number>();
  for (const d of deals) {
    if (["requested", "hold", "eoi", "unconditional"].includes(d.stage)) {
      openByClient.set(d.client_id, (openByClient.get(d.client_id) ?? 0) + 1);
    }
  }

  return (
    <Frame identity={identity}>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Clients</h1>
        <Link href="/partner/clients/new" className="rounded-lg px-3 py-2 text-sm font-semibold text-white" style={{ background: identity.branding.accentColor }}>
          Add a client
        </Link>
      </div>
      {clients.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600">
          No clients yet. Add a buyer, then request a hold on any available lot for them.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-4 py-2">Name</th>
                <th className="px-4 py-2">Contact</th>
                <th className="px-4 py-2">State</th>
                <th className="px-4 py-2">Budget</th>
                <th className="px-4 py-2">Open deals</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className={`border-t border-gray-100 ${c.status === "archived" ? "text-gray-400" : ""}`}>
                  <td className="px-4 py-2 font-medium">
                    <Link className="hover:underline" href={`/partner/clients/${c.id}`}>{c.name}</Link>
                    {c.status === "archived" && <span className="ml-2 text-xs">(archived)</span>}
                  </td>
                  <td className="px-4 py-2">{c.email ?? c.phone ?? "—"}</td>
                  <td className="px-4 py-2">{c.state ?? "—"}</td>
                  <td className="px-4 py-2">{c.budgetMax ? formatAud(c.budgetMax) : "—"}</td>
                  <td className="px-4 py-2">{openByClient.get(c.id) ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Frame>
  );
}
