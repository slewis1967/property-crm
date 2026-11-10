import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { publishPropertyUpsert } from "../../../../../utils/propchannel";
import { requireAuth } from "../../../../../utils/cf-access";

export const dynamic = "force-dynamic";

type Params = { id: string };

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<Params> },
) {
  const { id } = await params;
  const { data, error } = await supabase
    .from("property_financials")
    .select("property_id,gross_developer_fee,updated_at")
    .eq("property_id", id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ financials: data ?? null });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<Params> },
) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const gdfRaw = body?.gross_developer_fee;
  const gross_developer_fee =
    gdfRaw === null || gdfRaw === "" || gdfRaw === undefined
      ? null
      : typeof gdfRaw === "number"
      ? gdfRaw
      : typeof gdfRaw === "string"
      ? Number(gdfRaw.replace(/[^\d.]/g, ""))
      : null;

  const { data, error } = await supabase
    .from("property_financials")
    .upsert(
      {
        property_id: id,
        gross_developer_fee,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "property_id" },
    )
    .select("property_id,gross_developer_fee,updated_at")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Publish updated property (includes gross_developer_fee) to PropChannel
  publishPropertyUpsert(id).catch(() => {
    /* logged in util */
  });
  return NextResponse.json({ financials: data });
}

