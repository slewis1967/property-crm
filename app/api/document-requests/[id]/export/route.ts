/**
 * POST /api/document-requests/<id>/export   (AUTHED)
 *
 * Package an APPLICATION's collected documents into ONE Google Drive folder
 * (every applicant's files together, so YLA get a single link). The work lives
 * in utils/yla-export.ts (shared with the auto-submit sweep). ?force=1 exports a
 * partial set.
 */
import { NextResponse } from "next/server";
import { requireAuth } from "../../../../../utils/cf-access";
import { exportApplicationToDrive } from "../../../../../utils/yla-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const force = new URL(req.url).searchParams.get("force") === "1";

  const result = await exportApplicationToDrive(id, { force });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, ...(result.missing ? { missing: result.missing } : {}) },
      { status: result.status },
    );
  }
  if (result.alreadyExported) {
    return NextResponse.json({ ok: false, error: "Already exported to Drive.", folder_url: result.folderUrl }, { status: 409 });
  }
  return NextResponse.json({
    ok: true,
    folder_url: result.folderUrl,
    uploaded: result.uploaded,
    applicants: result.applicants,
    ...(result.warning ? { warning: result.warning } : {}),
  });
}
