import { NextResponse } from "next/server";
import { supabase } from "../../../utils/supabase";
import { requireAuth, userEmailFromRequest, isUnauthenticated } from "../../../utils/cf-access";
import {
  FEEDBACK_COLUMNS,
  FEEDBACK_MIGRATION_HINT,
  feedbackErrMessage,
  feedbackTableMissing,
  isFeedbackPriority,
  isFeedbackType,
  type FeedbackPriority,
  type FeedbackType,
} from "../../../utils/feedback";

export const dynamic = "force-dynamic";

/** GET — list feedback items, newest first. Degrades to an empty list when
 *  the table hasn't been migrated yet. */
export async function GET(req: Request) {
  const email = await userEmailFromRequest(req);
  if (isUnauthenticated(email)) {
    return NextResponse.json({ ok: false, error: "Unauthenticated" }, { status: 401 });
  }
  try {
    const { data, error } = await supabase
      .from("feedback")
      .select(FEEDBACK_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) {
      if (feedbackTableMissing(error)) {
        return NextResponse.json({ ok: true, items: [], tableMissing: true, hint: FEEDBACK_MIGRATION_HINT });
      }
      throw error;
    }
    return NextResponse.json({ ok: true, items: data ?? [] });
  } catch (e) {
    return NextResponse.json({ ok: false, error: feedbackErrMessage(e, "Could not load feedback") }, { status: 500 });
  }
}

/** POST — file a new feedback item. */
export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const submittedBy = auth;

  let body: {
    type?: unknown;
    title?: unknown;
    details?: unknown;
    area?: unknown;
    priority?: unknown;
    page_url?: unknown;
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

  try {
    const { data, error } = await supabase
      .from("feedback")
      .insert({ type, title, details, area, priority, submitted_by: submittedBy, page_url: pageUrl })
      .select(FEEDBACK_COLUMNS)
      .single();
    if (error) {
      if (feedbackTableMissing(error)) {
        return NextResponse.json({ ok: false, tableMissing: true, error: FEEDBACK_MIGRATION_HINT }, { status: 503 });
      }
      throw error;
    }
    return NextResponse.json({ ok: true, item: data }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: feedbackErrMessage(e, "Could not save feedback") }, { status: 500 });
  }
}
