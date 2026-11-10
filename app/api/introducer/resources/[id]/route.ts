import { NextResponse } from "next/server";
import { requireIntroducer, logIntroducerEvent } from "../../_shared";
import {
  findPublishedResource,
  signResource,
  resourcesTableMissing,
} from "../../../../../utils/introducer-resources-db";

/**
 * Fetch one library document.
 *
 * Redirects to a short-lived signed URL rather than streaming the bytes through
 * the function. A 40-page PDF does not need to traverse a serverless invocation
 * with a 26-second ceiling on it, and Supabase serves it faster than we can.
 *
 * WHY THE DOWNLOAD IS LOGGED. "Did this introducer have the policy manual?" is a
 * question an audit asks, and the honest answer needs a record of the document
 * having actually been fetched — not merely of it having been published. The
 * event carries the version, so the trail survives the document being revised.
 *
 * The bucket is private and there is no other route into it, so this session
 * check is the whole of the access control.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

  // Unpublished and non-existent give the same answer. A distinct "not
  // published yet" would confirm that a document exists and let anyone with a
  // session watch for the moment it goes live.
  if (!resource) {
    return NextResponse.json({ ok: false, error: "No such document." }, { status: 404 });
  }

  const url = await signResource(resource.storage_path, resource.filename);
  if (!url) {
    return NextResponse.json(
      { ok: false, error: "That document is listed but its file is missing. Please tell us." },
      { status: 502 },
    );
  }

  await logIntroducerEvent({
    introducerId: auth.introducerId,
    actorType: "introducer",
    actor: auth.email,
    action: "resource_downloaded",
    detail: { resource_id: resource.id, slug: resource.slug, version: resource.version },
  });

  // 302, not 307: this is a GET either way and the signed URL is single-use in
  // spirit — nothing should cache the redirect as permanent.
  return NextResponse.redirect(url, 302);
}
