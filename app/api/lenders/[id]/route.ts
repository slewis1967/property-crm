import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";
import { log, errInfo } from "../../../../utils/logger";
import { brisbaneToday, policyFacts } from "../../../../utils/lender-policy";
import { loadPolicy } from "../../../../utils/lender-policy/store";
import { verifyPolicy, isIsoDate, looksLikeSourceUrl } from "../../../../utils/lender-policy/verify";

export const dynamic = "force-dynamic";

/** GET — one lender's full policy, re-verified, with per-field issues. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await ctx.params;
  try {
    const { policy, source } = await loadPolicy(id);
    if (!policy) {
      return NextResponse.json({ ok: false, error: "Lender not found" }, { status: 404 });
    }
    const today = brisbaneToday();
    const { policy: verified, issues, counts } = verifyPolicy(policy, today);
    return NextResponse.json({
      ok: true,
      policy: verified,
      issues,
      counts,
      source,
      today,
      factCount: policyFacts(verified).length,
    });
  } catch (error) {
    log.error("lenders.get_failed", { id, ...errInfo(error) });
    return NextResponse.json({ ok: false, error: "Could not load the lender" }, { status: 500 });
  }
}

/**
 * PATCH — a broker confirms (or corrects) ONE field against the real policy.
 *
 * This is the manual layer over AI research, and it is deliberately
 * field-level and append-only rather than an edit to the policy blob:
 *
 *  - A later research pass overwrites `data` wholesale. Corrections living in
 *    their own table survive that; corrections written into the blob would be
 *    silently destroyed by the next refresh.
 *  - The previous confirmation is superseded, not deleted, so "who said what,
 *    when" stays reconstructable.
 *
 * Provenance is enforced here too: a broker confirmation still needs an as-at
 * date, and a source URL if one is given must be a real page link. A human is
 * a better authority than a heuristic, not an exemption from evidence.
 */
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const confirmedBy = auth;

  const { id } = await ctx.params;
  try {
    const body = (await req.json()) as {
      fieldPath?: string;
      value?: unknown;
      asAt?: string;
      sourceUrl?: string | null;
      sourceTitle?: string | null;
      note?: string | null;
    };

    if (!body.fieldPath || !/^[a-z]+\.[a-zA-Z]+$/.test(body.fieldPath)) {
      return NextResponse.json(
        { ok: false, error: "fieldPath must look like 'servicing.assessmentBufferPct'" },
        { status: 400 },
      );
    }
    if (!body.asAt || !isIsoDate(body.asAt)) {
      return NextResponse.json(
        { ok: false, error: "asAt is required and must be a real YYYY-MM-DD date" },
        { status: 400 },
      );
    }
    if (body.asAt > brisbaneToday()) {
      return NextResponse.json({ ok: false, error: "asAt cannot be in the future" }, { status: 400 });
    }
    if (body.sourceUrl && !looksLikeSourceUrl(body.sourceUrl)) {
      return NextResponse.json(
        { ok: false, error: "sourceUrl must be a link to the page the value was read on" },
        { status: 400 },
      );
    }

    // Supersede the previous live confirmation for this field, then insert.
    const { error: supersedeError } = await supabase
      .from("lender_policy_field_reviews")
      .update({ superseded_at: new Date().toISOString() })
      .eq("lender_id", id)
      .eq("field_path", body.fieldPath)
      .is("superseded_at", null);
    if (supersedeError) throw supersedeError;

    const { error } = await supabase.from("lender_policy_field_reviews").insert({
      lender_id: id,
      field_path: body.fieldPath,
      value: body.value ?? null,
      as_at: body.asAt,
      source_url: body.sourceUrl ?? null,
      source_title: body.sourceTitle ?? null,
      note: body.note ?? null,
      confirmed_by: confirmedBy,
    });
    if (error) throw error;

    log.info("lenders.field_confirmed", { id, field: body.fieldPath, by: confirmedBy });
    return NextResponse.json({ ok: true });
  } catch (error) {
    log.error("lenders.confirm_failed", { id, ...errInfo(error) });
    return NextResponse.json(
      {
        ok: false,
        error:
          "Could not record the confirmation. If the lender policy migration hasn't been run yet, " +
          "apply migrations/20260729_lender_policies.sql first.",
      },
      { status: 500 },
    );
  }
}
