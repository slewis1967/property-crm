/**
 * The ongoing half of income reconciliation.
 *
 * A one-off check catches a bad file the day someone clicks the button. Most of
 * these problems arrive by sitting still: payslips that were current when they
 * were uploaded age past what a lender will accept, and nobody notices because
 * nothing happened. The Hallidays' went from current to seven weeks old while
 * the file sat at "Factfind sent to broker".
 *
 * So this runs on the two-hourly cron alongside the YLA and reminder sweeps,
 * and splits the work by cost:
 *
 *   documents changed  → re-read the PDFs (~7 model calls)
 *   nothing changed    → re-score the cached extraction (free)
 *
 * The second path is what makes a frequent schedule affordable, and it is the
 * one that catches ageing. Extraction is capped per run so a backlog drains
 * over several sweeps instead of blowing the request window — the same failure
 * that silently killed the verification sweep before it was batched.
 */
import { supabase } from "./supabase";
import { DOCUMENT_REQUESTS_TABLE, docTableMissing } from "./document-requests-db";
import { runIncomeReconciliation, persistIncomeResult } from "./income-reconciliation-run";
import { worstSeverity, type IncomeEvidence } from "./income-reconciliation";
import { log, errInfo } from "./logger";

/**
 * Applications whose PDFs we'll re-read in one sweep. Each is ~7 model calls
 * against a shared request window; the cheap re-score path is unlimited.
 */
const EXTRACT_BUDGET = 4;

/** Re-read the documents at least this often even when nothing changed. */
const MAX_EXTRACTION_AGE_DAYS = 30;

export type SweepResult = {
  ok: boolean;
  considered: number;
  extracted: number;
  rescored: number;
  attention: number;
  skipped: number;
  errors: string[];
};

type Row = {
  id: string;
  application_id: string | null;
  client_ref: string | null;
  status: string | null;
  income_evidence: unknown;
  income_extracted_at: string | null;
  income_evaluated_at: string | null;
};

const SELECT =
  "id,application_id,client_ref,status,income_evidence,income_extracted_at,income_evaluated_at";

function ageDays(iso: string | null, now: Date): number {
  if (!iso) return Number.POSITIVE_INFINITY;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return (now.getTime() - t) / 86_400_000;
}

export async function runIncomeSweep(opts?: { now?: Date; budget?: number }): Promise<SweepResult> {
  const now = opts?.now ?? new Date();
  const budget = opts?.budget ?? EXTRACT_BUDGET;
  const out: SweepResult = {
    ok: true,
    considered: 0,
    extracted: 0,
    rescored: 0,
    attention: 0,
    skipped: 0,
    errors: [],
  };

  const { data, error } = await supabase
    .from(DOCUMENT_REQUESTS_TABLE)
    .select(SELECT)
    .eq("status", "submitted")
    .order("income_evaluated_at", { ascending: true, nullsFirst: true });

  if (error) {
    if (docTableMissing(error)) return { ...out, ok: false, errors: ["Document storage isn't set up."] };
    return { ...out, ok: false, errors: [error.message] };
  }

  /**
   * One reconciliation per APPLICATION, not per request row. Siblings share the
   * documents and the Needs Analysis, so running each would pay the extraction
   * cost twice and write two copies of the same verdict.
   */
  const byApplication = new Map<string, Row>();
  for (const r of (data ?? []) as Row[]) {
    const key = r.application_id ?? r.id;
    const seen = byApplication.get(key);
    // Keep the stalest sibling — its evaluated_at drives the ordering.
    if (!seen || ageDays(r.income_evaluated_at, now) > ageDays(seen.income_evaluated_at, now)) {
      byApplication.set(key, r);
    }
  }

  let extractionsLeft = budget;

  for (const row of byApplication.values()) {
    out.considered++;

    let cached: IncomeEvidence[] | undefined;
    if (Array.isArray(row.income_evidence) && row.income_evidence.length) {
      cached = row.income_evidence as IncomeEvidence[];
    }

    // Has anything been uploaded since we last read the documents?
    let docsChanged = !cached;
    if (cached && row.income_extracted_at) {
      const ids = [row.id];
      if (row.application_id) {
        const { data: sibs } = await supabase
          .from(DOCUMENT_REQUESTS_TABLE)
          .select("id")
          .eq("application_id", row.application_id)
          .neq("status", "cancelled");
        for (const s of sibs ?? []) if (!ids.includes(s.id)) ids.push(s.id);
      }
      const { count } = await supabase
        .from("client_documents")
        .select("id", { count: "exact", head: true })
        .in("request_id", ids)
        .neq("status", "replaced")
        .gt("uploaded_at", row.income_extracted_at);
      docsChanged = (count ?? 0) > 0;
    }
    if (!docsChanged && ageDays(row.income_extracted_at, now) > MAX_EXTRACTION_AGE_DAYS) {
      docsChanged = true;
    }

    if (docsChanged && extractionsLeft <= 0) {
      // Out of budget this sweep. Leave it for the next one rather than
      // re-scoring stale evidence and stamping it as freshly evaluated —
      // that would push it to the back of the queue and starve it.
      out.skipped++;
      continue;
    }

    try {
      const run = await runIncomeReconciliation(row.id, {
        asOf: now,
        cachedEvidence: docsChanged ? undefined : cached,
      });
      if (!run.ok) {
        out.errors.push(`${row.client_ref ?? row.id}: ${run.error}`);
        continue;
      }
      if (run.extracted) {
        extractionsLeft--;
        out.extracted++;
      } else {
        out.rescored++;
      }

      const worst = worstSeverity(run.result.findings);
      if (!run.result.pass || worst === "warn") out.attention++;

      // Same writer the on-demand route uses, so a swept verdict and a
      // hand-triggered one can never disagree about what gets stored.
      const upErr = await persistIncomeResult(run, row.id, now);
      if (upErr) out.errors.push(`${row.client_ref ?? row.id}: ${upErr}`);
    } catch (e) {
      log.error("income_sweep.failed", { request_id: row.id, ...errInfo(e) });
      out.errors.push(`${row.client_ref ?? row.id}: ${e instanceof Error ? e.message : "failed"}`);
    }
  }

  return out;
}
