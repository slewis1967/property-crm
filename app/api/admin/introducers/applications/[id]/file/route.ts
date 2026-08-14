import { NextResponse } from "next/server";
import { requireStaff } from "../../../_shared";
import { supabase } from "../../../../../../../utils/supabase";
import { findById, logOnboardingEvent } from "../../../../../../../utils/introducer-onboarding-db";
import { onboardingTablesMissing } from "../../../../../../../utils/introducer-onboarding";
import { INTRODUCER_DOC_LABEL, type IntroducerDocType } from "../../../../../../../utils/introducer-agreement";

/**
 * The audit file for one introducer.
 *
 * Everything held against them, in one response: identity documents, the exam
 * attempts, the certificate, the signed agreements, and the full event trail.
 * This is the panel that answers "show us what you have on this person" without
 * anyone assembling it by hand from four tables under time pressure.
 *
 * WHY IT IS ASSEMBLED, NOT STORED. There is no separate vault table duplicating
 * these rows. A copy would drift from the originals, and the moment it did the
 * copy is what someone would rely on. This reads the actual records every time.
 *
 * Staff-readable. Document URLs are minted on demand and expire; nothing here
 * hands out a durable link. Producing the file is itself logged, because "who
 * pulled this person's identity documents" is part of the record.
 */
export const dynamic = "force-dynamic";

const VIEW_TTL = 300;

async function signed(bucket: string, path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, VIEW_TTL);
  return data?.signedUrl ?? null;
}

type ResourceAudit = {
  title: string;
  version: string;
  requires_ack: boolean;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  /** An acknowledgement against a version that is no longer the published one.
   *  Kept rather than hidden: "they read 2.0, we are now on 2.1" is a different
   *  fact from "they have never read it", and only one of them is negligence. */
  acknowledged_version: string | null;
};

/**
 * The published shelf, annotated with what this introducer has confirmed.
 *
 * Driven from the RESOURCE list, not from the acknowledgement list. Listing only
 * what they confirmed would make a document they have never opened invisible —
 * which is exactly the row an auditor is looking for.
 */
