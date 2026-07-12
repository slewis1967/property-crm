import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import {
  createCalendarEvent,
  refreshAccessToken,
} from "../../../../utils/google-oauth";
import { errMessage } from "../../../../utils/errors";

type Body = {
  host_email: string;                                    // calendar owner
  summary: string;
  description?: string;
  location?: string;
  start: string;                                         // ISO with offset, e.g. "2026-05-10T14:00:00+10:00"
  end: string;                                           // ISO with offset
  timeZone?: string;
  attendees?: Array<{ email: string; displayName?: string }>;
  sendUpdates?: "all" | "externalOnly" | "none";
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.host_email || !body.summary || !body.start || !body.end) {
    return NextResponse.json(
      { error: "host_email, summary, start, and end are required" },
      { status: 400 },
    );
  }

  // Look up refresh token for this host
  const { data: cred, error: credErr } = await supabase
    .from("calendar_credentials")
    .select("refresh_token, scope")
    .eq("host_email", body.host_email)
    .maybeSingle();
  if (credErr) return NextResponse.json({ error: credErr.message }, { status: 500 });
  if (!cred) {
    return NextResponse.json(
      {
        error: `No connected calendar for ${body.host_email}. Connect it from /settings first.`,
        code: "not_connected",
      },
      { status: 412 },
    );
  }

  try {
    const { accessToken } = await refreshAccessToken(cred.refresh_token);
    const event = await createCalendarEvent(accessToken, {
      summary: body.summary,
      description: body.description,
      location: body.location,
      start: body.start,
      end: body.end,
      timeZone: body.timeZone,
      attendees: body.attendees,
      sendUpdates: body.sendUpdates,
    });
    return NextResponse.json({ event });
  } catch (e) {
    return NextResponse.json({ error: errMessage(e, "calendar_failed") }, { status: 500 });
  }
}
