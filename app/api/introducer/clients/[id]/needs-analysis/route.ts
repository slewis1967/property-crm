/**
 * GET   /api/introducer/clients/<id>/needs-analysis  — the pack's Needs Analysis
 * PATCH /api/introducer/clients/<id>/needs-analysis  — save it
 *
 * PUBLIC (session-scoped). Tier 2 only, and only for a pack whose `pack_type` is
 * 'full' — a Tier 1 referral has no Needs Analysis and asking for one is a 404
 * rather than an empty form, because an empty form invites someone to fill it in
 * and then discover it was never going anywhere.
 *
 * THIS IS THE DOCUMENT, not a step toward it. utils/yla-package.ts: "YLA do not
 * receive a Fact Find — they receive a Needs Analysis" (Sean, 2026-07-25). What
 * the introducer types here is what the client signs and what the assessor
 * reads. It is not machine-translated on the way — see the header of
 * migrations/20260820c_introducer_pack_collects_needs_analysis.sql for why that
 * direction was abandoned.
 *
 * SEPARATE FROM THE DETAIL ROUTE ON PURPOSE. `needs_analysis_data` is the whole
 * financial position — income, liabilities, living expenses, identity documents.
 * The referral list and detail payloads carry a boolean saying whether it has
 * been started, and nothing else. This route is the one surface entitled to the
 * blob, and it hands it back only to the firm that wrote it.
 *
 * THE LOCK APPLIES HERE TOO. `needs_analysis_data` is in the database trigger's
 * changed-column list (migrations/20260820c), so a submitted pack cannot be
 * edited even if this route forgot to check. It doesn't forget — but the trigger
 * is what makes that a promise rather than an intention.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../../utils/supabase";
import {
  requireIntroducer,
  loadOwnClient,
  activeGrantFor,
  logIntroducerEvent,
  readJson,
} from "../../../_shared";
import {
  canSendFullPack,
  packSubmitBlockers,
  grantIsActive,
  seedNeedsAnalysisFromReferral,
} from "../../../../../../utils/introducer";
import { hydrateNeedsAnalysis } from "../../../../../../utils/needsAnalysis";

export const dynamic = "force-dynamic";

/** The 403 body for a firm that isn't accredited to hold a pack. */
function tierRefusal() {
  return NextResponse.json(
    {
      ok: false,
      error: "A full submission pack needs Tier 2 accreditation.",
      code: "tier_required",
    },
    { status: 403 },
  );
}

/** Does an active grant cover the document itself? */
function unlockedFor(grant: Awaited<ReturnType<typeof activeGrantFor>>): boolean {
  if (!grantIsActive(grant)) return false;
  return grant!.scope === "full" || (grant!.fields ?? []).includes("needs_analysis_data");
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireIntroducer();
  if (auth instanceof NextResponse) return auth;
  if (!canSendFullPack(auth.tier)) return tierRefusal();

  const { id } = await params;
  const record = await loadOwnClient(auth, id);
  if (!record || record.pack_type !== "full") {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  const grant = await activeGrantFor(record.id);
  const unlocked = unlockedFor(grant);
  const editable = record.status === "draft" || unlocked;

  /* An empty blob is seeded from the referral fields on read rather than only at
   * create, so a pack started before this shipped — or one whose seed lost a
   * race with the introducer editing the referral details afterwards — still
   * opens with the client's name in it instead of a blank first page. */
  const raw = record.needs_analysis_data as unknown;
  const started = raw && typeof raw === "object" && Object.keys(raw).length > 0;

  return NextResponse.json({
    ok: true,
    client_ref: record.client_ref ?? null,
    status: record.status,
    editable,
    grant_expires_at: unlocked ? grant!.expires_at : null,
    data: started ? hydrateNeedsAnalysis(raw) : seedNeedsAnalysisFromReferral(record),
    blockers: packSubmitBlockers(raw),
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireIntroducer();
  if (auth instanceof NextResponse) return auth;
  if (!canSendFullPack(auth.tier)) return tierRefusal();

  const { id } = await params;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const record = await loadOwnClient(auth, id);
  if (!record || record.pack_type !== "full") {
    return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  /* Who may write, and why.
   *
   * A draft is freely editable. After submit the only way in is an unlock grant
   * that covers the document — an open info request is NOT enough, and the
   * trigger agrees. An info request exists to collect a detail somebody forgot;
   * re-opening a Needs Analysis the client has already signed is a different
   * act, and it needs a super admin to have said so. */
  const grant = await activeGrantFor(record.id);
  const unlocked = unlockedFor(grant);

  if (record.status !== "draft" && !unlocked) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "This pack has been submitted and the Needs Analysis is locked. Ask Springboard to " +
          "authorise a change if something needs correcting.",
        code: "locked",
      },
      { status: 403 },
    );
  }

  /* Normalise through `hydrateNeedsAnalysis` rather than storing what arrived.
   *
   * It is the same function the staff form loads through, so a blob written here
   * and a blob written at /needs-analysis have identical shape — which is what
   * makes the promotion at submit a copy rather than a translation. It also
   * means an unknown key posted by a modified client is dropped instead of
   * stored: the hydrator rebuilds from the template and takes only fields it
   * knows. */
  const data = hydrateNeedsAnalysis(body.data);

  const { error } = await supabase
    .from("introducer_clients")
    .update({ needs_analysis_data: data, updated_at: new Date().toISOString() })
    .eq("id", record.id)
    .eq("introducer_id", auth.introducerId)   // belt-and-braces: the tenant filter again
    .select("id")
    .single();

  if (error) {
    // The trigger speaks in SQL. If it fired, this route and the database
    // disagreed about who may write — worth knowing about, so log it rather than
    // letting it read as an ordinary failure.
    const locked = error.message?.includes("is locked");
    if (locked) {
      console.error("[introducer] lock trigger rejected a needs analysis write the route allowed", {
        client_id: record.id,
        status: record.status,
      });
    }
    return NextResponse.json(
      {
        ok: false,
        error: locked
          ? "This pack is locked. Ask Springboard to authorise the change."
          : "Could not save. Your work is still on this screen — try again.",
      },
      { status: locked ? 403 : 500 },
    );
  }

  // A grant is spent by the save it authorised, so an unlock can't become a
  // standing permission. Same rule the referral-fields PATCH applies.
  if (unlocked && grant) {
    const { data: g } = await supabase
      .from("introducer_unlock_grants")
      .select("single_use")
      .eq("id", grant.id)
      .maybeSingle();
    if (g?.single_use !== false) {
      await supabase
        .from("introducer_unlock_grants")
        .update({ consumed_at: new Date().toISOString() })
        .eq("id", grant.id);
    }
  }

  await logIntroducerEvent({
    clientId: record.id,
    introducerId: auth.introducerId,
    actorType: "introducer",
    actor: auth.email,
    action: record.status === "draft" ? "needs_analysis_saved" : "needs_analysis_authorised_change",
  });

  return NextResponse.json({ ok: true, blockers: packSubmitBlockers(data) });
}
