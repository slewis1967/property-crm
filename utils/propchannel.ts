import crypto from "crypto";
import { supabase } from "./supabase";

export type ReceiverStatus = "available" | "reserved" | "sold" | "withdrawn";

// Minimal shape of the stock row fields we read from global_stock_pool
export interface StockRow {
  id: string;
  street_address?: string | null;
  suburb?: string | null;
  state?: string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  car_spaces?: number | null;
  total_package_price?: number | null;
  house_price?: number | null;
  builder_name?: string | null;
  estate_name?: string | null;
  lot_number?: string | null;
  status?: string | null;
  brochure_url?: string | null;
  land_size_sqm?: number | null;
  land_size?: number | null;
  house_size?: number | null;
  expected_rent_weekly?: number | null;
  postcode?: string | null;
  property_type?: string | null;
}

export interface MediaRow {
  kind?: string | null;
  storage_path?: string | null;
}

export interface FinancialRow {
  gross_developer_fee?: number | null;
}

export type ReceiverProperty = {
  crm_property_id: string;
  title: string;
  suburb: string;
  state: string;
  price: number;
  // Optional / nullish fields per receiver schema
  developer_project?: string | null;
  beds?: number | null;
  baths?: number | null;
  cars?: number | null;
  address_line?: string | null;
  postcode?: string | null;
  property_type?: string | null;
  land_sqm?: number | null;
  build_sqm?: number | null;
  est_rent_pw?: number | null;
  smsf_suitable?: boolean | null;
  developer_name?: string | null;
  status: ReceiverStatus;
  hero_image_url?: string | null;
  gross_developer_fee: number; // nonnegative
};

type UpsertPayload = {
  event: "property.upserted";
  property: ReceiverProperty;
};

type WithdrawPayload = {
  event: "property.withdrawn";
  property: ReceiverProperty;
};

function getEnv() {
  const enabled = String(process.env.PROPCHANNEL_SYNC_ENABLED || "false").toLowerCase() === "true";
  const url =
    process.env.PROPCHANNEL_WEBHOOK_URL ||
    "https://propchannel-os.netlify.app/api/webhooks/crm";
  const secret =
    process.env.PROPCHANNEL_WEBHOOK_SECRET ||
    process.env.CRM_WEBHOOK_SECRET ||
    "";
  return { enabled, url, secret };
}

