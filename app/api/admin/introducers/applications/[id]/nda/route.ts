import { NextResponse } from "next/server";
import { requireSuperAdmin, readJson } from "../../../_shared";
import {
  findById,
  setState,
  logOnboardingEvent,
  reissueToken,
} from "../../../../../../../utils/introducer-onboarding-db";
import { onboardingTablesMissing } from "../../../../../../../utils/introducer-onboarding";
import { sendOnboardingStepEmail } from "../../../../../../../utils/introducer-onboarding-email";

/**
 * Record the confidentiality agreement as signed.
 *
 * INTERIM, AND HONEST ABOUT IT. The NDA is meant to be executed through the
 * e-signature engine — the schema already admits `introducer_nda` as a document
 * type. Until that document is wired, NDAs get signed the way they are signed
 * everywhere else: by email, or on paper. This records that it happened, who
 * says so, and how, rather than leaving the pipeline with an unreachable first
 * step and a staff workaround nobody wrote down.
 *
 * `method` is required for that reason. When e-signing lands it becomes another
 * value here, and this route stops being the usual path without needing to be
 * deleted.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const method = typeof body.method === "string" ? body.method.trim() : "";
  if (!method) {
    return NextResponse.json(
      { ok: false, error: "Record how it was signed — emailed back, signed on paper, or e-signed." },
      { status: 400 },
    );
  }

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

  if (app.state !== "invited") {
    return NextResponse.json(
      { ok: false, error: `This application is already ${app.state.replace(/_/g, " ")}.` },
      { status: 409 },
    );
  }

  await setState(id, "nda_signed");
  await logOnboardingEvent(id, "super_admin", auth, "nda_recorded", { method });

  // Rotate and tell them the next step is open, so nobody has to remember to go
  // back and check the page.
  let emailed = true;
  try {
    const fresh = await reissueToken(id);
    await sendOnboardingStepEmail({
      to: app.email,
      legalName: app.legal_name,
      rawToken: fresh,
      origin: new URL(req.url).origin,
      heading: "Next step: verify your identity",
      body:
        "Thanks — we have your confidentiality agreement. The next step is a photo of your driver " +
        "licence, front and back, which we use to confirm you are who you say you are before you sit " +
        "the accreditation.",
      cta: "Upload your licence",
    });
  } catch {
    emailed = false;
  }

  return NextResponse.json({ ok: true, state: "nda_signed", emailed });
}
