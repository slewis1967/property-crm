/**
 * POST /api/introducer/onboarding/<token>/submit-id
 *
 * PUBLIC, token-scoped. Called once both sides of the licence are uploaded.
 * Advances the application to `id_uploaded`, then runs the identity check.
 *
 * The check runs here rather than on upload because a licence is two images and
 * neither means anything alone. A pass moves them straight on to the course; a
 * fail, an error, or no configured provider all land in the staff queue — the
 * applicant is never told "you failed identity verification" by a machine.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../../utils/supabase";
import {
  findByToken,
  setState,
  logOnboardingEvent,
} from "../../../../../../utils/introducer-onboarding-db";
import { canUploadId, onboardingTablesMissing } from "../../../../../../utils/introducer-onboarding";
import {
  identityProvider,
  storedResult,
  clearsAutomatically,
} from "../../../../../../utils/identity-check";

export const dynamic = "force-dynamic";

const BUCKET = "introducer-identity";
/** Long enough for a provider to fetch, short enough not to be a handout. */
const FETCH_TTL_SECONDS = 300;

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let found;
  try {
    found = await findByToken(decodeURIComponent(token));
  } catch (err) {
    if (onboardingTablesMissing(err)) {
      return NextResponse.json({ ok: false, error: "Not available yet." }, { status: 503 });
    }
    throw err;
  }

  if (!found.ok) {
    return NextResponse.json(
      { ok: false, error: "This link is no longer valid. Ask Springboard to send you a new one." },
      { status: 403 },
    );
  }

  const app = found.application;
  if (!canUploadId(app.state)) {
    return NextResponse.json({ ok: false, error: "We already have your identity documents." }, { status: 409 });
  }

  const { data: docs } = await supabase
    .from("introducer_identity_documents")
    .select("side,storage_path")
    .eq("application_id", app.id)
    .is("purged_at", null);

  const front = docs?.find((d) => d.side === "front");
  const back = docs?.find((d) => d.side === "back");
  if (!front || !back) {
    return NextResponse.json(
      { ok: false, error: "We need both the front and the back of your licence." },
      { status: 400 },
    );
  }

  if (app.state !== "id_uploaded") {
    await setState(app.id, "id_uploaded");
  }
  await logOnboardingEvent(app.id, "applicant", app.email, "identity_submitted", {});

  // Short-lived signed URLs so a provider can fetch the images without the
  // bucket ever being public.
  const [signedFront, signedBack] = await Promise.all([
    supabase.storage.from(BUCKET).createSignedUrl(front.storage_path, FETCH_TTL_SECONDS),
    supabase.storage.from(BUCKET).createSignedUrl(back.storage_path, FETCH_TTL_SECONDS),
  ]);

  const provider = identityProvider();
  let result;
  try {
    result = await provider.check({
      applicationId: app.id,
      legalName: app.legal_name,
      frontUrl: signedFront.data?.signedUrl ?? "",
      backUrl: signedBack.data?.signedUrl ?? "",
    });
  } catch (err) {
    // A provider that throws is an error outcome, not a 500 for the applicant.
    // They have done their part; the failure is ours to chase.
    result = {
      outcome: "error" as const,
      reference: null,
      provider: provider.name,
      detail: (err as { message?: string })?.message ?? "the verification service did not respond",
    };
  }

  const stored = storedResult(result.outcome);
  await supabase
    .from("introducer_applications")
    .update({
      id_check_provider: result.provider,
      id_check_reference: result.reference,
      id_check_result: stored,
      id_checked_at: stored ? new Date().toISOString() : null,
      id_checked_by: null,
    })
    .eq("id", app.id);

  await logOnboardingEvent(app.id, "system", null, "identity_check_ran", {
    provider: result.provider,
    outcome: result.outcome,
    reference: result.reference,
    detail: result.detail,
  });

  if (clearsAutomatically(result.outcome)) {
    await setState(app.id, "id_verified");
    await logOnboardingEvent(app.id, "system", null, "identity_verified", { provider: result.provider });
  }

  // The applicant is told the same thing either way: it is with us now. Telling
  // someone a machine rejected their licence, when a human is about to look at
  // it anyway, creates a support call and no useful action.
  return NextResponse.json({
    ok: true,
    cleared: clearsAutomatically(result.outcome),
  });
}
