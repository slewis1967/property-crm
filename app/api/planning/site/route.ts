import { NextResponse } from "next/server";
import { requireAuth } from "../../../../utils/cf-access";
import { resolveSite } from "../../../../utils/planning";
import { log, errInfo } from "../../../../utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * GET /api/planning/site?address=...&refresh=1
 *
 * Resolve authoritative site facts (parcel, zone, planning controls, overlays)
 * for an Australian address from state government spatial services. Powers the
 * feasibility tool's ground-truth data and the future site map / 3D envelope.
 */
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const address = (url.searchParams.get("address") ?? "").trim();
  const refresh = url.searchParams.get("refresh") === "1";
  if (!address) {
    return NextResponse.json({ ok: false, error: "address required" }, { status: 400 });
  }

  try {
    const site = await resolveSite(address, !refresh);
    return NextResponse.json({ ok: true, site });
  } catch (e) {
    log.error("planning_site.failed", { ...errInfo(e) });
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Lookup failed" },
      { status: 500 },
    );
  }
}
