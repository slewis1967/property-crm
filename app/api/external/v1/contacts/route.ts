/**
 * GET /api/external/v1/contacts?since=<ISO>&updated_since=<ISO>&limit=&offset=
 * External read-only contact list: name, email, phone, source, status, tags, dates.
 */
import type { NextRequest } from "next/server";
import { supabase } from "@/utils/supabase";
import { CONTACT_COLUMNS, parseIsoParam, parsePaging, toExternalContact } from "@/utils/external-api";
import { ExternalApiError, withExternalAuth } from "@/utils/external-api-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withExternalAuth("contacts.list", async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const since = parseIsoParam(sp.get("since"));
  const updatedSince = parseIsoParam(sp.get("updated_since"));
  if (since === undefined || updatedSince === undefined) {
    throw new ExternalApiError(400, "since / updated_since must be ISO 8601 date/times");
  }
  const { limit, offset } = parsePaging(sp);
  let q = supabase
    .from("contacts")
    .select(CONTACT_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);
  if (since) q = q.gte("created_at", since);
  if (updatedSince) q = q.gte("updated_at", updatedSince);
  const { data, error, count } = await q;
  if (error) throw new Error(error.message);
  return {
    total: count ?? null,
    limit,
    offset,
    contacts: ((data || []) as unknown as Array<Record<string, unknown>>).map(toExternalContact),
  };
});
