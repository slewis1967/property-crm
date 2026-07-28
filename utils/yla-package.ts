/**
 * The two APPLICATION-level documents YLA need alongside the client's uploaded
 * files: the signed NCCP Needs Analysis and the signed Credit File
 * Authorisation.
 *
 * These are not client uploads — the client portal only collects the personal
 * documents (payslips, ID, ATO statements, super), and these two are produced
 * and signed inside the CRM. Until now nothing put them in the Drive folder, so
 * the "complete" package we hand YLA was never actually complete. YLA reject a
 * partial set outright ("we run like a bank") and a rejection costs a week, so
 * the auto-submit path must not be able to send without them.
 *
 * NOTE the Fact Find is deliberately NOT here. Sean, 2026-07-25: YLA do not
 * receive a Fact Find — they receive a Needs Analysis. (The Fact Find goes to
 * BROKERS instead; see utils/broker-submit.ts.)
 *
 * Both are resolved by the application's contact_id, newest first, and only
 * when they have reached their signed/locked terminal status.
 */
import { supabase } from "./supabase";
import { htmlToPdf } from "./pdf/render";
import { needsAnalysisHtmlWithLogo } from "./pdf/needsAnalysisPdf";
import { renderCreditAuthorisationHtml } from "./pdf/creditAuthorisationPdf";
import { hydrateNeedsAnalysis, NEEDS_ANALYSIS_TERMINAL_STATUS } from "./needsAnalysis";
import { hydrateCreditAuthorisation, CREDIT_AUTHORISATION_TERMINAL_STATUS } from "./creditAuthorisation";
import { packageFilename } from "./yla-documents";
import { buildSignaturesArray, type SignatureMark, type SignerLike } from "./signatures";
import { SIGNATURE_REQUESTS_TABLE } from "./signature-requests-db";

/** One rendered application-level document, ready to upload. */
export type PackageDoc = { name: string; bytes: ArrayBuffer; mime: string };

export type PackageResult = {
  docs: PackageDoc[];
  /** Human-readable reasons the package is not submittable, for the rep. */
  missing: string[];
};

type Spec = {
  key: "needs_analysis" | "credit_authorisation";
  table: string;
  terminal: string;
  /** What the rep is told when it's absent or unsigned. */
  label: string;
  filenameBase: string;
  render: (raw: unknown, signatures: (SignatureMark | null)[]) => Promise<string>;
};

const SPECS: Spec[] = [
  {
    key: "needs_analysis",
    table: "nccp_needs_analyses",
    terminal: NEEDS_ANALYSIS_TERMINAL_STATUS,
    label: "Needs Analysis",
    filenameBase: "Needs Analysis",
    render: (raw, sigs) => needsAnalysisHtmlWithLogo(hydrateNeedsAnalysis(raw), sigs),
  },
  {
    key: "credit_authorisation",
    table: "credit_authorisations",
    terminal: CREDIT_AUTHORISATION_TERMINAL_STATUS,
    label: "Credit File Authorisation",
    filenameBase: "Credit Authorisation",
    render: (raw, sigs) => renderCreditAuthorisationHtml(hydrateCreditAuthorisation(raw), sigs),
  },
];

/**
 * The captured e-signatures for one document, and whether everyone who was
 * asked has actually signed.
 *
 * The document row's own status is NOT sufficient evidence, which is how the
 * first real package went out wrong: the Hallidays' Credit File Authorisation
 * was `status: "signed"` and rendered with two empty signature boxes, because
 * the render was never given the signatures at all. The row status is a lock
 * flag; these rows are the signatures.
 *
 * Grouped by signer_index because a re-sent signing link leaves more than one
 * request per applicant — the Hallidays have four rows for two people. Judging
 * on "every row is signed" would fail a fully-signed document whose first link
 * was simply superseded.
 */
async function loadSignatures(
  spec: Spec,
  docId: string,
): Promise<{ marks: (SignatureMark | null)[]; allSigned: boolean }> {
  const { data, error } = await supabase
    .from(SIGNATURE_REQUESTS_TABLE)
    .select("signer_index,signer_name,signature_image,signed_at,status")
    .eq("doc_type", spec.key)
    .eq("doc_id", docId);
  // A missing signature table means e-signing isn't deployed here; that is not
  // the same as "nobody signed", and shipping an unsigned copy is the failure
  // we're fixing — so it's a hard error, like a missing document table.
  if (error) {
    if (tableMissing(error)) throw new Error("Signature storage isn't set up in this environment.");
    throw new Error(`Could not read the ${spec.label} signatures: ${error.message}`);
  }
  const rows = (data ?? []) as SignerLike[];
  const byIndex = new Map<number, SignerLike[]>();
  for (const r of rows) {
    (byIndex.get(r.signer_index) ?? byIndex.set(r.signer_index, []).get(r.signer_index)!).push(r);
  }
  const allSigned =
    byIndex.size > 0 && [...byIndex.values()].every((rs) => rs.some((r) => r.status === "signed"));
  return { marks: buildSignaturesArray(rows), allSigned };
}

