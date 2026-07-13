import { nexusApi } from "@/utils/nexus-api";
import { NextRequest, NextResponse } from "next/server";
import { errMessage } from "@/utils/errors";
import { userEmailFromRequest, isUnauthenticated } from "@/utils/cf-access";
import { validateDeletionInput, recordDeletion } from "@/utils/deletion-log";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const res = await nexusApi(`/api/leads/${id}`, { cache: "no-store" });
    const data = await res.json();
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) }, { status: 503 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  try {
    const res = await nexusApi(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) }, { status: 503 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Gate: an opportunity deletion requires a reason + the user's name.
  const body = await req.json().catch(() => ({}));
  const valid = validateDeletionInput(body);
  if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 });
  const { reason, deleterName } = valid.value;

  const email = await userEmailFromRequest(req);
  const deleterEmail = isUnauthenticated(email) ? null : email;

  // Snapshot the lead from NEXUS BEFORE the hard delete — this proxies to a
  // HARD delete in NEXUS, so the snapshot is the only recovery trail.
  let snapshot: unknown = null;
  let label: string = id;
  try {
    const getRes = await nexusApi(`/api/leads/${id}`, { cache: "no-store" });
    if (getRes.ok) {
      snapshot = await getRes.json();
      const s = snapshot as Record<string, unknown> | null;
      label =
        (s?.full_name as string) || (s?.name as string) || (s?.email as string) || id;
    }
  } catch {
    // Non-fatal: if the lookup fails we still record the deletion (without a
    // snapshot) and proceed. The reason+name gate has already passed.
  }

  await recordDeletion({
    entityType: "opportunity",
    entityId: id,
    entityLabel: label,
    reason,
    deleterName,
    deleterEmail,
    snapshot,
  });

  try {
    const res = await nexusApi(`/api/leads/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) return NextResponse.json(data, { status: res.status });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) }, { status: 503 });
  }
}
