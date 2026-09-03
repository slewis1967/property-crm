import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "../../../../utils/cf-access";
import { publishPropertyUpsert, propChannelEnv } from "../../../../utils/propchannel";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { ids } = await req.json().catch(() => ({ ids: null }));
  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids[] is required" }, { status: 400 });
  }
  const results = await Promise.allSettled(ids.map((id: string) => publishPropertyUpsert(id)));
  const ok = results.filter((r) => r.status === "fulfilled" && (r.value as any)?.ok !== false).length;
  const failed = results.length - ok;
  const env = propChannelEnv();
  return NextResponse.json({
    ok,
    failed,
    total: results.length,
    env: { enabled: env.enabled, url: env.url, hasSecret: env.hasSecret },
    results: results.map((r, i) =>
      r.status === "fulfilled" ? { id: ids[i], ok: (r.value as any)?.ok !== false } : { id: ids[i], ok: false },
    ),
  });
}

