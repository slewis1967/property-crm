/**
 * Requests for a help guide that does not exist yet.
 *
 * GET  — what the help panel needs: the published guides, the caller's own
 *        requests, and (for a super admin) how many are waiting for review.
 *        With ?all=1 a super admin gets every request for the review page.
 * POST — file a request. It is screened, saved, then prepared: a draft is
 *        written from the existing guides and checked against the help rules.
 *        Nothing here publishes; a super admin does that (see [id]/route.ts).
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";
import { isSuperAdmin } from "../../../../utils/super-admin";
import { aiCall } from "../../../../utils/ai";
import { aiExpensive, applyAiRateLimit } from "../../../../utils/ai-rate-limit";
import { errMessage } from "../../../../utils/errors";
import { HELP_SECTIONS, sectionForPath } from "../../../../utils/help";
import {
  CHECK_SYSTEM,
  DRAFT_SYSTEM,
  HELP_REQUEST_COLUMNS,
  HELP_REQUESTS_PER_DAY,
  corpusFor,
  draftPersonalDetails,
  normaliseQuestion,
  parseCheckReply,
  parseDraftReply,
  quoteForPrompt,
  screenQuestion,
  statusAfterPreparing,
  type HelpRequestRow,
  type HelpScreen,
} from "../../../../utils/help/requests";

export const dynamic = "force-dynamic";

const WAITING = ["new", "drafted", "refer", "blocked"];

function tableMissing(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === "42P01" || e.code === "PGRST205") return true;
  return (e.message ?? "").toLowerCase().includes("could not find the table");
}

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const admin = isSuperAdmin(auth);
  const wantAll = new URL(req.url).searchParams.get("all") === "1";

  try {
    if (wantAll) {
      if (!admin) return NextResponse.json({ ok: false, error: "Only a super admin can review requests." }, { status: 403 });
      const { data, error } = await supabase
        .from("help_requests")
        .select(HELP_REQUEST_COLUMNS)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return NextResponse.json({ ok: true, isAdmin: true, items: data ?? [] });
    }

    const [published, mine, waiting] = await Promise.all([
      supabase
        .from("help_requests")
        .select("id, section_label, draft")
        .eq("status", "published")
        .order("reviewed_at", { ascending: false })
        .limit(200),
      supabase
        .from("help_requests")
        .select("id, question, status, decline_reason, created_at")
        .eq("requested_by", auth)
        .order("created_at", { ascending: false })
        .limit(20),
      admin
        ? supabase.from("help_requests").select("id", { count: "exact", head: true }).in("status", WAITING)
        : Promise.resolve({ count: 0, error: null }),
    ]);
    const error = published.error || mine.error || waiting.error;
    if (error) throw error;
    return NextResponse.json({
      ok: true,
      isAdmin: admin,
      published: published.data ?? [],
      mine: mine.data ?? [],
      waiting: waiting.count ?? 0,
    });
  } catch (e) {
    if (tableMissing(e)) {
      return NextResponse.json({ ok: true, isAdmin: admin, published: [], mine: [], waiting: 0, items: [], unavailable: true });
    }
    return NextResponse.json({ ok: false, error: errMessage(e, "Could not load help requests") }, { status: 500 });
  }
}

/** Drafts and checks. Throws when the AI service cannot be reached. */
async function prepare(question: string, pagePath: string | null) {
  const section = sectionForPath(HELP_SECTIONS, pagePath);
  const reply = await aiCall({
    system: DRAFT_SYSTEM,
    user: `${corpusFor(HELP_SECTIONS, section)}\n\n## The staff member's question\n${quoteForPrompt("staff_question", question)}`,
    maxTokens: 1400,
    thinking: false,
  });
  const { screen, draft } = parseDraftReply(reply);
  if (!draft) return { screen, draft, status: statusAfterPreparing(screen, false) };

  // A draft must not carry contact details either, whatever the model was told.
  const leaked = draftPersonalDetails(draft);
  if (leaked) {
    const flagged: HelpScreen = { ...screen, concerns: ["The draft contained an email address or a long number, so it was discarded."] };
    return { screen: flagged, draft: null, status: "blocked" as const };
  }

  const checked = parseCheckReply(
    await aiCall({
      system: CHECK_SYSTEM,
      user: `## Question\n${quoteForPrompt("staff_question", question)}\n\n## Draft guide\n${quoteForPrompt("draft_guide", JSON.stringify(draft, null, 2))}`,
      maxTokens: 600,
      thinking: false,
    }),
  );
  const finalScreen: HelpScreen = { ...screen, concerns: checked.concerns };
  return { screen: finalScreen, draft, status: statusAfterPreparing(finalScreen, checked.pass) };
}

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  // Keyed on the verified identity, not on a request header the caller controls.
  const limited = applyAiRateLimit(req, { ...aiExpensive, keyFn: () => `help-request:${auth}` });
  if (limited) return limited;

  let body: { question?: unknown; page_path?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  // Normalised once here; this exact string is what is screened, stored and sent on.
  const question = typeof body.question === "string" ? normaliseQuestion(body.question) : "";
  const refused = screenQuestion(question);
  if (refused) return NextResponse.json({ ok: false, error: refused }, { status: 400 });

  const pagePath =
    typeof body.page_path === "string" && body.page_path.startsWith("/") ? body.page_path.slice(0, 200) : null;
  const section = sectionForPath(HELP_SECTIONS, pagePath);

  // Save first, so a request is never lost if preparing it fails or times out.
  const { data: saved, error: insertError } = await supabase
    .from("help_requests")
    .insert({ question, page_path: pagePath, section_label: section?.label ?? null, requested_by: auth })
    .select(HELP_REQUEST_COLUMNS)
    .single();
  if (insertError || !saved) {
    const message = tableMissing(insertError)
      ? "Asking for a guide is not switched on yet."
      : errMessage(insertError, "Could not save your request");
    return NextResponse.json({ ok: false, error: message }, { status: tableMissing(insertError) ? 503 : 500 });
  }
  const row = saved as unknown as HelpRequestRow;

  // Daily cap, checked AFTER the insert by this row's place among the person's
  // requests in the last day. Counting before inserting would let requests sent
  // at the same moment all pass; a place in an ordered list cannot be shared.
  // It is counted from the table, so it holds across server instances.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const today = await supabase
    .from("help_requests")
    .select("id")
    .eq("requested_by", auth)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(HELP_REQUESTS_PER_DAY + 50);
  const place = (today.data ?? []).findIndex((r) => r.id === row.id);
  // Fails closed: if the place cannot be read, the request is not prepared.
  if (today.error || place < 0 || place >= HELP_REQUESTS_PER_DAY) {
    await supabase.from("help_requests").delete().eq("id", row.id);
    return NextResponse.json(
      { ok: false, error: `You can ask for ${HELP_REQUESTS_PER_DAY} guides a day. Try again tomorrow.` },
      { status: 429 },
    );
  }

  try {
    const prepared = await prepare(question, pagePath);
    await supabase
      .from("help_requests")
      .update({ ...prepared, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    return NextResponse.json({ ok: true, id: row.id, status: prepared.status });
  } catch {
    // Left as 'new': the reviewer sees it and prepares it by hand.
    return NextResponse.json({ ok: true, id: row.id, status: "new" });
  }
}