/**
 * A missing TABLE means the feature isn't deployed in this environment, which
 * is not the same as an unsigned document — treat it as a hard error rather
 * than quietly shipping an incomplete package.
 */
function tableMissing(err: { code?: string } | null): boolean {
  return err?.code === "42P01" || err?.code === "PGRST205";
}

/** Newest signed row for one spec, or null. Throws on a real read failure. */
async function loadSigned(spec: Spec, contactId: string) {
  const { data, error } = await supabase
    .from(spec.table)
    .select("id,status,data,updated_at")
    .eq("contact_id", contactId)
    .eq("status", spec.terminal)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (tableMissing(error)) throw new Error(`${spec.label} storage isn't set up in this environment.`);
    throw new Error(`Could not read the ${spec.label}: ${error.message}`);
  }
  return data as { id: string; data: unknown } | null;
}

/**
 * Which of the two are not signed yet — the CHEAP check (no PDF rendering), so
 * verification can block a submission without paying for two headless-Chromium
 * renders on every sweep. Phrased for the rep, and returned as `missing` rather
 * than as document faults: an unsigned Needs Analysis is our job to fix, not
 * the client's, so it must never trigger a client "please re-upload" email.
 */
export async function missingComplianceDocs(contactId: string | null): Promise<string[]> {
  if (!contactId) return SPECS.map((s) => `${s.label} — this application isn't linked to a contact`);
  const found = await Promise.all(
    SPECS.map(async (spec) => {
      const row = await loadSigned(spec, contactId);
      // Checking the signatures, not just the lock flag. A document can carry
      // the terminal status while nobody's signature was ever captured, and
      // that is precisely the package we must not send: YLA require the Credit
      // File Authorisation signed by every applicant, and it is an Equifax
      // Access Seeker consent under the Privacy Act — an unsigned copy is not
      // a formatting problem.
      const sigs = row ? await loadSignatures(spec, row.id) : null;
      return { spec, row, sigs };
    }),
  );
  return found
    .filter(({ row, sigs }) => !row || !sigs?.allSigned)
    .map(({ spec, row }) =>
      row ? `${spec.label} — not signed by every applicant yet` : `${spec.label} — not signed yet`,
    );
}

/**
 * Render the signed Needs Analysis + Credit File Authorisation for an
 * application's contact.
 *
 * Anything not signed is reported in `missing` rather than thrown, so the
 * caller can surface a precise, fixable reason ("Credit File Authorisation
 * isn't signed yet") instead of a generic failure. A render that BLOWS UP,
 * however, is an error — silently dropping a document here is exactly how a
 * partial set reaches YLA.
 */
export async function buildYlaPackageDocs(opts: {
  contactId: string | null;
  clientRef: string | null;
  primaryApplicant: string | null;
}): Promise<PackageResult> {
  const docs: PackageDoc[] = [];
  const missing: string[] = [];

  if (!opts.contactId) {
    return { docs, missing: SPECS.map((s) => `${s.label} — this application isn't linked to a contact`) };
  }

  // Both renders are headless-Chromium and take seconds; run them together so
  // the sweep's already-tight serverless budget isn't spent twice over.
  const results = await Promise.all(
    SPECS.map(async (spec) => {
      const data = await loadSigned(spec, opts.contactId!);
      if (!data) return { spec, doc: null as PackageDoc | null };

      // Render WITH the captured signatures. Omitting them produced a
      // pixel-perfect blank consent form that read as though the clients had
      // never signed — while their signatures sat in the signature table all
      // along.
      const { marks, allSigned } = await loadSignatures(spec, data.id);
      if (!allSigned) return { spec, doc: null as PackageDoc | null };

      const html = await spec.render(data.data, marks);
      const pdf = await htmlToPdf(html);
      const name = packageFilename(spec.filenameBase, opts.primaryApplicant, opts.clientRef);
      // Copy into a standalone ArrayBuffer — Buffer views share a pooled one.
      const bytes = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
      return { spec, doc: { name, bytes, mime: "application/pdf" } };
    }),
  );

  for (const { spec, doc } of results) {
    if (doc) docs.push(doc);
    else missing.push(`${spec.label} — not signed by every applicant yet`);
  }

  return { docs, missing };
}
