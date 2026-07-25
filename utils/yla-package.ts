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
  render: (raw: unknown) => Promise<string>;
};

const SPECS: Spec[] = [
  {
    key: "needs_analysis",
    table: "nccp_needs_analyses",
    terminal: NEEDS_ANALYSIS_TERMINAL_STATUS,
    label: "Needs Analysis",
    filenameBase: "Needs Analysis",
    render: (raw) => needsAnalysisHtmlWithLogo(hydrateNeedsAnalysis(raw)),
  },
  {
    key: "credit_authorisation",
    table: "credit_authorisations",
    terminal: CREDIT_AUTHORISATION_TERMINAL_STATUS,
    label: "Credit File Authorisation",
    filenameBase: "Credit Authorisation",
    render: (raw) => renderCreditAuthorisationHtml(hydrateCreditAuthorisation(raw)),
  },
];

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
    SPECS.map(async (spec) => ({ spec, row: await loadSigned(spec, contactId) })),
  );
  return found.filter(({ row }) => !row).map(({ spec }) => `${spec.label} — not signed yet`);
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

      const html = await spec.render(data.data);
      const pdf = await htmlToPdf(html);
      const name = packageFilename(spec.filenameBase, opts.primaryApplicant, opts.clientRef);
      // Copy into a standalone ArrayBuffer — Buffer views share a pooled one.
      const bytes = pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength) as ArrayBuffer;
      return { spec, doc: { name, bytes, mime: "application/pdf" } };
    }),
  );

  for (const { spec, doc } of results) {
    if (doc) docs.push(doc);
    else missing.push(`${spec.label} — not signed yet`);
  }

  return { docs, missing };
}
