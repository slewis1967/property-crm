import { NextResponse } from "next/server";
import { requireIntroducer, logIntroducerEvent } from "../../../_shared";
import {
  findPublishedResource,
  recordAck,
  resourcesTableMissing,
} from "../../../../../../utils/introducer-resources-db";
import { clientIp } from "../../../../../../utils/introducer-auth";

/**
 * "I have read this."
 *
 * THE VERSION IS TAKEN FROM THE DOCUMENT, NOT THE REQUEST. The client never
 * says which version it is confirming — it would be trivial to confirm a version
 * that was never read, and an acknowledgement anyone can aim at an arbitrary
 * string is not evidence of anything. The row records the version currently
 * published, which is the version the button appeared beneath.
 *
 * Idempotent: the unique constraint absorbs a double-click, and the first
 * confirmation keeps its timestamp. That timestamp is the point of the record.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireIntroducer();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  let resource;
  try {
    resource = await findPublishedResource(id);
  } catch (err) {
    if (resourcesTableMissing(err)) {
      return NextResponse.json(
        { ok: false, error: "The document library is not switched on yet." },
        { status: 503 },
      );
    }
    throw err;
  }
  if (!resource) {
    return NextResponse.json({ ok: false, error: "No such document." }, { status: 404 });
  }

  // Confirming a document that asks for no confirmation would put a row in an
  // append-only evidence table that nobody asked for and nobody can remove.
  if (!resource.requires_ack) {
    return NextResponse.json(
      { ok: false, error: "That document doesn't need to be confirmed." },
      { status: 400 },
    );
  }

  let result;
  try {
    result = await recordAck({
      resourceId: resource.id,
      introducerId: auth.introducerId,
      version: resource.version,
      acknowledgedBy: auth.email,
      ip: clientIp(req),
      userAgent: req.headers.get("user-agent"),
    });
  } catch (err) {
    if (resourcesTableMissing(err)) {
      return NextResponse.json(
        { ok: false, error: "The document library is not switched on yet." },
        { status: 503 },
      );
    }
    throw err;
  }

  // Only log the first one. A repeat is a double-click, and filling the audit
  // trail with those makes the entries that matter harder to find.
  if (result.recorded) {
    await logIntroducerEvent({
      introducerId: auth.introducerId,
      actorType: "introducer",
      actor: auth.email,
      action: "resource_acknowledged",
      detail: { resource_id: resource.id, slug: resource.slug, version: resource.version },
    });
  }

  return NextResponse.json({ ok: true, acknowledged: true, version: resource.version });
}
