import crypto from "crypto";
import { supabase } from "./supabase";

type UpsertPayload = {
  event: "property.upserted";
  crm_property_id: string;
  price?: number | null;
  beds?: number | null;
  baths?: number | null;
  cars?: number | null;
  suburb?: string | null;
  state?: string | null;
  address?: string | null;
  images?: string[];
  gross_developer_fee?: number | null;
  builder_name?: string | null;
  estate_name?: string | null;
  lot_number?: string | null;
  status?: string | null;
};

type WithdrawPayload = {
  event: "property.withdrawn";
  crm_property_id: string;
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
  const images: string[] = [];
  if (prop.brochure_url) images.push(prop.brochure_url as string);
  for (const m of media ?? []) {
    if (m.storage_path && typeof m.storage_path === "string") {
      images.push(m.storage_path);
    }
  }
  const price: number | null =
    (prop.total_package_price as number | null) ??
    (prop.house_price as number | null) ??
    null;
  const payload: UpsertPayload = {
    event: "property.upserted",
    crm_property_id: String(prop.id),
    price,
    beds: (prop.bedrooms as number | null) ?? null,
    baths: (prop.bathrooms as number | null) ?? null,
    cars: (prop.car_spaces as number | null) ?? null,
    suburb: (prop.suburb as string | null) ?? null,
    state: (prop.state as string | null) ?? null,
    address:
      (prop.street_address as string | null) ??
      (prop.estate_name as string | null) ??
      (prop.suburb as string | null) ??
      null,
    images: images.length > 0 ? images.slice(0, 10) : undefined,
    gross_developer_fee: fin?.gross_developer_fee ?? null,
    builder_name: (prop.builder_name as string | null) ?? null,
    estate_name: (prop.estate_name as string | null) ?? null,
    lot_number: (prop.lot_number as string | null) ?? null,
    status: (prop.status as string | null) ?? null,
  };
  return payload;
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
  return postSignedJson(payload);
}

export async function publishPropertyWithdraw(propertyId: string) {
  const payload: WithdrawPayload = {
    event: "property.withdrawn",
    crm_property_id: propertyId,
  };
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

