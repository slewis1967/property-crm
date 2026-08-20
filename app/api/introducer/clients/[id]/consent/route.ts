/**
 * GET  /api/introducer/clients/<id>/consent  — where the consent form has got to
 * POST /api/introducer/clients/<id>/consent  — issue it for signature
 *     Body: { deliver: "in_person" | "email" }
 *
 * PUBLIC (session-scoped). The client's Referral Consent and Privacy Form, as a
 * document THEY sign rather than a scan the introducer uploads.
 *
 * WHY THIS EXISTS. migrations/20260811 calls the client's consent "the lawful
 * basis for us holding the record at all". The evidence behind that used to be a
 * photographed page that cannot say who signed it, when, or from where. An
 * e-signature can: the engine captures the mark, the signer's email, a timestamp
 * and the IP/user-agent, and refuses a document not signed by everyone asked.
 *
 * IN PERSON IS THE DEFAULT, AND THAT IS A PRIVACY DECISION, NOT A CONVENIENCE.
 * Emailing the form means holding the client's name and address in order to ask
 * for permission to hold them. The introducer is normally sitting with the
 * client, so the default opens the signing page on the introducer's own device
 * and nothing is sent. Email is the phone-referral fallback, and the choice is
 * recorded on the document.
 *
 * REISSUING. An unsigned draft can be replaced — it is evidence of nothing. A
 * SIGNED one cannot, by a database trigger, because it is the record of what
 * this person actually agreed to.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../../utils/supabase";
import {
  requireIntroducer,
  loadOwnClient,
  logIntroducerEvent,
  readJson,
} from "../../../_shared";
import {
  buildConsentDoc,
  consentDocSummary,
  consentReadyToSend,
  hydrateConsentDoc,
} from "../../../../../../utils/introducer-consent";
import { createSignatureRequests } from "../../../../../../utils/signature-requests-create";
import { publicOrigin } from "../../../../../../utils/document-requests-db";
import { allSigned, type SignerLike } from "../../../../../../utils/signatures";

export const dynamic = "force-dynamic";

/** The consent document for a referral, with its signature state. */
async function loadConsent(clientId: string) {
  const { data: doc } = await supabase
    .from("introducer_consent_docs")
    .select("id,status,data,delivery,created_at")
    .eq("client_id", clientId)
    .maybeSingle();
  if (!doc) return null;

  const { data: sigs } = await supabase
    .from("signature_requests")
    .select("signer_index,signer_name,signer_email,status,signed_at")
    .eq("doc_type", "referral_consent")
    .eq("doc_id", (doc as { id: string }).id)
    .order("signer_index", { ascending: true });

  const rows = (sigs ?? []) as SignerLike[];
  return {
    id: (doc as { id: string }).id,
    status: (doc as { status: string }).status,
    delivery: (doc as { delivery: string | null }).delivery,
    created_at: (doc as { created_at: string }).created_at,
    /* Counted and named, not the full signature record — the introducer needs
     * to know who still has to sign so they can chase them, and nothing else.
     * The captured mark, IP and user-agent stay server-side. */
    signers: rows.map((r) => ({
      name: (r as unknown as { signer_name: string | null }).signer_name ?? "",
      status: r.status,
    })),
    all_signed: rows.length > 0 && allSigned(rows),
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireIntroducer();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const record = await loadOwnClient(auth, id);
  if (!record) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  return NextResponse.json({ ok: true, consent: await loadConsent(record.id) });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireIntroducer();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;

  const record = await loadOwnClient(auth, id);
  if (!record) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  // A submitted referral is done being consented to. Reissuing here would mean
  // collecting a consent AFTER the details were already passed on, which is not
  // what the form says it is.
  if (record.status !== "draft") {
    return NextResponse.json(
      { ok: false, error: "This referral has already been submitted." },
      { status: 409 },
    );
  }

  const deliver = body.deliver === "email" ? "email" : "in_person";
  const now = new Date().toISOString();
  const doc = buildConsentDoc(record, { firmName: auth.firmName, issuedAt: now });

  const ready = consentReadyToSend(doc);
  if (!ready.ok) {
    return NextResponse.json({ ok: false, error: ready.reason }, { status: 400 });
  }

  /* Replace any unsigned draft. A signed one is protected by the database
   * trigger, so this delete simply matches nothing and the insert below then
   * violates the unique index — which is the correct outcome: you cannot quietly
   * reissue a consent someone has already given. */
  const existing = await loadConsent(record.id);
  if (existing?.status === "Signed") {
    return NextResponse.json(
      {
        ok: false,
        error: "Your client has already signed this consent form. It can't be reissued.",
        code: "already_signed",
      },
      { status: 409 },
    );
  }
  if (existing) {
    await supabase.from("signature_requests").delete().eq("doc_type", "referral_consent").eq("doc_id", existing.id);
    await supabase.from("introducer_consent_docs").delete().eq("id", existing.id);
  }

  const { data: created, error } = await supabase
    .from("introducer_consent_docs")
    .insert({
      client_id: record.id,
      status: "Sent",
      data: doc,
      delivery: deliver,
      created_by: auth.email,
    })
    .select("id")
    .single();

  if (error || !created) {
    const missing = error?.code === "42P01" || error?.code === "PGRST205";
    console.error("[introducer] consent doc insert failed", { client_id: record.id, error: error?.message });
    return NextResponse.json(
      {
        ok: false,
        error: missing
          ? "Consent forms aren't set up yet — run migrations/20260821_referral_consent_esignature.sql."
          : "Could not prepare the consent form. Please try again.",
      },
      { status: missing ? 503 : 500 },
    );
  }

  const result = await createSignatureRequests({
    docType: "referral_consent",
    docId: created.id,
    docLabel: "Referral Consent and Privacy Form",
    signers: doc.signers,
    origin: publicOrigin(req),
    deliver: deliver === "in_person" ? "link" : "email",
    message:
      "This confirms you're happy for your details to be passed to Springboard Homes so they can " +
      "look at whether the Community Funding Program suits you.",
    createdBy: auth.email,
  });

  if (!result.ok) {
    // The document exists but nobody can sign it. Remove it rather than leaving
    // a "Sent" row that was never sent — a stuck consent blocks the submit and
    // reads as though the client is being slow.
    await supabase.from("introducer_consent_docs").delete().eq("id", created.id);
    return NextResponse.json({ ok: false, error: result.error }, { status: result.status });
  }

  await logIntroducerEvent({
    clientId: record.id,
    introducerId: auth.introducerId,
    actorType: "introducer",
    actor: auth.email,
    action: "consent_form_issued",
    detail: { delivery: deliver, signers: doc.signers.length, summary: consentDocSummary(doc) },
  });

  return NextResponse.json({
    ok: true,
    consent: await loadConsent(record.id),
    /* Only for the in-person path, and only to the introducer who owns this
     * referral. Each URL carries a one-time token — it is the credential, so it
     * is never stored, never logged, and shown once. */
    links: result.links,
  });
}

/** The consent form as it will be signed, for a preview before issuing. */
export async function PUT(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireIntroducer();
  if (auth instanceof NextResponse) return auth;

  const { id } = await params;
  const record = await loadOwnClient(auth, id);
  if (!record) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

  const doc = hydrateConsentDoc(
    buildConsentDoc(record, { firmName: auth.firmName, issuedAt: new Date().toISOString() }),
  );
  return NextResponse.json({ ok: true, doc });
}
