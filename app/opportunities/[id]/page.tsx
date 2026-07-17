import type { ComponentProps } from "react";
import { nexusApi } from "@/utils/nexus-api";
import { supabase } from "../../../utils/supabase";
import { notFound } from "next/navigation";
import OpportunityDetail from "./OpportunityDetail";
import type { OpportunityDoc } from "./OpportunityDocuments";
import { log, errInfo } from "@/utils/logger";

export const dynamic = "force-dynamic";

/** The borrower's compliance documents for this opportunity's contact, so they
 * surface (with status) on the detail page rather than only being reachable via
 * the header's open-or-create buttons. Each table is queried with an EXPLICIT
 * non-PII column set (never `data`), and degrades to nothing if the table isn't
 * migrated (supabase returns data:null on a missing table — no throw). */
async function fetchOpportunityDocuments(
  contactId: string | null,
  opportunityId: string,
): Promise<OpportunityDoc[]> {
  const out: OpportunityDoc[] = [];
  const add = (
    rows: Array<Record<string, unknown>> | null,
    kind: OpportunityDoc["kind"],
    titleField: string,
    openBase: string,
    apiBase: string,
  ) => {
    for (const r of rows ?? []) {
      const rid = String(r.id);
      out.push({
        id: rid,
        kind,
        title: (r[titleField] as string) || kind,
        status: (r.status as string) ?? null,
        created_at: (r.created_at as string) ?? null,
        openHref: `${openBase}/${rid}`,
        pdfHref: `${apiBase}/${rid}/pdf`,
      });
    }
  };

  const jobs: Array<PromiseLike<unknown>> = [];
  if (contactId) {
    jobs.push(
      supabase.from("borrower_fact_finds").select("id,applicant_name,status,created_at")
        .eq("contact_id", contactId).order("created_at", { ascending: false })
        .then(({ data }) => add(data, "Fact Find", "applicant_name", "/fact-find", "/api/fact-finds")),
      supabase.from("nccp_needs_analyses").select("id,applicant_name,status,created_at")
        .eq("contact_id", contactId).order("created_at", { ascending: false })
        .then(({ data }) => add(data, "Needs Analysis", "applicant_name", "/needs-analysis", "/api/needs-analyses")),
      supabase.from("credit_authorisations").select("id,names,status,created_at")
        .eq("contact_id", contactId).order("created_at", { ascending: false })
        .then(({ data }) => add(data, "Credit Authorisation", "names", "/credit-authorisation", "/api/credit-authorisations")),
    );
  }
  // EOIs link by opportunity_id (primary) and/or contact_id.
  jobs.push(
    supabase.from("eois").select("id,summary,status,created_at")
      .or(contactId ? `opportunity_id.eq.${opportunityId},contact_id.eq.${contactId}` : `opportunity_id.eq.${opportunityId}`)
      .order("created_at", { ascending: false })
      .then(({ data }) => add(data, "EOI", "summary", "/eoi", "/api/eois")),
  );

  try {
    await Promise.all(jobs);
  } catch (e) {
    log.warn("opportunity_documents.fetch_failed", { ...errInfo(e) });
  }
  // Newest first across all types.
  out.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  return out;
}

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

  const [{ ghlContactId, archive }, documents] = await Promise.all([
    resolveGhlArchiveForLead(lead.email),
    fetchOpportunityDocuments(lead.primary_contact_id, id),
  ]);

  return (
    <OpportunityDetail lead={lead} ghlArchive={archive} ghlContactId={ghlContactId} documents={documents} />
  );
}
