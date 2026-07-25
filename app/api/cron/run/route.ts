/**
 * POST /api/cron/run   — external cron trigger (secret-authed, NOT CF Access)
 *
 * Netlify's scheduled functions stopped executing (the YLA sweep + document
 * reminders both went dark), so this lets a reliable external scheduler — the
 * Fly nexus-api supercronic fleet — drive them over HTTP instead.
 *
 * AUTH: this path is exempted from the Cloudflare Access gate (edge bypass +
 * proxy.ts `isCronRoute`) precisely because a machine caller has no CF identity.
 * It is re-secured here by a shared secret: the caller MUST send
 *   Authorization: Bearer <CRON_SECRET>
 * matching env CRON_SECRET (compared in constant time). No secret configured =
 * fail closed (503) so the endpoint is never open by accident.
 *
 * Each underlying job keeps its OWN send gate (YLA_AUTOSUBMIT_ENABLED,
 * REMINDERS_ENABLED, CLIENT_DOC_FIXUP_ENABLED), so triggering the cron never
 * sends anything that wasn't already enabled — it only makes the schedule fire.
 *
 * Body/query: ?job=yla|reminders|all (default all). ?dry_run=1 forces dry.
 */
import { NextResponse } from "next/server";
import { safeEqual } from "../../../../utils/sign-token";
import { runYlaAutoSubmit } from "../../../../utils/yla-auto-submit";
import { runDocumentReminders } from "../../../../utils/document-reminders";
import { log, errInfo } from "../../../../utils/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorised(req: Request): boolean {
  const secret = (process.env.CRON_SECRET || "").trim();
  if (!secret) return false; // fail closed — not configured
  const header = req.headers.get("authorization") || "";
  const m = header.match(/^Bearer\s+(.+)$/i);
  const provided = (m?.[1] || "").trim();
  if (!provided) return false;
  return safeEqual(provided, secret);
}

export async function POST(req: Request) {
  if (!authorised(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorised" }, { status: 401 });
  }

  const url = new URL(req.url);
  const job = (url.searchParams.get("job") || "all").toLowerCase();
  const forceDry = url.searchParams.get("dry_run") === "1";
  const dryRun = forceDry ? true : undefined; // undefined → each job uses its own gate

  const result: Record<string, unknown> = { ok: true, ran: [] as string[] };
  const ran = result.ran as string[];

  if (job === "yla" || job === "all") {
    try {
      result.yla = await runYlaAutoSubmit({ dryRun });
      ran.push("yla");
    } catch (e) {
      log.error("cron.yla_failed", { ...errInfo(e) });
      result.yla = { ok: false, error: e instanceof Error ? e.message : "failed" };
    }
  }
  if (job === "reminders" || job === "all") {
    try {
      result.reminders = await runDocumentReminders({ dryRun });
      ran.push("reminders");
    } catch (e) {
      log.error("cron.reminders_failed", { ...errInfo(e) });
      result.reminders = { ok: false, error: e instanceof Error ? e.message : "failed" };
    }
  }

  if (ran.length === 0) {
    return NextResponse.json({ ok: false, error: `unknown job "${job}" (use yla|reminders|all)` }, { status: 400 });
  }
  return NextResponse.json(result);
}
