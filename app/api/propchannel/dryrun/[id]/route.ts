import { NextRequest, NextResponse } from "next/server";
import { buildUpsertPayload, propChannelEnv, signForDryRun } from "../../../../../utils/propchannel";
import { requireAuth } from "../../../../../utils/cf-access";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const env = propChannelEnv();
  const payload = await buildUpsertPayload(id);
  if (!payload) return NextResponse.json({ error: "property_not_found" }, { status: 404 });
  const sig = signForDryRun(payload);
  return NextResponse.json({
    env: { enabled: env.enabled, url: env.url, hasSecret: env.hasSecret },
    payload,
    signature: sig.signature,
  });
}

