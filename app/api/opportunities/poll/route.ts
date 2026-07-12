import { nexusApi } from "@/utils/nexus-api";
import { NextResponse } from "next/server";
import { errMessage } from "@/utils/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await nexusApi("/api/leads", { cache: "no-store" });
    if (!res.ok) throw new Error(`NEXUS API ${res.status}`);
    const data = await res.json();
    return NextResponse.json({ leads: data.leads || [] });
  } catch (e) {
    return NextResponse.json({ error: errMessage(e), leads: [] }, { status: 503 });
  }
}
