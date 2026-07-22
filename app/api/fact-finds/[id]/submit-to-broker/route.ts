/**
 * POST /api/fact-finds/<id>/submit-to-broker   (AUTHED)   Body: { brokerId }
 *
 * Submits a completed Fact Find to a broker chosen from Settings: verify it's
 * complete → render the PDF → email the broker. Mirrors the YLA verify→send flow
 * but for the Fact Find format. Refuses (422) with the missing fields if the
 * Fact Find is a stub. The work lives in utils/factfind-broker-submit.ts.
 */
import { NextResponse } from "next/server";
import { requireAuth } from "../../../../../utils/cf-access";
import { submitFactFindToBroker } from "../../../../../utils/factfind-broker-submit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;

  const body = await req.json().catch(() => ({}));
  const brokerId = typeof body?.brokerId === "string" ? body.brokerId : "";
  if (!brokerId) return NextResponse.json({ ok: false, error: "brokerId is required" }, { status: 400 });

  const result = await submitFactFindToBroker(id, brokerId, auth);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error, ...(result.blockers ? { blockers: result.blockers } : {}) }, { status: result.status });
  }
  return NextResponse.json({ ok: true, broker: result.brokerName, email: result.brokerEmail, applicant: result.applicant });
}
