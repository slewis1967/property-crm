import { supabase } from "../../utils/supabase";
import { fetchAllRows } from "../../utils/supabase-paginate";
import LeadsClient, { type LeadRow } from "./LeadsClient";

export const dynamic = "force-dynamic";

// Explicit columns (never the heavy `thinking_log`). The `promoted_*` columns
// only exist after migrations/20260714_property_leads_promote.sql — if they're
// absent we retry without them so the page works pre-migration.
const COLS_BASE =
  "id,name,email,phone,buyer_type,state,budget,triage_score,match_status,top_match_name,source,created_at";
const COLS_FULL = COLS_BASE + ",promoted_at,promoted_opportunity_id";

export default async function LeadsPage() {
  const q = (cols: string) =>
    fetchAllRows((from, to) =>
      supabase.from("property_leads").select(cols).order("created_at", { ascending: false }).range(from, to),
    );

  let { data: leads, error } = await q(COLS_FULL);
  if (error && /column .*promoted/i.test(String(error))) {
    ({ data: leads, error } = await q(COLS_BASE));
  }
  if (error) {
    return <div className="text-red-600 p-4">Error loading leads: {String(error)}</div>;
  }

  return <LeadsClient initialLeads={(leads ?? []) as unknown as LeadRow[]} />;
}
