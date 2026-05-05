import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";

const CALC_TYPES = ["yield", "stamp_duty", "borrowing", "growth", "fhg", "repayment"];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: opportunityId } = await params;
  const { data, error } = await supabase
    .from("opportunity_calculations")
    .select("id, calculator_type, name, inputs, outputs, created_at, updated_at")
    .eq("opportunity_id", opportunityId)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ calculations: data ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: opportunityId } = await params;
  const body = await req.json();
  const { calculator_type, name, inputs, outputs } = body ?? {};
  if (!CALC_TYPES.includes(calculator_type)) {
    return NextResponse.json({ error: `calculator_type must be one of ${CALC_TYPES.join(", ")}` }, { status: 400 });
  }
  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!inputs || typeof inputs !== "object") {
    return NextResponse.json({ error: "inputs is required" }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("opportunity_calculations")
    .insert({
      opportunity_id: opportunityId,
      calculator_type,
      name: name.trim(),
      inputs,
      outputs: outputs ?? null,
    })
    .select("id, calculator_type, name, inputs, outputs, created_at, updated_at")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ calculation: data }, { status: 201 });
}
