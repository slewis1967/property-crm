/**
 * Shared helpers for the STAFF-side introducer routes (app/api/admin/introducers/*).
 * Not a route (underscore-prefixed).
 *
 * These routes sit behind Cloudflare Access like the rest of the CRM. They live
 * under /api/admin/ deliberately: the public portal owns /api/introducer/*,
 * which proxy.ts exempts from the CF Access gate. Keeping the two apart by
 * prefix rather than by a trailing-slash technicality means no future rename can
 * accidentally drag a staff route inside the exemption — the mistake the signing
 * routes had to correct when /api/sign/requests became /api/signature-requests.
 *
 * TWO PRIVILEGE LEVELS
 *   requireStaff      — any Cloudflare-Access-authenticated user. Reviewing,
 *                       asking for more information, moving the progress stage.
 *   requireSuperAdmin — Sean alone. Onboarding an introducer, accepting or
 *                       declining a referral, and authorising a change to a
 *                       submitted one.
 */
import { NextResponse } from "next/server";
import { requireAuth } from "../../../../utils/cf-access";
import { isSuperAdmin } from "../../../../utils/super-admin";

/** Any authenticated staff member. Returns the email, or the 401 to return. */
export async function requireStaff(req: Request): Promise<string | NextResponse> {
  return requireAuth(req);
}

/**
 * The owner only. Returns the email, or the response to return (401 if not
 * authenticated at all, 403 if authenticated but not the super admin).
 *
 * The 403 message names what's missing rather than being coy: the caller is a
 * colleague, and "you need Sean to do this" is the useful answer.
 */
export async function requireSuperAdmin(req: Request): Promise<string | NextResponse> {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  if (!isSuperAdmin(auth)) {
    return NextResponse.json(
      {
        ok: false,
        error: "Only the account owner can authorise this. Ask Sean to action it.",
        code: "super_admin_required",
      },
      { status: 403 },
    );
  }
  return auth;
}

/** Parse a JSON body, or return the 400 the caller should return. */
export async function readJson(req: Request): Promise<Record<string, unknown> | NextResponse> {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") throw new Error("not an object");
    return body as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }
}
