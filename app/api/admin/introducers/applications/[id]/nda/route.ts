import { NextResponse } from "next/server";
import { requireSuperAdmin, readJson } from "../../../_shared";
import {
  findById,
  setState,
  logOnboardingEvent,
  reissueToken,
} from "../../../../../../../utils/introducer-onboarding-db";
import { onboardingTablesMissing } from "../../../../../../../utils/introducer-onboarding";
import {
  sendOnboardingStepEmail,
  sendNdaSigningEmail,
} from "../../../../../../../utils/introducer-onboarding-email";
import { openNdaSigning } from "../../../../../../../utils/introducer-nda";

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

  // Two ways through this route, and e-signing is now the normal one.
  //
  //   { action: "esign" } — email them a link and let them sign on screen.
  //   { method: "..." }   — record a signature that happened elsewhere, on
  //                         paper or by email. Still needed: not everyone will
  //                         sign on screen, and a signature that happened is
  //                         worth recording however it happened.
  const esign = body.action === "esign";
  const method = typeof body.method === "string" ? body.method.trim() : "";
  if (!esign && !method) {
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

  // E-SIGN: issue the document, mint a link, email it. The application stays at
  // `invited` until they actually sign — advancing it here would mark an
  // agreement as executed on the strength of an email having been sent.
  if (esign) {
    let opened;
    try {
      opened = await openNdaSigning(app, new Date());
    } catch (err) {
      if (onboardingTablesMissing(err)) {
        return NextResponse.json({ ok: false, error: "Accreditation is not switched on yet." }, { status: 503 });
      }
      throw err;
    }
    if (!opened.ok) {
      return NextResponse.json({ ok: false, error: opened.error }, { status: 409 });
    }

    const sent = await sendNdaSigningEmail({
      to: app.email,
      legalName: app.legal_name,
      rawToken: opened.raw,
      origin: new URL(req.url).origin,
    });
    if (!sent.ok) {
      // The email IS the action. Reporting success when nothing left the
      // building would leave staff waiting on a signature that was never asked
      // for. The document and link survive, so retrying just re-sends.
      return NextResponse.json(
        { ok: false, error: `Could not send it: ${sent.error}` },
        { status: 502 },
      );
    }

    await logOnboardingEvent(id, "super_admin", auth, "nda_sent_for_signature", {
      doc_id: opened.docId,
      issued: opened.issued,
    });
    return NextResponse.json({ ok: true, state: app.state, emailed: true, esign: true });
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
