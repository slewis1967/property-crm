/**
 * Runs the income reconciliation for one APPLICATION: reads the financial
 * content out of the payslips and ATO income statements the client uploaded,
 * reads the declared position off the Needs Analysis (or, failing that, the
 * Fact Find), and hands both to the pure logic in
 * utils/income-reconciliation.ts.
 *
 * Deliberately mirrors utils/yla-verification-run.ts — same storage bucket,
 * same sibling-request gathering, same single-wave concurrency, same model
 * plumbing — because the two run over the same documents and must not drift.
 * The difference is what they look at: verification checks that the document
 * is a legible payslip, this checks what the payslip SAYS.
 *
 * Only income documents are fetched. Photo ID and super statements carry no
 * servicing signal and each one is a model call we'd be paying for.
 */
import { supabase } from "./supabase";
import { MODELS, orChat } from "./openrouter";
import { DOCUMENT_REQUESTS_TABLE, docTableMissing } from "./document-requests-db";
import { hydrateNeedsAnalysis, type NeedsAnalysisData } from "./needsAnalysis";
import { hydrateFactFind } from "./factfind";
import { factFindToNeedsAnalysis } from "./factFindToNeedsAnalysis";
import {
  reconcile,
  worstSeverity,
  type AtoEvidence,
  type DeclaredIncome,
  type IncomeEvidence,
  type PayFrequency,
  type PayslipEvidence,
  type ReconciliationResult,
} from "./income-reconciliation";

const BUCKET = "client-documents";
const SELECT =
  "id,client_ref,application_id,applicant_name,contact_id,fact_find_id,status,created_at";

/** Matches yla-verification-run: one wave, sized to clear inside the request window. */
const AI_CONCURRENCY = 16;

/** The only document types that carry income. */
const INCOME_DOC_TYPES = new Set(["payslip", "ato_income"]);

export type IncomeRunResult =
  | { ok: false; status: number; error: string }
  | {
      ok: true;
      applicationId: string | null;
      clientRef: string | null;
      documentsRead: number;
      /** True when we had no Needs Analysis to compare against. */
      declaredUnavailable: boolean;
      /** False when cached evidence was re-scored instead of re-reading the PDFs. */
      extracted: boolean;
      result: ReconciliationResult;
      /** The extracted evidence, for the caller to cache. */
      evidence: IncomeEvidence[];
      siblingIds: string[];
    };

const PAYSLIP_PROMPT = `You are reading ONE Australian payslip. Extract only what is printed on it.

Return STRICT JSON, no markdown fences:
{
  "employer": "<payer/company name, or null>",
  "period_start": "<YYYY-MM-DD or null>",
  "period_end": "<YYYY-MM-DD or null>",
  "paid_on": "<YYYY-MM-DD pay date, or null>",
  "frequency": "<wk|fn|m|pa|null — from the stated pay frequency, else infer from the period length>",
  "gross_this_period": <number or null>,
  "ytd_gross": <number or null>,
  "variable_component": <number or null>,
  "deductions": [{"label": "<as printed>", "amount": <number>, "pre_tax": <true|false>}]
}

Rules:
- gross_this_period is the GROSS for this pay period, not net and not YTD.
- variable_component is the part of gross that is overtime, penalties, shift loading, bonus or commission — the portion a lender shades. Sum them. Null if none.
- deductions: only actual deductions FROM pay (union fees, salary sacrifice, novated lease). Allowances PAID TO the employee are not deductions.
- pre_tax true for salary sacrifice and other before-tax deductions; false for after-tax ones.
- Numbers as plain numbers: 3645.93 not "$3,645.93".
- Dates: the period is the work period; paid_on is the payment date. They differ.
- Use null rather than guessing.`;

const ATO_PROMPT = `You are reading ONE Australian ATO income statement (myGov payment summary) for a single employer.

Return STRICT JSON, no markdown fences:
{
  "employer": "<employer name, or null>",
  "financial_year": "<YYYY-YY, e.g. 2025-26, or null>",
  "period_start": "<YYYY-MM-DD or null>",
  "period_end": "<YYYY-MM-DD or null>",
  "total_gross": <number or null>,
  "overtime": <number or null>,
  "salary_sacrifice": <number or null — as a POSITIVE number even though shown negative>,
  "termination_indicated": <true|false>
}

Rules:
- period_start/period_end come from the "Period" line. This is critical: a statement for a job started mid-year covers only part of the year, and that must be captured accurately.
- total_gross is the "Total gross amount".
- termination_indicated is true if the statement shows any unused leave on termination, an ETP, or otherwise indicates the employment ended.
- Numbers as plain numbers. Use null rather than guessing.`;

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function freq(v: unknown): PayFrequency | null {
  const s = typeof v === "string" ? v.toLowerCase().trim() : "";
  return s === "wk" || s === "fn" || s === "m" || s === "pa" ? s : null;
}

