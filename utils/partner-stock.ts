/**
 * Channel-partner portal — reading the stock book. Server-only.
 *
 * Every partner sees the same stock; the masking is in utils/partner.ts
 * (toPartnerLot). This module's own contribution to that is to never SELECT the
 * supplier columns for a partner read in the first place — the whitelist in
 * toPartnerLot is the rule, and not fetching what it would drop is the belt to
 * go with those braces.
 */
import { supabase } from "./supabase";
import {
  ACTIVE_HOLD_STAGES,
  assertNoForbiddenKeys,
  feeRuleFromEnv,
  referralFee,
  toPartnerLot,
  type PartnerLot,
  type StockRow,
} from "./partner";

/** Exactly what toPartnerLot reads. No builder, estate, lot, address, source or free text. */
const PARTNER_STOCK_COLUMNS =
  "id,suburb,state,property_type,bedrooms,bathrooms,car_spaces,study_room," +
  "land_size_sqm,land_size,house_size,frontage_m,total_package_price,house_price,land_price," +
  "build_price,contract_type,titled,completion_date,land_registration_date,expected_rent_weekly," +
  "status,pipeline_status,updated_at";

/** PostgREST caps any single response at 1,000 rows regardless of .limit(). */
const PAGE = 1000;

async function pageAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

// Supplier names change when a stocklist lands, not per request. Ten minutes is
// long enough to keep this off the hot path and short enough that a new estate
// is scrubbed the same morning it arrives.
let namesCache: { at: number; names: string[] } | null = null;
const NAMES_TTL_MS = 10 * 60_000;

/**
 * Every builder and estate name we know, for redactSupplierNames. Longest
 * first, so "Stockland Aura" is scrubbed whole before "Aura" gets a chance to
 * leave "Stockland —" behind.
 */
export async function supplierNames(): Promise<string[]> {
  if (namesCache && Date.now() - namesCache.at < NAMES_TTL_MS) return namesCache.names;

  const set = new Set<string>();
  const { data: builders } = await supabase.from("builders").select("canonical_name,aliases");
  for (const b of (builders ?? []) as { canonical_name?: string | null; aliases?: unknown }[]) {
    if (b.canonical_name) set.add(b.canonical_name);
    if (Array.isArray(b.aliases)) for (const a of b.aliases) if (typeof a === "string") set.add(a);
  }
  const rows = await pageAll<{ builder_name: string | null; estate_name: string | null }>((from, to) =>
    supabase
      .from("global_stock_pool")
      .select("builder_name,estate_name")
      .neq("pipeline_status", "withdrawn")
      .order("id")
      .range(from, to),
  );
  for (const r of rows) {
    if (r.builder_name) set.add(r.builder_name);
    if (r.estate_name) set.add(r.estate_name);
  }

  const names = [...set].map((s) => s.trim()).filter((s) => s.length >= 4).sort((a, b) => b.length - a.length);
  namesCache = { at: Date.now(), names };
  return names;
}

/** Lots tied up by a partner deal. Shown to every partner as "On hold", with no hint whose. */
async function heldPropertyIds(): Promise<Set<string>> {
  const { data } = await supabase
    .from("partner_enquiries")
    .select("property_id")
    .in("stage", [...ACTIVE_HOLD_STAGES]);
  return new Set(((data ?? []) as { property_id: string }[]).map((r) => r.property_id));
}

/** Gross developer fees by lot. Read here, reduced to the partner's figure, and dropped. */
async function grossFees(ids?: string[]): Promise<Map<string, number>> {
  const rows = await pageAll<{ property_id: string; gross_developer_fee: number | null }>((from, to) => {
    let q = supabase.from("property_financials").select("property_id,gross_developer_fee");
    if (ids) q = q.in("property_id", ids);
    return q.order("property_id").range(from, to);
  });
  const map = new Map<string, number>();
  for (const r of rows) if (r.gross_developer_fee !== null) map.set(r.property_id, Number(r.gross_developer_fee));
  return map;
}

export type StockFilters = {
  state?: string;
  q?: string;
  minBeds?: number;
  minPrice?: number;
  maxPrice?: number;
  type?: string;
  availableOnly?: boolean;
  sort?: "newest" | "price_asc" | "price_desc" | "fee_desc";
};

export function parseStockFilters(params: URLSearchParams): StockFilters {
  const n = (k: string) => {
    const v = Number(params.get(k));
    return Number.isFinite(v) && v > 0 ? v : undefined;
  };
  const sort = params.get("sort");
  return {
    state: params.get("state")?.toUpperCase() || undefined,
    q: params.get("q")?.trim().slice(0, 60) || undefined,
    minBeds: n("minBeds"),
    minPrice: n("minPrice"),
    maxPrice: n("maxPrice"),
    type: params.get("type")?.trim() || undefined,
    availableOnly: params.get("available") === "1",
    sort: sort === "price_asc" || sort === "price_desc" || sort === "fee_desc" ? sort : "newest",
  };
}

