/**
 * Property shortlists — the database side. Server-only.
 *
 * Two audiences share this module and must never share a code path that
 * decides what they see:
 *   - the PUBLIC client routes (app/api/shortlist/[token]/*) get
 *     `loadClientShortlist`, which is masked (utils/property-shortlist.ts) and
 *     runs the partner portal's forbidden-key tripwire before returning;
 *   - the STAFF routes (app/api/property-shortlists/*) get `listShortlists` /
 *     `loadShortlistForStaff`, which carry the stock ids so staff can open a lot.
 *
 * Every public handler resolves the token itself (`resolveShortlistToken`) and
 * scopes every item read to that shortlist's id — never an id from the caller
 * alone.
 */
import { supabase } from "./supabase";
import { hashToken, newToken } from "./sign-token";
import { sendBrevoEmail } from "./brevo";
import { resolveIdentity } from "./mailIdentities";
import { assertNoForbiddenKeys, redactSupplierNames, type StockRow } from "./partner";
import { lotLabel, supplierNames } from "./partner-stock";
import { findHost, findHostBySlug, hostsForBrand } from "./scheduling-hosts";
import {
  lotFromSnapshot,
  parseAssumptions,
  REPORT_DISCLAIMER,
  SHORTLIST_MIGRATION_HINT,
  shortlistImageUrls,
  shortlistSuburbs,
  shortlistTablesMissing,
  shortlistUsable,
  toClientLotView,
  toClientProperty,
  type ClientLotView,
  type ClientProperty,
  type CreateItemInput,
  type MediaRow,
  type ResponseInput,
  type ShortlistAssumptions,
  type ShortlistItemRow,
} from "./property-shortlist";
import { shortlistInviteHtml, shortlistResponseNoticeHtml } from "./property-shortlist-email";

export const SHORTLISTS = "property_shortlists";
export const SHORTLIST_ITEMS = "property_shortlist_items";
export const SHORTLIST_EVENTS = "property_shortlist_events";

/** Exactly what toClientLotView reads. No builder, estate, lot, address, brochure or free text. */
const CLIENT_STOCK_COLUMNS =
  "id,suburb,state,property_type,bedrooms,bathrooms,car_spaces,study_room," +
  "land_size_sqm,land_size,house_size,frontage_m,total_package_price,house_price,land_price," +
  "build_price,contract_type,titled,completion_date,land_registration_date,expected_rent_weekly," +
  "status,pipeline_status,updated_at";

const SHORTLIST_COLUMNS =
  "id,contact_id,opportunity_id,client_name,client_email,title,message,assumptions,booking_slug," +
  "status,expires_at,first_viewed_at,last_viewed_at,view_count,created_by,revoked_at,created_at";

const ITEM_COLUMNS =
  "id,shortlist_id,property_id,position,rent_weekly_override,staff_note,lot_snapshot," +
  "client_response,client_note,responded_at";

export type ShortlistRow = {
  id: string;
  contact_id: string | null;
  opportunity_id: string | null;
  client_name: string;
  client_email: string | null;
  title: string | null;
  message: string | null;
  assumptions: unknown;
  booking_slug: string | null;
  status: string;
  expires_at: string;
  first_viewed_at: string | null;
  last_viewed_at: string | null;
  view_count: number;
  created_by: string;
  revoked_at: string | null;
  created_at: string;
};

export type ItemRow = ShortlistItemRow & {
  shortlist_id: string;
  property_id: string;
  position: number;
  lot_snapshot: unknown;
};

/** Same words for unknown, revoked and expired — a stranger can't tell which links existed. */
export const LINK_INVALID =
  "This link isn't active any more. Please contact your NextKey consultant for a new one.";

type Fail = { ok: false; status: number; error: string };

// ── Token ────────────────────────────────────────────────────────────────────────

