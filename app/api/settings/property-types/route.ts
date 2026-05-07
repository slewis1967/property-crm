/**
 * GET  /api/settings/property-types — fetch the canonical list of property
 *   types used by the aggregator extractor + the /properties filter UI.
 * PUT  /api/settings/property-types — replace the list. Body: { types: [...] }.
 *
 * Storage: app_settings row with key='property_types', value={ types: [...] }.
 * Mirrors the email_signature endpoint pattern.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";

export const dynamic = "force-dynamic";

export type PropertyType = {
  name: string;
  icon?: string | null;
  description?: string | null;
};

const DEFAULTS: PropertyType[] = [
  { name: "House & Land", icon: "🏡" },
  { name: "House",        icon: "🏠" },
  { name: "Townhouse",    icon: "🏘️" },
  { name: "Duplex",       icon: "🏠" },
  { name: "Apartment",    icon: "🏢" },
  { name: "Land",         icon: "🟩" },
  { name: "SDA",          icon: "♿" },
  { name: "Acreage",      icon: "🌳" },
];

async function loadTypes(): Promise<PropertyType[]> {
  const { data } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "property_types")
    .maybeSingle();
  const list = (data?.value as any)?.types;
  if (Array.isArray(list) && list.length > 0) return list as PropertyType[];
  return DEFAULTS;
}

export async function GET() {
  const types = await loadTypes();
  return NextResponse.json({ ok: true, types });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const incoming = Array.isArray(body?.types) ? body.types : null;
  if (!incoming) {
    return NextResponse.json({ ok: false, error: "body must be { types: [...] }" }, { status: 400 });
  }

  // Sanitise — name is required; icon + description optional. Trim, dedupe by name.
  const seen = new Set<string>();
  const cleaned: PropertyType[] = [];
  for (const t of incoming) {
    const name = (t?.name ?? "").toString().trim();
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push({
      name,
      icon: typeof t?.icon === "string" && t.icon.trim() ? t.icon.trim() : null,
      description:
        typeof t?.description === "string" && t.description.trim() ? t.description.trim() : null,
    });
  }
  if (cleaned.length === 0) {
    return NextResponse.json({ ok: false, error: "at least one named type required" }, { status: 400 });
  }

  const updatedBy =
    req.headers.get("x-user-email") ??
    req.headers.get("cf-access-authenticated-user-email") ??
    null;

  const { error } = await supabase
    .from("app_settings")
    .upsert(
      {
        key: "property_types",
        value: { types: cleaned },
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      },
      { onConflict: "key" },
    );

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, types: cleaned });
}
