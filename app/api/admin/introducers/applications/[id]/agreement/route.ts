import { NextResponse } from "next/server";
import { requireSuperAdmin, readJson } from "../../../_shared";
import {
  findById,
  setState,
  logOnboardingEvent,
  reissueToken,
} from "../../../../../../../utils/introducer-onboarding-db";
import { canSignAgreement, onboardingTablesMissing } from "../../../../../../../utils/introducer-onboarding";
import { sendOnboardingStepEmail } from "../../../../../../../utils/introducer-onboarding-email";

/**
 * The introducer agreement and commission schedule.
 *
 *   POST { action: "send" }     mark them as out for signature
 *   POST { action: "signed", method }  record execution
 *
 * INTERIM, on the same terms as the NDA route. These belong in the e-signature
 * engine — the schema already admits `introducer_agreement` and
 * `introducer_schedule` as document types, which is the hard half. What is
 * missing is the per-document plumbing in utils/sign-doc-render.ts: a table, a
 * hydrator and a renderer, mapped through ComplianceDocType the way `eoi` is.
 *
 * Until that exists, agreements get executed the way they are today and this
 * records who says so and how. `method` is mandatory so the file always answers
 * "how was this signed", and when e-signing lands it becomes one more value
 * rather than a route to delete.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSuperAdmin(req);
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const action = body.action === "signed" ? "signed" : body.action === "send" ? "send" : null;
  if (!action) {
    return NextResponse.json({ ok: false, error: "Action must be send or signed." }, { status: 400 });
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

  if (action === "send") {
    await setState(id, "agreement_sent");
    await logOnboardingEvent(id, "super_admin", auth, "agreement_sent", {});

    let emailed = true;
    try {
      const fresh = await reissueToken(id);
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
