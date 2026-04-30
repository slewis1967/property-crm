import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { aiCallEnvelope } from "../../../../utils/ai";

export const dynamic = "force-dynamic";

const SYSTEM = `You are the morning briefing for Sean — a property advisor who runs NextKey Property Strategists. He opens his War Room dashboard and needs to know in 15 seconds: what should I do today?

Write 4-6 short bullets (use • as the marker). Each bullet must:
- Name a specific contact, lead, or property where relevant
- State the action OR the signal (not both, keep it tight)
- Be one line, plain text, no markdown beyond the bullet

Order by importance — most-time-sensitive first. Skip categories that have no signal. If everything is quiet, say so in 1-2 lines without padding.

Topics to scan: hot contacts that haven't been touched recently, new leads, opportunities stuck in a stage, contracts/deals with expiring dates, properties that are good matches for active buyers, big-ticket items needing follow-up.

No greeting, no header, no closer. Just the bullets.`;

export async function POST() {
  try {
    const nowIso = new Date().toISOString();
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400_000).toISOString();

    const [
      { count: leadsCount },
      { count: propertiesCount },
      { count: contactsCount },
      { data: hotContacts },
      { data: recentLeads },
      { data: staleHotContacts },
      { data: upcomingAppointments },
    ] = await Promise.all([
      supabase.from("property_leads").select("*", { count: "exact", head: true }),
      supabase.from("global_stock_pool").select("*", { count: "exact", head: true }),
      supabase.from("contacts").select("*", { count: "exact", head: true }),
      supabase
        .from("contacts")
        .select("name,email,buyer_type,preferred_state,lead_score,status,updated_at")
        .eq("temperature", "hot")
        .order("updated_at", { ascending: false })
        .limit(8),
      supabase
        .from("property_leads")
        .select("full_name,email,state,buyer_type,temperature,score,match_status,created_at")
        .gte("created_at", sevenDaysAgo)
        .order("created_at", { ascending: false })
        .limit(10),
      supabase
        .from("contacts")
        .select("name,email,buyer_type,preferred_state,updated_at")
        .eq("temperature", "hot")
        .lt("updated_at", thirtyDaysAgo)
        .order("updated_at", { ascending: true })
        .limit(8),
      supabase
        .from("appointments")
        .select("event_title,contact_name,contact_email,host_name,start_time,status")
        .gte("start_time", nowIso)
        .neq("status", "cancelled")
        .order("start_time", { ascending: true })
        .limit(8),
    ]);

    const userPrompt = [
      "=== KPI snapshot ===",
      `Total contacts: ${contactsCount ?? 0}`,
      `Total leads (all time): ${leadsCount ?? 0}`,
      `Stock pool: ${propertiesCount ?? 0} properties`,
      `Hot contacts shown: ${hotContacts?.length ?? 0}`,
      "",
      hotContacts && hotContacts.length > 0 ? "=== HOT CONTACTS (recent) ===" : "",
      ...((hotContacts ?? []).map(
        (c: any) =>
          `- ${c.name || "(unnamed)"} · ${c.buyer_type || "?"} · ${c.preferred_state || "?"} · score ${c.lead_score ?? "?"} · status ${c.status ?? "?"} · last updated ${fmtDate(c.updated_at)}`,
      )),
      "",
      staleHotContacts && staleHotContacts.length > 0
        ? "=== HOT CONTACTS NOT TOUCHED IN 30+ DAYS ==="
        : "",
      ...((staleHotContacts ?? []).map(
        (c: any) =>
          `- ${c.name || "(unnamed)"} · ${c.buyer_type || "?"} · ${c.preferred_state || "?"} · last touched ${fmtDate(c.updated_at)}`,
      )),
      "",
      recentLeads && recentLeads.length > 0 ? "=== NEW LEADS (last 7 days) ===" : "",
      ...((recentLeads ?? []).map(
        (l: any) =>
          `- ${l.full_name || "(unnamed)"} · ${l.buyer_type || "?"} · ${l.state || "?"} · temp ${l.temperature || "?"} · match ${l.match_status || "?"} · scored ${l.score ?? "?"} · received ${fmtDate(l.created_at)}`,
      )),
      "",
      upcomingAppointments && upcomingAppointments.length > 0
        ? "=== UPCOMING APPOINTMENTS ==="
        : "",
      ...((upcomingAppointments ?? []).map(
        (a: any) =>
          `- ${a.event_title || "(untitled)"} · with ${a.contact_name || a.contact_email} · ${fmtDateTime(a.start_time)}`,
      )),
    ]
      .filter(Boolean)
      .join("\n");

    const result = await aiCallEnvelope({
      system: SYSTEM,
      user: userPrompt,
      maxTokens: 2500,
      effort: "high",
    });

    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to build dashboard brief" },
      { status: 500 },
    );
  }
}

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.valueOf())) return "—";
  return d.toLocaleDateString("en-AU", { year: "2-digit", month: "short", day: "numeric" });
}
function fmtDateTime(s: string | null | undefined) {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.valueOf())) return "—";
  return d.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}
