import { nexusApi } from "@/utils/nexus-api";
import { supabase } from "../../../utils/supabase";
import { notFound } from "next/navigation";
import ContactDetail from "./ContactDetail";

export const dynamic = "force-dynamic";

async function getLeadsForContact(email: string | null) {
  if (!email) return [];
  try {
    const res = await nexusApi(`/api/leads`, { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.leads || []).filter((l: any) =>
      l.email?.toLowerCase() === email.toLowerCase()
    );
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

  const { data: contact, error } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !contact) return notFound();

  const [leads, ghlContactId] = await Promise.all([
    getLeadsForContact(contact.email as string | null),
    resolveGhlContactId(contact),
  ]);
  const ghlArchive = await getGhlArchive(ghlContactId);

  return <ContactDetail contact={contact} leads={leads} ghlArchive={ghlArchive} ghlContactId={ghlContactId} />;
}
