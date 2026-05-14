import { supabase } from "../../utils/supabase";
import BroadcastClient from "./BroadcastClient";

export const dynamic = "force-dynamic";

/**
 * /broadcast — compose + send a one-off email to all eligible contacts (or a
 * tag-filtered subset). Wire-up:
 *
 *   form submit → POST /api/broadcast (Phase 1: compliance review)
 *   if violations → modal, user ack → POST /api/broadcast with
 *     acknowledge_violations=true (Phase 2: writes sequence + enrolments)
 *   sequence_runner.py cron picks up within 5 min and sends via Brevo
 *
 * This page computes audience snapshots (total eligible + per-tag counts) so
 * the operator sees what they're about to hit before composing. Eligibility
 * mirrors what the runner enforces: has email, not in unsubscribes (email/all).
 */
export default async function BroadcastPage() {
  const [{ data: contacts }, { data: unsubs }] = await Promise.all([
    supabase
      .from("contacts")
      .select("email,tags")
      .not("email", "is", null)
      .neq("email", ""),
    supabase
      .from("unsubscribes")
      .select("email")
      .in("channel", ["email", "all"])
      .not("email", "is", null),
  ]);

  const optedOut = new Set(
    (unsubs ?? []).map((u: { email: string | null }) => (u.email ?? "").toLowerCase()),
  );
  const eligible = (contacts ?? []).filter(
    (c: { email: string | null }) => !optedOut.has((c.email ?? "").toLowerCase()),
  );

  const tagCounts: Record<string, number> = {};
  for (const c of eligible) {
    const tags = Array.isArray(c.tags) ? c.tags : [];
    for (const t of tags) {
      if (typeof t === "string" && t) {
        tagCounts[t] = (tagCounts[t] ?? 0) + 1;
      }
    }
  }
  const sortedTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([tag, count]) => ({ tag, count }));

  return (
    <BroadcastClient totalEligible={eligible.length} tags={sortedTags} optedOutCount={optedOut.size} />
  );
}
