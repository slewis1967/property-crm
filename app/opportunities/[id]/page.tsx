import type { ComponentProps } from "react";
import { nexusApi } from "@/utils/nexus-api";
import { supabase } from "../../../utils/supabase";
import { notFound } from "next/navigation";
import OpportunityDetail from "./OpportunityDetail";
import type { OpportunityDoc } from "./OpportunityDocuments";
import type { SupportingDoc, UploadTarget } from "./OpportunitySupportingDocuments";
import type { LiveTask } from "./OpportunityTasks";
import { DOC_BY_KEY, requiredSlots } from "../../../utils/yla-documents";
import { DOCUMENT_REQUESTS_TABLE } from "../../../utils/document-requests-db";
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

/** The documents the CLIENT uploaded through their secure portal for this
 * opportunity — payslips, photo ID, ATO income statements, super statements.
 * Linked by opportunity_id (co-applicants share it; an applicant-2 request may
 * carry no contact_id, so opportunity_id is the reliable key). Cancelled
 * requests are excluded. Degrades to [] if the tables aren't migrated. */
async function fetchSupportingDocuments(opportunityId: string): Promise<SupportingDoc[]> {
  try {
    const { data: reqs } = await supabase
      .from(DOCUMENT_REQUESTS_TABLE)
      .select("id,applicant_name,status,opportunity_id")
      .eq("opportunity_id", opportunityId)
      .neq("status", "cancelled");
    const requests = reqs ?? [];
    if (requests.length === 0) return [];

    const nameById = new Map(
      requests.map((r) => [String(r.id), (r.applicant_name as string) || "Applicant"]),
    );
    const { data: docs } = await supabase
      .from("client_documents")
      .select("id,request_id,doc_type,filename,original_name,size_bytes,status,check_notes,uploaded_at")
      .in("request_id", requests.map((r) => String(r.id)))
      .neq("status", "replaced")
      .order("uploaded_at", { ascending: true });

    return (docs ?? []).map((d) => ({
      id: String(d.id),
      applicant: nameById.get(String(d.request_id)) || "Applicant",
      docType: d.doc_type as string,
      docLabel: DOC_BY_KEY[d.doc_type as string]?.label || (d.doc_type as string),
      filename: (d.original_name as string) || (d.filename as string) || "document",
      sizeBytes: (d.size_bytes as number) ?? null,
      status: (d.status as string) ?? null,
      uploadedAt: (d.uploaded_at as string) ?? null,
      checkNotes: (d.check_notes as string) ?? null,
    }));
  } catch (e) {
    log.warn("opportunity_supporting_documents.fetch_failed", { ...errInfo(e) });
    return [];
  }
}

/**
 * The applicants on this opportunity and which of YLA's document slots are
 * still empty — so the advisor can upload on a client's behalf when they post
 * or email their paperwork in rather than using the portal.
 */
async function fetchUploadTargets(opportunityId: string): Promise<UploadTarget[]> {
  try {
    const { data: reqs } = await supabase
      .from(DOCUMENT_REQUESTS_TABLE)
      .select("id,applicant_name,status,opportunity_id,created_at")
      .eq("opportunity_id", opportunityId)
      .neq("status", "cancelled")
      .order("created_at", { ascending: true });
    const requests = reqs ?? [];
    if (requests.length === 0) return [];

    const { data: docs } = await supabase
      .from("client_documents")
      .select("request_id,doc_type")
      .in("request_id", requests.map((r) => String(r.id)))
      .neq("status", "replaced");

    return requests.map((r) => {
      const mine = (docs ?? []).filter((d) => String(d.request_id) === String(r.id));
      // Slots fill in order within a doc type, matching how the verification
      // gate pairs uploads to slots — so "slot 2" is simply the second file.
      const usedByType = new Map<string, number>();
      for (const d of mine) {
        const k = String(d.doc_type);
        usedByType.set(k, (usedByType.get(k) ?? 0) + 1);
      }
      const filledSlots = new Set<string>();
      for (const [type, n] of usedByType) {
        for (let i = 1; i <= n; i++) filledSlots.add(`${type}:${i}`);
      }
      return {
        requestId: String(r.id),
        applicant: (r.applicant_name as string) || "Applicant",
        slots: requiredSlots().map((s) => ({
          docKey: s.docKey,
          label: s.label,
          slot: s.slot,
          filled: filledSlots.has(`${s.docKey}:${s.slot}`),
        })),
      };
    });
  } catch (e) {
    log.warn("opportunity_upload_targets.fetch_failed", { ...errInfo(e) });
    return [];
  }
}

/** The live advisor TODOs (the `tasks` table) for this opportunity's contact —
 * the tasks set via "Add task", so they surface on the page rather than only
 * living in the DB. Ordered open-first, then soonest due. Empty if no contact
 * or the table isn't present. */
async function fetchLiveTasks(contactId: string | null): Promise<LiveTask[]> {
  if (!contactId) return [];
  try {
    const { data } = await supabase
      .from("tasks")
      .select("id,title,body,due_date,completed,created_at")
      .eq("contact_id", contactId)
      .order("completed", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false })
      .limit(50);
    return (data ?? []).map((t) => ({
      id: String(t.id),
      title: (t.title as string) || "(untitled task)",
      body: (t.body as string) ?? null,
      due_date: (t.due_date as string) ?? null,
      completed: Boolean(t.completed),
      created_at: (t.created_at as string) ?? null,
    }));
  } catch (e) {
    log.warn("opportunity_live_tasks.fetch_failed", { ...errInfo(e) });
    return [];
  }
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

  const [{ ghlContactId, archive }, documents, supportingDocuments, uploadTargets, liveTasks] = await Promise.all([
    resolveGhlArchiveForLead(lead.email),
    fetchOpportunityDocuments(lead.primary_contact_id, id),
    fetchSupportingDocuments(id),
    fetchUploadTargets(id),
    fetchLiveTasks(lead.primary_contact_id),
  ]);

  return (
    <OpportunityDetail
      lead={lead}
      ghlArchive={archive}
      ghlContactId={ghlContactId}
      documents={documents}
      supportingDocuments={supportingDocuments}
      uploadTargets={uploadTargets}
      liveTasks={liveTasks}
      opportunityId={id}
    />
  );
}
