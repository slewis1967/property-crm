import { cookies } from "next/headers";
import { supabase } from "../../utils/supabase";
import { log, errInfo } from "../../utils/logger";
import PropertyGrid from "./PropertyGrid";
import { DEFAULT_PAGE_SIZE, coercePropertiesPageSize } from "../../utils/pagination";
import { interleaveByBuilder } from "../../utils/feed-order";

// Upper bound on rows pulled for the first-page interleave (mirrors the API
// route). The active feed is a few hundred rows; this bounds the work.
const FEED_INTERLEAVE_CAP = 3000;

// The Aggregator Feed must reflect live stock on every load — without this,
// Next.js serves a cached build snapshot, so withdrawn/edited rows (e.g. the
// garbage ARG range rows we clean up) linger in the grid until the next deploy.
export const dynamic = "force-dynamic";

// Default property type list — used as a fallback when the
// app_settings row is missing. Mirrors the API route's defaults.
const DEFAULT_PROPERTY_TYPES = [
  { name: "House & Land", icon: "🏡" },
  { name: "House",        icon: "🏠" },
  { name: "Townhouse",    icon: "🏘️" },
  { name: "Duplex",       icon: "🏠" },
  { name: "Apartment",    icon: "🏢" },
  { name: "Land",         icon: "🟩" },
  { name: "SDA",          icon: "♿" },
  { name: "Acreage",      icon: "🌳" },
];

/**
 * Read the user's preferred page size from cookies so the server
 * component's first render matches the dropdown. Falls back to
 * DEFAULT_PAGE_SIZE if the cookie is missing or invalid.
 *
 * The client component also persists to localStorage; the cookie
 * just bridges the gap so the very first render isn't always 50.
 *
 * In Next 16 the cookies() helper is async.
 */
async function pageSizeFromCookies(): Promise<number> {
  try {
    const jar = await cookies();
    const raw = jar.get("properties_pageSize")?.value;
    if (raw) return coercePropertiesPageSize(raw);
  } catch {
    // cookies() throws if called from a context where it isn't
    // available; treat that as "no preference" and use the default.
  }
  return DEFAULT_PAGE_SIZE;
}

async function getPropertyTypes(): Promise<Array<{ name: string; icon?: string | null }>> {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "property_types")
      .maybeSingle();
    const list = (data?.value as { types?: Array<{ name: string; icon?: string | null }> } | null)?.types;
    if (Array.isArray(list) && list.length > 0) return list;
  } catch {
    // fall through to defaults
  }
  return DEFAULT_PROPERTY_TYPES;
}

// This is the Server Component. It fetches the first page of active stock
// (default 50, overridable via the properties_pageSize cookie) plus the
// total count, then hands both to the Client Component. Subsequent pages
// are loaded by the client via /api/properties/list.
export default async function PropertiesPage() {
  const pageSize = await pageSizeFromCookies();

  // Same projection the API route uses. Kept here as a single source of truth —
  // if you add a column to the list view, update both.
  const BASE_COLS =
    "id,builder_name,estate_name,lot_number,street_address,suburb,state," +
    "property_type,bedrooms,bathrooms,car_spaces,land_size,house_size," +
    "land_price,build_price,house_price,total_package_price," +
    "status,pipeline_status,titled,created_at,updated_at," +
    "brochure_url,confidence_score";

  // Fetch the whole active set (bounded) so we can interleave builders for the
  // first page — otherwise a single bulk import (e.g. 200+ rows added the same
  // day) floods newest-first and buries every other builder. The "Load more"
  // API applies the same interleave for subsequent pages.
  const runQuery = (cols: string) =>
    supabase
      .from("global_stock_pool")
      .select(cols, { count: "exact" })
      .neq("pipeline_status", "withdrawn")
      .neq("pipeline_status", "legacy")
      .order("created_at", { ascending: false })
      .range(0, FEED_INTERLEAVE_CAP - 1);

  // Request contract_type, but fall back to the base projection if the column
  // hasn't been added yet (ALTER pending) — keeps the page working either way.
  let { data: firstPage, count, error } = await runQuery(BASE_COLS + ",contract_type");
  if (error && /contract_type/i.test(error.message || "")) {
    ({ data: firstPage, count, error } = await runQuery(BASE_COLS));
  }

  if (error) {
    log.error("properties.page.query_failed", errInfo(error));
    return <div className="text-red-600 p-4">Error: {error.message}</div>;
  }

  const propertyTypes = await getPropertyTypes();

  // Normalise field names so PropertyGrid's `??` fallbacks line up
  // with the snake_case columns Supabase returns. `firstPage` is typed as
  // Supabase's GenericStringError[] because the projection is a runtime string;
  // the raw rows are real records, so narrow to the fields we read here.
  type RawRow = {
    id: string;
    builder_name?: string | null;
    total_package_price?: number | null;
    house_price?: number | null;
    price_total?: number | null;
    street_address?: string | null;
    address_street?: string | null;
    suburb?: string | null;
    address_suburb?: string | null;
    state?: string | null;
    address_state?: string | null;
    brochure_url?: string | null;
    image_url?: string | null;
  };
  const allNormalised = ((firstPage ?? []) as unknown as RawRow[]).map((p) => ({
    ...p,
    price_total: p.total_package_price ?? p.house_price ?? p.price_total,
    address_street: p.street_address ?? p.address_street,
    address_suburb: p.suburb ?? p.address_suburb,
    address_state: p.state ?? p.address_state,
    image_url: p.brochure_url ?? p.image_url,
  }));

  // First page = the interleaved set sliced to pageSize (builder variety).
  const properties = interleaveByBuilder(allNormalised).slice(0, pageSize);
  // Full builder list for the dropdown, so every builder is selectable even
  // when its stock isn't on the current page.
  const allBuilders = Array.from(
    new Set(allNormalised.map((p) => (p.builder_name || "").toString().trim()).filter(Boolean)),
  ).sort();

  const total = count ?? allNormalised.length;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Aggregator Feed</h1>
        <span className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full">
          Live Connection Active
        </span>
      </div>

      {/* We pass the first page + total to the client component. The
          grid handles "Load more" via /api/properties/list. */}
      <PropertyGrid
        properties={properties}
        propertyTypes={propertyTypes}
        allBuilders={allBuilders}
        initialTotal={total}
        initialPageSize={pageSize}
      />

      {total === 0 && (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center mt-6">
          <p className="text-gray-500 font-medium mb-2">No properties found in the database.</p>
        </div>
      )}
    </div>
  );
}
