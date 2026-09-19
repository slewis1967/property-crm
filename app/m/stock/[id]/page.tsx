import { notFound } from "next/navigation";
import { supabase } from "../../../../utils/supabase";
import { Header, Section, Facts, money } from "../../ui";
import Photo from "../Photo";

export const dynamic = "force-dynamic";

const size = (n: number | null | undefined) =>
  n && Number.isFinite(n) && n > 0 ? `${Math.round(n).toLocaleString("en-AU")} m²` : null;

/** One lot, laid out to show a client on the phone: photos, price split, key specs, brochure. */
export default async function PhoneStockItem({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ data: p }, { data: media }] = await Promise.all([
    supabase
      .from("global_stock_pool")
      .select(
        "id,builder_name,estate_name,lot_number,street_address,suburb,state,property_type,bedrooms,bathrooms," +
          "car_spaces,land_size,house_size,land_price,build_price,house_price,total_package_price,status,titled,brochure_url",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("property_media").select("kind,storage_path,source_url").eq("property_id", id),
  ]);
  if (!p) notFound();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic stock row, as in PropertyGridItem
  const row = p as any;

  const mediaRows = media ?? [];
  const photos: string[] = [
    row.brochure_url,
    ...mediaRows.filter((m) => m.kind === "gallery" && m.storage_path).map((m) => m.storage_path as string),
  ].filter(Boolean);
  const floorplan = mediaRows.find((m) => m.kind === "floorplan" && m.storage_path)?.storage_path ?? null;
  const brochure =
    mediaRows.find((m) => m.kind === "brochure_pdf" && m.storage_path)?.storage_path ??
    mediaRows.find((m) => m.source_url)?.source_url ??
    null;

  const place = [row.suburb, row.state].filter(Boolean).join(", ");
  const title = row.street_address || row.estate_name || place || "Property";

  return (
    <>
      <Header title={title} back="/m/stock" fullHref={`/properties/${row.id}`} />

      <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pt-4 [scrollbar-width:none]">
        {/* One photo fills the width; several peek so it's obvious they swipe. */}
        {(photos.length ? photos : [null]).map((src, i) => (
          <Photo
            key={i}
            src={src}
            alt={`${title} photo ${i + 1}`}
            className={`h-56 ${photos.length > 1 ? "w-[85%]" : "w-full"} shrink-0 snap-center rounded-xl`}
          />
        ))}
      </div>

      <div className="px-4 pt-4">
        <p className="text-2xl font-bold">{money(row.total_package_price ?? row.house_price) ?? "Price TBC"}</p>
        <p className="text-sm text-gray-600">
          {[row.estate_name !== title ? row.estate_name : null, row.lot_number ? `Lot ${row.lot_number}` : null, place]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      <Section title="Details">
        <Facts
          rows={[
            ["Land price", money(row.land_price)],
            ["Build price", money(row.build_price)],
            ["Bedrooms", row.bedrooms],
            ["Bathrooms", row.bathrooms],
            ["Car spaces", row.car_spaces],
            ["Land", size(row.land_size)],
            ["House", size(row.house_size)],
            ["Type", row.property_type],
            ["Titled", row.titled === true ? "Yes" : row.titled === false ? "Not yet" : null],
            ["Builder", row.builder_name],
            ["Status", row.status],
          ]}
        />
      </Section>

      {(floorplan || brochure) && (
        <Section title="Documents">
          <div className="flex gap-2">
            {floorplan && (
              <a href={floorplan} target="_blank" rel="noopener noreferrer" className="flex-1 rounded-xl bg-white py-3 text-center text-sm font-medium text-[#0F4C5C] shadow-sm">
                Floor plan
              </a>
            )}
            {brochure && (
              <a href={brochure} target="_blank" rel="noopener noreferrer" className="flex-1 rounded-xl bg-white py-3 text-center text-sm font-medium text-[#0F4C5C] shadow-sm">
                Brochure
              </a>
            )}
          </div>
        </Section>
      )}
    </>
  );
}
