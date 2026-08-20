/**
 * POST /api/document-requests/<id>/income-check   (AUTHED)
 *
 * Reads the numbers inside an application's payslips and ATO income statements
 * and reconciles them against the income declared on the Needs Analysis.
 *
 * Sits alongside /verify, which checks that each document is a legible, correct
 * document but deliberately never reads its contents. Both are needed: a file
 * can pass verification with every slot filled and still be assessed on income
 * nobody checked.
 *
 * The work lives in utils/income-reconciliation-run.ts (I/O) and
 * utils/income-reconciliation.ts (decisions).
 */
import { NextResponse } from "next/server";
import { requireAuth } from "../../../../../utils/cf-access";
import { applyAiRateLimit, aiExpensive } from "../../../../../utils/ai-rate-limit";
import {
  runIncomeReconciliation,
  persistIncomeResult,
} from "../../../../../utils/income-reconciliation-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Each income document is a model call; a two-applicant set runs ~7 of them.
export const maxDuration = 120;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const rateLimited = applyAiRateLimit(req, aiExpensive);
  if (rateLimited) return rateLimited;

  const { id } = await params;
  const run = await runIncomeReconciliation(id);
  if (!run.ok) return NextResponse.json({ ok: false, error: run.error }, { status: run.status });

  // Persist, so the panel that triggered this shows the answer when it
  // refreshes. Returning the verdict without recording it makes the button
  // look broken: it computes the result, throws it away, and the page re-reads
  // the same empty state it started from.
  const saveError = await persistIncomeResult(run, id, new Date());

  return NextResponse.json({
    save_error: saveError,
    ok: true,
    application_id: run.applicationId,
    client_ref: run.clientRef,
    documents_read: run.documentsRead,
    declared_unavailable: run.declaredUnavailable,
    ...run.result,
  });
}
