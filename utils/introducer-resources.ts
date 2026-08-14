/**
 * The introducer document library — shaping and ordering.
 *
 * Pure: no database, no rendering, no signed URLs. Imported by the API route and
 * the page, so it must stay free of both.
 *
 * The one piece of real logic here is `isAcknowledged`, and it is the reason
 * this file exists rather than the route doing it inline: an acknowledgement is
 * only good for the exact version it was given against. Comparing on document id
 * alone would report every introducer as up to date the instant a revised policy
 * manual was published, which is precisely backwards — a revision is the moment
 * you most need to know who has not read it.
 */

export const RESOURCE_CATEGORIES = ["manual", "reference", "agreement", "marketing"] as const;
export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<ResourceCategory, string> = {
  manual: "Manuals",
  reference: "Reference",
  agreement: "Your agreement",
  marketing: "Approved client material",
};

/** Shelf order. Manuals first: they are what someone comes here for. */
const CATEGORY_ORDER: ResourceCategory[] = ["manual", "reference", "agreement", "marketing"];

export function isResourceCategory(v: unknown): v is ResourceCategory {
  return typeof v === "string" && (RESOURCE_CATEGORIES as readonly string[]).includes(v);
}

/** A row as it comes back from the table. */
export type ResourceRow = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | string | null;
  version: string;
  requires_ack: boolean;
  sort_order: number | null;
  updated_at: string | null;
};

/** An acknowledgement, as far as this module cares. */
export type AckRow = { resource_id: string; version: string };

/** What the portal is allowed to see. No storage path: the file is fetched
 *  through a route that mints a short-lived URL, never by path. */
export type ResourceView = {
  id: string;
  title: string;
  description: string;
  category: ResourceCategory;
  filename: string;
  version: string;
  sizeLabel: string | null;
  updatedAt: string | null;
  requiresAck: boolean;
  acknowledged: boolean;
};

/**
 * Has this introducer confirmed reading THIS version?
 *
 * Version strings are compared after trimming and case-folding, so "1.0" and
 * "1.0 " are the same version. They are not parsed or ordered — an
 * acknowledgement of "2.0" says nothing about "1.0", and inferring that newer
 * covers older would be inventing consent.
 */
export function isAcknowledged(row: ResourceRow, acks: AckRow[]): boolean {
  const want = row.version.trim().toLowerCase();
  return acks.some((a) => a.resource_id === row.id && a.version.trim().toLowerCase() === want);
}

/** "1.2 MB". Null when the size was never recorded, so the UI can omit it
 *  rather than print a confident "0 B". */
export function sizeLabel(bytes: number | string | null | undefined): string | null {
  const n = typeof bytes === "string" ? Number(bytes) : bytes;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function toResourceView(row: ResourceRow, acks: AckRow[]): ResourceView {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    // An unrecognised category lands in Reference rather than vanishing. A
    // document that is on the shelf but rendered nowhere is worse than one
    // filed under the wrong heading.
    category: isResourceCategory(row.category) ? row.category : "reference",
    filename: row.filename,
    version: row.version,
    sizeLabel: sizeLabel(row.size_bytes),
    updatedAt: row.updated_at ?? null,
    requiresAck: row.requires_ack,
    acknowledged: isAcknowledged(row, acks),
  };
}

export type ResourceSection = { category: ResourceCategory; label: string; items: ResourceView[] };

/** Group into shelf sections, dropping empties. Within a section, the order the
 *  rows arrived in is kept — the query sorts by sort_order, which is the
 *  editorial decision and does not belong in this file. */
export function shelve(views: ResourceView[]): ResourceSection[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    label: CATEGORY_LABEL[category],
    items: views.filter((v) => v.category === category),
  })).filter((s) => s.items.length > 0);
}

/** Documents this introducer must confirm and has not. Drives the one banner. */
export function unacknowledged(views: ResourceView[]): ResourceView[] {
  return views.filter((v) => v.requiresAck && !v.acknowledged);
}
