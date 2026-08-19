/**
 * Runs the income reconciliation for one APPLICATION: reads the financial
 * content out of the payslips and ATO income statements the client uploaded,
 * reads the declared position off the Needs Analysis, and hands both to the
 * pure logic in utils/income-reconciliation.ts.
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
import { hydrateNeedsAnalysis } from "./needsAnalysis";
import {
  reconcile,
  type AtoEvidence,
  type DeclaredIncome,
  type IncomeEvidence,
  type PayFrequency,
  type PayslipEvidence,
  type ReconciliationResult,
} from "./income-reconciliation";

const BUCKET = "client-documents";
const SELECT = "id,client_ref,application_id,applicant_name,contact_id,status,created_at";

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
 * The declared position, per applicant, off the most recent signed-or-draft
 * Needs Analysis. Draft counts: the whole point is to catch a bad figure BEFORE
 * it's signed, and by the time it's terminal it has already gone out.
 */
export async function loadDeclaredIncome(contactId: string | null): Promise<DeclaredIncome[]> {
  if (!contactId) return [];
  const { data, error } = await supabase
    .from("nccp_needs_analyses")
    .select("id,data,updated_at")
    .eq("contact_id", contactId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return [];

  const na = hydrateNeedsAnalysis((data as { data: unknown }).data);
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
   * `other_income` ("Bonus, Commission, Centrelink, Family Assistance") is one
   * shared free-text field for the whole household, but the claim inside it
   * usually names one person — "David Casual Woolworths 1 day per $400 per
   * week". Attaching it to every applicant would raise the same unevidenced
   * -income finding twice, so it goes to whoever it names, and to the first
   * applicant only when it names nobody.
   */
  const note = str(na.other_income);
  if (note && out.length) {
    const lower = note.toLowerCase();
    const named = out.find((d) => {
      const given = d.applicant.split(" ")[0]?.toLowerCase();
      return given && given.length > 2 && lower.includes(given);
    });
    (named ?? out[0]!).otherIncomeNote = note;
  }
  return out;
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

  const declared = await loadDeclaredIncome(
    (request as { contact_id?: string | null }).contact_id ?? null,
  );

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
