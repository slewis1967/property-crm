/**
 * GET /api/portal/<token>/compliance/<kind>   kind = needs-analysis | credit-authorisation
 *
 * PUBLIC (token-scoped). The client's own SIGNED compliance documents, rendered
 * to PDF — the same renderers the advisor-facing endpoints use, so the client
 * sees exactly the document that was signed.
 *
 * WHY IT IS SAFE TO EXPOSE. These are the client's own documents, which they
 * personally e-signed; withholding them from the person who signed them serves
 * nobody. Three guards:
 *   1. Only ever the SIGNED/terminal version — never a draft mid-edit.
 *   2. Resolved through the token's own request → contact_id. A token can only
 *      reach the contact it belongs to.
 *   3. Rendered on demand, never cached or stored anywhere public.
 *
 * Chromium rendering takes seconds on a cold start, hence the Node runtime and
 * the longer duration.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../../utils/supabase";
import { enforceRateLimit } from "../../../../../../utils/rate-limit";
import { resolveToken, clientIp } from "../../../_shared";
import { DOCUMENT_REQUESTS_TABLE } from "../../../../../../utils/document-requests-db";
import { htmlToPdf } from "../../../../../../utils/pdf/render";
import { needsAnalysisHtmlWithLogo } from "../../../../../../utils/pdf/needsAnalysisPdf";
import { renderCreditAuthorisationHtml } from "../../../../../../utils/pdf/creditAuthorisationPdf";
import { hydrateNeedsAnalysis, NEEDS_ANALYSIS_TERMINAL_STATUS } from "../../../../../../utils/needsAnalysis";
import {
  hydrateCreditAuthorisation,
  CREDIT_AUTHORISATION_TERMINAL_STATUS,
} from "../../../../../../utils/creditAuthorisation";
import { log, errInfo } from "../../../../../../utils/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KINDS: Record<string, { table: string; terminal: string; filename: string; render: (raw: unknown) => Promise<string> }> = {
  "needs-analysis": {
    table: "nccp_needs_analyses",
    terminal: NEEDS_ANALYSIS_TERMINAL_STATUS,
    filename: "Needs Analysis.pdf",
    render: (raw) => needsAnalysisHtmlWithLogo(hydrateNeedsAnalysis(raw)),
  },
  "credit-authorisation": {
    table: "credit_authorisations",
    terminal: CREDIT_AUTHORISATION_TERMINAL_STATUS,
    filename: "Credit Authorisation.pdf",
    render: (raw) => renderCreditAuthorisationHtml(hydrateCreditAuthorisation(raw)),
  },
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string; kind: string }> },
) {
  const { token, kind } = await params;
  const spec = KINDS[kind];
  if (!spec) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const resolved = await resolveToken(token);
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status });
  }

  // Each call is a headless-Chromium render — throttle hard.
  const limited = enforceRateLimit(req, {
    windowMs: 60_000,
    max: 6,
    keyFn: () => `portal-compliance:${token}:${clientIp(req)}`,
  });
  if (limited) return limited;

  const { data: request } = await supabase
    .from(DOCUMENT_REQUESTS_TABLE)
    .select("id,contact_id")
    .eq("id", resolved.request.id)
    .maybeSingle();
  const contactId = (request as { contact_id?: string | null } | null)?.contact_id ?? null;
  if (!contactId) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const { data: row } = await supabase
    .from(spec.table)
    .select("id,data,updated_at")
    .eq("contact_id", contactId)
    .eq("status", spec.terminal) // signed only — never a draft
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!row) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  try {
    const pdf = await htmlToPdf(await spec.render((row as { data: unknown }).data));
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${spec.filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    log.error("portal.compliance_render_failed", { requestId: resolved.request.id, kind, ...errInfo(e) });
    return NextResponse.json({ ok: false, error: "Could not open that document." }, { status: 502 });
  }
}
