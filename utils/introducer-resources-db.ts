/**
 * The introducer document library — database and storage.
 *
 * The impure half of utils/introducer-resources.ts. Every read here filters on
 * `published`, in this file, once: there is deliberately no exported helper that
 * fetches a resource by id alone, so "forgot to check it was published" is not a
 * mistake a future route can make.
 */
import { supabase } from "./supabase";
import type { ResourceRow, AckRow } from "./introducer-resources";

const BUCKET = "introducer-library";

/** Short enough that a copied link is dead before it can be pasted anywhere
 *  useful, long enough for a slow phone to finish the download. */
const DOWNLOAD_TTL = 120;

const ROW_COLUMNS =
  "id,slug,title,description,category,filename,mime_type,size_bytes,version,requires_ack,sort_order,updated_at";

/**
 * True when the failure is "this feature has not been migrated yet" rather than
 * a real error. Lets the portal say so plainly instead of showing a stack trace
 * to an introducer, in the window between deploying this and running the SQL.
 */
export function resourcesTableMissing(err: unknown): boolean {
  const msg = typeof err === "string" ? err : (err as { message?: string })?.message || "";
  return /introducer_resources|introducer_resource_acks/.test(msg) &&
    /does not exist|schema cache|relation/i.test(msg);
}

function fail(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

/** Everything on the shelf, in editorial order. Unpublished rows never leave
 *  this function. */
export async function listPublishedResources(): Promise<ResourceRow[]> {
  const { data, error } = await supabase
    .from("introducer_resources")
    .select(ROW_COLUMNS)
    .eq("published", true)
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });
  fail("listing introducer resources", error);
  return (data ?? []) as ResourceRow[];
}

/** One published resource, including the storage path the caller needs to sign.
 *  Returns null for "not published" and "no such id" alike. */
export async function findPublishedResource(
  id: string,
): Promise<(ResourceRow & { storage_path: string }) | null> {
  if (!id || typeof id !== "string") return null;
  const { data, error } = await supabase
    .from("introducer_resources")
    .select(`${ROW_COLUMNS},storage_path`)
    .eq("id", id)
    .eq("published", true)
    .maybeSingle();
  fail("loading an introducer resource", error);
  return (data as (ResourceRow & { storage_path: string }) | null) ?? null;
}

/** This introducer's acknowledgements. Version-bearing, because that is the
 *  only form in which an acknowledgement means anything. */
export async function acksFor(introducerId: string): Promise<AckRow[]> {
  const { data, error } = await supabase
    .from("introducer_resource_acks")
    .select("resource_id,version")
    .eq("introducer_id", introducerId);
  fail("loading resource acknowledgements", error);
  return (data ?? []) as AckRow[];
}

/**
 * Record that an introducer confirmed reading a version.
 *
 * Idempotent by way of the unique constraint: a double-clicked button, or a
 * retried request, resolves to "already acknowledged" rather than a second row
 * or a 500. The FIRST confirmation is the one that stands — re-recording it
 * would move the timestamp, and the timestamp is the evidence.
 */
export async function recordAck(entry: {
  resourceId: string;
  introducerId: string;
  version: string;
  acknowledgedBy: string | null;
  ip: string | null;
  userAgent: string | null;
}): Promise<{ recorded: boolean }> {
  const { error } = await supabase.from("introducer_resource_acks").insert({
    resource_id: entry.resourceId,
    introducer_id: entry.introducerId,
    version: entry.version,
    acknowledged_by: entry.acknowledgedBy,
    ip: entry.ip,
    user_agent: entry.userAgent,
  });
  if (error) {
    if (error.code === "23505") return { recorded: false };
    throw new Error(`recording an acknowledgement: ${error.message}`);
  }
  return { recorded: true };
}

/**
 * A short-lived URL for one document.
 *
 * Nothing durable is ever handed out: the bucket is private and this is the only
 * way in. `download` makes the browser save it under the published filename
 * rather than the storage key, which is a uuid nobody wants on their desktop.
 */
export async function signResource(
  storagePath: string,
  filename: string,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, DOWNLOAD_TTL, { download: filename });
  if (error) return null;
  return data?.signedUrl ?? null;
}
