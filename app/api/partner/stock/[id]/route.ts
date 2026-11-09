/**
 * GET /api/partner/stock/<id>
 *
 * PUBLIC (session-scoped). One masked lot. A lot that has sold or been
 * withdrawn comes back with availability "unavailable" rather than a 404, so a
 * partner who bookmarked it learns it's gone rather than suspecting a broken link.
 */
import { NextResponse } from "next/server";
import { requirePartner, requireFeature, showsFees } from "../../_shared";
import { loadPartnerLot } from "../../../../../utils/partner-stock";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requirePartner();
  if (auth instanceof NextResponse) return auth;
  const locked = requireFeature(auth, "stock");
  if (locked) return locked;

  const { id } = await params;
  const lot = await loadPartnerLot(id, { showFees: showsFees(auth) });
  if (!lot) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
  return NextResponse.json({ ok: true, lot });
}
