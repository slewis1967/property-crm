import { nexusApi } from "@/utils/nexus-api";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json();

  try {
    const res = await nexusApi("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    // Read as text first — NEXUS may be down and we'd get a Cloudflare HTML
    // error page, which would crash res.json() with "Unexpected token <".
    const raw = await res.text();
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      // Non-JSON response (likely CF tunnel 502 / HTML error page) — surface a
      // clean message instead of leaking the HTML body to the UI.
      const friendly =
        res.status === 502 || res.status === 503 || res.status === 504
          ? "NEXUS API unreachable — start it with `bash /mnt/c/NEXUS-Memory/start-nexus.sh` (status " + res.status + ")"
          : `NEXUS upstream returned non-JSON (status ${res.status})`;
      return NextResponse.json({ error: friendly }, { status: 503 });
    }
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 503 });
  }
}
