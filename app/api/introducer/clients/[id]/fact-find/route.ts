/**
 * GET   /api/introducer/clients/<id>/fact-find  — the pack's fact find
 * PATCH /api/introducer/clients/<id>/fact-find  — save it
 *
 * PUBLIC (session-scoped). Tier 2 only, and only for a pack whose `pack_type` is
 * 'full' — a Tier 1 referral has no fact find and asking for one is a 404 rather
 * than an empty form, because an empty form invites someone to fill it in and
 * then discover it was never going anywhere.
 *
 * SEPARATE FROM THE DETAIL ROUTE ON PURPOSE. `fact_find_data` is the whole
 * financial position — income, liabilities, licence numbers, disclosures about
 * bankruptcy. The referral list and detail payloads carry a boolean saying
 * whether it has been started, and nothing else. This route is the one surface
 * entitled to the blob, and it hands it back only to the firm that wrote it.
 *
 * THE LOCK APPLIES HERE TOO. `fact_find_data` is in the database trigger's
 * changed-column list (migrations/20260820), so a submitted pack cannot be
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
  factFindSubmitBlockers,
  grantIsActive,
  seedFactFindFromReferral,
} from "../../../../../../utils/introducer";
import { hydrateFactFind } from "../../../../../../utils/factfind";

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
  const unlocked = grantIsActive(grant) && (grant!.scope === "full" || (grant!.fields ?? []).includes("fact_find_data"));
  const editable = record.status === "draft" || unlocked;

  /* An empty blob is seeded from the referral fields on read rather than only at
   * create, so a pack started before this shipped — or one whose seed lost a
   * race with the introducer editing the referral details afterwards — still
   * opens with the client's name in it instead of a blank first page. */
  const raw = record.fact_find_data as unknown;
  const started = raw && typeof raw === "object" && Object.keys(raw).length > 0;

  return NextResponse.json({
    ok: true,
    client_ref: record.client_ref ?? null,
    status: record.status,
    editable,
    grant_expires_at: unlocked ? grant!.expires_at : null,
    data: started ? hydrateFactFind(raw) : seedFactFindFromReferral(record),
    blockers: factFindSubmitBlockers(raw),
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
   * that covers the fact find — an open info request is NOT enough, and the
   * trigger agrees. An info request exists to collect a detail somebody forgot;
   * re-opening a submitted financial position is a different act, and it needs a
   * super admin to have said so. */
  const grant = await activeGrantFor(record.id);
  const unlocked =
    grantIsActive(grant) && (grant!.scope === "full" || (grant!.fields ?? []).includes("fact_find_data"));

  if (record.status !== "draft" && !unlocked) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "This pack has been submitted and the fact find is locked. Ask Springboard to authorise a " +
          "change if something needs correcting.",
        code: "locked",
      },
      { status: 403 },
    );
  }

  /* Normalise through `hydrateFactFind` rather than storing what arrived.
   *
   * It is the same function the staff form loads through, so a blob written here
   * and a blob written at /fact-find have identical shape — which is what makes
   * the promotion at submit a copy rather than a translation. It also means an
   * unknown key posted by a modified client is dropped instead of stored: the
   * hydrator rebuilds from the template and takes only fields it knows. */
  const data = hydrateFactFind(body.data);

  const { error } = await supabase
    .from("introducer_clients")
    .update({ fact_find_data: data, updated_at: new Date().toISOString() })
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
      console.error("[introducer] lock trigger rejected a fact find write the route allowed", {
        client_id: record.id,
        status: record.status,
      });
    }
    return NextResponse.json(
      {
        ok: false,
        error: locked
          ? "This pack is locked. Ask Springboard to authorise the change."
          : "Could not save the fact find. Your work is still on this screen — try again.",
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
    action: record.status === "draft" ? "fact_find_saved" : "fact_find_authorised_change",
  });

  return NextResponse.json({ ok: true, blockers: factFindSubmitBlockers(data) });
}
