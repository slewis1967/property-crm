import { NextRequest, NextResponse } from "next/server";
import { nexusApi } from "@/utils/nexus-api";
import { requireAuth } from "@/utils/cf-access";
import { errMessage } from "@/utils/errors";
import { invalidateLeadCache } from "@/utils/nexus-leads-cache";
import { callNote, isCallOutcome, type NoteEntry } from "@/utils/call-outcome";

/**
 * Log the outcome of one call against a lead. Fetches the lead fresh and prepends
 * on the server, for the same reason as the sibling note route: a phone page loaded
 * minutes ago must not overwrite notes added since.
 */

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

  let body: { outcome?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!isCallOutcome(body.outcome)) {
    return NextResponse.json({ error: "Unknown call outcome" }, { status: 400 });
  }

  try {
    const getRes = await nexusApi(`/api/leads/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!getRes.ok) {
      return NextResponse.json({ error: `Lead lookup failed (${getRes.status})` }, { status: getRes.status });
    }
    const lead = await getRes.json();
    const now = new Date().toISOString();
    const notes = [callNote(body.outcome, now), ...parseNotes(lead?.notes, lead?.created_at || now)];

    const res = await nexusApi(`/api/leads/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: JSON.stringify(notes) }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return NextResponse.json({ error: data.error || `Save failed (${res.status})` }, { status: res.status });
    }
    invalidateLeadCache();
    return NextResponse.json({ ok: true, notes });
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) }, { status: 503 });
  }
}
