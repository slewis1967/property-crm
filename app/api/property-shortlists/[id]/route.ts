/**
 * PATCH /api/property-shortlists/<id>  { action: "revoke" }
 *
 * AUTHED (Cloudflare Access). Revoking kills the client's link immediately —
 * the public routes re-check status on every request. There is no "reissue":
 * the raw token was never stored, so a new link means a new shortlist.
 */
import { NextResponse } from "next/server";
import { requireAuth } from "../../../../utils/cf-access";
import { isUuid } from "../../../../utils/property-shortlist";
import { revokeShortlist } from "../../../../utils/property-shortlist-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { action?: unknown };
  if (body.action !== "revoke") {
    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  }

  const result = await revokeShortlist(id, auth);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
