import { NextResponse } from "next/server";
import { requireSuperAdmin, readJson } from "../../../_shared";
import {
  findById,
  setState,
  logOnboardingEvent,
  mintLinkToken,
  setReferralFee,
  setRecruiterEntitlement,
} from "../../../../../../../utils/introducer-onboarding-db";
import { canSignAgreement, onboardingTablesMissing } from "../../../../../../../utils/introducer-onboarding";
import {
  sendOnboardingStepEmail,
  sendAgreementSigningEmail,
} from "../../../../../../../utils/introducer-onboarding-email";
import { openAgreementSigning } from "../../../../../../../utils/introducer-agreement-signing";

/**
 * The introducer agreement and commission schedule.
 *
 *   POST { action: "send" }     mark them as out for signature
 *   POST { action: "signed", method }  record execution
 *
 * THREE WAYS THROUGH, and e-signing is now the normal one.
 *
 *   { action: "esign" }              issue the next document and email it for
 *                                    on-screen signature. Optionally carries
 *                                    the referral fee, which a PAID schedule
 *                                    cannot issue without.
 *   { action: "send" }               the old notice-only path: mark them as out
 *                                    for signature and email a link to the
 *                                    roadmap, where they can start signing
 *                                    themselves.
 *   { action: "signed", method }     record an execution that happened
 *                                    elsewhere, on paper or by email.
 *
 * The third is kept, not deprecated: not everyone signs on screen, and a
 * signature that happened is worth recording however it happened. `method` stays
 * mandatory so the audit file always answers "how was this signed".
 *
 * TWO DOCUMENTS. The referral agreement and the commission schedule are separate
 * instruments, offered one at a time — see utils/introducer-agreement-signing.ts
 * for why, and for the rule that the application advances only when both are in.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const action =
    body.action === "signed" ? "signed"
    : body.action === "send" ? "send"
    : body.action === "esign" ? "esign"
    : null;
  if (!action) {
    return NextResponse.json(
      { ok: false, error: "Action must be esign, send or signed." },
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

  if (!canSignAgreement(app.state)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          app.state === "exam_passed"
            ? "Issue their certificate first — the agreement cites the accreditation number."
            : `This application is ${app.state.replace(/_/g, " ")}, so there is no agreement step outstanding.`,
      },
      { status: 409 },
    );
  }

  // E-SIGN: issue the next document, email it, and leave the application where
  // it is. It advances when they actually sign — marking an agreement executed
  // on the strength of an email having left the building would be a lie in the
  // audit file. State moves to `agreement_sent` only so the roadmap stops
  // saying "we are issuing your certificate".
  if (action === "esign") {
    // The fee first, if one was given: the schedule snapshots it at issue, so
    // setting it afterwards would leave the signed document disagreeing with
    // the record behind it.
    if (typeof body.recruits_introducers === "boolean") {
      const granted = await setRecruiterEntitlement(id, body.recruits_introducers);
      if (!granted.ok) return NextResponse.json({ ok: false, error: granted.error }, { status: 409 });
      app = (await findById(id)) ?? app;
    }
    if (typeof body.fee_per_settlement === "string") {
      const saved = await setReferralFee(
        id,
        body.fee_per_settlement,
        typeof body.fee_notes === "string" ? body.fee_notes : "",
      );
      if (!saved.ok) return NextResponse.json({ ok: false, error: saved.error }, { status: 409 });
      app = (await findById(id)) ?? app;
    }

    let opened;
    try {
      opened = await openAgreementSigning(app, new Date());
    } catch (err) {
      if (onboardingTablesMissing(err)) {
        return NextResponse.json({ ok: false, error: "Accreditation is not switched on yet." }, { status: 503 });
      }
      throw err;
    }
    if (!opened.ok) {
      // `complete` is not a failure of this request — both documents are in and
      // the application should already have moved. Say so plainly.
      return NextResponse.json(
        { ok: false, error: opened.error, complete: opened.reason === "complete" },
        { status: 409 },
      );
    }

    const sent = await sendAgreementSigningEmail({
      to: app.email,
      legalName: app.legal_name,
      label: opened.label,
      rawToken: opened.raw,
      origin: new URL(req.url).origin,
      accreditationNo: app.accreditation_no,
      remaining: opened.remaining,
    });
    if (!sent.ok) {
      // The email IS the action. Reporting success when nothing left the
      // building would leave staff waiting on a signature that was never asked
      // for. The document and link survive, so retrying just re-sends.
      return NextResponse.json({ ok: false, error: `Could not send it: ${sent.error}` }, { status: 502 });
    }

    if (app.state !== "agreement_sent") await setState(id, "agreement_sent");
    await logOnboardingEvent(id, "super_admin", auth, "agreement_sent_for_signature", {
      doc_id: opened.docId,
      doc_type: opened.docType,
      issued: opened.issued,
      remaining: opened.remaining,
    });

    return NextResponse.json({
      ok: true,
      state: "agreement_sent",
      emailed: true,
      esign: true,
      doc_type: opened.docType,
      remaining: opened.remaining,
    });
  }

  if (action === "send") {
    await setState(id, "agreement_sent");
    await logOnboardingEvent(id, "super_admin", auth, "agreement_sent", {});

    let emailed = true;
    try {
      const fresh = await mintLinkToken(id, "agreement");
      await sendOnboardingStepEmail({
        to: app.email,
        legalName: app.legal_name,
        rawToken: fresh,
        origin: new URL(req.url).origin,
        heading: "Last step: your introducer agreement",
        body:
          `Congratulations again on passing. The final step is signing the introducer agreement and ` +
          `commission schedule, which cite your accreditation number ` +
          `<strong>${app.accreditation_no ?? ""}</strong>. Your portal access opens as soon as they are ` +
          `executed.`,
        cta: "See where you are",
      });
    } catch {
      emailed = false;
    }

    return NextResponse.json({ ok: true, state: "agreement_sent", emailed });
  }

  const method = typeof body.method === "string" ? body.method.trim() : "";
  if (!method) {
    return NextResponse.json(
      { ok: false, error: "Record how it was executed — e-signed, emailed back, or signed on paper." },
      { status: 400 },
    );
  }

  await setState(id, "agreement_signed");
  await logOnboardingEvent(id, "super_admin", auth, "agreement_signed", { method });

  return NextResponse.json({
    ok: true,
    state: "agreement_signed",
    // Activation is a separate, deliberate action rather than an automatic
    // consequence: creating a login is the moment a third party gets inside
    // something of ours, and that should be somebody pressing a button.
    next: "activate",
  });
}
