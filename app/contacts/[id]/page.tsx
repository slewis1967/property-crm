import { nexusApi } from "@/utils/nexus-api";
import { supabase } from "../../../utils/supabase";
import { notFound } from "next/navigation";
import ContactDetail from "./ContactDetail";

export const dynamic = "force-dynamic";

async function getLeadsForContact(contactId: string, email: string | null) {
  // A contact can be connected to a lead in three ways:
  //   1. matching email (the original ad-hoc link)
  //   2. lead.primary_contact_id == contact.id  (post-CRM, explicit link)
  //   3. contact.id IN lead.linked_contact_ids (additional linked contacts)
  // We want all of them to surface as "opportunities for this contact".
  try {
    const res = await nexusApi(`/api/leads`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    const all = data.leads || [];
    const e = email?.toLowerCase() || null;
    return all.filter((l: any) => {
      if (e && l.email?.toLowerCase() === e) return true;
      if (l.primary_contact_id === contactId) return true;
      const linked = (() => {
        try { return l.linked_contact_ids ? JSON.parse(l.linked_contact_ids) : []; }
        catch { return []; }
      })();
      return Array.isArray(linked) && linked.includes(contactId);
    });
  } catch {
    return [];
  }
}

async function getPipelines() {
  try {
    const res = await nexusApi(`/api/pipelines`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return data.pipelines || [];
  } catch {
    return [];
  }
}

/** Resolve which ghl_archive_contacts row matches this CRM contact. Prefer
 * the explicit ghl_contact_id link; fall back to email match. Returns null
 * if no match (the contact existed only post-GHL or doesn't have a counterpart). */
async function resolveGhlContactId(contact: any): Promise<string | null> {
  if (contact.ghl_contact_id) return contact.ghl_contact_id;
  if (!contact.email) return null;
  const { data } = await supabase
    .from("ghl_archive_contacts")
    .select("id")
    .ilike("email", contact.email)
    .limit(1);
  return data?.[0]?.id ?? null;
}

async function getGhlArchive(ghlContactId: string | null) {
  if (!ghlContactId) {
    return { notes: [], conversations: [], tasks: [], appointments: [], opportunities: [] };
  }
  const [
    { data: notes },
    { data: conversations },
    { data: tasks },
    { data: appointments },
    { data: opportunities },
  ] = await Promise.all([
    supabase.from("ghl_archive_notes")
      .select("id,body,user_id,pinned,date_added")
      .eq("contact_id", ghlContactId)
      .order("date_added", { ascending: false, nullsFirst: false }),
    supabase.from("ghl_archive_conversations")
      .select("id,type,unread_count,last_message_body,last_message_type,last_message_date")
      .eq("contact_id", ghlContactId)
      .order("last_message_date", { ascending: false, nullsFirst: false }),
    supabase.from("ghl_archive_tasks")
      .select("id,title,body,due_date,completed,date_added")
      .eq("contact_id", ghlContactId)
      .order("date_added", { ascending: false, nullsFirst: false }),
    supabase.from("ghl_archive_appointments")
      .select("id,title,appointment_status,start_time")
      .eq("contact_id", ghlContactId)
      .order("start_time", { ascending: false, nullsFirst: false }),
    supabase.from("ghl_archive_opportunities")
      .select("id,name,pipeline_id,pipeline_stage_id,status,monetary_value,date_added")
      .eq("contact_id", ghlContactId)
      .order("date_added", { ascending: false, nullsFirst: false }),
  ]);
  return {
    notes: notes ?? [],
    conversations: conversations ?? [],
    tasks: tasks ?? [],
    appointments: appointments ?? [],
    opportunities: opportunities ?? [],
  };
}

export default async function ContactDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let contact: any;
  const { data: liveContact } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (liveContact) {
    contact = liveContact;
  } else {
    // Fall back to GHL archive — archive-only contacts (no live counterpart) still
    // need a detail view. Map archive fields onto the live Contact shape.
    const { data: archive } = await supabase
      .from("ghl_archive_contacts")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!archive) return notFound();
    contact = {
      id: archive.id,
      name: archive.contact_name || `${archive.first_name || ""} ${archive.last_name || ""}`.trim() || null,
      full_name: archive.contact_name || null,
      first_name: archive.first_name || null,
      email: archive.email || null,
      phone: archive.phone || null,
      buyer_type: archive.type || null,
      state: archive.state || null,
      preferred_state: archive.state || null,
      ghl_contact_id: archive.id,
      tags: Array.isArray(archive.tags) ? [...archive.tags, "ghl-archive"] : ["ghl-archive"],
      created_at: archive.date_added || null,
      updated_at: archive.date_added || null,
      source: archive.source || null,
      _archive_only: true,
    };
  }

  const [leads, pipelines, ghlContactId, liveAppointments] = await Promise.all([
    getLeadsForContact(contact.id, contact.email as string | null),
    getPipelines(),
    resolveGhlContactId(contact),
    getLiveAppointments(contact.id, contact.email as string | null),
  ]);
  const ghlArchive = await getGhlArchive(ghlContactId);

  return (
    <ContactDetail
      contact={contact}
      leads={leads}
      pipelines={pipelines}
      ghlArchive={ghlArchive}
      ghlContactId={ghlContactId}
      liveAppointments={liveAppointments}
    />
  );
}

/** Cal.com bookings ingested via the booking webhook (live, current source).
 * Matches by contact_id first, falls back to email match for any pre-link rows. */
async function getLiveAppointments(contactId: string, email: string | null) {
  const out: any[] = [];
  const seenUids = new Set<string>();
  const { data: byId } = await supabase
    .from("appointments")
    .select("id,cal_uid,event_title,event_slug,host_email,host_name,start_time,end_time,location,status,cancel_reason,additional_notes")
    .eq("contact_id", contactId)
    .order("start_time", { ascending: false });
  for (const r of byId ?? []) {
    if (r.cal_uid) seenUids.add(r.cal_uid);
    out.push(r);
  }
  if (email) {
    const { data: byEmail } = await supabase
      .from("appointments")
      .select("id,cal_uid,event_title,event_slug,host_email,host_name,start_time,end_time,location,status,cancel_reason,additional_notes")
      .ilike("contact_email", email)
      .order("start_time", { ascending: false });
    for (const r of byEmail ?? []) {
      if (!r.cal_uid || !seenUids.has(r.cal_uid)) out.push(r);
    }
  }
  // Sort combined list by start_time desc
  out.sort((a, b) => {
    const ta = a.start_time ? new Date(a.start_time).getTime() : 0;
    const tb = b.start_time ? new Date(b.start_time).getTime() : 0;
    return tb - ta;
  });
  return out;
}
