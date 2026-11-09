import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/utils/cf-access";
import { supabase } from "@/utils/supabase";
import { RECORDING_BUCKET, recordingObjectPath } from "@/utils/call-outcome";

/**
 * A short-lived link to play one call recording on this lead.
 *
 * Recordings are written by Elvis's work-phone call recorder into the private
 * `call-recordings` bucket under `leads/<lead_id>/`. The bucket has no public URLs; the
 * page asks here when someone presses Play, so a link never outlives the view.
 */
export const dynamic = "force-dynamic";

const TTL_SECONDS = 600;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const objectPath = recordingObjectPath(req.nextUrl.searchParams.get("path"), id);
  if (!objectPath) return NextResponse.json({ error: "Not a recording on this lead" }, { status: 400 });

  const { data, error } = await supabase.storage.from(RECORDING_BUCKET).createSignedUrl(objectPath, TTL_SECONDS);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  }
  return NextResponse.json({ url: data.signedUrl }, { headers: { "Cache-Control": "no-store" } });
}
