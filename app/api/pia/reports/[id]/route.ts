/**
 * GET    /api/pia/reports/{id}   — fetch one
 * DELETE /api/pia/reports/{id}   — remove
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { data, error } = await supabase
    .from("pia_reports")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 404 });
  return NextResponse.json({ ok: true, report: data });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { error } = await supabase.from("pia_reports").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
