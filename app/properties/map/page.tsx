/**
 * Stock Map (/properties/map) — geographic view of the aggregator feed.
 *
 * Server component: fetches only the filter vocabulary (builders + property
 * types across the whole active pool) so every builder is selectable even
 * though the map itself loads via /api/properties/map on the client.
 */
import { supabase } from "../../../utils/supabase";
import { log, errInfo } from "../../../utils/logger";
import StockMapClient from "./StockMapClient";

export const dynamic = "force-dynamic";

// Matches the feed's interleave cap — the active pool is well under this.
const VOCAB_CAP = 5000;

async function getFilterVocab(): Promise<{ builders: string[]; types: string[] }> {
  try {
    const { data, error } = await supabase
      .from("global_stock_pool")
      .select("builder_name,property_type")
      .neq("pipeline_status", "withdrawn")
      .neq("pipeline_status", "legacy")
      .limit(VOCAB_CAP);

    if (error) {
      log.warn("properties.map.vocab_failed", errInfo(error));
      return { builders: [], types: [] };
    }

    const rows = (data ?? []) as Array<{
      builder_name: string | null;
      property_type: string | null;
    }>;
    const uniq = (vals: Array<string | null>) =>
      Array.from(new Set(vals.map((v) => (v ?? "").trim()).filter(Boolean))).sort();

    return {
      builders: uniq(rows.map((r) => r.builder_name)),
      types: uniq(rows.map((r) => r.property_type)),
    };
  } catch (e) {
    log.warn("properties.map.vocab_failed", errInfo(e));
    return { builders: [], types: [] };
  }
}

export default async function StockMapPage() {
  const { builders, types } = await getFilterVocab();
  return <StockMapClient allBuilders={builders} allTypes={types} />;
}
