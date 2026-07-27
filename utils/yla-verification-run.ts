/**
 * Runs the YLA verification agent for one APPLICATION (all per-applicant
 * requests sharing application_id): gathers the collected documents, then checks
 * each against YLA's standard — structural (bytes) + AI visual. Shared by the
 * /verify route and the submit-to-YLA primitive so they can never diverge.
 *
 * Pure decision logic lives in utils/yla-verification.ts; this does the I/O
 * (Supabase reads, storage fetch, the vision model call).
 */
import { supabase } from "./supabase";
import { requiredSlots, allowsExtra } from "./yla-documents";
import { MODELS, orChat } from "./openrouter";
import { DOCUMENT_REQUESTS_TABLE, docTableMissing } from "./document-requests-db";
import {
  hasPdfHeader,
  looksEncrypted,
  structuralIssues,
  visualCheckPrompt,
  parseVisualVerdict,
  visualIssues,
  docVerdict,
  buildResult,
  atoYearCoverageIssues,
  type DocVerdict,
  type VerificationResult,
} from "./yla-verification";
import { missingComplianceDocs } from "./yla-package";
import { financialYearsNeeded } from "./mygov-guide";

const BUCKET = "client-documents";
const SELECT =
  "id,client_ref,application_id,applicant_name,contact_id,status,created_at,drive_folder_url,yla_submitted_at";
/**
 * Documents checked at once. Sized so a whole application goes through in ONE
 * wave, because the sweep runs inside a serverless request with a ceiling of a
 * few tens of seconds: at 5, a two-applicant set (15 documents, including the
 * extra ATO statements myGov issues per employer) took three waves and 43s end
 * to end. That overran the window and the run was killed before it could record
 * its verdict — silently, and identically on every retry. One wave costs about
 * as long as the slowest single document.
 *
 * Safe to raise: each call goes through the OpenAI SDK, which already retries
 * 429/5xx, so a burst that brushes a rate limit is retried rather than being
 * turned into a spurious "this document couldn't be checked" fault.
 */
const AI_CONCURRENCY = 16;

export type VerifyRunResult =
  | { ok: false; status: number; error: string }
  | {
      ok: true;
      applicationId: string | null;
      clientRef: string | null;
      primaryApplicant: string;
      /** Any sibling's Drive folder link (all siblings share it once exported). */
      driveFolderUrl: string | null;
      ylaSubmittedAt: string | null;
      siblingIds: string[];
      visualChecked: boolean;
      result: VerificationResult;
    };

type Matched = {
  applicant: string;
  docKey: string;
  /** 1-based index within the doc type — licence front vs back reads differently. */
  slot: number;
  filename: string;
  storage_path: string;
  mime: string;
};

