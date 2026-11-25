import Link from "next/link";
import { redirect } from "next/navigation";
import Frame from "../Frame";
import { has, requirePartnerPage } from "../session";
import { formatAud } from "../../../utils/partner";
import { listOwnClients, listOwnDeals, toClientView } from "../../api/partner/_shared";
import { EmptyState, Icon, PageHeader, StatTile, buttonPrimary, initials, tableWrap, td, th, tr } from "../ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clients — Partner Portal" };

export default async function PartnerClientsPage() {
  const identity = await requirePartnerPage();
  if (!has(identity, "clients")) redirect("/partner/account");

  const [rows, deals] = await Promise.all([listOwnClients(identity), listOwnDeals(identity)]);
  const clients = rows.map(toClientView);
  const openByClient = new Map<string, number>();
  for (const d of deals) {
    if (["requested", "hold", "eoi", "contract_issued", "unconditional"].includes(d.stage)) {
      openByClient.set(d.client_id, (openByClient.get(d.client_id) ?? 0) + 1);
    }
  }
  const active = clients.filter((c) => c.status !== "archived").length;
  const withOpen = [...openByClient.values()].filter((n) => n > 0).length;

  return (
    <Frame identity={identity}>
      <PageHeader
        eyebrow="Your buyers"
        title="Clients"
        icon="users"
        subtitle="Only your firm can see these. Add a buyer, then request a hold on any available lot for them."
        actions={
          <Link href="/partner/clients/new" className={buttonPrimary}>
            <Icon name="users" /> Add a client
          </Link>
        }
      />
      {clients.length === 0 ? (
        <EmptyState icon="users" title="No clients yet">
          Add a buyer, then request a hold on any available lot for them.
        </EmptyState>
      ) : (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-2">
            <StatTile icon="users" label="Active clients" value={active} />
            <StatTile icon="handshake" label="With a deal in progress" value={withOpen} tone="accent" />
          </div>
          <div className={tableWrap}>
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80">
                <tr>
                  <th className={th}>Name</th>
                  <th className={th}>Contact</th>
                  <th className={th}>State</th>
                  <th className={`${th} text-right`}>Budget</th>
                  <th className={`${th} text-right`}>Open deals</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => {
                  const archived = c.status === "archived";
                  const n = openByClient.get(c.id) ?? 0;
                  return (
                    <tr key={c.id} className={`${tr} ${archived ? "text-slate-400" : ""}`}>
                      <td className={td}>
                        <Link className="group flex items-center gap-3" href={`/partner/clients/${c.id}`}>
                          <span
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${archived ? "bg-slate-100 text-slate-400" : "text-white"}`}
                            style={archived ? undefined : { background: "linear-gradient(135deg, var(--brand), color-mix(in srgb, var(--brand) 65%, white))" }}
                          >
                            {initials(c.name)}
                          </span>
                          <span className={`font-semibold group-hover:underline ${archived ? "" : "text-slate-900"}`}>{c.name}</span>
                          {archived && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">Archived</span>}
                        </Link>
                      </td>
                      <td className={`${td} ${archived ? "" : "text-slate-600"}`}>{c.email ?? c.phone ?? "—"}</td>
                      <td className={td}>{c.state ?? "—"}</td>
                      <td className={`${td} text-right font-medium`}>{c.budgetMax ? formatAud(c.budgetMax) : "—"}</td>
                      <td className={`${td} text-right`}>
                        {n > 0 ? (
                          <span className="inline-flex min-w-6 justify-center rounded-full bg-sky-50 px-2 py-0.5 text-xs font-bold text-sky-800 ring-1 ring-inset ring-sky-200">{n}</span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Frame>
  );
}
