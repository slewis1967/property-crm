import type { ComponentProps } from "react";
import { nexusApi } from "@/utils/nexus-api";
import { supabase } from "../../../utils/supabase";
import { notFound } from "next/navigation";
import OpportunityDetail from "./OpportunityDetail";
import { log, errInfo } from "@/utils/logger";

export const dynamic = "force-dynamic";

/** Resolve this lead's live CRM contact by email (case-insensitive). NEXUS
 * doesn't always stamp primary_contact_id even when a matching contact exists,
 * which left appointment/task linking blocked ("no matched contact") for leads
 * that plainly had one. Returns the contacts.id or null. */
async function resolveContactIdByEmail(email: string | null): Promise<string | null> {
  if (!email) return null;
  const { data } = await supabase
    .from("contacts")
    .select("id")
    .ilike("email", email)
    .limit(1);
  return data?.[0]?.id ?? null;
}

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

  // The nexus API returns either a lead row (shape = OpportunityDetail's `lead`
  // prop) or an `{ error }` envelope, distinguished by the guard below.
  let lead: (ComponentProps<typeof OpportunityDetail>["lead"] & { error?: string }) | null = null;
  try {
    const res = await nexusApi(`/api/leads/${id}`, {
      cache: "no-store",
    });
    if (res.ok) lead = await res.json();
  } catch (e) {
    log.warn("opportunity_detail.nexus_fetch_failed", { id, ...errInfo(e) });
  }

  if (!lead || lead.error) return notFound();

  // Fall back to an email match against the live contacts table when NEXUS
  // didn't link this opportunity to a CRM contact — so scheduling/tasks aren't
  // blocked ("no matched contact") for a lead that already has one.
  if (!lead.primary_contact_id && lead.email) {
    lead.primary_contact_id = await resolveContactIdByEmail(lead.email);
  }

  const { ghlContactId, archive } = await resolveGhlArchiveForLead(lead.email);

  return <OpportunityDetail lead={lead} ghlArchive={archive} ghlContactId={ghlContactId} />;
}
