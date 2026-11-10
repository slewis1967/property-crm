import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";
import { log, errInfo } from "../../../../utils/logger";
import { hydrateFactFind, type FactFindData } from "../../../../utils/factfind";
import { factFindToLenderScenario } from "../../../../utils/factfind-lender-scenario";
import { MISSING_FIELD_LABELS } from "../../../../utils/factfind-capacity";

export const dynamic = "force-dynamic";

/**
 * GET ?factFindId=… — build a lender scenario from an existing Fact Find.
 *
 * The "fact find in" half of the feature. It returns the scenario together with
 * `assumptions`: every policy input the Fact Find has no field for and the
 * value that was assumed instead (employment basis, residency, credit history).
 * The UI shows that list before the shortlist, because a match built on
 * unconfirmed assumptions is a match built on a guess — and those particular
 * fields are the ones lenders knock clients out on.
 */
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const factFindId = url.searchParams.get("factFindId");
  if (!factFindId) {
    return NextResponse.json({ ok: false, error: "factFindId is required" }, { status: 400 });
  }

  try {
    const { data, error } = await supabase
      .from("borrower_fact_finds")
      .select("id, data")
      .eq("id", factFindId)
      .limit(1);
    if (error) throw error;

    const row = (data ?? [])[0] as { id: string; data: unknown } | undefined;
    if (!row) {
      return NextResponse.json({ ok: false, error: "Fact find not found" }, { status: 404 });
    }

    const factFind = hydrateFactFind(row.data as Partial<FactFindData>);
    const { scenario, missing, notes, assumptions } = factFindToLenderScenario(factFind);

    return NextResponse.json({
      ok: true,
      scenario,
      assumptions,
      notes,
      missing: missing.map((m) => MISSING_FIELD_LABELS[m] ?? m),
    });
  } catch (error) {
    log.error("lenders.scenario_from_factfind_failed", { factFindId, ...errInfo(error) });
    return NextResponse.json(
      { ok: false, error: "Could not build a scenario from that fact find" },
      { status: 500 },
    );
  }
}
