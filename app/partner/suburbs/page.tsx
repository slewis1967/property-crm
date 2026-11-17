import Link from "next/link";
import { redirect } from "next/navigation";
import Frame from "../Frame";
import { has, requirePartnerPage } from "../session";
import { formatAud } from "../../../utils/partner";
import { loadPartnerStock } from "../../../utils/partner-stock";
import { stockSuburbs } from "../../../utils/partner-suburbs";
import { BRAND, Card, EmptyState, Icon, PageHeader, brandTint, inputClass } from "../ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Suburbs — Partner Portal" };

/** Every suburb with stock, with a research report one click away. */
export default async function PartnerSuburbsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const identity = await requirePartnerPage();
  if (!has(identity, "suburb_reports")) redirect("/partner/account");

  const { q } = await searchParams;
  const all = stockSuburbs(await loadPartnerStock({ showFees: false }));
  const needle = (q ?? "").trim().toLowerCase();
  const list = needle ? all.filter((s) => s.suburb.toLowerCase().includes(needle)) : all;

  return (
    <Frame identity={identity}>
      <PageHeader
        eyebrow="Research"
        title="Suburb research"
        icon="pin"
        subtitle={
          <>
            A research report for any suburb where we have stock: market, growth drivers, infrastructure and lifestyle,
            ready to print for your client. <strong className="text-slate-900">{all.length}</strong> suburbs.
          </>
        }
      />
      <form className="mb-6 max-w-md">
        <label className="relative block">
          <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input name="q" defaultValue={q ?? ""} placeholder="Find a suburb" className={`${inputClass} pl-10`} aria-label="Find a suburb" />
        </label>
      </form>

      {list.length === 0 ? (
        <EmptyState icon="pin" title="No suburb matches">Try part of the name, or clear the search.</EmptyState>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((s) => {
            const href = `/partner/suburbs/report?suburb=${encodeURIComponent(s.suburb)}&state=${encodeURIComponent(s.state ?? "")}`;
            const range =
              s.minPrice === null ? "Price on request" : s.minPrice === s.maxPrice ? formatAud(s.minPrice) : `${formatAud(s.minPrice)} – ${formatAud(s.maxPrice)}`;
            return (
              <Link key={`${s.suburb}|${s.state}`} href={href} className="group">
                <Card className="h-full transition duration-200 group-hover:-translate-y-0.5 group-hover:shadow-[0_14px_32px_-12px_rgba(15,23,42,0.28)]" padded={false}>
                  <div className="flex items-start gap-3.5 p-5">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: brandTint(9), color: BRAND }}>
                      <Icon name="pin" className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold text-slate-900">
                        {s.suburb}
                        {s.state ? <span className="font-medium text-slate-500">, {s.state}</span> : null}
                      </div>
                      <div className="mt-0.5 text-sm text-slate-600">{range}</div>
                      <div className="mt-3 flex items-center gap-2 text-xs">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-700">{s.count} lots</span>
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800 ring-1 ring-inset ring-emerald-200">{s.available} available</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm font-semibold" style={{ color: BRAND }}>
                    Open report
                    <Icon name="arrow-right" className="h-4 w-4 transition group-hover:translate-x-0.5" />
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </Frame>
  );
}
