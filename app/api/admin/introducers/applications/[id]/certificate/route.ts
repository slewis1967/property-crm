import { NextResponse } from "next/server";
import { requireSuperAdmin } from "../../../_shared";
import {
  findById,
  setState,
  allocateAccreditationNumber,
  logOnboardingEvent,
  reissueToken,
} from "../../../../../../../utils/introducer-onboarding-db";
import { onboardingTablesMissing } from "../../../../../../../utils/introducer-onboarding";
import { sendAccreditationPassedEmail } from "../../../../../../../utils/introducer-onboarding-email";
import { renderCertificateHtml } from "../../../../../../../utils/pdf/introducerCertificatePdf";
import { htmlToPdf } from "../../../../../../../utils/pdf/render";
import { supabase } from "../../../../../../../utils/supabase";

const CERT_BUCKET = "introducer-records";

/**
 * Issue the certificate.
 *
 * Normally automatic: the exam webhook allocates the number and moves the
 * application straight to `exam_passed`. This route exists for the cases that
 * are not normal — a webhook that never arrived, an email that bounced, a
 * certificate that needs reissuing after a name correction.
 *
 * Allocation is idempotent in SQL, so a reissue never mints a second number.
 * That matters: the number appears on the agreement, in the register and on the
 * certificate itself, and a person having two of them would be worse than
 * having none.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(req);
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

  if (app.state !== "exam_passed" && app.state !== "certificate_issued") {
    return NextResponse.json(
      {
        ok: false,
        error:
          app.state === "course_started" || app.state === "id_verified"
            ? "They have not passed the exam yet."
            : `This application is ${app.state.replace(/_/g, " ")} — there is no certificate to issue.`,
      },
      { status: 409 },
    );
  }

  const accreditationNo = await allocateAccreditationNumber(id);
  const reissue = app.state === "certificate_issued";

  // Render and file the certificate before moving the state, so an application
  // is never marked certificated with nothing behind it.
  const issuedOn = new Date().toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  let certificatePath: string | null = app.certificate_path;
  let pdfGenerated = false;
  try {
    const html = await renderCertificateHtml({
      legalName: app.legal_name,
      firmName: app.firm_name,
      accreditationNo,
      tier: app.tier,
      issuedOn,
      reissued: reissue,
    });
    const pdf = await htmlToPdf(html, { landscape: true, printBackground: true });
    const key = `${id}/certificate-${accreditationNo}${reissue ? `-r${Date.now()}` : ""}.pdf`;

    const { error: upErr } = await supabase.storage
      .from(CERT_BUCKET)
      .upload(key, Buffer.from(pdf), { contentType: "application/pdf", upsert: true });

    if (upErr) throw new Error(upErr.message);
    certificatePath = key;
    pdfGenerated = true;
  } catch (err) {
    // A certificate that fails to render must not block accreditation — the
    // number is allocated and the person has passed. It is logged loudly and
    // can be reissued, which is exactly what this route is for.
    await logOnboardingEvent(id, "system", null, "certificate_render_failed", {
      error: (err as { message?: string })?.message ?? "render failed",
    });
  }

  if (!reissue) {
    await setState(id, "certificate_issued", {
      certificate_path: certificatePath,
      certificate_issued_at: new Date().toISOString(),
    });
  } else if (certificatePath) {
    await supabase
      .from("introducer_applications")
      .update({ certificate_path: certificatePath })
      .eq("id", id);
  }

  await logOnboardingEvent(id, "super_admin", auth, reissue ? "certificate_reissued" : "certificate_issued", {
    accreditation_no: accreditationNo,
  });

  let emailed = true;
  try {
    const fresh = await reissueToken(id);
    await sendAccreditationPassedEmail({
      to: app.email,
      legalName: app.legal_name,
      accreditationNo,
      rawToken: fresh,
      origin: new URL(req.url).origin,
    });
  } catch (err) {
    emailed = false;
    await logOnboardingEvent(id, "system", null, "certificate_email_failed", {
      error: (err as { message?: string })?.message ?? "send failed",
    });
  }

  return NextResponse.json({
    ok: true,
    accreditation_no: accreditationNo,
    reissued: reissue,
    emailed,
    pdf_generated: pdfGenerated,
  });
}