/** Strip fences and parse. Extraction failures degrade to null fields, not throws. */
function parseJson(raw: string): Record<string, unknown> {
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return {};
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * The declared position, per applicant, read off a Needs Analysis.
 *
 * Pure and exported so the Fact Find path below can reuse it rather than
 * growing a second extraction that drifts from this one.
 */
export function needsAnalysisToDeclaredIncome(na: NeedsAnalysisData): DeclaredIncome[] {
  const out: DeclaredIncome[] = [];

  for (const a of na.applicants ?? []) {
    const name = [a.given_names, a.surname].filter(Boolean).join(" ").trim();
    if (!name) continue;
    const emp = a.current_employment;
    out.push({
      applicant: name,
      annual: annualiseDeclared(emp?.income_amount ?? null, emp?.pay_frequency ?? "pa"),
      // The form has no employer NAME field — only an address block — so reps
      // type the employer into the street line ("Woolworths Bateau Bay, 12 Bay
      // Village Rd"). That line is the best name we have; occupation is the
      // fallback when it's blank.
      employer: str(emp?.employer?.street) ?? str(emp?.occupation),
      employmentType: str(emp?.employment_type),
      basis: str(emp?.employment_basis),
      startedOn: str(emp?.date_started),
      otherIncomeNote: null,
    });
  }

  /**
   * Other income, attributed by the person who entered it.
   *
   * THIS USED TO BE A GUESS. `other_income` was one shared free-text line for
   * the whole household, so working out whose income it was meant scanning the
   * prose for an applicant's first name and defaulting to applicant 1 when it
   * named nobody — on a document the client signs. It is now rows carrying an
   * explicit owner, so the guess is gone.
   *
   * `both` goes to every applicant in use: a jointly-received payment is income
   * to each of them for the purpose of "did they declare something we can't
   * evidence". A row with NO owner set is still surfaced — against applicant 1,
   * and flagged as unattributed — because dropping it would hide a declared
   * income from the very check that exists to notice unevidenced claims.
   */
  for (const row of na.other_incomes ?? []) {
    const amount = typeof row.amount === "number" && isFinite(row.amount) ? row.amount : null;
    const label = [str(row.type), str(row.description)].filter(Boolean).join(" — ");
    const money = amount == null ? "amount not stated" : `$${amount.toLocaleString("en-AU")} ${row.frequency}`;
    const unattributed = row.owner !== "app1" && row.owner !== "app2" && row.owner !== "both";
    const note = `${label || "Other income"}: ${money}${unattributed ? " (not attributed to an applicant)" : ""}`;

    const targets: DeclaredIncome[] = [];
    if (row.owner === "both") targets.push(...out);
    else if (row.owner === "app2" && out[1]) targets.push(out[1]);
    else if (out[0]) targets.push(out[0]);

    for (const t of targets) {
      t.otherIncomeNote = t.otherIncomeNote ? `${t.otherIncomeNote}; ${note}` : note;
    }
  }

  /**
   * The legacy household line, for documents signed before the rows existed.
   * Still attached to applicant 1 rather than guessed at — the guessing is what
   * this change removed, and a sentence nobody has converted into rows is not
   * evidence of whose income it is.
   */
  const legacy = str(na.other_income);
  if (legacy && out.length) {
    const note = `Recorded as a note: ${legacy}`;
    out[0]!.otherIncomeNote = out[0]!.otherIncomeNote ? `${out[0]!.otherIncomeNote}; ${note}` : note;
  }

  return out;
}

/**
 * The declared position for one application, per applicant.
 *
 * TWO SOURCES, IN ORDER OF AUTHORITY.
 *
 *   1. The most recent signed-or-draft Needs Analysis for the contact. Draft
 *      counts: the whole point is to catch a bad figure BEFORE it's signed, and
 *      by the time it's terminal it has already gone out.
 *   2. Failing that, the Fact Find the document request was raised against.
 *
 * THE FALLBACK IS NOT A NICETY. This function returning [] does not raise a
 * finding — it sets `declaredUnavailable` and the reconciliation quietly has
 * nothing to compare the payslips against. So every application without a
 * Needs Analysis was silently exempt from the check that exists because a file
 * went out declaring $186k against payslips worth $154k.
 *
 * A Tier 2 introducer pack is exactly that shape: it produces a Fact Find, no
 * Needs Analysis, and no contact id, and it reaches the assessor without a
 * human having approved it (see the header of
 * migrations/20260820_introducer_tier2_pack.sql). The submissions with the most
 * reason to be checked were the ones being skipped — an introducer paid on
 * completion is the last person whose income figure should go unverified.
 *
 * The Fact Find is carried through `factFindToNeedsAnalysis`, the bridge the
 * staff "seed a Needs Analysis" button already uses, rather than a second
 * mapper. It maps a Fact Find's gross annual onto `income_amount` at frequency
 * "pa", which is precisely what this needs. What it CANNOT supply is employer,
 * employment basis and start date — the Fact Find has no fields for them — so
 * the employer-match and part-year findings stay quiet on a Fact-Find-only
 * application. The headline declared-vs-evidenced comparison, which is the one
 * that caught Halliday, works.
 */
export async function loadDeclaredIncome(source: {
  contactId: string | null;
  factFindId?: string | null;
}): Promise<DeclaredIncome[]> {
  if (source.contactId) {
    const { data, error } = await supabase
      .from("nccp_needs_analyses")
      .select("id,data,updated_at")
      .eq("contact_id", source.contactId)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!error && data) {
      const declared = needsAnalysisToDeclaredIncome(
        hydrateNeedsAnalysis((data as { data: unknown }).data),
      );
      // An empty Needs Analysis is not a reason to ignore a Fact Find that has
      // the figures — fall through rather than returning nothing.
      if (declared.length) return declared;
    }
  }

  if (source.factFindId) {
    const { data, error } = await supabase
      .from("borrower_fact_finds")
      .select("id,data")
      .eq("id", source.factFindId)
      .maybeSingle();
    if (!error && data) {
      const ff = hydrateFactFind((data as { data: unknown }).data);
      return needsAnalysisToDeclaredIncome(factFindToNeedsAnalysis(ff).data);
    }
  }

  return [];
}