export async function resolveShortlistToken(token: string): Promise<{ ok: true; row: ShortlistRow } | Fail> {
  if (typeof token !== "string" || token.length < 20 || token.length > 128) {
    return { ok: false, status: 404, error: LINK_INVALID };
  }
  const { data, error } = await supabase
    .from(SHORTLISTS)
    .select(SHORTLIST_COLUMNS)
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (error) {
    if (shortlistTablesMissing(error)) console.error("[shortlist] tables missing —", SHORTLIST_MIGRATION_HINT);
    return { ok: false, status: 500, error: "Something went wrong. Please try again." };
  }
  // The select is a concatenated string, so supabase-js can't infer the row shape.
  const row = data as unknown as ShortlistRow | null;
  if (!row || !shortlistUsable(row)) return { ok: false, status: 404, error: LINK_INVALID };
  return { ok: true, row };
}

// ── Reads ────────────────────────────────────────────────────────────────────────

async function loadItems(shortlistId: string): Promise<ItemRow[]> {
  const { data, error } = await supabase
    .from(SHORTLIST_ITEMS)
    .select(ITEM_COLUMNS)
    .eq("shortlist_id", shortlistId)
    .order("position");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ItemRow[];
}

async function loadStockRows(ids: string[]): Promise<Map<string, StockRow>> {
  const map = new Map<string, StockRow>();
  if (ids.length === 0) return map;
  const { data, error } = await supabase.from("global_stock_pool").select(CLIENT_STOCK_COLUMNS).in("id", ids);
  if (error) throw new Error(error.message);
  for (const r of (data ?? []) as unknown as StockRow[]) map.set(r.id, r);
  return map;
}

/**
 * Photo URLs per lot, SERVER-SIDE ONLY (see shortlistImageUrls for why). The
 * order is stable — created_at, then id — because the client asks for photo N
 * and the image route must resolve N to the same file on every request.
 */
export async function loadImageUrls(ids: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (ids.length === 0) return out;
  const [media, brochures] = await Promise.all([
    supabase
      .from("property_media")
      .select("property_id,kind,storage_path")
      .in("property_id", ids)
      .in("kind", ["facade", "gallery"])
      .order("created_at")
      .order("id"),
    supabase.from("global_stock_pool").select("id,brochure_url").in("id", ids),
  ]);
  const byLot = new Map<string, MediaRow[]>();
  for (const m of (media.data ?? []) as (MediaRow & { property_id: string })[]) {
    const list = byLot.get(m.property_id) ?? [];
    list.push(m);
    byLot.set(m.property_id, list);
  }
  const brochure = new Map<string, unknown>();
  for (const b of (brochures.data ?? []) as { id: string; brochure_url: unknown }[]) brochure.set(b.id, b.brochure_url);
  for (const id of ids) {
    out.set(id, shortlistImageUrls(byLot.get(id) ?? [], brochure.get(id), process.env.NEXT_PUBLIC_SUPABASE_URL));
  }
  return out;
}

export type ClientShortlistPayload = {
  clientFirstName: string;
  title: string | null;
  message: string | null;
  consultantName: string | null;
  assumptions: ShortlistAssumptions;
  bookingPath: string | null;
  expiresAt: string;
  properties: ClientProperty[];
  suburbs: { suburb: string; state: string | null }[];
  disclaimer: string;
};

/** Everything the client page renders. Masked, and checked for leaks before it leaves. */
export async function loadClientShortlist(row: ShortlistRow): Promise<ClientShortlistPayload> {
  const items = await loadItems(row.id);
  const ids = items.map((i) => i.property_id);
  const [stock, images, names] = await Promise.all([loadStockRows(ids), loadImageUrls(ids), supplierNames()]);

  const properties: ClientProperty[] = [];
  for (const item of items) {
    const live = stock.get(item.property_id);
    const lot: ClientLotView | null = live ? toClientLotView(live, names) : lotFromSnapshot(item.lot_snapshot);
    if (!lot) continue;
    properties.push(
      toClientProperty(
        lot,
        { ...item, staff_note: redactSupplierNames(item.staff_note, names) },
        live ? (images.get(item.property_id)?.length ?? 0) : 0,
      ),
    );
  }

  const host = row.booking_slug ? findHostBySlug(row.booking_slug) : undefined;
  const consultant = findHost(row.created_by);
  return assertNoForbiddenKeys({
    clientFirstName: row.client_name.trim().split(/\s+/)[0] ?? "",
    title: row.title,
    message: redactSupplierNames(row.message, names),
    consultantName: consultant?.displayName ?? null,
    assumptions: parseAssumptions(row.assumptions),
    bookingPath: host ? `/book/${host.slug}` : null,
    expiresAt: row.expires_at,
    properties,
    suburbs: shortlistSuburbs(properties),
    disclaimer: REPORT_DISCLAIMER,
  });
}

