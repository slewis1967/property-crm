import { NextResponse } from "next/server";
import { requireAuth } from "../../../../utils/cf-access";
import { scanRegion } from "../../../../utils/prospecting";
import { supabase } from "../../../../utils/supabase";
import { log, errInfo } from "../../../../utils/logger";

export const dynamic = "force-dynamic";
// A region scan pulls several bulk layers + local geometry work; give it room.
export const maxDuration = 60;

/**
 * POST /api/prospecting/scan
 * Body: { region: string, minAreaSqm?: number, maxCandidates?: number }
 *
 * Combs a region for parcels with subdivision headroom (NSW). Persists the run
 * to `prospecting_runs` (best-effort — ignored if the table isn't migrated).
 */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const email = auth; // requireAuth returns the verified email string

  try {
    const body = (await req.json()) as {
      region?: string;
      minAreaSqm?: number;
      maxCandidates?: number;
    };
    const region = (body?.region ?? "").trim();
    if (!region) return NextResponse.json({ ok: false, error: "region required" }, { status: 400 });

    const result = await scanRegion(region, {
      minAreaSqm: body?.minAreaSqm,
      maxCandidates: body?.maxCandidates,
    });

    if (result.supported) {
      try {
        await supabase.from("prospecting_runs").insert({
          region: result.region,
          state: result.state,
          bbox: result.bbox,
          params: { minAreaSqm: body?.minAreaSqm ?? null, maxCandidates: body?.maxCandidates ?? null },
          candidate_count: result.candidates.length,
          candidates: result.candidates,
          created_by: email,
        });
      } catch {
        /* table not migrated / transient — persistence is optional */
      }
    }

    return NextResponse.json({ ok: true, result });
  } catch (e) {
    log.error("prospecting_scan.failed", { ...errInfo(e) });
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Scan failed" },
      { status: 500 },
    );
  }
}
