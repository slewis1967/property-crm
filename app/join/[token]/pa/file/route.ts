/**
 * PUBLIC guest copy of the Preliminary Assessment PDF being presented.
 * TOKEN-AUTHENTICATED (the signed guest link), NO requireAuth.
 *
 * GET /join/<token>/pa/file -> the PDF bytes, inline, never cached.
 *
 * The applicant's phone draws the pages itself from these bytes and follows the
 * rep's page number, so the file has to reach the browser. It is streamed
 * through this handler rather than handed out as a signed Storage URL: a signed
 * URL is a second bearer link to a credit proposal that outlives the call and
 * can be forwarded. This one stops working when the guest token expires or the
 * PA leaves the room.
 *
 * 404 until the rep has pressed Present. See ../_shared.ts for the access rule.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { log } from "../../../../../utils/logger";
import { PA_BUCKET } from "../../../../../utils/preliminary-assessments";
import { limitGuest, notFound, resolveGuestPa } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await params;
  // A phone fetches this once per call; reconnects and a second device share
  // the allowance.
  const limited = limitGuest(req, token, 12);
  if (limited) return limited;

  try {
    const pa = await resolveGuestPa(token);
    if (!pa) return notFound();

    const { data, error } = await supabase.storage.from(PA_BUCKET).download(pa.pdf_path);
    if (error || !data) {
      log.error("pa.guest_file_missing", { paId: pa.id, message: error?.message ?? "no data" });
      return notFound();
    }

    const body = new Uint8Array(await data.arrayBuffer());
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        // A fixed name: the stored filename carries YLA's reference and the
        // applicants' surnames, which have no business in a response header.
        "Content-Disposition": 'inline; filename="preliminary-assessment.pdf"',
        "Content-Length": String(body.byteLength),
        "Cache-Control": "no-store",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (e) {
    log.error("pa.guest_file_failed", { message: e instanceof Error ? e.message : String(e) });
    return notFound();
  }
}