/** Photo N of an item on THIS shortlist, or null. The item is scoped to the resolved shortlist. */
export async function imageUrlForItem(row: ShortlistRow, itemId: string, n: number): Promise<string | null> {
  const { data } = await supabase
    .from(SHORTLIST_ITEMS)
    .select("property_id")
    .eq("id", itemId)
    .eq("shortlist_id", row.id)
    .maybeSingle();
  const propertyId = (data as { property_id?: string } | null)?.property_id;
  if (!propertyId) return null;
  const urls = (await loadImageUrls([propertyId])).get(propertyId) ?? [];
  return urls[n] ?? null;
}

/** Best-effort view counter. A lost increment is not worth failing a page load over. */
export async function recordView(row: ShortlistRow): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from(SHORTLISTS)
    .update({
      view_count: (row.view_count ?? 0) + 1,
      last_viewed_at: now,
      first_viewed_at: row.first_viewed_at ?? now,
    })
    .eq("id", row.id);
  if (!row.first_viewed_at) await logEvent(row.id, null, "client", row.client_email ?? "client", "first_viewed", {});
}

// ── Audit ────────────────────────────────────────────────────────────────────────

export async function logEvent(
  shortlistId: string,
  itemId: string | null,
  actorType: "client" | "staff" | "system",
  actor: string,
  action: string,
  detail: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.from(SHORTLIST_EVENTS).insert({
    shortlist_id: shortlistId,
    item_id: itemId,
    actor_type: actorType,
    actor,
    action,
    detail,
  });
  if (error) console.error("[shortlist] event log failed", action, error.message);
}

// ── Create ───────────────────────────────────────────────────────────────────────

export type CreateShortlistInput = {
  clientName: string;
  clientEmail: string | null;
  contactId: string | null;
  opportunityId: string | null;
  title: string | null;
  message: string | null;
  assumptions: ShortlistAssumptions;
  bookingSlug: string | null;
  ttlDays: number;
  items: CreateItemInput[];
  sendEmail: boolean;
  createdBy: string;
  origin: string;
};

export type CreateShortlistResult =
  | {
      ok: true;
      id: string;
      /** Contains the raw token. Shown once to staff; never stored or logged. */
      link: string;
      emailed: boolean;
      emailError: string | null;
      unavailable: string[];
    }
  | Fail;

