import { NextRequest, NextResponse } from "next/server";
import { nexusApi } from "@/utils/nexus-api";
import { requireAuth } from "@/utils/cf-access";
import { errMessage } from "@/utils/errors";

/**
 * Add one note to an opportunity — used by the phone view (/m/leads/[id]).
 *
 * Opportunity notes are a JSON array of { text, created_at }, newest first,
 * stored in the lead's `notes` column in NEXUS, and the detail page writes the
 * whole array back on every add. A phone doing the same from a page loaded
 * minutes earlier would drop any note added on the desktop in between, so this
 * route fetches the lead fresh and prepends on the server.
 */

type NoteEntry = { text: string; created_at: string };

const MAX_NOTE = 4000;

/** Same tolerance as OpportunityDetail: a legacy plain-text note becomes one entry. */
function parseNotes(raw: unknown, fallbackDate: string): NoteEntry[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [{ text: raw, created_at: fallbackDate }];
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  let body: { text?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const text = typeof body.text === "string" ? body.text.trim().slice(0, MAX_NOTE) : "";
  if (!text) return NextResponse.json({ error: "Note is empty" }, { status: 400 });

  try {
    const getRes = await nexusApi(`/api/leads/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!getRes.ok) {
      return NextResponse.json({ error: `Lead lookup failed (${getRes.status})` }, { status: getRes.status });
    }
    const lead = await getRes.json();
    const now = new Date().toISOString();
    const notes = [{ text, created_at: now }, ...parseNotes(lead?.notes, lead?.created_at || now)];

    const res = await nexusApi(`/api/leads/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: JSON.stringify(notes) }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return NextResponse.json({ error: data.error || `Save failed (${res.status})` }, { status: res.status });
    }
    return NextResponse.json({ ok: true, notes });
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) }, { status: 503 });
  }
}
