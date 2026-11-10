import { NextResponse } from "next/server";
import { requireAuth } from "../../../utils/cf-access";
import { log, errInfo } from "../../../utils/logger";
import {
  brisbaneToday,
  filterPolicies,
  hydratePolicy,
  researchedFieldCount,
  type LenderPolicy,
  type LenderStatus,
  type LenderTier,
} from "../../../utils/lender-policy";
import { loadPolicies, upsertPolicies, MIGRATION_HINT } from "../../../utils/lender-policy/store";
import { verifyPolicy } from "../../../utils/lender-policy/verify";

export const dynamic = "force-dynamic";

/**
 * GET — the lender policy library.
 *
 * Every record is re-verified on read rather than trusting the stored status:
 * a fact that was fresh when researched can go stale, and the list is where a
 * broker forms an impression of how much of this database they can rely on.
 * The counts returned here are what the UI badges "12 verified / 3 unverified".
 */
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q") ?? undefined;
    const tiers = url.searchParams.getAll("tier") as LenderTier[];
    const statuses = url.searchParams.getAll("status") as LenderStatus[];
    const hasFields = url.searchParams.getAll("has");

    const { policies, source, migrationNeeded, hint } = await loadPolicies();
    const today = brisbaneToday();

    const filtered = filterPolicies(policies, {
      q,
      tiers: tiers.length ? tiers : undefined,
      statuses: statuses.length ? statuses : undefined,
      hasFields: hasFields.length ? hasFields : undefined,
    });

    const lenders = filtered.map((policy) => {
      const { counts } = verifyPolicy(policy, today);
      return {
        id: policy.id,
        name: policy.name,
        legalName: policy.legalName,
        tier: policy.tier,
        status: policy.status,
        funder: policy.funder,
        brokerSiteUrl: policy.brokerSiteUrl,
        policyDocUrl: policy.policyDocUrl,
        effectiveFrom: policy.effectiveFrom,
        researchedAt: policy.researchedAt,
        gapCount: policy.gaps?.length ?? 0,
        researchedFields: researchedFieldCount(policy),
        counts,
      };
    });

    return NextResponse.json({
      ok: true,
      lenders,
      total: policies.length,
      source,
      migrationNeeded,
      hint,
      today,
    });
  } catch (error) {
    log.error("lenders.list_failed", errInfo(error));
    return NextResponse.json({ ok: false, error: "Could not load the lender library" }, { status: 500 });
  }
}

/**
 * POST — create or replace a lender policy record.
 *
 * The submitted `status` on every fact is IGNORED: `upsertPolicies` re-verifies
 * and stores the verdict. A caller cannot mark its own data verified — that is
 * the whole anti-hallucination contract, and it has to hold at the API edge as
 * well as in the engine.
 */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = (await req.json()) as { policy?: Partial<LenderPolicy> & { id?: string; name?: string } };
    const raw = body.policy;
    if (!raw?.id || !raw?.name) {
      return NextResponse.json({ ok: false, error: "id and name are required" }, { status: 400 });
    }
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(raw.id)) {
      return NextResponse.json(
        { ok: false, error: "id must be a lowercase slug (a-z, 0-9, hyphens)" },
        { status: 400 },
      );
    }

    const policy = hydratePolicy(raw as Partial<LenderPolicy> & { id: string; name: string });
    const result = await upsertPolicies([policy], {
      changedBy: typeof auth === "string" ? auth : "unknown",
      reason: "broker_edit",
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.error ?? MIGRATION_HINT, migrationNeeded: result.migrationNeeded },
        { status: result.migrationNeeded ? 409 : 500 },
      );
    }

    const { counts, issues } = verifyPolicy(policy, brisbaneToday());
    return NextResponse.json({ ok: true, id: policy.id, counts, issues });
  } catch (error) {
    log.error("lenders.save_failed", errInfo(error));
    return NextResponse.json({ ok: false, error: "Could not save the lender policy" }, { status: 500 });
  }
}
