/**
 * POST /api/contacts — create ONE contact (or return the existing one).
 *
 * The CRM previously had no way to add a single person: `bulk-insert` (CSV) was
 * the only front door, and everything else created contacts as a side effect.
 * That made "book a meeting with the person I'm on the phone to" impossible,
 * because a meeting must attach to a contact row.
 *
 * Idempotent on email, so a double-submit or a retry returns the same contact
 * instead of a duplicate. `created` tells the caller which happened.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "../../../utils/cf-access";
import { errMessage } from "../../../utils/errors";
import {
  findOrCreateContactByEmail,
  looksLikeEmail,
  type NewContactInput,
} from "../../../utils/contacts-create";

export async function POST(req: NextRequest) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  let body: NewContactInput;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const fullName = (body.full_name ?? "").trim();
  if (!fullName) {
    return NextResponse.json({ error: "full_name is required" }, { status: 400 });
  }
  if (!looksLikeEmail(body.email)) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }

  try {
    const result = await findOrCreateContactByEmail({ ...body, full_name: fullName });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json(
      { contact_id: result.id, created: result.created },
      { status: result.created ? 201 : 200 },
    );
  } catch (e) {
    return NextResponse.json({ error: errMessage(e, "Could not create contact") }, { status: 500 });
  }
}
