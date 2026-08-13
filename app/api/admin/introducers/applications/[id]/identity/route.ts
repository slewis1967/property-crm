import { NextResponse } from "next/server";
import { requireStaff, requireSuperAdmin, readJson } from "../../../_shared";
import { supabase } from "../../../../../../../utils/supabase";
import {
  findById,
  setState,
  logOnboardingEvent,
} from "../../../../../../../utils/introducer-onboarding-db";
import { onboardingTablesMissing } from "../../../../../../../utils/introducer-onboarding";

/**
 * Staff review of an applicant's identity documents.
 *
 *   GET   short-lived signed URLs for the two images, plus what the automated
 *         check said. Any staff member can look.
 *   PATCH record a human decision. Super admin only — clearing someone's
 *         identity is what lets them onto the course, and from there onto the
 *         register.
 *
 * Viewing is logged. These are licence images: who looked, and when, is part of
 * the record for exactly the same reason the images themselves are.
 */
export const dynamic = "force-dynamic";

const BUCKET = "introducer-identity";
const VIEW_TTL_SECONDS = 300;

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireStaff(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;

  let app;
  try {
    app = await findById(id);
  } catch (err) {
    if (onboardingTablesMissing(err)) {
      return NextResponse.json({ ok: false, error: "Accreditation is not switched on yet." }, { status: 503 });
    }
    throw err;
  }
  if (!app) return NextResponse.json({ ok: false, error: "No such application." }, { status: 404 });

  const { data: docs } = await supabase
    .from("introducer_identity_documents")
    .select("id,side,storage_path,mime_type,uploaded_at")
    .eq("application_id", id)
    .is("purged_at", null);

  const images = await Promise.all(
    (docs ?? []).map(async (d) => {
      const { data } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(d.storage_path, VIEW_TTL_SECONDS);
      return { side: d.side, uploaded_at: d.uploaded_at, url: data?.signedUrl ?? null };
    }),
  );

  if (images.length) {
    await logOnboardingEvent(id, "staff", auth, "identity_documents_viewed", {
      sides: images.map((i) => i.side),
    });
  }

  return NextResponse.json({
    ok: true,
    legal_name: app.legal_name,
    state: app.state,
    check: {
      provider: app.id_check_provider,
      result: app.id_check_result,
      checked_at: app.id_checked_at,
    },
    images,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const decision = body.decision === "pass" ? "manual_pass" : body.decision === "fail" ? "manual_fail" : null;
  const note = typeof body.note === "string" ? body.note.trim() : "";

  if (!decision) {
    return NextResponse.json({ ok: false, error: "Decision must be pass or fail." }, { status: 400 });
  }
  // A refusal has consequences for a real person, so it has to carry a reason.
  if (decision === "manual_fail" && !note) {
    return NextResponse.json(
      { ok: false, error: "Record why you could not verify them — it is the only account of this decision." },
      { status: 400 },
    );
  }

  const app = await findById(id);
  if (!app) return NextResponse.json({ ok: false, error: "No such application." }, { status: 404 });

  if (app.state !== "id_uploaded") {
    return NextResponse.json(
      { ok: false, error: `This application is ${app.state.replace(/_/g, " ")} — there is nothing waiting on an identity decision.` },
      { status: 409 },
    );
  }

  await supabase
    .from("introducer_applications")
    .update({
      id_check_result: decision,
      id_checked_at: new Date().toISOString(),
      id_checked_by: auth,
    })
    .eq("id", id);

  await logOnboardingEvent(id, "super_admin", auth, "identity_decision_recorded", {
    decision,
    note: note || null,
  });

  if (decision === "manual_pass") {
    await setState(id, "id_verified");
    await logOnboardingEvent(id, "super_admin", auth, "identity_verified", { by: "staff review" });
  } else {
    // A failed identity check stops the application rather than leaving it
    // sitting in a queue nobody revisits. Re-inviting is a deliberate act.
    await setState(id, "withdrawn", {
      withdrawn_at: new Date().toISOString(),
      withdrawn_reason: `Identity could not be verified: ${note}`,
    });
  }

  return NextResponse.json({ ok: true, state: decision === "manual_pass" ? "id_verified" : "withdrawn" });
}
