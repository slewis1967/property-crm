import { supabase } from "../../utils/supabase";
import PropertyGrid from "./PropertyGrid";

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

async function getPropertyTypes(): Promise<Array<{ name: string; icon?: string | null }>> {
  try {
    const { data } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "property_types")
      .maybeSingle();
    const list = (data?.value as any)?.types;
    if (Array.isArray(list) && list.length > 0) return list;
  } catch {
    // fall through to defaults
  }
  return DEFAULT_PROPERTY_TYPES;
}

// This is the Server Component. It fetches data securely, then hands it to the Client Component.
export default async function PropertiesPage() {

  // Active stock pool only — hide rows soft-deleted by either the
  // aggregator's withdraw-not-listed pass or the user-clicked delete
  // button (both set pipeline_status='withdrawn'). Same filter PIA uses.
  const [{ data: properties, error }, propertyTypes] = await Promise.all([
    supabase
      .from("global_stock_pool")
      .select("*")
      .neq("pipeline_status", "withdrawn")
      .neq("pipeline_status", "legacy")
      .order("created_at", { ascending: false }),
    getPropertyTypes(),
  ]);

  if (error) {
    return <div className="text-red-600 p-4">Error: {error.message}</div>;
  }

  // Normalise field names so PropertyGrid works regardless of compiled version
  const normalised = (properties || []).map((p: any) => ({
    ...p,
    price_total:     p.total_package_price ?? p.house_price ?? p.price_total,
    address_street:  p.street_address ?? p.address_street,
    address_suburb:  p.suburb ?? p.address_suburb,
    address_state:   p.state ?? p.address_state,
    image_url:       p.brochure_url ?? p.image_url,
  }));

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Aggregator Feed</h1>
        <span className="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full">
          Live Connection Active
        </span>
      </div>

      {/* We pass the data we fetched into our new interactive component */}
      <PropertyGrid properties={normalised} propertyTypes={propertyTypes} />

      {properties?.length === 0 && (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center mt-6">
          <p className="text-gray-500 font-medium mb-2">No properties found in the database.</p>
        </div>
      )}
    </div>
  );
}