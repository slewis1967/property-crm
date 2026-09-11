import { NextResponse } from "next/server";
import { supabase } from "../../../utils/supabase";
import { requireAuth } from "../../../utils/cf-access";
import { log, errInfo } from "../../../utils/logger";
import { errMessage } from "../../../utils/errors";
import { getStockStats, smsfPitchRef, springboardPitchRef } from "../../../utils/channel-partners-server";
import {
  channelPartnersTableMissing,
  coercePartnerBody,
  type ChannelPartner,
} from "../../../utils/channel-partners";

export const dynamic = "force-dynamic";

const MIGRATION_HINT =
  "Channel Partners storage isn't set up yet — run migrations/20260911_channel_partners.sql in the Supabase SQL editor.";

/** GET — every target, the live stock figures the pitch quotes, and the Springboard gate. */
export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const [{ data, error }, stats] = await Promise.all([
      supabase
        .from("channel_partners")
        .select("*")
        .order("suggested_priority", { ascending: true, nullsFirst: false })
        .order("company", { ascending: true })
        .limit(1000),
      getStockStats(),
    ]);
    if (error) {
      if (channelPartnersTableMissing(error)) {
        return NextResponse.json({ ok: true, partners: [], stats, springboardRef: null, migrationNeeded: true, hint: MIGRATION_HINT });
      }
      throw error;
    }
    return NextResponse.json({
      ok: true,
      partners: (data ?? []) as ChannelPartner[],
      stats,
      springboardRef: springboardPitchRef(),
      smsfRef: smsfPitchRef(),
      migrationNeeded: false,
    });
  } catch (e) {
    log.error("channel_partners.list_failed", errInfo(e));
    return NextResponse.json({ ok: false, error: errMessage(e, "List failed") }, { status: 500 });
  }
}

/** POST — add a target by hand (the CSV seeded the first 24). */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const row = coercePartnerBody((await req.json()) as Record<string, unknown>, true);
    if (!row.company) {
      return NextResponse.json({ ok: false, error: "A company name is required" }, { status: 400 });
    }
    row.created_by = auth;
    const { data, error } = await supabase.from("channel_partners").insert(row).select("*").single();
    if (error) {
      if (channelPartnersTableMissing(error)) {
        return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 501 });
      }
      throw error;
    }
    return NextResponse.json({ ok: true, partner: data });
  } catch (e) {
    log.error("channel_partners.create_failed", errInfo(e));
    return NextResponse.json({ ok: false, error: errMessage(e, "Save failed") }, { status: 500 });
  }
}