function signBodyHex(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

function normaliseStatus(s: unknown): ReceiverStatus {
  const k = String(s || "").toLowerCase();
  if (k === "sold") return "sold";
  if (k === "withdrawn") return "withdrawn";
  if (k === "hold" || k === "on hold" || k === "reserved") return "reserved";
  return "available";
}

function deriveTitle(p: StockRow): string {
  const address = (p.street_address as string | null) ?? "";
  const suburb = (p.suburb as string | null) ?? "";
  const estate = (p.estate_name as string | null) ?? "";
  const lot = (p.lot_number as string | null) ?? "";
  if (address && suburb) return `${address}, ${suburb}`;
  if (lot && estate) return `Lot ${lot} — ${estate}`;
  if (estate && suburb) return `${estate}, ${suburb}`;
  const builder = (p.builder_name as string | null) ?? "";
  if (builder && suburb) return `${builder} — ${suburb}`;
  return address || estate || builder || suburb || "Property";
}

function pickHeroImage(p: StockRow, media?: MediaRow[]): string | null {
  if (p.brochure_url && typeof p.brochure_url === "string") return p.brochure_url as string;
  for (const m of media ?? []) {
    if (m.storage_path && typeof m.storage_path === "string") {
      return m.storage_path;
    }
  }
  return null;
}

export function makeReceiverProperty(
  p: StockRow,
  fin?: FinancialRow | null,
  media?: MediaRow[] | null,
  overrideStatus?: ReceiverStatus,
): ReceiverProperty {
  const priceRaw: number | null =
    (p.total_package_price as number | null) ??
    (p.house_price as number | null) ??
    null;
  const price = priceRaw != null && isFinite(priceRaw) && priceRaw > 0 ? priceRaw : 0;
  const gdfRaw = fin?.gross_developer_fee;
  const hero = pickHeroImage(p, media ?? undefined);
  const status = overrideStatus ?? normaliseStatus(p.status);
  const state = ((p.state as string | null) ?? "").trim();
  const suburb = ((p.suburb as string | null) ?? "").trim();
  return {
    crm_property_id: String(p.id),
    title: deriveTitle(p),
    suburb,
    state,
    price,
    developer_project: (p.estate_name as string | null) ?? null,
    beds: (p.bedrooms as number | null) ?? null,
    baths: (p.bathrooms as number | null) ?? null,
    cars: (p.car_spaces as number | null) ?? null,
    address_line:
      (p.street_address as string | null) ??
      (p.estate_name as string | null) ??
      (p.suburb as string | null) ??
      null,
    postcode: (p.postcode as string | null) ?? null,
    property_type: ((p.property_type as string | null) ?? "house_land") || "house_land",
    land_sqm: (p.land_size_sqm as number | null) ?? (p.land_size as number | null) ?? null,
    build_sqm: (p.house_size as number | null) ?? null,
    est_rent_pw: (p.expected_rent_weekly as number | null) ?? null,
    smsf_suitable: false,
    developer_name: (p.builder_name as string | null) ?? null,
    status,
    hero_image_url: hero,
    gross_developer_fee:
      gdfRaw != null && isFinite(gdfRaw as number) && (gdfRaw as number) >= 0
        ? (gdfRaw as number)
        : -1, // mark invalid; validator will block send
  };
}

export async function buildUpsertPayload(propertyId: string): Promise<UpsertPayload | null> {
  const [{ data: prop }, { data: fin }, { data: media }] = await Promise.all([
    supabase.from("global_stock_pool").select("*").eq("id", propertyId).maybeSingle(),
    supabase
      .from("property_financials")
      .select("gross_developer_fee")
      .eq("property_id", propertyId)
      .maybeSingle(),
    supabase
      .from("property_media")
      .select("kind,storage_path")
      .eq("property_id", propertyId),
  ]);
  if (!prop) return null;
  const property = makeReceiverProperty(prop as StockRow, fin as FinancialRow | null, (media as MediaRow[] | null));
  const payload: UpsertPayload = { event: "property.upserted", property };
  return payload;
}

function validateReceiverProperty(p: ReceiverProperty): { ok: true } | { ok: false; reason: string } {
  if (!p.crm_property_id || p.crm_property_id.trim().length === 0)
    return { ok: false, reason: "crm_property_id missing" };
  if (!p.title || p.title.trim().length === 0) return { ok: false, reason: "title missing" };
  if (!p.suburb || p.suburb.trim().length === 0) return { ok: false, reason: "suburb missing" };
  if (!p.state || p.state.trim().length < 2) return { ok: false, reason: "state too short" };
  if (!isFinite(p.price) || p.price <= 0) return { ok: false, reason: "price not positive" };
  if (!isFinite(p.gross_developer_fee) || p.gross_developer_fee < 0)
    return { ok: false, reason: "gross_developer_fee negative/missing" };
  if (!["available", "reserved", "sold", "withdrawn"].includes(p.status))
    return { ok: false, reason: "invalid status" };
  return { ok: true };
}

async function postSignedJson(payload: object) {
  const { enabled, url, secret } = getEnv();
  if (!enabled) {
    console.info("[propchannel] disabled — would send:", payload);
    return { ok: true, skipped: true };
  }
  if (!secret) {
    console.warn("[propchannel] secret missing — skipping send");
    return { ok: false, error: "secret_missing" };
  }
  const body = JSON.stringify(payload);
  const sig = signBodyHex(body, secret);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-propchannel-signature": sig,
    },
    body,
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    console.error("[propchannel] send failed", res.status, text);
    return { ok: false, status: res.status, body: text };
  }
  console.info("[propchannel] sent", res.status, text.slice(0, 200));
  return { ok: true, status: res.status, body: text };
}

export async function publishPropertyUpsert(propertyId: string) {
  const payload = await buildUpsertPayload(propertyId);
  if (!payload) return { ok: false, error: "not_found" };
  const v = validateReceiverProperty(payload.property);
  if (v.ok !== true) {
    console.warn("[propchannel] skip upsert: invalid_payload_local:", v.reason);
    const { enabled } = getEnv();
    if (!enabled) return { ok: false, error: "invalid_payload_local", reason: v.reason, skipped: true };
    return { ok: false, error: "invalid_payload_local", reason: v.reason };
  }
  return postSignedJson(payload);
}

export async function publishPropertyWithdraw(propertyId: string) {
  const [{ data: prop }, { data: fin }, { data: media }] = await Promise.all([
    supabase.from("global_stock_pool").select("*").eq("id", propertyId).maybeSingle(),
    supabase
      .from("property_financials")
      .select("gross_developer_fee")
      .eq("property_id", propertyId)
      .maybeSingle(),
    supabase
      .from("property_media")
      .select("kind,storage_path")
      .eq("property_id", propertyId),
  ]);
  if (!prop) return { ok: false, error: "not_found" };
  const property = makeReceiverProperty(prop as StockRow, fin as FinancialRow | null, (media as MediaRow[] | null), "withdrawn");
  const payload: WithdrawPayload = { event: "property.withdrawn", property };
  const v = validateReceiverProperty(payload.property);
  if (v.ok !== true) {
    console.warn("[propchannel] skip withdraw: invalid_payload_local:", v.reason);
    const { enabled } = getEnv();
    if (!enabled) return { ok: false, error: "invalid_payload_local", reason: v.reason, skipped: true };
    return { ok: false, error: "invalid_payload_local", reason: v.reason };
  }
  return postSignedJson(payload);
}

export function propChannelEnv() {
  const { enabled, url, secret } = getEnv();
  return {
    enabled,
    url,
    hasSecret: !!secret,
  };
}

export function signForDryRun(payload: object, secret?: string) {
  const sec =
    secret || process.env.PROPCHANNEL_WEBHOOK_SECRET || process.env.CRM_WEBHOOK_SECRET || "";
  const body = JSON.stringify(payload);
  return { signature: signBodyHex(body, sec), body };
}