export async function createShortlist(input: CreateShortlistInput): Promise<CreateShortlistResult> {
  const ids = input.items.map((i) => i.propertyId);
  const [stock, names] = await Promise.all([loadStockRows(ids), supplierNames()]);
  const missing = ids.filter((id) => !stock.has(id));
  if (missing.length) {
    return { ok: false, status: 400, error: `${missing.length} of the selected properties no longer exist. Refresh the feed and try again.` };
  }

  const lots = new Map<string, ClientLotView>();
  for (const id of ids) lots.set(id, toClientLotView(stock.get(id)!, names));
  const unavailable = ids.filter((id) => lots.get(id)!.availability === "unavailable").map((id) => lots.get(id)!.ref);

  // Default the booking link to the consultant sending it, else the first NextKey host.
  const bookingSlug =
    (input.bookingSlug && findHostBySlug(input.bookingSlug)?.slug) ||
    findHost(input.createdBy)?.slug ||
    hostsForBrand("nextkey")[0]?.slug ||
    null;

  const token = newToken();
  const expiresAt = new Date(Date.now() + input.ttlDays * 86_400_000).toISOString();

  const { data: created, error } = await supabase
    .from(SHORTLISTS)
    .insert({
      token_hash: token.hash,
      contact_id: input.contactId,
      opportunity_id: input.opportunityId,
      client_name: input.clientName,
      client_email: input.clientEmail,
      title: input.title,
      message: input.message,
      assumptions: input.assumptions,
      booking_slug: bookingSlug,
      expires_at: expiresAt,
      created_by: input.createdBy,
    })
    .select("id")
    .single();
  if (error || !created) {
    if (shortlistTablesMissing(error)) return { ok: false, status: 503, error: SHORTLIST_MIGRATION_HINT };
    return { ok: false, status: 500, error: error?.message ?? "Could not create the shortlist." };
  }
  const shortlistId = (created as { id: string }).id;

  const { error: itemsError } = await supabase.from(SHORTLIST_ITEMS).insert(
    input.items.map((item, position) => ({
      shortlist_id: shortlistId,
      property_id: item.propertyId,
      position,
      rent_weekly_override: item.rentWeekly,
      staff_note: item.staffNote,
      lot_snapshot: lots.get(item.propertyId),
    })),
  );
  if (itemsError) {
    // A shortlist with no properties behind it must not survive as a live link.
    await supabase.from(SHORTLISTS).delete().eq("id", shortlistId);
    return { ok: false, status: 500, error: itemsError.message };
  }

  // The raw token appears ONLY here.
  const link = `${input.origin}/shortlist/${token.raw}`;

  let emailed = false;
  let emailError: string | null = null;
  if (input.sendEmail && input.clientEmail) {
    const identity = resolveIdentity("nextkey");
    const suburbs = shortlistSuburbs([...lots.values()]).map((s) => s.suburb);
    const res = await sendBrevoEmail({
      to: [{ email: input.clientEmail, name: input.clientName }],
      subject:
        ids.length === 1 ? "A property we think you'll like — NextKey" : `${ids.length} properties we've picked for you — NextKey`,
      html: shortlistInviteHtml({
        firstName: input.clientName.split(/\s+/)[0] ?? "",
        link,
        count: ids.length,
        suburbs,
        message: redactSupplierNames(input.message, names),
        consultantName: findHost(input.createdBy)?.displayName ?? null,
      }),
      fromEmail: identity.fromEmail,
      fromName: identity.fromName,
      // Replies go to the consultant who sent it, not a shared inbox.
      replyTo: /@/.test(input.createdBy) ? input.createdBy : undefined,
      tags: ["nextkey", "property-shortlist"],
      // Presenting stock is commercial email: an unsubscribed client is suppressed
      // (Spam Act). Staff still get the link to share another way.
      commercial: true,
    });
    emailed = res.ok;
    if (!res.ok) emailError = res.error;
  }

  await logEvent(shortlistId, null, "staff", input.createdBy, "created", {
    items: ids.length,
    emailed,
    email_error: emailError,
    unavailable,
  });

  return { ok: true, id: shortlistId, link, emailed, emailError, unavailable };
}

// ── Client response ──────────────────────────────────────────────────────────────

export async function recordResponse(
  row: ShortlistRow,
  input: ResponseInput,
  ctx: { ip: string; origin: string },
): Promise<{ ok: true; respondedAt: string | null } | Fail> {
  const respondedAt = input.response ? new Date().toISOString() : null;
  const { data, error } = await supabase
    .from(SHORTLIST_ITEMS)
    .update({ client_response: input.response, client_note: input.note, responded_at: respondedAt })
    .eq("id", input.itemId)
    .eq("shortlist_id", row.id)
    .select("id,property_id,lot_snapshot")
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: "Couldn't save that. Please try again." };
  if (!data) return { ok: false, status: 404, error: "That property isn't on this shortlist." };

  await logEvent(row.id, input.itemId, "client", row.client_email ?? row.client_name, "responded", {
    response: input.response,
    note: input.note,
    ip: ctx.ip,
  });

  // Tell the consultant. Best-effort: the response is already recorded.
  const lot = lotFromSnapshot((data as { lot_snapshot: unknown }).lot_snapshot);
  const recipients = shortlistNotifyRecipients(row.created_by);
  if (lot && recipients.length) {
    const staffLink = row.contact_id ? `${ctx.origin}/contacts/${row.contact_id}` : `${ctx.origin}/properties/${(data as { property_id: string }).property_id}`;
    const res = await sendBrevoEmail({
      to: recipients.map((email) => ({ email })),
      subject: `${row.client_name} ${input.response === "interested" ? "is interested in" : input.response === "not_for_me" ? "passed on" : "updated"} ${lot.ref}`,
      html: shortlistResponseNoticeHtml({
        clientName: row.client_name,
        lotLabel: lotLabel(lot),
        lotRef: lot.ref,
        response: input.response,
        note: input.note,
        staffLink,
      }),
      tags: ["internal", "property-shortlist"],
    });
    if (!res.ok) console.error("[shortlist] response notice failed", res.error);
  }

  return { ok: true, respondedAt };
}

