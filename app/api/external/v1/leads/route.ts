/**
 * GET /api/external/v1/leads?since=<ISO>&limit=&offset=
 * External read-only lead list (see utils/external-api.ts). Newest first.
 */
import type { NextRequest } from "next/server";
import { parseIsoParam, parsePaging } from "@/utils/external-api";
import { ExternalApiError, listLeads, withExternalAuth } from "@/utils/external-api-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withExternalAuth("leads.list", async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const since = parseIsoParam(sp.get("since"));
  if (since === undefined) throw new ExternalApiError(400, "since must be an ISO 8601 date/time");
  const { limit, offset } = parsePaging(sp);
  const { total, leads } = await listLeads({ since, limit, offset });
  return { total, limit, offset, leads };
});
