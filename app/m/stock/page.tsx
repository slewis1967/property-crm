import Link from "next/link";
import { supabase } from "../../../utils/supabase";
import { Header, Empty, LoadError, SearchBox, money } from "../ui";
import Photo from "./Photo";

export const dynamic = "force-dynamic";

const LIMIT = 40;

type Row = {
  id: string;
  builder_name: string | null;
  estate_name: string | null;
  lot_number: string | null;
  street_address: string | null;
  suburb: string | null;
  state: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  car_spaces: number | null;
  land_size: number | null;
  total_package_price: number | null;
  house_price: number | null;
  brochure_url: string | null;
};

/**
 * Stock: active lots from the aggregator feed, newest first, searchable by
 * suburb, estate, builder or address. Same visibility rule as the feed —
 * withdrawn and legacy rows are hidden.
 */
export default async function PhoneStock({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const term = q?.trim().replace(/[%,()]/g, " ").trim() ?? "";

  let query = supabase
    .from("global_stock_pool")
    .select(
      "id,builder_name,estate_name,lot_number,street_address,suburb,state,bedrooms,bathrooms,car_spaces," +
        "land_size,total_package_price,house_price,brochure_url",
    )
    .neq("pipeline_status", "withdrawn")
    .neq("pipeline_status", "legacy");
  if (term) {
    const like = `%${term}%`;
    query = query.or(
      `suburb.ilike.${like},builder_name.ilike.${like},estate_name.ilike.${like},street_address.ilike.${like}`,
    );
  }
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .limit(LIMIT);
  const rows = (data ?? []) as unknown as Row[];

  return (
    <>
      <Header title="Stock" fullHref="/properties" />
      <SearchBox action="/m/stock" defaultValue={q} placeholder="Suburb, estate or builder…" />
      <div className="space-y-3 px-4 pt-4">
        {error ? (
          <LoadError>Couldn&apos;t load stock: {error.message}</LoadError>
        ) : rows.length === 0 ? (
          <Empty>{term ? `Nothing matches “${term}”.` : "No active stock."}</Empty>
        ) : (
          <>
            <p className="text-xs text-gray-500">
              {term ? `${rows.length}${rows.length === LIMIT ? "+" : ""} result${rows.length === 1 ? "" : "s"}` : `Newest ${rows.length}`}
            </p>
            {rows.map((p) => {
              const place = [p.suburb, p.state].filter(Boolean).join(", ");
              const title = p.estate_name || p.street_address || place || "Property";
              const specs = [
                p.bedrooms ? `${p.bedrooms} bed` : null,
                p.bathrooms ? `${p.bathrooms} bath` : null,
                p.car_spaces ? `${p.car_spaces} car` : null,
                p.land_size ? `${Math.round(p.land_size)} m²` : null,
              ].filter(Boolean).join(" · ");
              return (
                <Link key={p.id} href={`/m/stock/${p.id}`} className="flex gap-3 overflow-hidden rounded-xl bg-white shadow-sm active:bg-gray-50">
                  <Photo src={p.brochure_url} alt={title} className="h-24 w-28 shrink-0" />
                  <div className="min-w-0 flex-1 py-2 pr-3">
                    <p className="text-[15px] font-semibold">{money(p.total_package_price ?? p.house_price) ?? "Price TBC"}</p>
                    <p className="truncate text-sm">{title}{p.lot_number ? ` · Lot ${p.lot_number}` : ""}</p>
                    <p className="truncate text-xs text-gray-500">{place}</p>
                    {specs && <p className="truncate text-xs text-gray-500">{specs}</p>}
                  </div>
                </Link>
              );
            })}
          </>
        )}
      </div>
    </>
  );
}
