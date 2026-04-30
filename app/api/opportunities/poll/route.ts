import { nexusApi } from "@/utils/nexus-api";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const res = await nexusApi("/api/leads", { cache: "no-store" });
    if (!res.ok) throw new Error(`NEXUS API ${res.status}`);
    const data = await res.json();
    return NextResponse.json({ leads: data.leads || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, leads: [] }, { status: 503 });
  }
}
