import { NextResponse } from "next/server";
import { supabase } from "../../../utils/supabase";
import { requireAuth, userEmailFromRequest, isUnauthenticated } from "../../../utils/cf-access";
import {
  FEEDBACK_COLUMNS,
  FEEDBACK_COLUMNS_BASE,
  FEEDBACK_MIGRATION_HINT,
  feedbackAiColumnsMissing,
  feedbackErrMessage,
  feedbackTableMissing,
  isFeedbackPriority,
  isFeedbackType,
  type FeedbackPriority,
  type FeedbackType,
} from "../../../utils/feedback";
import { triageFeedback } from "../../../utils/feedback-triage";

export const dynamic = "force-dynamic";

/** GET — list feedback items, newest first. Falls back to base columns when
 *  the AI-pipeline migration hasn't been applied, and to an empty list when
 *  the table itself is absent. */
export async function GET(req: Request) {
  const email = await userEmailFromRequest(req);
  if (isUnauthenticated(email)) {
    return NextResponse.json({ ok: false, error: "Unauthenticated" }, { status: 401 });
  }
  try {
    const primary = await supabase
      .from("feedback")
      .select(FEEDBACK_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(200);
    let rows: unknown[] | null = primary.data as unknown[] | null;
    let error = primary.error;
    if (error && feedbackAiColumnsMissing(error)) {
      const fallback = await supabase
        .from("feedback")
        .select(FEEDBACK_COLUMNS_BASE)
        .order("created_at", { ascending: false })
        .limit(200);
      rows = fallback.data as unknown[] | null;
      error = fallback.error;
    }
    if (error) {
      if (feedbackTableMissing(error)) {
        return NextResponse.json({ ok: true, items: [], tableMissing: true, hint: FEEDBACK_MIGRATION_HINT });
      }
      throw error;
    }
    return NextResponse.json({ ok: true, items: rows ?? [] });
  } catch (e) {
    return NextResponse.json({ ok: false, error: feedbackErrMessage(e, "Could not load feedback") }, { status: 500 });
  }
}

/** POST — file a new feedback item, then triage it (best-effort). */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const submittedBy = auth;

  let body: {
    type?: unknown; title?: unknown; details?: unknown; area?: unknown;
    priority?: unknown; page_url?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return NextResponse.json({ ok: false, error: "A short title is required." }, { status: 400 });
  }

  const type: FeedbackType = isFeedbackType(body.type) ? body.type : "other";
  const priority: FeedbackPriority = isFeedbackPriority(body.priority) ? body.priority : "medium";
  const details = typeof body.details === "string" && body.details.trim() ? body.details.trim() : null;
  const area = typeof body.area === "string" && body.area.trim() ? body.area.trim() : null;
  const pageUrl = typeof body.page_url === "string" && body.page_url.trim() ? body.page_url.trim() : null;

  let item: Record<string, unknown>;
  try {
    const { data, error } = await supabase
      .from("feedback")
      .insert({ type, title, details, area, priority, submitted_by: submittedBy, page_url: pageUrl })
      .select(FEEDBACK_COLUMNS_BASE)
      .single();
    if (error) {
      if (feedbackTableMissing(error)) {
        return NextResponse.json({ ok: false, tableMissing: true, error: FEEDBACK_MIGRATION_HINT }, { status: 503 });
      }
      throw error;
    }
    item = data as Record<string, unknown>;
  } catch (e) {
    return NextResponse.json({ ok: false, error: feedbackErrMessage(e, "Could not save feedback") }, { status: 500 });
  }

  // Triage — best-effort. On any failure (model, parse, or the AI columns not
  // being migrated yet) leave the item as-is; the cloud routine triages any
  // item still at the `pending` stage.
  try {
    const t = await triageFeedback({ type, title, details, area });
    const { data: updated } = await supabase
      .from("feedback")
      .update({
        ai_kind: t.kind,
        ai_genuine: t.genuine,
        ai_severity: t.severity,
        ai_risk_class: t.riskClass,
        ai_summary: t.summary,
        ai_analysis: t.analysis,
        ai_confidence: t.confidence,
        agent_stage: "triaged",
        triaged_at: new Date().toISOString(),
      })
      .eq("id", item.id as string)
      .select(FEEDBACK_COLUMNS)
      .single();
    if (updated) item = updated as unknown as Record<string, unknown>;
  } catch {
    /* triage is best-effort; the routine retries pending items */
  }

  return NextResponse.json({ ok: true, item }, { status: 201 });
}