/** The consultant who sent it, plus SHORTLIST_NOTIFY_EMAILS (default Sean). Deduplicated. */
export function shortlistNotifyRecipients(createdBy: string, env: Record<string, string | undefined> = process.env): string[] {
  const raw = [createdBy, ...(env.SHORTLIST_NOTIFY_EMAILS ?? "sean.l@nextkey.com.au").split(",")];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of raw) {
    const v = e.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

// ── Staff ────────────────────────────────────────────────────────────────────────

export type StaffShortlist = Omit<ShortlistRow, "assumptions"> & {
  assumptions: ShortlistAssumptions;
  usable: boolean;
  items: {
    id: string;
    property_id: string;
    ref: string | null;
    label: string | null;
    price: number | null;
    rent_weekly_override: number | null;
    staff_note: string | null;
    client_response: string | null;
    client_note: string | null;
    responded_at: string | null;
  }[];
};

function toStaffShortlist(row: ShortlistRow, items: ItemRow[]): StaffShortlist {
  return {
    ...row,
    assumptions: parseAssumptions(row.assumptions),
    usable: shortlistUsable(row),
    items: items.map((i) => {
      const lot = lotFromSnapshot(i.lot_snapshot);
      const override = Number(i.rent_weekly_override);
      return {
        id: i.id,
        property_id: i.property_id,
        ref: lot?.ref ?? null,
        label: lot ? lotLabel(lot) : null,
        price: lot?.price ?? null,
        rent_weekly_override: Number.isFinite(override) && override > 0 ? override : null,
        staff_note: i.staff_note,
        client_response: i.client_response,
        client_note: i.client_note,
        responded_at: i.responded_at,
      };
    }),
  };
}

export async function listShortlists(filter: { contactId?: string | null; limit?: number }): Promise<
  { ok: true; shortlists: StaffShortlist[]; tableMissing?: boolean } | Fail
> {
  let q = supabase.from(SHORTLISTS).select(SHORTLIST_COLUMNS).order("created_at", { ascending: false }).limit(filter.limit ?? 50);
  if (filter.contactId) q = q.eq("contact_id", filter.contactId);
  const { data, error } = await q;
  if (error) {
    if (shortlistTablesMissing(error)) return { ok: true, shortlists: [], tableMissing: true };
    return { ok: false, status: 500, error: error.message };
  }
  const rows = (data ?? []) as unknown as ShortlistRow[];
  if (rows.length === 0) return { ok: true, shortlists: [] };

  const { data: itemData, error: itemError } = await supabase
    .from(SHORTLIST_ITEMS)
    .select(ITEM_COLUMNS)
    .in("shortlist_id", rows.map((r) => r.id))
    .order("position");
  if (itemError) return { ok: false, status: 500, error: itemError.message };
  const byShortlist = new Map<string, ItemRow[]>();
  for (const i of (itemData ?? []) as unknown as ItemRow[]) {
    const list = byShortlist.get(i.shortlist_id) ?? [];
    list.push(i);
    byShortlist.set(i.shortlist_id, list);
  }
  return { ok: true, shortlists: rows.map((r) => toStaffShortlist(r, byShortlist.get(r.id) ?? [])) };
}

export async function revokeShortlist(id: string, by: string): Promise<{ ok: true } | Fail> {
  const { data, error } = await supabase
    .from(SHORTLISTS)
    .update({ status: "revoked", revoked_by: by, revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: error.message };
  if (!data) return { ok: false, status: 404, error: "Shortlist not found or already revoked." };
  await logEvent(id, null, "staff", by, "revoked", {});
  return { ok: true };
}
