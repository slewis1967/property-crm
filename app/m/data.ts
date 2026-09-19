import { nexusApi } from "@/utils/nexus-api";
import { errMessage } from "@/utils/errors";
import { DEFAULT_STAGES, normaliseStage } from "@/utils/pipeline-stage";
import type { LiveTask } from "@/utils/tasks";
import { getCachedLeads, getCachedPipelines } from "@/utils/nexus-leads-cache";

/** Server-side loaders for the phone view. Leads + pipelines live in NEXUS; everything else is Supabase. */

export type PhoneLead = {
  lead_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  buyer_type: string | null;
  state: string | null;
  budget: string | null;
  temperature: string | null;
  ghl_stage: string | null;
  pipeline_id: string | null;
  created_at: string | null;
  tags: string | null;
  primary_contact_id: string | null;
  notes: string | null;
  top_match_name: string | null;
  source?: string | null;
};

export type Pipeline = { id: string; name: string; stages: string[] };

/** The lead list, from the short-lived cache (see utils/nexus-leads-cache.ts). */
export function loadLeads(): Promise<{ leads: PhoneLead[]; error: string | null }> {
  return getCachedLeads<PhoneLead>();
}

/**
 * A single lead. Served from the cached list when it's there: NEXUS takes
 * 2-14s for one lead (measured 19 Sep 2026), and every stage change or note
 * made through the CRM expires that cache, so the cached row is current for
 * anything done here or on the desktop. Falls back to NEXUS for a lead the
 * cache hasn't seen yet, or if the list rows ever stop carrying notes.
 */
export async function loadLead(id: string): Promise<{ lead: PhoneLead | null; error: string | null }> {
  const { leads } = await getCachedLeads<PhoneLead>();
  const cached = leads.find((l) => l.lead_id === id);
  if (cached && "notes" in cached) return { lead: cached, error: null };
  try {
    const res = await nexusApi(`/api/leads/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (res.status === 404) return { lead: null, error: null };
    if (!res.ok) return { lead: null, error: `NEXUS API responded ${res.status}` };
    return { lead: await res.json(), error: null };
  } catch (e) {
    return { lead: null, error: errMessage(e, "Couldn't reach NEXUS API") };
  }
}

export function loadPipelines(): Promise<Pipeline[]> {
  return getCachedPipelines<Pipeline>();
}

/**
 * The pipeline a lead belongs to. Mirrors the kanban: a lead with no
 * pipeline_id is shown in the first pipeline.
 */
export function pipelineOf(lead: Pick<PhoneLead, "pipeline_id">, pipelines: Pipeline[]): Pipeline | null {
  return pipelines.find((p) => p.id === lead.pipeline_id) ?? (lead.pipeline_id ? null : pipelines[0] ?? null);
}

export function stagesOf(pipeline: Pipeline | null): string[] {
  return pipeline?.stages?.length ? pipeline.stages : DEFAULT_STAGES;
}

export function stageOf(lead: Pick<PhoneLead, "ghl_stage" | "pipeline_id">, pipelines: Pipeline[]): string {
  return normaliseStage(lead.ghl_stage, stagesOf(pipelineOf(lead, pipelines)));
}

export function parseTags(raw: string | null): string[] {
  try {
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export const tempDot: Record<string, string> = {
  hot: "bg-red-500",
  warm: "bg-amber-400",
  cold: "bg-sky-400",
};

/** Task columns plus the contact's name, as read by Today and the Tasks screen. */
export const OPEN_TASKS_SELECT = "id,title,body,due_date,completed,created_at,contact_id,contact:contacts(name)";

export type RawTask = {
  id: string;
  title: string | null;
  body: string | null;
  due_date: string | null;
  completed: boolean | null;
  created_at: string | null;
  contact_id: string | null;
  contact?: { name: string | null } | { name: string | null }[] | null;
};

export function toLiveTasks(rows: RawTask[]): LiveTask[] {
  return rows.map((t) => {
    const c = Array.isArray(t.contact) ? t.contact[0] : t.contact;
    return {
      id: String(t.id),
      title: t.title || "(untitled task)",
      body: t.body ?? null,
      due_date: t.due_date ?? null,
      completed: t.completed === true,
      created_at: t.created_at ?? null,
      contactId: t.contact_id ?? null,
      contactName: c?.name ?? null,
    };
  });
}
