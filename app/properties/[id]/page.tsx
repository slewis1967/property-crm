import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import Image from "next/image";
import { supabase } from "../../../utils/supabase";
import AIPropertyMatches from "../../components/AIPropertyMatches";

export const dynamic = "force-dynamic";

const fmtCurrency = (n: number | null | undefined) => {
  if (n == null || !isFinite(n as number) || (n as number) <= 0) return "—";
  return `$${Number(n).toLocaleString("en-AU", { maximumFractionDigits: 0 })}`;
};

const fmtSize = (n: number | null | undefined, unit = "m²") => {
  if (n == null || !isFinite(n as number) || (n as number) <= 0) return "—";
  return `${Number(n).toLocaleString("en-AU", { maximumFractionDigits: 0 })} ${unit}`;
};

const statusColor = (s: string | null | undefined) => {
  const k = String(s || "").toLowerCase();
  if (k === "active" || k === "available") return "bg-emerald-100 text-emerald-700";
  if (k === "hold" || k === "on hold") return "bg-amber-100 text-amber-700";
  if (k === "sold") return "bg-gray-200 text-gray-700";
  return "bg-blue-100 text-blue-700";
};

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { data: property } = await supabase
    .from("global_stock_pool")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!property) return notFound();

  // Brochure media (facade is already on property.brochure_url as the hero;
  // here we surface the floor plan, gallery, and a brochure-download link).
  const { data: media } = await supabase
    .from("property_media")
    .select("kind,storage_path,source_url")
    .eq("property_id", id);
  const mediaRows = media ?? [];
  const floorplans = mediaRows.filter((m) => m.kind === "floorplan" && m.storage_path);
  const gallery = mediaRows.filter((m) => m.kind === "gallery" && m.storage_path);
  // Prefer a Supabase-hosted brochure PDF (no link expiry); fall back to the
  // builder's source folder link so the operator can still grab the brochure.
  const brochureLink =
    mediaRows.find((m) => m.kind === "brochure_pdf" && m.storage_path)?.storage_path ??
    mediaRows.find((m) => m.source_url)?.source_url ??
    null;

  const price = property.total_package_price ?? property.house_price ?? 0;
  const address =
    property.street_address || property.estate_name || property.suburb || "(unknown address)";

  return (
    <div className="max-w-5xl">
      <Link
        href="/properties"
        className="text-sm text-gray-400 hover:text-gray-700 inline-block mb-3"
      >
        ← Aggregator Feed
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{address}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {[property.suburb, property.state].filter(Boolean).join(", ") || "—"}
            {property.estate_name && property.estate_name !== address && (
              <> · {property.estate_name}</>
            )}
            {property.lot_number && <> · Lot {property.lot_number}</>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/feasibility?address=${encodeURIComponent(
              [address, property.suburb, property.state].filter(Boolean).join(", "),
            )}&auto=1&property=${encodeURIComponent(String(property.id))}`}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-[#0F4C5C] hover:bg-[#0B3D4A] transition"
          >
            🗺️ Planning Feasibility
          </Link>
          <Link
            href={`/eoi?property=${encodeURIComponent(String(property.id))}`}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-[#0F4C5C] text-[#0F4C5C] hover:bg-[#0F4C5C]/5 transition"
          >
            📝 Create EOI
          </Link>
          {property.status && (
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusColor(property.status)}`}
            >
              {property.status}
            </span>
          )}
          {property.property_type && (
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
              {property.property_type}
            </span>
          )}
          {property.sda_category && (
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 text-purple-700">
              SDA · {property.sda_category}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        {/* Left: image / brochure */}
        <div className="lg:col-span-1">
          {property.brochure_url ? (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <a
                href={property.brochure_url}
                target="_blank"
                rel="noreferrer"
                className="block"
              >
                <Image
                  src={property.brochure_url}
                  alt={address}
                  width={800}
                  height={600}
                  sizes="(max-width: 1024px) 100vw, 33vw"
                  unoptimized
                  className="w-full aspect-[4/3] object-cover"
                />
              </a>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 aspect-[4/3] flex items-center justify-center text-gray-300">
              <span className="text-5xl">🏠</span>
            </div>
          )}

          {brochureLink && (
            <a
              href={brochureLink}
              target="_blank"
              rel="noreferrer"
              className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-[#0F4C5C] text-white text-sm font-semibold py-2.5 hover:bg-[#0d4250] transition-colors"
            >
              📄 Download brochure
            </a>
          )}

          {floorplans.length > 0 && (
            <div className="mt-3">
              <p className="text-[11px] text-gray-400 uppercase tracking-wide font-medium mb-1.5">
                Floor plan
              </p>
              <div className="space-y-2">
                {floorplans.map((m, i) => (
                  <a
                    key={i}
                    href={m.storage_path}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-lg border border-gray-200 overflow-hidden bg-white"
                  >
                    <Image
                      src={m.storage_path}
                      alt="Floor plan"
                      width={800}
                      height={600}
                      sizes="(max-width: 1024px) 100vw, 33vw"
                      unoptimized
                      className="w-full object-contain"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          {gallery.length > 0 && (
            <div className="mt-3 grid grid-cols-3 gap-1.5">
              {gallery.map((m, i) => (
                <a
                  key={i}
                  href={m.storage_path}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-md overflow-hidden border border-gray-200"
                >
                  <Image
                    src={m.storage_path}
                    alt=""
                    width={200}
                    height={200}
                    sizes="120px"
                    unoptimized
                    className="w-full aspect-square object-cover"
                  />
                </a>
              ))}
            </div>
          )}

          {property.source_document_url && (
            <a
              href={property.source_document_url}
              target="_blank"
              rel="noreferrer"
              className="block mt-2 text-xs text-blue-600 hover:underline truncate"
            >
              📄 Source document
            </a>
          )}
        </div>

        {/* Right: financials + specs */}
        <div className="lg:col-span-2 space-y-5">
          {/* Headline + price breakdown */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-1">
              Total package
            </p>
            <p className="text-3xl font-bold text-gray-900">{fmtCurrency(price)}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4 text-sm">
              <Detail label="Land" value={fmtCurrency(property.land_price)} />
              <Detail label="Build" value={fmtCurrency(property.build_price)} />
              <Detail label="House only" value={fmtCurrency(property.house_price)} />
              <Detail
                label="Expected rent / wk"
                value={fmtCurrency(property.expected_rent_weekly)}
              />
              <Detail
                label="Rebates"
                value={property.rebates ? fmtCurrency(property.rebates) : "—"}
              />
            </div>
          </div>

          {/* Specs */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">
              Specs
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              <Detail label="Bedrooms" value={property.bedrooms ?? "—"} />
              <Detail label="Bathrooms" value={property.bathrooms ?? "—"} />
              <Detail label="Car spaces" value={property.car_spaces ?? "—"} />
              <Detail label="House" value={fmtSize(property.house_size)} />
              <Detail
                label="Land"
                value={fmtSize(property.land_size_sqm ?? property.land_size)}
              />
            </div>
          </div>

          {/* Origin / availability */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-xs uppercase tracking-wider text-gray-500 font-semibold mb-3">
              Origin
            </p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <Detail label="Builder" value={property.builder_name || "—"} />
              <Detail label="Estate" value={property.estate_name || "—"} />
              <Detail label="Lot" value={property.lot_number || "—"} />
              <Detail
                label="Titled"
                value={property.titled === true ? "Yes" : property.titled === false ? "No" : "—"}
              />
              <Detail
                label="Land reg date"
                value={
                  property.land_registration_date
                    ? new Date(property.land_registration_date).toLocaleDateString("en-AU")
                    : "—"
                }
              />
              <Detail
                label="Hold until"
                value={
                  property.hold_until
                    ? new Date(property.hold_until).toLocaleDateString("en-AU")
                    : "—"
                }
              />
            </div>
          </div>

          {/* SDA — only render if SDA-relevant */}
          {(property.sda_category ||
            property.sda_passed != null ||
            property.sda_compliance_score != null) && (
            <div className="bg-white rounded-xl border border-purple-200 p-5">
              <p className="text-xs uppercase tracking-wider text-purple-600 font-semibold mb-3">
                ♿ SDA detail
              </p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Detail label="Category" value={property.sda_category || "—"} />
                <Detail
                  label="Compliance score"
                  value={
                    property.sda_compliance_score != null
                      ? `${property.sda_compliance_score}/100`
                      : "—"
                  }
                />
                <Detail
                  label="Passed checks"
                  value={
                    Array.isArray(property.sda_passed)
                      ? property.sda_passed.length
                      : "—"
                  }
                />
                <Detail
                  label="Failed checks"
                  value={
                    Array.isArray(property.sda_failed)
                      ? property.sda_failed.length
                      : "—"
                  }
                />
              </div>
              {Array.isArray(property.sda_modifications) &&
                property.sda_modifications.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-purple-100">
                    <p className="text-xs font-medium text-purple-700 mb-1">Modifications</p>
                    <ul className="text-xs text-gray-700 space-y-0.5">
                      {property.sda_modifications.slice(0, 8).map((m: string, i: number) => (
                        <li key={i}>• {m}</li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>
          )}
        </div>
      </div>

      {/* AI matches — full width */}
      <AIPropertyMatches propertyId={property.id} />
    </div>
  );
}

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] text-gray-400 uppercase tracking-wide font-medium">{label}</p>
      <p className="text-sm font-medium text-gray-900 mt-0.5">{value ?? "—"}</p>
    </div>
  );
}