export async function runApplicationVerification(
  id: string,
  opts?: { visual?: boolean },
): Promise<VerifyRunResult> {
  const doVisual = opts?.visual !== false;

  const { data: request, error: reqErr } = await supabase
    .from(DOCUMENT_REQUESTS_TABLE)
    .select(SELECT)
    .eq("id", id)
    .maybeSingle();
  if (reqErr) {
    if (docTableMissing(reqErr)) return { ok: false, status: 503, error: "Document storage isn't set up yet." };
    return { ok: false, status: 500, error: reqErr.message };
  }
  if (!request) return { ok: false, status: 404, error: "Not found" };

  let siblings = [request];
  if (request.application_id) {
    const { data: sibs } = await supabase
      .from(DOCUMENT_REQUESTS_TABLE)
      .select(SELECT)
      .eq("application_id", request.application_id)
      .neq("status", "cancelled")
      .order("created_at", { ascending: true });
    if (sibs && sibs.length) siblings = sibs;
  }

  const slots = requiredSlots();
  const matched: Matched[] = [];
  const missing: string[] = [];
  let received = 0;

  for (let ai = 0; ai < siblings.length; ai++) {
    const sib = siblings[ai]!;
    const who = siblings.length > 1 ? `Applicant ${ai + 1}` : sib.applicant_name || "Applicant";
    const { data: docs } = await supabase
      .from("client_documents")
      .select("id,doc_type,filename,storage_path,mime_type,status,uploaded_at")
      .eq("request_id", sib.id)
      .neq("status", "replaced")
      .order("uploaded_at", { ascending: true });

    const used = new Set<string>();
    for (const slot of slots) {
      const m = (docs ?? []).find((d) => !used.has(d.id) && d.doc_type === slot.docKey);
      if (!m) {
        missing.push(
          `${who}: ${slot.label}${slot.docKey === "photo_id" ? (slot.slot === 1 ? " (front)" : " (back)") : ""}`,
        );
        continue;
      }
      used.add(m.id);
      received++;
      matched.push({
        applicant: who,
        docKey: slot.docKey,
        slot: slot.slot,
        filename: m.filename,
        storage_path: m.storage_path,
        mime: m.mime_type || "application/pdf",
      });
    }

    // Documents BEYOND the required slots — a third or fourth ATO statement,
    // because myGov issues one per employer. They must still be checked (an
    // extra statement can be a screenshot too) and must reach the year-coverage
    // check, or a client's 2024-25 statement would be invisible simply because
    // they had two employers in the other year.
    for (const d of docs ?? []) {
      if (used.has(d.id) || !allowsExtra(d.doc_type)) continue;
      used.add(d.id);
      received++;
      const nth = matched.filter((m) => m.applicant === who && m.docKey === d.doc_type).length + 1;
      matched.push({
        applicant: who,
        docKey: d.doc_type,
        slot: nth,
        filename: d.filename,
        storage_path: d.storage_path,
        mime: d.mime_type || "application/pdf",
      });
    }
  }

  const verdicts: DocVerdict[] = new Array(matched.length);
  /** Per-document facts only the cross-document checks below can act on. */
  const financialYears: (string | null)[] = new Array(matched.length).fill(null);
  let next = 0;
  async function worker() {
    while (next < matched.length) {
      const i = next++;
      const m = matched[i]!;
      const structural: string[] = [];
      const visual: string[] = [];
      let sizeBytes = 0;
      try {
        const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(m.storage_path, 300);
        if (!signed?.signedUrl) throw new Error("could not read from storage");
        const res = await fetch(signed.signedUrl);
        if (!res.ok) throw new Error("could not download");
        const buf = new Uint8Array(await res.arrayBuffer());
        sizeBytes = buf.byteLength;
        structural.push(
          ...structuralIssues({ mime: m.mime, sizeBytes, isPdfHeader: hasPdfHeader(buf), encrypted: looksEncrypted(buf) }),
        );
        if (doVisual && structural.length === 0) {
          const dataUrl = `data:application/pdf;base64,${Buffer.from(buf).toString("base64")}`;
          const chatBody: Record<string, unknown> = {
            model: MODELS.extract,
            max_tokens: 600,
            reasoning: { effort: "low" },
            messages: [
              {
                role: "user",
                content: [
                  { type: "file", file: { filename: m.filename, file_data: dataUrl } },
                  { type: "text", text: visualCheckPrompt(m.docKey, m.slot) },
                ],
              },
            ],
            plugins: [{ id: "file-parser", pdf: { engine: "native" } }],
          };
          const response = await orChat(chatBody);
          const text = response.choices?.[0]?.message?.content;
          const verdict = parseVisualVerdict(typeof text === "string" ? text : "");
          financialYears[i] = verdict.financialYear ?? null;
          visual.push(...visualIssues(verdict));
        }
      } catch (e) {
        structural.push(`couldn't be checked (${e instanceof Error ? e.message : "read error"})`);
      }
      verdicts[i] = docVerdict({ docKey: m.docKey, applicant: m.applicant, filename: m.filename, sizeBytes, structural, visual });
    }
  }
  await Promise.all(Array.from({ length: Math.min(AI_CONCURRENCY, matched.length) }, () => worker()));

  // Cross-document: a whole financial year can be missing while every file
  // passes on its own. NOT a duplicate-year check — myGov issues one statement
  // per employer, so two for the same year is correct for a two-job year.
  const atoIndexes = matched.map((m, i) => ({ m, i })).filter(({ m }) => m.docKey === "ato_income");
  const yearIssues = atoYearCoverageIssues(
    atoIndexes.map(({ m, i }) => ({ applicant: m.applicant, financialYear: financialYears[i]! })),
    financialYearsNeeded(new Date()).map((y) => y.label),
  );
  for (const [nth, issue] of yearIssues) {
    const target = atoIndexes[nth];
    const verdict = target ? verdicts[target.i] : undefined;
    if (!verdict) continue;
    verdict.issues.push(issue);
    verdict.pass = false;
  }

  // The two documents the client never uploads. They belong in `missing` (a
  // rep task) rather than in the per-document verdicts, so an unsigned Needs
  // Analysis blocks the YLA submission WITHOUT emailing the client to re-upload
  // something they were never asked for.
  try {
    missing.push(
      ...(await missingComplianceDocs((request as { contact_id?: string | null }).contact_id ?? null)),
    );
  } catch (e) {
    missing.push(e instanceof Error ? e.message : "Could not check the Needs Analysis / Credit Authorisation.");
  }

  const result = buildResult({ applicantCount: siblings.length, received, missing, docs: verdicts.filter(Boolean) });
  const driveFolderUrl = siblings.map((s) => s.drive_folder_url).find(Boolean) ?? null;
  const ylaSubmittedAt = siblings.map((s) => s.yla_submitted_at).find(Boolean) ?? null;

  return {
    ok: true,
    applicationId: request.application_id,
    clientRef: request.client_ref,
    primaryApplicant: siblings[0]?.applicant_name ?? "",
    driveFolderUrl,
    ylaSubmittedAt,
    siblingIds: siblings.map((s) => s.id),
    visualChecked: doVisual,
    result,
  };
}
