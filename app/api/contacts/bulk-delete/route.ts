import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { userEmailFromRequest, isUnauthenticated } from "../../../../utils/cf-access";

// Hard cap on a single bulk-delete request. Picked to comfortably cover the
// "select all + delete" UX without exposing the whole table to a single bad
// request. Anyone needing a larger purge can paginate.
const MAX_IDS = 500;
// UUID v1-v5. We require client-supplied ids to look like contact UUIDs —
// otherwise the request is rejected before any DB call.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const owner = await userEmailFromRequest(req);
  if (isUnauthenticated(owner)) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

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

  const { error } = await supabase.from("contacts").delete().in("id", ids);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: ids.length });
}
