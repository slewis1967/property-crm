import { NextResponse } from "next/server";
import { requireSuperAdmin } from "../../../_shared";
import {
  findById,
  setState,
  allocateAccreditationNumber,
  logOnboardingEvent,
  mintLinkToken,
} from "../../../../../../../utils/introducer-onboarding-db";
import {
  onboardingTablesMissing,
  accreditationExpiries,
} from "../../../../../../../utils/introducer-onboarding";
import { businessDayKey, BUSINESS_TIME_ZONE } from "../../../../../../../utils/datetime";
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

  /* The certificate's issue date drives both expiries, so a REISSUE derives
   * from the first issue and never from today. A replacement certificate for a
   * misspelt name would otherwise hand its holder another twelve months, which
   * is the difference between correcting a document and re-accrediting someone.
   *
   * The business calendar day, not a UTC one: a certificate issued at 9am
   * Brisbane is issued on the 14th, and read as UTC it was issued at 11pm on
   * the 13th — both expiries a day early, every time. */
  const issuedAt = (reissue && app.certificate_issued_at) || new Date().toISOString();
  const issuedDay = businessDayKey(issuedAt) ?? businessDayKey(new Date().toISOString())!;
  const expiries = accreditationExpiries(issuedDay);

  // Render and file the certificate before moving the state, so an application
  // is never marked certificated with nothing behind it.
  const issuedOn = new Date(issuedAt).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: BUSINESS_TIME_ZONE,
  });
  const asPrinted = (day: string) =>
    new Date(`${day}T00:00:00Z`).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });

  let certificatePath: string | null = app.certificate_path;
  let pdfGenerated = false;
  // Held so the email below can carry it. The certificate is the one document
  // in this flow the holder actually wants a copy of, and asking them to come
  // back through a link to collect it is how someone ends up with none.
  let certificateBase64: string | null = null;
  try {
    const html = await renderCertificateHtml({
      legalName: app.legal_name,
      firmName: app.firm_name,
      accreditationNo,
      tier: app.tier,
      issuedOn,
      reissued: reissue,
      accreditationExpiresOn: asPrinted(expiries.accreditationExpiresAt),
      smsfCompetencyExpiresOn: asPrinted(expiries.smsfCompetencyExpiresAt),
    });
    const pdf = await htmlToPdf(html, { landscape: true, printBackground: true });
    const key = `${id}/certificate-${accreditationNo}${reissue ? `-r${Date.now()}` : ""}.pdf`;

    const { error: upErr } = await supabase.storage
      .from(CERT_BUCKET)
      .upload(key, Buffer.from(pdf), { contentType: "application/pdf", upsert: true });

    if (upErr) throw new Error(upErr.message);
    certificatePath = key;
    certificateBase64 = Buffer.from(pdf).toString("base64");
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
      certificate_issued_at: issuedAt,
      accreditation_expires_at: expiries.accreditationExpiresAt,
      smsf_competency_expires_at: expiries.smsfCompetencyExpiresAt,
    });
  } else if (certificatePath) {
    await supabase
      .from("introducer_applications")
      .update({ certificate_path: certificatePath })
      .eq("id", id);
  }

  await logOnboardingEvent(id, "super_admin", auth, reissue ? "certificate_reissued" : "certificate_issued", {
    accreditation_no: accreditationNo,
    accreditation_expires_at: expiries.accreditationExpiresAt,
    smsf_competency_expires_at: expiries.smsfCompetencyExpiresAt,
  });

  let emailed = true;
  try {
    const fresh = await mintLinkToken(id, "certificate");
    await sendAccreditationPassedEmail({
      to: app.email,
      legalName: app.legal_name,
      accreditationNo,
      rawToken: fresh,
      origin: new URL(req.url).origin,
      // Only when this run actually produced one. A render that failed above is
      // already logged; the email still goes, minus a promise it cannot keep.
      certificate: certificateBase64
        ? {
            filename: `Springboard-Accreditation-${accreditationNo}.pdf`,
            base64: certificateBase64,
          }
        : undefined,
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
    accreditation_expires_at: expiries.accreditationExpiresAt,
    smsf_competency_expires_at: expiries.smsfCompetencyExpiresAt,
    emailed,
    pdf_generated: pdfGenerated,
  });
}