/**
 * Record a reconciliation verdict against every sibling row of the application.
 *
 * Shared by the sweep and the on-demand route so the two can never drift — the
 * same reason /verify and submit-to-yla share runApplicationVerification. It
 * lives here rather than in the sweep because the route must not import the
 * sweep just to save its own result.
 *
 * Written to every sibling, like drive_folder_url: the verdict is
 * application-level, and denormalising it lets any single request row answer
 * "does this file need attention?" without a join.
 */
export async function persistIncomeResult(
  run: Extract<IncomeRunResult, { ok: true }>,
  fallbackRequestId: string,
  now: Date,
): Promise<string | null> {
  const worst = worstSeverity(run.result.findings);
  const patch: Record<string, unknown> = {
    income_status: run.result.pass && worst !== "warn" ? "pass" : "attention",
    income_summary: run.result.summary,
    income_findings: run.result.findings,
    income_applicants: run.result.applicants,
    income_evaluated_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
  // Only stamp the extraction cache when we actually re-read the PDFs; a
  // re-score must not claim the documents were read again, or the sweep would
  // stop noticing genuinely new uploads.
  if (run.extracted) {
    patch.income_evidence = run.evidence;
    patch.income_extracted_at = now.toISOString();
  }

  const ids = run.siblingIds.length ? run.siblingIds : [fallbackRequestId];
  const { error } = await supabase.from(DOCUMENT_REQUESTS_TABLE).update(patch).in("id", ids);
  return error ? error.message : null;
}

/** Needs Analysis stores an amount plus a frequency; servicing wants per annum. */
function annualiseDeclared(amount: number | null, frequency: string): number | null {
  if (amount == null) return null;
  const per: Record<string, number> = { wk: 52, fn: 26, m: 12, pa: 1 };
  return Math.round(amount * (per[frequency] ?? 1));
}

export async function runIncomeReconciliation(
  id: string,
  opts?: {
    asOf?: Date;
    /**
     * Skip the PDFs and score this evidence instead. The sweep passes the
     * cached extraction when no document has changed: whether a payslip has
     * aged past the staleness threshold is date arithmetic, and paying ~7
     * model calls every two hours to re-learn numbers that cannot have moved
     * is how a background job becomes the largest line on the AI bill.
     */
    cachedEvidence?: IncomeEvidence[];
  },
): Promise<IncomeRunResult> {
  const asOf = opts?.asOf ?? new Date();

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

  const declared = await loadDeclaredIncome({
    contactId: (request as { contact_id?: string | null }).contact_id ?? null,
    factFindId: (request as { fact_find_id?: string | null }).fact_find_id ?? null,
  });

  /**
   * Applicant labels must agree between the declared side and the evidence
   * side or every comparison silently becomes "declared with no evidence".
   * The request's applicant_name is the anchor; where it matches a Needs
   * Analysis applicant we adopt that spelling, otherwise we keep the request's.
   */
  const nameFor = (raw: string | null): string => {
    const fallback = raw?.trim() || "Applicant";
    const hit = declared.find(
      (d) =>
        d.applicant.toLowerCase() === fallback.toLowerCase() ||
        d.applicant.toLowerCase().includes(fallback.toLowerCase().split(" ")[0] ?? "~") ||
        fallback.toLowerCase().includes(d.applicant.toLowerCase().split(" ")[0] ?? "~"),
    );
    return hit?.applicant ?? fallback;
  };

  // Re-score cached evidence and skip the expensive half entirely.
  if (opts?.cachedEvidence) {
    const cached = opts.cachedEvidence;
    return {
      ok: true,
      applicationId: request.application_id,
      clientRef: request.client_ref,
      documentsRead: cached.length,
      declaredUnavailable: declared.length === 0,
      extracted: false,
      result: reconcile({ declared, evidence: cached, asOf }),
      evidence: cached,
      siblingIds: siblings.map((s) => s.id),
    };
  }

  type Target = { applicant: string; docKey: string; filename: string; storage_path: string };
  const targets: Target[] = [];

  for (const sib of siblings) {
    const who = nameFor(sib.applicant_name);
    const { data: docs } = await supabase
      .from("client_documents")
      .select("id,doc_type,filename,storage_path,mime_type,status,uploaded_at")
      .eq("request_id", sib.id)
      .neq("status", "replaced")
      .order("uploaded_at", { ascending: true });

    for (const d of docs ?? []) {
      if (!INCOME_DOC_TYPES.has(d.doc_type)) continue;
      targets.push({
        applicant: who,
        docKey: d.doc_type,
        filename: d.filename,
        storage_path: d.storage_path,
      });
    }
  }

  const evidence: (IncomeEvidence | null)[] = new Array(targets.length).fill(null);
  let next = 0;
  async function worker() {
    while (next < targets.length) {
      const i = next++;
      const t = targets[i]!;
      try {
        const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(t.storage_path, 300);
        if (!signed?.signedUrl) throw new Error("could not read from storage");
        const res = await fetch(signed.signedUrl);
        if (!res.ok) throw new Error("could not download");
        const buf = new Uint8Array(await res.arrayBuffer());
        const dataUrl = `data:application/pdf;base64,${Buffer.from(buf).toString("base64")}`;

        const response = await orChat({
          model: MODELS.extract,
          max_tokens: 900,
          reasoning: { effort: "low" },
          messages: [
            {
              role: "user",
              content: [
                { type: "file", file: { filename: t.filename, file_data: dataUrl } },
                { type: "text", text: t.docKey === "payslip" ? PAYSLIP_PROMPT : ATO_PROMPT },
              ],
            },
          ],
          plugins: [{ id: "file-parser", pdf: { engine: "native" } }],
        });

        const text = response.choices?.[0]?.message?.content;
        const j = parseJson(typeof text === "string" ? text : "");

        if (t.docKey === "payslip") {
          const ded = Array.isArray(j.deductions) ? j.deductions : [];
          const slip: PayslipEvidence = {
            kind: "payslip",
            applicant: t.applicant,
            filename: t.filename,
            employer: str(j.employer),
            periodStart: str(j.period_start),
            periodEnd: str(j.period_end),
            paidOn: str(j.paid_on),
            frequency: freq(j.frequency),
            grossThisPeriod: num(j.gross_this_period),
            ytdGross: num(j.ytd_gross),
            variableComponent: num(j.variable_component),
            deductions: ded
              .map((d) => {
                const o = d as Record<string, unknown>;
                const amount = num(o.amount);
                return amount == null
                  ? null
                  : { label: str(o.label) ?? "Deduction", amount, preTax: o.pre_tax === true };
              })
              .filter((d): d is { label: string; amount: number; preTax: boolean } => d !== null),
          };
          evidence[i] = slip;
        } else {
          const a: AtoEvidence = {
            kind: "ato",
            applicant: t.applicant,
            filename: t.filename,
            employer: str(j.employer),
            financialYear: str(j.financial_year),
            periodStart: str(j.period_start),
            periodEnd: str(j.period_end),
            totalGross: num(j.total_gross),
            overtime: num(j.overtime),
            salarySacrifice: num(j.salary_sacrifice) == null ? null : Math.abs(num(j.salary_sacrifice)!),
            terminationIndicated: j.termination_indicated === true,
          };
          evidence[i] = a;
        }
      } catch {
        // A document we couldn't read contributes nothing rather than poisoning
        // the reconciliation with zeros. It still shows as an absence: an
        // applicant whose only payslip failed extraction reports as unevidenced.
        evidence[i] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(AI_CONCURRENCY, targets.length) }, () => worker()));

  const usable = evidence.filter((e): e is IncomeEvidence => e !== null);
  const result = reconcile({ declared, evidence: usable, asOf });

  return {
    ok: true,
    applicationId: request.application_id,
    clientRef: request.client_ref,
    documentsRead: usable.length,
    declaredUnavailable: declared.length === 0,
    extracted: true,
    result,
    evidence: usable,
    siblingIds: siblings.map((s) => s.id),
  };
}
