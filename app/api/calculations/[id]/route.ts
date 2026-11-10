import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";

import { requireAuth } from "../../../../utils/cf-access";
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const body = await req.json();
  const update: Record<string, unknown> = {};
  if (typeof body?.name === "string" && body.name.trim()) update.name = body.name.trim();
  if (body?.inputs && typeof body.inputs === "object") update.inputs = body.inputs;
  if (body?.outputs !== undefined) update.outputs = body.outputs;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no valid fields" }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();
  const { data, error } = await supabase
    .from("opportunity_calculations")
    .update(update)
    .eq("id", id)
    .select("id, calculator_type, name, inputs, outputs, created_at, updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ calculation: data });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const { error } = await supabase.from("opportunity_calculations").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
