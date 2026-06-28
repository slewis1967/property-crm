/**
 * GET /api/memory/recall?q=...&kind=...&entityType=...&entityId=...&limit=8
 *
 * Hybrid retrieval (semantic when embeddings configured, else full-text).
 * The endpoint AI features hit to pull relevant memories into their context.
 */
import { NextResponse } from "next/server";
import { recall, type MemoryKind } from "../../../../utils/memory";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  if (!q.trim()) {
    return NextResponse.json({ ok: false, error: "q is required" }, { status: 400 });
  }

  try {
    const items = await recall(q, {
      kind: (url.searchParams.get("kind") as MemoryKind | null) ?? undefined,
      entityType: url.searchParams.get("entityType") ?? undefined,
      entityId: url.searchParams.get("entityId") ?? undefined,
      limit: Math.min(parseInt(url.searchParams.get("limit") ?? "8", 10), 50),
      feature: url.searchParams.get("feature") ?? "api",
    });
    return NextResponse.json({ ok: true, items });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "recall failed" },
      { status: 500 },
    );
  }
}
