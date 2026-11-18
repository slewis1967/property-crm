/**
 * POST /api/partner/week
 *
 * PUBLIC (session-scoped). "Your week, drafted": the template week from
 * utils/partner-week.ts, rewritten by Claude on demand. Every draft is screened
 * (brand firewall, masking, claims) and any that fail keep their template.
 * Cached per partner per day; a light per-partner rate limit caps spend when
 * the AI keeps failing and nothing is cached.
 *
 * Returns drafts with the {first_name} placeholder; the page swaps names in.
 */
import { NextResponse } from "next/server";
import { requirePartner } from "../_shared";
import { firstNameOf, loadPartnerWorld } from "../../../partner/world";
import { buildWeekDraft } from "../../../../utils/partner-week";
import { aiWeekDraft } from "../../../../utils/partner-ai";
import { supplierNames } from "../../../../utils/partner-stock";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WINDOW_MS = 60 * 60_000;
const MAX_PER_WINDOW = 6;
const calls = new Map<string, number[]>();

function limited(partnerId: string, now = Date.now()): boolean {
  const recent = (calls.get(partnerId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) return true;
  calls.set(partnerId, [...recent, now]);
  return false;
}

export async function POST() {
  const auth = await requirePartner();
  if (auth instanceof NextResponse) return auth;
  if (limited(auth.partnerId)) {
    return NextResponse.json({ ok: false, error: "You've drafted a few weeks already this hour. Try again shortly." }, { status: 429 });
  }
  try {
    const [world, names] = await Promise.all([loadPartnerWorld(auth), supplierNames()]);
    const sender = { name: firstNameOf(auth), firm: auth.firmName };
    const base = buildWeekDraft({ lots: world.lots, clients: world.clients, firmName: auth.firmName, senderName: sender.name, now: new Date() });
    const result = await aiWeekDraft(auth.partnerId, base, { supplierNames: names, sender });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("[partner] week draft failed", e);
    return NextResponse.json({ ok: false, error: "We couldn't draft your week right now." }, { status: 503 });
  }
}
