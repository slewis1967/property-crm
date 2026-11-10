import { NextResponse } from "next/server";
import { requireAuth } from "../../../../utils/cf-access";
import { log, errInfo } from "../../../../utils/logger";
import { brisbaneToday } from "../../../../utils/lender-policy";
import { packPolicies, upsertPolicies, MIGRATION_HINT } from "../../../../utils/lender-policy/store";
import { verifyPolicy } from "../../../../utils/lender-policy/verify";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST — load the committed research pack into Supabase.
 *
 * The one-click "seed the database" action, run after applying
 * `migrations/20260729_lender_policies.sql`. Idempotent: it upserts by id and
 * archives whatever it replaces into `lender_policy_versions`, so re-running it
 * after a fresh research tranche is the normal way to publish new records.
 *
 * It does NOT touch `lender_policy_field_reviews`. Broker confirmations are
 * folded over the blob on read, so re-importing research can never overwrite a
 * human who checked the actual policy document — that separation is the whole
 * reason the reviews live in their own table.
 */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const policies = packPolicies();
    if (policies.length === 0) {
      return NextResponse.json({
        ok: false,
        error:
          "The research pack is empty. Run the research pipeline, then " +
          "`node scripts/build-lender-pack.mjs` to bundle it.",
      });
    }

    const today = brisbaneToday();
    const totals = { total: 0, verified: 0, unverified: 0, notFound: 0 };
    for (const policy of policies) {
      const { counts } = verifyPolicy(policy, today);
      totals.total += counts.total;
      totals.verified += counts.verified + counts.humanConfirmed;
      totals.unverified += counts.unverified;
      totals.notFound += counts.notFound;
    }

    const result = await upsertPolicies(policies, { changedBy: auth, reason: "import" });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error ?? MIGRATION_HINT, migrationNeeded: result.migrationNeeded },
        { status: result.migrationNeeded ? 409 : 500 },
      );
    }

    log.info("lenders.import", { lenders: result.written, ...totals });
    return NextResponse.json({ ok: true, imported: result.written, fields: totals });
  } catch (error) {
    log.error("lenders.import_failed", errInfo(error));
    return NextResponse.json({ ok: false, error: "Could not import the research pack" }, { status: 500 });
  }
}