export function applyStockFilters(lots: PartnerLot[], f: StockFilters): PartnerLot[] {
  const q = f.q?.toLowerCase();
  const out = lots.filter((l) => {
    if (l.availability === "unavailable") return false;
    if (f.availableOnly && l.availability !== "available") return false;
    if (f.state && l.state?.toUpperCase() !== f.state) return false;
    if (q && !(l.suburb ?? "").toLowerCase().includes(q)) return false;
    if (f.minBeds && (l.bedrooms ?? 0) < f.minBeds) return false;
    if (f.minPrice && (l.price ?? 0) < f.minPrice) return false;
    if (f.maxPrice && (l.price === null || l.price > f.maxPrice)) return false;
    if (f.type && l.propertyType !== f.type) return false;
    return true;
  });
  const price = (l: PartnerLot) => l.price ?? Number.POSITIVE_INFINITY;
  switch (f.sort) {
    case "price_asc":
      return out.sort((a, b) => price(a) - price(b));
    case "price_desc":
      return out.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    case "fee_desc":
      return out.sort((a, b) => (b.referralFee ?? -1) - (a.referralFee ?? -1));
    default:
      return out.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  }
}

/**
 * The whole partner-visible stock book, masked. Unavailable lots (sold, under
 * contract, withdrawn) are dropped by applyStockFilters, not here, so the
 * per-lot page can say "no longer available" rather than a bare 404.
 */
export async function loadPartnerStock(opts: { showFees: boolean }): Promise<PartnerLot[]> {
  const [rows, held, names, fees] = await Promise.all([
    pageAll<StockRow>((from, to) =>
      supabase
        .from("global_stock_pool")
        .select(PARTNER_STOCK_COLUMNS)
        .eq("pipeline_status", "active")
        .order("id")
        .range(from, to) as unknown as PromiseLike<{ data: StockRow[] | null; error: { message: string } | null }>,
    ),
    heldPropertyIds(),
    supplierNames(),
    opts.showFees ? grossFees() : Promise.resolve(new Map<string, number>()),
  ]);
  const rule = feeRuleFromEnv();
  const lots = rows.map((row) =>
    toPartnerLot(row, {
      referralFee: opts.showFees ? referralFee(fees.get(row.id), rule) : null,
      heldByPartnerDeal: held.has(row.id),
      supplierNames: names,
    }),
  );
  return assertNoForbiddenKeys(lots);
}

/** One masked lot, or null if it doesn't exist. Availability is on the lot. */
export async function loadPartnerLot(id: string, opts: { showFees: boolean }): Promise<PartnerLot | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await supabase
    .from("global_stock_pool")
    .select(PARTNER_STOCK_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;

  const [held, names, fees] = await Promise.all([
    heldPropertyIds(),
    supplierNames(),
    opts.showFees ? grossFees([id]) : Promise.resolve(new Map<string, number>()),
  ]);
  const row = data as unknown as StockRow;
  return assertNoForbiddenKeys(
    toPartnerLot(row, {
      referralFee: opts.showFees ? referralFee(fees.get(id), feeRuleFromEnv()) : null,
      heldByPartnerDeal: held.has(id),
      supplierNames: names,
    }),
  );
}

/**
 * STAFF ONLY. The supplier identity behind a lot — for the internal hold-request
 * email and to pre-fill a reveal. Never call this from app/api/partner/*.
 */
export async function lotSupplierForStaff(id: string): Promise<{
  builder_name: string | null;
  estate_name: string | null;
  lot_number: string | null;
  street_address: string | null;
}> {
  const { data } = await supabase
    .from("global_stock_pool")
    .select("builder_name,estate_name,lot_number,street_address")
    .eq("id", id)
    .maybeSingle();
  const r = (data ?? {}) as Record<string, string | null>;
  return {
    builder_name: r.builder_name ?? null,
    estate_name: r.estate_name ?? null,
    lot_number: r.lot_number ?? null,
    street_address: r.street_address ?? null,
  };
}

/** A one-line description of a masked lot, for emails and lists. */
export function lotLabel(lot: Pick<PartnerLot, "bedrooms" | "propertyType" | "suburb" | "state">): string {
  const beds = lot.bedrooms ? `${lot.bedrooms} bed ` : "";
  const type = lot.propertyType ?? "property";
  const place = [lot.suburb, lot.state].filter(Boolean).join(" ");
  return `${beds}${type}${place ? ` in ${place}` : ""}`;
}
