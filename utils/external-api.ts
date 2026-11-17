/**
 * External read-only API (`/api/external/v1/*`) for approved outside parties.
 *
 * First client: Regathered (Chris, AI automation), approved by Sean 17 Nov 2026
 * for lead information, calendar, contact details (incl. phone), lead stage and
 * activity, and lead creation date.
 *
 * Rules this module encodes:
 *  - **Keys are hash-only.** `EXTERNAL_API_KEYS` holds `client:sha256hex` pairs
 *    (comma-separated). The raw key exists only with the client. Revoke a client
 *    by removing its pair and redeploying. No pairs = the API answers 401 to all.
 *  - **Every payload is a whitelist, not a redaction.** The mappers below pick
 *    fields one by one, so a new column (income, DOB, HECS, notes, TFN-adjacent
 *    data on a lead or contact) is invisible here by default. Free-text notes,
 *    email subjects/bodies and meeting join links are deliberately never sent:
 *    a LiveKit join link is itself a credential to the client's video room.
 *  - **Read-only.** The proxy carve-out only lets GET/HEAD through.
 *
 * Pure (no Supabase / NEXUS import) so it is unit-testable.
 */
import { createHash } from "node:crypto";
import { safeEqual } from "./sign-token";
import { normaliseStage, DEFAULT_STAGES } from "./pipeline-stage";

export const EXTERNAL_API_PREFIX = "/api/external/";

export function isExternalApiRoute(pathname: string): boolean {
  return pathname.startsWith(EXTERNAL_API_PREFIX);
}

export interface ExternalClient {
  name: string;
}

/** Parse `EXTERNAL_API_KEYS` = "regathered:<sha256hex>,other:<sha256hex>". */
export function parseKeyConfig(raw: string | undefined): Array<{ name: string; hash: string }> {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((pair) => {
      const i = pair.lastIndexOf(":");
      if (i <= 0) return null;
      const name = pair.slice(0, i).trim();
      const hash = pair.slice(i + 1).trim().toLowerCase();
      if (!name || !/^[0-9a-f]{64}$/.test(hash)) return null;
      return { name, hash };
    })
    .filter((x): x is { name: string; hash: string } => x !== null);
}

export function hashKey(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/** Resolve the caller from `Authorization: Bearer <key>` (or `X-API-Key`). Fails closed. */
export function authenticateExternal(
  headers: Headers,
  config: string | undefined = process.env.EXTERNAL_API_KEYS,
): ExternalClient | null {
  const keys = parseKeyConfig(config);
  if (keys.length === 0) return null;
  const auth = headers.get("authorization") || "";
  const m = auth.match(/^Bearer\s+(.+)$/i);
  const provided = (m?.[1] || headers.get("x-api-key") || "").trim();
  if (provided.length < 32) return null;
  const h = hashKey(provided);
  let match: ExternalClient | null = null;
  // Compare against every entry (no early exit) so timing doesn't reveal which matched.
  for (const k of keys) {
    if (safeEqual(h, k.hash)) match = { name: k.name };
  }
  return match;
}

// ---------------------------------------------------------------- paging

export const MAX_LIMIT = 500;

export function parsePaging(sp: URLSearchParams): { limit: number; offset: number } {
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(sp.get("limit") || "100", 10) || 100));
  const offset = Math.max(0, parseInt(sp.get("offset") || "0", 10) || 0);
  return { limit, offset };
}

/** Parse an ISO date/time query param; null if absent, undefined if invalid. */
export function parseIsoParam(v: string | null): string | null | undefined {
  if (!v) return null;
  const t = Date.parse(v);
  if (Number.isNaN(t)) return undefined;
  return new Date(t).toISOString();
}

// ---------------------------------------------------------------- whitelists

const str = (v: unknown): string | null =>
  v === null || v === undefined || v === "" ? null : String(v);

function tagList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string" && v.trim()) {
    const t = v.trim();
    if (t.startsWith("[")) {
      try {
        const arr = JSON.parse(t);
        if (Array.isArray(arr)) return arr.map(String).filter(Boolean);
      } catch {
        /* fall through to comma split */
      }
    }
    return t.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export interface PipelineInfo {
  id: string;
  name: string;
  stages: string[];
}

export interface ExternalLead {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  contact_id: string | null;
  source: string | null;
  pipeline: string | null;
  stage: string;
  stage_raw: string | null;
  temperature: string | null;
  score: number | null;
  buyer_type: string | null;
  state: string | null;
  preferred_location: string | null;
  tags: string[];
  created_at: string | null;
}

