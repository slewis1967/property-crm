/**
 * POST /api/pia/reports/{id}/email
 *   Body: { to: string, subject?: string, message?: string }
 *   Renders the saved PIA report into an HTML email body and ships via Brevo.
 *   Updates last_emailed_to / last_emailed_at / email_count on success.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../../utils/supabase";
import { sendBrevoEmail } from "../../../../../../utils/brevo";
import { defaultSignature } from "../../../../../../utils/email-signature";

import { requireAuth, userEmailFromRequest } from "../../../../../../utils/cf-access";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const to: string | undefined = body.to;
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ ok: false, error: "Valid 'to' email required" }, { status: 400 });
  }

  const { data: report, error } = await supabase
    .from("pia_reports")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !report) {
    return NextResponse.json({ ok: false, error: "Report not found" }, { status: 404 });
  }

  // Append the logged-in user's email signature.
  const sender = await userEmailFromRequest(req);
  const sig = await defaultSignature(sender);
  const kind = (report.results as { kind?: string } | null)?.kind;
  const subject = body.subject || `Property Investment Analysis — ${report.title}`;
  const html =
    kind === "comparison"
      ? renderComparisonEmailHtml(report, body.message, sig.html)
      : renderEmailHtml(report, body.message, sig.html);

  const result = await sendBrevoEmail({
    to: [{ email: to }],
    subject,
    html,
    tags: ["pia-report"],
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }

  // Audit
  await supabase
    .from("pia_reports")
    .update({
      last_emailed_to: to,
      last_emailed_at: new Date().toISOString(),
      email_count: (report.email_count ?? 0) + 1,
    })
    .eq("id", id);

  return NextResponse.json({ ok: true, messageId: result.messageId });
}

function fmtAud(n: number | null | undefined): string {
  if (n == null || !isFinite(Number(n))) return "—";
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 }).format(Number(n));
}

function renderEmailHtml(
  report: { title: string; inputs: Record<string, unknown>; results: Record<string, unknown> | null },
  message: string | undefined,
  signatureHtml = "",
): string {
  const inputs = report.inputs ?? {};
  const results = report.results ?? {};
  const cf = (results.cashflow ?? null) as { weeklyAfterTax?: number; positiveAfterTax?: boolean } | null;
  const purchasePrice = Number(inputs.purchasePrice ?? 0);
  const weeklyRent = Number(inputs.weeklyRent ?? 0);
  const loanAmount = Number(inputs.loanAmount ?? 0);
  const holdingYears = Number(inputs.holdingYears ?? 0);
  const grossYield = Number(results.grossYield ?? 0);
  const netYield = Number(results.netYield ?? 0);
  const initialCash = Number(results.initialCashRequired ?? 0);
  const endValue = Number(results.endValue ?? 0);
  const endEquity = Number(results.endEquity ?? 0);
  const totalReturn = Number(results.totalReturn ?? 0);
  const irr = Number(results.irrApprox ?? 0);

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><title>${escapeHtml(report.title)}</title></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;max-width:640px;margin:0 auto;padding:24px;line-height:1.5;">
  <h1 style="font-size:22px;margin:0 0 4px;">Property Investment Analysis</h1>
  <p style="color:#666;margin:0 0 24px;font-size:14px;">${escapeHtml(report.title)}</p>
  ${message ? `<div style="background:#f6f8ff;border-left:3px solid #4a7;padding:12px 16px;margin-bottom:24px;white-space:pre-wrap;font-size:14px;">${escapeHtml(message)}</div>` : ""}
  <h2 style="font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#666;margin:24px 0 8px;">Headline numbers</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <tr><td style="padding:6px 0;color:#666;">Purchase price</td><td style="padding:6px 0;text-align:right;font-weight:600;">${fmtAud(purchasePrice)}</td></tr>
    <tr><td style="padding:6px 0;color:#666;">Weekly rent</td><td style="padding:6px 0;text-align:right;font-weight:600;">${fmtAud(weeklyRent)}</td></tr>
    <tr><td style="padding:6px 0;color:#666;">Loan amount</td><td style="padding:6px 0;text-align:right;font-weight:600;">${fmtAud(loanAmount)}</td></tr>
    <tr><td style="padding:6px 0;color:#666;">Holding period</td><td style="padding:6px 0;text-align:right;font-weight:600;">${holdingYears} years</td></tr>
    <tr><td style="padding:6px 0;color:#666;">Gross yield (yr 1)</td><td style="padding:6px 0;text-align:right;font-weight:600;">${grossYield.toFixed(2)}%</td></tr>
    <tr><td style="padding:6px 0;color:#666;">Net yield (yr 1)</td><td style="padding:6px 0;text-align:right;font-weight:600;">${netYield.toFixed(2)}%</td></tr>
    <tr><td style="padding:6px 0;color:#666;">Cash needed at start</td><td style="padding:6px 0;text-align:right;font-weight:600;">${fmtAud(initialCash)}</td></tr>
    <tr><td style="padding:6px 0;color:#666;">Property value (yr ${holdingYears})</td><td style="padding:6px 0;text-align:right;font-weight:600;">${fmtAud(endValue)}</td></tr>
    <tr><td style="padding:6px 0;color:#666;">Equity at end</td><td style="padding:6px 0;text-align:right;font-weight:600;">${fmtAud(endEquity)}</td></tr>
    <tr><td style="padding:6px 0;color:#666;">Total return (after CGT)</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#0a0;">${fmtAud(totalReturn)}</td></tr>
    <tr><td style="padding:6px 0;color:#666;">IRR (approx)</td><td style="padding:6px 0;text-align:right;font-weight:600;">${irr.toFixed(2)}%</td></tr>
    ${cf?.weeklyAfterTax != null ? `<tr><td style="padding:6px 0;color:#666;">Weekly cashflow (after tax)</td><td style="padding:6px 0;text-align:right;font-weight:600;color:${cf.positiveAfterTax ? "#0a0" : "#b45309"};">${cf.weeklyAfterTax < 0 ? "−" : "+"}${fmtAud(Math.abs(cf.weeklyAfterTax))}/wk</td></tr>` : ""}
  </table>
  ${signatureHtml ? `<div style="margin-top:28px;">${signatureHtml}</div>` : ""}
  <p style="margin-top:32px;font-size:11px;color:#888;line-height:1.5;font-style:italic;">
    Advisor-grade modelling for client discussions. Not a substitute for a quantity-surveyor depreciation report,
    licensed mortgage broker serviceability analysis, accountant tax advice, or solicitor settlement-cost review.
    NextKey is not a licensed financial planner, mortgage broker, real estate agent or solicitor. Property
    investment carries risk including loss of capital. Past returns are not indicative of future performance.
  </p>
</body></html>`;
}

function renderComparisonEmailHtml(
  report: { title: string; results: Record<string, unknown> | null },
  message: string | undefined,
  signatureHtml = "",
): string {
  const cmp = ((report.results ?? {}) as any).comparison ?? {};
  const props: any[] = cmp.properties ?? [];
  const rec = cmp.recommendation;
  const rows = props
    .map(
      (p) => `<tr>
        <td style="padding:8px 0;border-top:1px solid #eee;">${escapeHtml(p.address ?? p.suburb ?? "Property")}</td>
        <td style="padding:8px 0;border-top:1px solid #eee;text-align:right;font-weight:700;color:#0F4C5C;">${p.score}/10</td>
        <td style="padding:8px 0;border-top:1px solid #eee;text-align:right;">${p.irr != null ? p.irr + "%" : "—"}</td>
        <td style="padding:8px 0;border-top:1px solid #eee;text-align:right;">${p.netYield != null ? p.netYield + "%" : "—"}</td>
      </tr>`,
    )
    .join("");
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8" /><title>${escapeHtml(report.title)}</title></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1a1a1a;max-width:640px;margin:0 auto;padding:24px;line-height:1.5;">
  <h1 style="font-size:22px;margin:0 0 4px;">Investment comparison</h1>
  <p style="color:#666;margin:0 0 24px;font-size:14px;">${escapeHtml(report.title)}</p>
  ${message ? `<div style="background:#f6f8ff;border-left:3px solid #4a7;padding:12px 16px;margin-bottom:24px;white-space:pre-wrap;font-size:14px;">${escapeHtml(message)}</div>` : ""}
  ${rec ? `<div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:14px 16px;margin-bottom:20px;font-size:14px;"><strong style="color:#B45309;">NextKey's pick:</strong> ${escapeHtml(rec.address ?? rec.suburb ?? "")} (${rec.score}/10)${rec.why?.length ? `<br><span style="color:#666;">${rec.why.map(escapeHtml).join(" · ")}</span>` : ""}</div>` : ""}
  <table style="width:100%;border-collapse:collapse;font-size:14px;">
    <tr style="text-align:left;color:#666;font-size:12px;text-transform:uppercase;"><th style="padding-bottom:4px;">Property</th><th style="text-align:right;">Score</th><th style="text-align:right;">IRR</th><th style="text-align:right;">Net yield</th></tr>
    ${rows}
  </table>
  ${signatureHtml ? `<div style="margin-top:28px;">${signatureHtml}</div>` : ""}
  <p style="margin-top:32px;font-size:11px;color:#888;line-height:1.5;font-style:italic;">
    General information only, prepared by NextKey Property Strategists. Ratings are NextKey's general assessment of
    investment merits, not personal advice or a forecast/guarantee of return. Figures are modelled on conservative
    assumptions; past performance is not indicative of future results. Seek your own independent financial, legal and
    taxation advice before deciding.
  </p>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
