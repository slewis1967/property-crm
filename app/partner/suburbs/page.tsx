import Link from "next/link";
import { redirect } from "next/navigation";
import Frame from "../Frame";
import { has, requirePartnerPage } from "../session";
import { formatAud } from "../../../utils/partner";
import { loadPartnerStock } from "../../../utils/partner-stock";
import { stockSuburbs } from "../../../utils/partner-suburbs";

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
      <h1 className="text-2xl font-semibold text-gray-900">Suburb research</h1>
      <p className="mt-1 max-w-3xl text-sm text-gray-600">
        A research report for any suburb where we have stock: market, growth drivers, infrastructure and lifestyle,
        ready to print for your client. {all.length} suburbs.
      </p>
      <form className="mt-4 max-w-sm">
        <input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Find a suburb"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </form>
      <div className="mt-4 overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2">Suburb</th>
              <th className="px-4 py-2 text-right">Lots</th>
              <th className="px-4 py-2 text-right">Available</th>
              <th className="px-4 py-2 text-right">Price range</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {list.map((s) => {
              const href = `/partner/suburbs/report?suburb=${encodeURIComponent(s.suburb)}&state=${encodeURIComponent(s.state ?? "")}`;
              return (
                <tr key={`${s.suburb}|${s.state}`} className="border-t border-gray-100">
                  <td className="px-4 py-2 font-medium text-gray-900">{s.suburb}{s.state ? `, ${s.state}` : ""}</td>
                  <td className="px-4 py-2 text-right">{s.count}</td>
                  <td className="px-4 py-2 text-right">{s.available}</td>
                  <td className="px-4 py-2 text-right text-gray-600">
                    {s.minPrice === null ? "—" : s.minPrice === s.maxPrice ? formatAud(s.minPrice) : `${formatAud(s.minPrice)} – ${formatAud(s.maxPrice)}`}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link href={href} className="font-medium underline" style={{ color: identity.branding.primaryColor }}>Report</Link>
                  </td>
                </tr>
              );
            })}
            {list.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">No suburb matches.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Frame>
  );
}
