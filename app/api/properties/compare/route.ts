import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";
import { withObservability } from "../../../../utils/observability";

const MAX_IDS = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handler(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { ids } = await req.json().catch(() => ({ ids: null }));
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "No ids provided" }, { status: 400 });
  }
  if (ids.length > MAX_IDS) {
    return NextResponse.json(
      { error: `Too many ids — max ${MAX_IDS} per request` },
      { status: 400 },
    );
  }
  if (!ids.every((id) => typeof id === "string" && UUID_RE.test(id))) {
    return NextResponse.json({ error: "Invalid id format" }, { status: 400 });
  }

  try {
    const { data, error } = await supabase
      .from("global_stock_pool")
      .select("*")
      .in("id", ids);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ properties: data ?? [] });
  } catch (err) {
    console.error("[compare] supabase fetch failed", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Failed to fetch properties" }, { status: 500 });
  }
}

export const POST = withObservability("POST /api/properties/compare", handler);
