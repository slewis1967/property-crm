/**
 * /api/memory/[id]   (id may be a uuid or a slug)
 *
 * GET    — fetch one memory.
 * PATCH  — edit fields, archive, or apply a reinforcement delta.
 *          Body: { title?, body?, tags?, links?, confidence?, kind?,
 *                  archived?, reinforce?: number }
 *          Editing title/body re-embeds via remember()'s upsert path.
 * DELETE — hard delete (prefer PATCH { archived: true } for soft delete).
 */
import { NextResponse } from "next/server";
import { getDb } from "../../../../utils/db";
import { getMemory, remember, reinforce, type MemoryKind } from "../../../../utils/memory";
import { requireAuth } from "../../../../utils/cf-access";

const supabase = getDb();

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mem = await getMemory(id);
  if (!mem) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, memory: mem });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const existing = await getMemory(id);
  if (!existing) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  try {
    // Reinforcement is independent of content edits.
    if (typeof body.reinforce === "number") {
      await reinforce(existing.id, body.reinforce);
    }

    const touchesContent =
      typeof body.title === "string" || typeof body.body === "string";

    if (touchesContent) {
      // Re-run through remember() so the embedding is regenerated for the new text.
      const mem = await remember({
        slug: existing.slug,
        kind: (body.kind as MemoryKind) ?? (existing.kind as MemoryKind),
        title: typeof body.title === "string" ? body.title : existing.title,
        body: typeof body.body === "string" ? body.body : existing.body,
        source: existing.source ?? "human",
        entityType: existing.entity_type ?? undefined,
        entityId: existing.entity_id ?? undefined,
        tags: Array.isArray(body.tags) ? (body.tags as string[]) : existing.tags,
        links: Array.isArray(body.links) ? (body.links as string[]) : existing.links,
        confidence:
          typeof body.confidence === "number" ? body.confidence : existing.confidence,
      });
      return NextResponse.json({ ok: true, memory: mem });
    }

    // Metadata-only update (tags/links/confidence/kind/archived) — no re-embed.
    const patch: Record<string, unknown> = {};
    if (Array.isArray(body.tags)) patch.tags = body.tags;
    if (Array.isArray(body.links)) patch.links = body.links;
    if (typeof body.confidence === "number") patch.confidence = body.confidence;
    if (typeof body.kind === "string") patch.kind = body.kind;
    if (typeof body.archived === "boolean") patch.archived = body.archived;

    if (Object.keys(patch).length === 0 && typeof body.reinforce !== "number") {
      return NextResponse.json({ ok: false, error: "nothing to update" }, { status: 400 });
    }
    if (Object.keys(patch).length) {
      const { error } = await supabase.from("crm_memory").update(patch).eq("id", existing.id);
      if (error) throw new Error(error.message);
    }
    const mem = await getMemory(existing.id);
    return NextResponse.json({ ok: true, memory: mem });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "update failed" },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const existing = await getMemory(id);
  if (!existing) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
  const { error } = await supabase.from("crm_memory").delete().eq("id", existing.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
