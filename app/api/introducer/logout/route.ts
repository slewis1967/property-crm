/**
 * POST /api/introducer/logout
 *
 * PUBLIC (session-scoped). Revokes the session server-side as well as clearing
 * the cookie — clearing the cookie alone would leave a valid token in anything
 * that had already copied it.
 */
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  revokeSession,
  sessionCookieName,
  sessionCookieOptions,
} from "../../../../utils/introducer-auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const jar = await cookies();
  const name = sessionCookieName();
  const raw = jar.get(name)?.value;
  if (raw) await revokeSession(raw, "signed_out");

  const res = NextResponse.json({ ok: true });
  res.cookies.set(name, "", sessionCookieOptions(0));
  return res;
}
