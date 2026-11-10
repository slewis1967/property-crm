/**
 * Staff side of property shortlists (AUTHED — behind Cloudflare Access).
 *
 *   POST /api/property-shortlists
 *     Body: { client_name, client_email?, contact_id?, opportunity_id?, title?,
 *             message?, assumptions?, booking_slug?, ttl_days?, send_email?,
 *             items: [propertyId | {propertyId, rentWeekly?, staffNote?}] }
 *     Mints a client link (only its SHA-256 is stored), snapshots the masked
 *     lots, optionally emails the client, and returns the one-time link.
 *
 *   GET /api/property-shortlists?contact_id=
 *     Shortlists with their items and the client's responses.
 *
 * DELIBERATELY not under /api/shortlist/*, which is CF-Access-bypassed for the
 * client. Keeping staff routes here preserves their auth requirement.
 */
import { NextResponse } from "next/server";
import { requireAuth } from "../../../utils/cf-access";
import { enforceRateLimit } from "../../../utils/rate-limit";
import { isValidEmail, publicOrigin } from "../../../utils/document-requests-db";
import {
  isUuid,
  MESSAGE_MAX,
  parseAssumptions,
  parseCreateItems,
  parseTtlDays,
} from "../../../utils/property-shortlist";
import { createShortlist, listShortlists } from "../../../utils/property-shortlist-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

export async function POST(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const limited = enforceRateLimit(req, { windowMs: 60_000, max: 20 });
  if (limited) return limited;

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  const clientName = text(body.client_name, 120);
  if (!clientName) return NextResponse.json({ ok: false, error: "Client name is required." }, { status: 400 });

  const clientEmail = text(body.client_email, 200);
  if (clientEmail && !isValidEmail(clientEmail)) {
    return NextResponse.json({ ok: false, error: "That client email doesn't look right." }, { status: 400 });
  }
  const sendEmail = body.send_email === true;
  if (sendEmail && !clientEmail) {
    return NextResponse.json({ ok: false, error: "Add the client's email to send the link." }, { status: 400 });
  }

  const items = parseCreateItems(body.items);
  if (!items.ok) return NextResponse.json({ ok: false, error: items.error }, { status: 400 });

  const contactId = isUuid(body.contact_id) ? body.contact_id : null;
  const opportunityId = text(body.opportunity_id, 100);

  const result = await createShortlist({
    clientName,
    clientEmail,
    contactId,
    opportunityId,
    title: text(body.title, 120),
    message: text(body.message, MESSAGE_MAX),
    assumptions: parseAssumptions(body.assumptions),
    bookingSlug: text(body.booking_slug, 40),
    ttlDays: parseTtlDays(body.ttl_days),
    items: items.items,
    sendEmail,
    createdBy: auth,
    origin: publicOrigin(req),
  });

  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json(result);
}

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const url = new URL(req.url);
  const contactId = url.searchParams.get("contact_id");
  if (contactId && !isUuid(contactId)) {
    return NextResponse.json({ ok: false, error: "Invalid contact_id" }, { status: 400 });
  }
  const result = await listShortlists({ contactId, limit: 50 });
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  return NextResponse.json(result);
}