async function resourceAcknowledgements(introducerId: string | null): Promise<ResourceAudit[]> {
  const { data: shelf } = await supabase
    .from("introducer_resources")
    .select("id,title,version,requires_ack")
    .eq("published", true)
    .order("sort_order", { ascending: true });
  if (!shelf?.length) return [];

  const { data: acks } = introducerId
    ? await supabase
        .from("introducer_resource_acks")
        .select("resource_id,version,acknowledged_at,acknowledged_by")
        .eq("introducer_id", introducerId)
    : { data: [] };

  return shelf.map((r) => {
    const mine = (acks ?? []).filter((a) => a.resource_id === r.id);
    const current = mine.find(
      (a) => String(a.version).trim().toLowerCase() === String(r.version).trim().toLowerCase(),
    );
    // Fall back to the most recent acknowledgement of ANY version, so a stale
    // confirmation is reported as stale rather than as absent.
    const latest = current ?? [...mine].sort((a, b) =>
      String(b.acknowledged_at).localeCompare(String(a.acknowledged_at)),
    )[0];
    return {
      title: r.title as string,
      version: r.version as string,
      requires_ack: Boolean(r.requires_ack),
      acknowledged_at: latest?.acknowledged_at ?? null,
      acknowledged_by: latest?.acknowledged_by ?? null,
      acknowledged_version: latest?.version ?? null,
    };
  });
}

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

  const [identity, docs, events, sigs] = await Promise.all([
    supabase
      .from("introducer_identity_documents")
      .select("side,original_name,uploaded_at,purged_at,storage_path")
      .eq("application_id", id)
      .order("uploaded_at", { ascending: true }),
    supabase
      .from("introducer_agreement_docs")
      .select("id,doc_type,status,created_at,updated_at")
      .eq("application_id", id),
    supabase
      .from("introducer_events")
      .select("action,actor_type,actor,detail,created_at")
      .contains("detail", { application_id: id })
      .order("created_at", { ascending: true }),
    // Signed PDFs live with the signature request, not the document.
    supabase
      .from("signature_requests")
      .select("doc_type,doc_id,signer_name,status,signed_at,signed_pdf_path")
      .in("doc_type", ["introducer_nda", "introducer_agreement", "introducer_schedule"]),
  ]);

  const docIds = new Set((docs.data ?? []).map((d) => d.id as string));
  const relevantSigs = (sigs.data ?? []).filter((s) => docIds.has(s.doc_id as string));

  // Which manuals this introducer has confirmed reading, and -- the part an
  // audit actually asks about -- which ones they have NOT confirmed at the
  // version currently published. A list of confirmations alone reads as
  // reassurance; the gap is the finding.
  //
  // Keyed off introducer_id, which only exists once the application is
  // activated. Before that there is no portal login, so there is nothing to
  // acknowledge and an empty section is the honest answer.
  const resources = await resourceAcknowledgements(app.introducer_id ?? null);

  // Identity images: a purged row is reported as having existed and been
  // destroyed, rather than silently vanishing. That distinction is the whole
  // point of keeping the row.
  const identityFiles = await Promise.all(
    (identity.data ?? []).map(async (d) => ({
      side: d.side,
      original_name: d.original_name,
      uploaded_at: d.uploaded_at,
      purged_at: d.purged_at,
      url: d.purged_at ? null : await signed("introducer-identity", d.storage_path as string),
    })),
  );

  const agreements = await Promise.all(
    (docs.data ?? []).map(async (d) => {
      const sig = relevantSigs.find((s) => s.doc_id === d.id);
      return {
        doc_type: d.doc_type,
        label: INTRODUCER_DOC_LABEL[d.doc_type as IntroducerDocType] ?? d.doc_type,
        status: d.status,
        signed_at: sig?.signed_at ?? null,
        signer_name: sig?.signer_name ?? null,
        url: await signed("signed-documents", (sig?.signed_pdf_path as string) ?? null),
      };
    }),
  );

  const attempts = (events.data ?? [])
    .filter((e) => e.action === "exam_attempt")
    .map((e) => {
      const d = (e.detail ?? {}) as Record<string, unknown>;
      return {
        at: e.created_at,
        paper_id: d.paper_id,
        score: d.score,
        total: d.total,
        passed: d.passed,
        missed_modules: d.missed_modules,
        red_line_modules: d.red_line_modules,
      };
    });

  await logOnboardingEvent(id, "staff", auth, "audit_file_produced", {
    identity_files: identityFiles.filter((f) => !f.purged_at).length,
    agreements: agreements.length,
    attempts: attempts.length,
    resources_outstanding: resources.filter(
      (r) => r.requires_ack && r.acknowledged_version !== r.version,
    ).length,
  });

  return NextResponse.json({
    ok: true,
    application: {
      id: app.id,
      legal_name: app.legal_name,
      firm_name: app.firm_name,
      email: app.email,
      abn: app.abn,
      tier: app.tier,
      state: app.state,
      accreditation_no: app.accreditation_no,
      created_at: app.created_at,
      activated_at: (app as unknown as { activated_at?: string }).activated_at ?? null,
      introducer_id: app.introducer_id,
    },
    identity: {
      provider: app.id_check_provider,
      result: app.id_check_result,
      checked_at: app.id_checked_at,
      checked_by: app.id_checked_by,
      files: identityFiles,
    },
    exam: {
      attempts,
      passed_at: app.exam_passed_at,
      score: app.exam_score,
      total: app.exam_total,
    },
    certificate: {
      accreditation_no: app.accreditation_no,
      url: await signed("introducer-records", app.certificate_path),
    },
    agreements,
    resources,
    // The complete trail, not a summary. An audit asks what happened, in order.
    events: (events.data ?? []).map((e) => ({
      at: e.created_at,
      action: e.action,
      actor_type: e.actor_type,
      actor: e.actor,
      detail: e.detail,
    })),
  });
}
