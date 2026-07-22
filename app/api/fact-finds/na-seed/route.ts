/**
 * GET /api/fact-finds/na-seed?contact_id=   (AUTHED)
 *
 * Returns Fact Find applicant data mapped from this contact's NEWEST Needs
 * Analysis, so the "Populate from Needs Analysis" button can fill an otherwise
 * empty Fact Find without the advisor re-keying identity that's already on file.
 *
 * Read-only: it never writes. The client merges the result into the form (empty
 * fields only) and the advisor reviews before saving — mapping notes are
 * returned so nothing carries across silently. jsonb lives server-side, hence
 * this endpoint rather than a client read.
 *
 * The static "na-seed" segment resolves ahead of the sibling dynamic [id] route.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";
import { hydrateNeedsAnalysis } from "../../../../utils/needsAnalysis";
import { needsAnalysisToFactFind } from "../../../../utils/needsAnalysisToFactFind";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const contactId = new URL(req.url).searchParams.get("contact_id");
  if (!contactId) {
    return NextResponse.json({ ok: false, error: "contact_id is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("nccp_needs_analyses")
    .select("id,data,created_at")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    // Missing table (older deployment) or any read error — degrade to "nothing
    // to seed" so the button just reports it, never 500s the form.
    return NextResponse.json({ ok: true, found: false });
  }
  if (!data) {
    return NextResponse.json({ ok: true, found: false });
  }

  const na = hydrateNeedsAnalysis((data as { data: unknown }).data);
  const { applicants, notes } = needsAnalysisToFactFind(na);
  if (!applicants.length) {
    return NextResponse.json({ ok: true, found: false });
  }

  return NextResponse.json({
    ok: true,
    found: true,
    applicants,
    notes,
    source: { id: (data as { id: string }).id, created_at: (data as { created_at: string }).created_at },
  });
}
