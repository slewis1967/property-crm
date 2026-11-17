/**
 * GET /api/external/v1/appointments?from=<ISO>&to=<ISO>&contact_id=
 * External read-only calendar. Range required, at most 100 days. Video join
 * links and private notes are never included.
 */
import type { NextRequest } from "next/server";
import { supabase } from "@/utils/supabase";
import { APPOINTMENT_COLUMNS, parseIsoParam, toExternalAppointment } from "@/utils/external-api";
import { ExternalApiError, withExternalAuth } from "@/utils/external-api-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RANGE_MS = 100 * 24 * 3600 * 1000;

export const GET = withExternalAuth("appointments.list", async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const from = parseIsoParam(sp.get("from"));
  const to = parseIsoParam(sp.get("to"));
  if (!from || !to) throw new ExternalApiError(400, "from and to are required ISO 8601 date/times");
  const span = Date.parse(to) - Date.parse(from);
  if (span <= 0 || span > MAX_RANGE_MS) throw new ExternalApiError(400, "to must be after from, at most 100 days apart");
  let q = supabase
    .from("appointments")
    .select(APPOINTMENT_COLUMNS)
    .gte("start_time", from)
    .lt("start_time", to)
    .order("start_time", { ascending: true })
    .limit(1000);
  const contactId = sp.get("contact_id");
  if (contactId) {
    if (!/^[0-9a-f-]{36}$/i.test(contactId)) throw new ExternalApiError(400, "contact_id must be a UUID");
    q = q.eq("contact_id", contactId);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return { appointments: ((data || []) as unknown as Array<Record<string, unknown>>).map(toExternalAppointment) };
});
