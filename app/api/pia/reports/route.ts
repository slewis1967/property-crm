/**
 * GET  /api/pia/reports?opportunity_id=X | ?contact_id=Y | ?limit=N
 *   List saved PIA reports filtered by opportunity or contact.
 *
 * POST /api/pia/reports
 *   Body: { title, inputs, results?, opportunity_id?, contact_id?, property_id? }
 *   Creates a new PIA report. Returns the row.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const opportunityId = url.searchParams.get("opportunity_id");
  const contactId = url.searchParams.get("contact_id");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);

  let q = supabase
    .from("pia_reports")
    .select("id,title,opportunity_id,contact_id,property_id,generated_at,generated_by,last_emailed_at,last_emailed_to,email_count")
    .order("generated_at", { ascending: false })
    .limit(limit);
  if (opportunityId) q = q.eq("opportunity_id", opportunityId);
  if (contactId) q = q.eq("contact_id", contactId);

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, reports: data ?? [] });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { title, inputs, results, opportunity_id, contact_id, property_id } = body;

  if (!title || typeof title !== "string") {
    return NextResponse.json({ ok: false, error: "title is required" }, { status: 400 });
  }
  if (!inputs || typeof inputs !== "object") {
    return NextResponse.json({ ok: false, error: "inputs is required" }, { status: 400 });
  }

  const generatedBy =
    req.headers.get("x-user-email") ??
    req.headers.get("cf-access-authenticated-user-email") ??
    null;

  const { data, error } = await supabase
    .from("pia_reports")
    .insert({
      title,
      inputs,
      results: results ?? null,
      opportunity_id: opportunity_id ?? null,
      contact_id: contact_id ?? null,
      property_id: property_id ?? null,
      generated_by: generatedBy,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, report: data });
}