export function toExternalLead(
  row: Record<string, unknown>,
  pipelines: Map<string, PipelineInfo>,
  phoneFor: (row: Record<string, unknown>) => string | null,
): ExternalLead {
  const pid = str(row.pipeline_id);
  const p = pid ? pipelines.get(pid) : undefined;
  const stages = p?.stages?.length ? p.stages : DEFAULT_STAGES;
  const rawStage = str(row.ghl_stage);
  const score = typeof row.score === "number" ? row.score : row.score == null ? null : Number(row.score);
  return {
    id: String(row.lead_id),
    name: str(row.full_name),
    email: str(row.email),
    phone: str(row.phone) ?? phoneFor(row),
    contact_id: str(row.primary_contact_id),
    source: str(row.source),
    pipeline: p?.name ?? null,
    stage: normaliseStage(rawStage, stages),
    stage_raw: rawStage,
    temperature: str(row.temperature),
    score: Number.isFinite(score as number) ? (score as number) : null,
    buyer_type: str(row.buyer_type),
    state: str(row.state),
    preferred_location: str(row.preferred_location),
    tags: tagList(row.tags),
    created_at: str(row.created_at),
  };
}

export interface ExternalContact {
  id: string;
  name: string | null;
  first_name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: string | null;
  temperature: string | null;
  state: string | null;
  tags: string[];
  created_at: string | null;
  updated_at: string | null;
}

/** Columns read from `contacts` for this API — and nothing else. */
export const CONTACT_COLUMNS =
  "id,name,full_name,first_name,email,phone,source,status,temperature,state,tags,created_at,updated_at";

export function toExternalContact(row: Record<string, unknown>): ExternalContact {
  return {
    id: String(row.id),
    name: str(row.full_name) ?? str(row.name),
    first_name: str(row.first_name),
    email: str(row.email),
    phone: str(row.phone),
    source: str(row.source),
    status: str(row.status),
    temperature: str(row.temperature),
    state: str(row.state),
    tags: tagList(row.tags),
    created_at: str(row.created_at),
    updated_at: str(row.updated_at),
  };
}

export interface ExternalAppointment {
  id: string;
  title: string | null;
  start: string | null;
  end: string | null;
  status: string | null;
  host_name: string | null;
  host_email: string | null;
  contact_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
}

/** Columns read from `appointments`. NOT location (holds the video join link) or notes. */
export const APPOINTMENT_COLUMNS =
  "id,event_title,start_time,end_time,status,host_name,host_email,contact_id,contact_name,contact_email";

export function toExternalAppointment(row: Record<string, unknown>): ExternalAppointment {
  return {
    id: String(row.id),
    title: str(row.event_title),
    start: str(row.start_time),
    end: str(row.end_time),
    status: str(row.status),
    host_name: str(row.host_name),
    host_email: str(row.host_email),
    contact_id: str(row.contact_id),
    contact_name: str(row.contact_name),
    contact_email: str(row.contact_email) || null,
  };
}

export interface ActivityEvent {
  type: "lead_created" | "email" | "appointment";
  at: string;
  direction?: "inbound" | "outbound" | null;
  status?: string | null;
  appointment_id?: string;
}

/** Merge activity into one newest-first timeline. Content is never included. */
export function buildActivity(input: {
  createdAt: string | null;
  emails: Array<Record<string, unknown>>;
  appointments: Array<Record<string, unknown>>;
}): ActivityEvent[] {
  const out: ActivityEvent[] = [];
  if (input.createdAt) out.push({ type: "lead_created", at: input.createdAt });
  for (const e of input.emails) {
    const at = str(e.sent_at) ?? str(e.created_at);
    if (!at) continue;
    const d = str(e.direction);
    out.push({
      type: "email",
      at,
      direction: d === "inbound" || d === "outbound" ? d : null,
      status: str(e.status),
    });
  }
  for (const a of input.appointments) {
    const at = str(a.start_time);
    if (!at) continue;
    out.push({ type: "appointment", at, status: str(a.status), appointment_id: String(a.id) });
  }
  return out.sort((x, y) => Date.parse(y.at) - Date.parse(x.at));
}

/** Tripwire: throws if a payload carries a field that must never leave. */
const FORBIDDEN_KEYS = new Set([
  "notes", "additional_notes", "location", "message", "scoring_notes", "body_text", "body_html",
  "subject", "date_of_birth", "annual_income", "partner_annual_income", "existing_savings",
  "hecs_balance", "employer_name", "occupation", "home_address_street", "home_address_postcode",
  "tfn", "tax_file_number", "budget", "budget_numeric", "income", "savings",
]);

export function assertNoForbiddenKeys(value: unknown, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => assertNoForbiddenKeys(v, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(k)) throw new Error(`external-api: forbidden key ${path}.${k}`);
      assertNoForbiddenKeys(v, `${path}.${k}`);
    }
  }
}
