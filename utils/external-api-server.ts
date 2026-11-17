/**
 * Server side of the external read-only API: the route wrapper (auth, rate
 * limit, audit log, payload tripwire) and the data reads. See utils/external-api.ts.
 */
import { NextResponse, type NextRequest } from "next/server";
import { supabase } from "./supabase";
import { getCachedLeads, getCachedPipelines } from "./nexus-leads-cache";
import { enforceKeyedRateLimit } from "./rate-limit";
import { log, errInfo } from "./logger";
import {
  authenticateExternal,
  assertNoForbiddenKeys,
  toExternalLead,
  type ExternalClient,
  type ExternalLead,
  type PipelineInfo,
} from "./external-api";

type Handler<C> = (req: NextRequest, client: ExternalClient, ctx: C) => Promise<unknown>;

export class ExternalApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function withExternalAuth<C>(route: string, handler: Handler<C>) {
  return async (req: NextRequest, ctx: C): Promise<NextResponse> => {
    const client = authenticateExternal(req.headers);
    if (!client) {
      log.warn("external_api.unauthorised", { route });
      return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    }
    const limited = enforceKeyedRateLimit(`external:${client.name}`, { windowMs: 60_000, max: 120 });
    if (limited) return limited;
    try {
      const body = await handler(req, client, ctx);
      assertNoForbiddenKeys(body);
      // Audit: who read what. No PII, no query values beyond the route.
      log.info("external_api.read", { client: client.name, route });
      return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
    } catch (e) {
      if (e instanceof ExternalApiError) {
        return NextResponse.json({ error: e.message }, { status: e.status });
      }
      log.error("external_api.failed", { client: client.name, route, ...errInfo(e) });
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
  };
}

async function pipelineMap(): Promise<Map<string, PipelineInfo>> {
  const raw = await getCachedPipelines<Record<string, unknown>>();
  const m = new Map<string, PipelineInfo>();
  for (const p of raw) {
    const id = String(p.id ?? p.pipeline_id ?? "");
    if (!id) continue;
    const stages = Array.isArray(p.stages) ? p.stages.map((s) => (typeof s === "string" ? s : String((s as { name?: unknown })?.name ?? ""))).filter(Boolean) : [];
    m.set(id, { id, name: String(p.name ?? ""), stages });
  }
  return m;
}

/** Phones from `contacts`, by contact id and by lowercased email. The NEXUS list has no phone column. */
async function phoneLookup(rows: Array<Record<string, unknown>>) {
  const ids = [...new Set(rows.map((r) => r.primary_contact_id).filter(Boolean).map(String))];
  const emails = [...new Set(rows.map((r) => r.email).filter(Boolean).map((e) => String(e).toLowerCase()))];
  const byId = new Map<string, string>();
  const byEmail = new Map<string, string>();
  const take = (data: Array<{ id: string; email: string | null; phone: string | null }> | null) => {
    for (const c of data || []) {
      if (!c.phone) continue;
      byId.set(c.id, c.phone);
      if (c.email && !byEmail.has(c.email.toLowerCase())) byEmail.set(c.email.toLowerCase(), c.phone);
    }
  };
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase.from("contacts").select("id,email,phone").in("id", ids.slice(i, i + 200));
    take(data);
  }
  for (let i = 0; i < emails.length; i += 200) {
    const { data } = await supabase.from("contacts").select("id,email,phone").in("email", emails.slice(i, i + 200));
    take(data);
  }
  return (r: Record<string, unknown>): string | null => {
    const id = r.primary_contact_id ? String(r.primary_contact_id) : "";
    if (id && byId.has(id)) return byId.get(id)!;
    const em = r.email ? String(r.email).toLowerCase() : "";
    return (em && byEmail.get(em)) || null;
  };
}

export async function listLeads(opts: {
  since: string | null;
  limit: number;
  offset: number;
}): Promise<{ total: number; leads: ExternalLead[] }> {
  const { leads, error } = await getCachedLeads<Record<string, unknown>>();
  if (error) throw new ExternalApiError(503, "Lead store temporarily unavailable");
  const sinceMs = opts.since ? Date.parse(opts.since) : null;
  const filtered = leads.filter((l) => {
    if (sinceMs === null) return true;
    const t = l.created_at ? Date.parse(String(l.created_at)) : NaN;
    return Number.isFinite(t) && t >= sinceMs;
  });
  const page = filtered.slice(opts.offset, opts.offset + opts.limit);
  const [pipelines, phoneFor] = await Promise.all([pipelineMap(), phoneLookup(page)]);
  return { total: filtered.length, leads: page.map((r) => toExternalLead(r, pipelines, phoneFor)) };
}

export async function getLead(id: string): Promise<{ lead: ExternalLead; raw: Record<string, unknown> } | null> {
  const { leads, error } = await getCachedLeads<Record<string, unknown>>();
  if (error) throw new ExternalApiError(503, "Lead store temporarily unavailable");
  const raw = leads.find((l) => String(l.lead_id) === id);
  if (!raw) return null;
  const [pipelines, phoneFor] = await Promise.all([pipelineMap(), phoneLookup([raw])]);
  return { lead: toExternalLead(raw, pipelines, phoneFor), raw };
}

/** Activity rows for a lead's contact: email metadata (no subject/body) and appointments. */
export async function leadActivityRows(contactId: string | null, email: string | null) {
  const emails: Array<Record<string, unknown>> = [];
  const appts: Array<Record<string, unknown>> = [];
  if (contactId) {
    const { data } = await supabase
      .from("email_log")
      .select("direction,status,sent_at,created_at")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(100);
    emails.push(...(data || []));
  }
  // Two plain queries merged by id, rather than a PostgREST .or() string built from an email.
  const seen = new Set<string>();
  const addAppts = (rows: Array<Record<string, unknown>> | null) => {
    for (const r of rows || []) {
      const k = String(r.id);
      if (!seen.has(k)) {
        seen.add(k);
        appts.push(r);
      }
    }
  };
  const apptBase = () => supabase.from("appointments").select("id,start_time,status").order("start_time", { ascending: false }).limit(50);
  if (contactId) addAppts((await apptBase().eq("contact_id", contactId)).data);
  if (email) addAppts((await apptBase().eq("contact_email", email)).data);
  return { emails, appts };
}
