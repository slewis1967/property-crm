import { nexusApi } from "@/utils/nexus-api";
import { NextRequest, NextResponse } from "next/server";
import { errMessage } from "@/utils/errors";

export async function GET() {
  try {
    const res = await nexusApi("/api/pipelines", { cache: "no-store" });
    const data = await res.json();
    // Propagate an upstream failure instead of relaying a Flask 500 body as a
    // 200 — otherwise the client sees a valid-looking response with no
    // `pipelines` key and can't tell a real error from an empty result.
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ pipelines: [], error: errMessage(e) }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  try {
    const res = await nexusApi("/api/pipelines", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) }, { status: 503 });
  }
}
