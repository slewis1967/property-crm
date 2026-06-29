/**
 * /api/memory
 *
 * GET  — list/browse memories (filter by kind, entity, tag, free-text q).
 * POST — write a memory. Used by AI features (source = agent name) and by the
 *        /brain UI (source = 'human').
 *
 * Auth: protected by Cloudflare Access at the edge like the rest of the CRM.
 */
import { NextResponse } from "next/server";
import { getDb } from "../../../utils/db";
import { remember, type MemoryKind } from "../../../utils/memory";
import { requireAuth } from "../../../utils/cf-access";

const supabase = getDb();

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const entityType = url.searchParams.get("entityType");
  const entityId = url.searchParams.get("entityId");
  const tag = url.searchParams.get("tag");
  const q = url.searchParams.get("q");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);

  let query = supabase
    .from("crm_memory")
    .select("*")
    .eq("archived", false)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (kind) query = query.eq("kind", kind);
  if (entityType) query = query.eq("entity_type", entityType);
  if (entityId) query = query.eq("entity_id", entityId);
  if (tag) query = query.contains("tags", [tag]);
  if (q) query = query.textSearch("fts", q, { type: "websearch" });

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, items: data ?? [] });
}

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  if (!title) {
    return NextResponse.json({ ok: false, error: "title is required" }, { status: 400 });
  }

  try {
    const mem = await remember({
      kind: payload.kind as MemoryKind | undefined,
      title,
      body: typeof payload.body === "string" ? payload.body : undefined,
      source: typeof payload.source === "string" ? payload.source : "human",
      entityType: typeof payload.entityType === "string" ? payload.entityType : undefined,
      entityId: typeof payload.entityId === "string" ? payload.entityId : undefined,
      tags: Array.isArray(payload.tags) ? (payload.tags as string[]) : undefined,
      links: Array.isArray(payload.links) ? (payload.links as string[]) : undefined,
      confidence: typeof payload.confidence === "number" ? payload.confidence : undefined,
      createdBy:
        typeof payload.createdBy === "string"
          ? payload.createdBy
          : typeof auth === "string"
            ? auth
            : undefined,
      slug: typeof payload.slug === "string" ? payload.slug : undefined,
    });
    return NextResponse.json({ ok: true, memory: mem });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "write failed" },
      { status: 500 },
    );
  }
}
