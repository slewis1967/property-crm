/**
 * GET /api/settings/ai-instructions — fetch the operator's custom AI instructions.
 * PUT /api/settings/ai-instructions — save them. Body: { instructions: string }.
 *
 * Free text appended (subordinate to the built-in rules) to the voice assistant's
 * system prompt. Stored as app_settings.key='ai_instructions'. Mirrors the
 * property-types / signature settings endpoints.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";
import { AI_INSTRUCTIONS_KEY, AI_INSTRUCTIONS_MAX, getAiInstructions } from "../../../../utils/ai-instructions";

export const dynamic = "force-dynamic";

export async function GET() {
  const instructions = await getAiInstructions();
  return NextResponse.json({ ok: true, instructions });
}

export async function PUT(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  const instructions = typeof body.instructions === "string" ? body.instructions.trim() : "";
  if (instructions.length > AI_INSTRUCTIONS_MAX) {
    return NextResponse.json(
      { ok: false, error: `instructions too long (max ${AI_INSTRUCTIONS_MAX} characters)` },
      { status: 400 },
    );
  }

  const updatedBy =
    req.headers.get("x-user-email") ??
    req.headers.get("cf-access-authenticated-user-email") ??
    null;

  const { error } = await supabase.from("app_settings").upsert(
    {
      key: AI_INSTRUCTIONS_KEY,
      value: { instructions },
      updated_at: new Date().toISOString(),
      updated_by: updatedBy,
    },
    { onConflict: "key" },
  );
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, instructions });
}
