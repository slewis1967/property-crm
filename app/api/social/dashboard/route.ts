/**
 * GET /api/social/dashboard
 *   Proxies to NEXUS Flask /social/dashboard. Uses the same robust JSON
 *   handling as /api/opportunities so a tunnel 502/503 surfaces a clean
 *   error rather than crashing res.json() on an HTML body.
 */
import { nexusApi } from "@/utils/nexus-api";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await nexusApi("/social/dashboard");
    const raw = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      const friendly =
        res.status === 502 || res.status === 503 || res.status === 504
          ? `NEXUS API unreachable — start it with \`bash /mnt/c/NEXUS-Memory/start-nexus.sh\` (status ${res.status})`
          : `NEXUS upstream returned non-JSON (status ${res.status})`;
      return NextResponse.json({ ok: false, error: friendly }, { status: 503 });
    }
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json({ ok: true, ...(data as object) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 503 });
  }
}
