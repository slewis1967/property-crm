import { NextResponse } from "next/server";
import { requireAuth } from "../../../../utils/cf-access";
import { log, errInfo } from "../../../../utils/logger";
import { brisbaneToday } from "../../../../utils/lender-policy";
import { loadPolicies } from "../../../../utils/lender-policy/store";
import { matchScenario, MATCH_DISCLAIMER } from "../../../../utils/lender-policy/match";
import { scenarioGaps, scenarioIsMeaningful, type LenderScenario } from "../../../../utils/lender-policy/scenario";

export const dynamic = "force-dynamic";

/**
 * POST — score a client scenario against every lender on file.
 *
 * Stateless: nothing about the client is written anywhere. The scenario carries
 * income, dependents and credit history, which is client PII under APP 11, and
 * a lender shortlist is a working calculation rather than a record that needs
 * keeping — the Fact Find and Needs Analysis are the records. Not persisting it
 * is the cheapest possible way to be right about that.
 */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await req.json()) as { scenario?: LenderScenario; lenderIds?: string[] };
    const scenario = body.scenario;
    if (!scenario?.capacity || !Array.isArray(scenario.applicants)) {
      return NextResponse.json({ ok: false, error: "A scenario with capacity inputs and applicants is required" }, { status: 400 });
    }
    if (!scenarioIsMeaningful(scenario)) {
      return NextResponse.json({
        ok: true,
        run: null,
        reason:
          "Not enough to rank lenders yet — enter at least one applicant income. " +
          "A shortlist built on no income would be a list of lenders, not a match.",
        disclaimer: MATCH_DISCLAIMER,
      });
    }

    const { policies, source, migrationNeeded } = await loadPolicies();
    const pool = body.lenderIds?.length
      ? policies.filter((p) => body.lenderIds?.includes(p.id))
      : policies;

    // A withdrawn lender can't take an application; a research_only record was
    // never meant to be recommended from. Both stay in the reference library.
    const active = pool.filter((p) => p.status === "active" || p.status === "paused");

    const run = matchScenario(active, scenario, brisbaneToday(), scenarioGaps(scenario));

    log.info("lenders.match_run", {
      lenders: active.length,
      eligible: run.summary.eligible,
      refer: run.summary.refer,
      ineligible: run.summary.ineligible,
      insufficient: run.summary.insufficient_data,
    });

    return NextResponse.json({ ok: true, run, source, migrationNeeded, poolSize: active.length });
  } catch (error) {
    log.error("lenders.match_failed", errInfo(error));
    return NextResponse.json({ ok: false, error: "Could not run the lender match" }, { status: 500 });
  }
}
