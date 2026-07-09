import { NextResponse } from "next/server";
import { requireAuth } from "../../../../utils/cf-access";
import { resolveSite } from "../../../../utils/planning";
import { computeFeasibility } from "../../../../utils/feasibility";
import type { FeasibilityAssumptions } from "../../../../utils/feasibility";
import { log, errInfo } from "../../../../utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/planning/feasibility
 * Body: { address: string, refresh?: boolean, assumptions?: Partial<FeasibilityAssumptions> }
 *
 * Resolves the site, then runs the deterministic feasibility engine with any
 * caller-supplied assumption overrides (build cost, sale rate, land cost, …).
 * Returns { site, feasibility } — no AI, no report. Powers the interactive
 * yield/feaso panel where the advisor tunes assumptions.
 */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await req.json()) as {
      address?: string;
      refresh?: boolean;
      assumptions?: Partial<FeasibilityAssumptions>;
    };
    const address = (body?.address ?? "").trim();
    if (!address) {
      return NextResponse.json({ ok: false, error: "address required" }, { status: 400 });
    }

    const site = await resolveSite(address, !body?.refresh);
    const feasibility = computeFeasibility(site, body?.assumptions ?? {});
    return NextResponse.json({ ok: true, site, feasibility });
  } catch (e) {
    log.error("planning_feasibility_calc.failed", { ...errInfo(e) });
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Feasibility failed" },
      { status: 500 },
    );
  }
}
