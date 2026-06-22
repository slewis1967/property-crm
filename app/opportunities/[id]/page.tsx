import { nexusApi } from "@/utils/nexus-api";
import { supabase } from "../../../utils/supabase";
import { notFound } from "next/navigation";
import OpportunityDetail from "./OpportunityDetail";
import { log, errInfo } from "@/utils/logger";

export const dynamic = "force-dynamic";

/** Match this lead to its GHL counterpart via email + pull notes/conversations
 * /tasks /appointments scoped to that contact. Returns nulls if no match. */
async function resolveGhlArchiveForLead(email: string | null) {
  if (!email) return { ghlContactId: null, archive: emptyArchive() };
  const { data: ghlContacts } = await supabase
    .from("ghl_archive_contacts")
    .select("id")
    .ilike("email", email)
    .limit(1);
  const ghlContactId = ghlContacts?.[0]?.id ?? null;
  if (!ghlContactId) return { ghlContactId: null, archive: emptyArchive() };

  const [
    { data: notes },
    { data: conversations },
    { data: tasks },
    { data: appointments },
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
  ]);

  return {
    ghlContactId,
    archive: {
      notes: notes ?? [],
      conversations: conversations ?? [],
      tasks: tasks ?? [],
      appointments: appointments ?? [],
    },
  };
}

function emptyArchive() {
  return { notes: [], conversations: [], tasks: [], appointments: [] };
}

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let lead: any = null;
  try {
    const res = await nexusApi(`/api/leads/${id}`, {
      cache: "no-store",
    });
    if (res.ok) lead = await res.json();
  } catch (e) {
    log.warn("opportunity_detail.nexus_fetch_failed", { id, ...errInfo(e) });
  }

  if (!lead || lead.error) return notFound();

  const { ghlContactId, archive } = await resolveGhlArchiveForLead(lead.email);

  return <OpportunityDetail lead={lead} ghlArchive={archive} ghlContactId={ghlContactId} />;
}
