/**
 * DisclaimerBanner — single source of truth for compliance language across
 * the CRM. Use it on any page that renders client-facing numbers or analysis
 * (PIA, War Room calculators, archive views with historical financial data).
 *
 * Three variants:
 *   - "compact"   one-line collapsed banner with a "details" expander
 *   - "full"      full multi-paragraph disclosure (use on analysis pages)
 *   - "archive"   for the GHL archive views — frozen-data caveat
 */
import { ReactNode } from "react";

type Variant = "compact" | "full" | "archive";

const FULL_TEXT = `NextKey Property Strategists provides general property strategy advice only. We are not a
licensed financial planner, mortgage broker, tax agent, credit provider, real estate agent, or
solicitor — and the information shown here does not consider your personal financial situation,
objectives or needs. Property investment carries risk including loss of capital. Past performance
is not indicative of future results. State grants, stamp-duty thresholds, lender serviceability
rules, First Home Guarantee allocations, NDIS pricing arrangements and tax law all change
frequently — always verify current values with the relevant state revenue office, Housing Australia,
NDIS, ATO or other primary source before acting on any number. Always seek independent financial,
taxation, credit and legal advice from licensed professionals before making property decisions.`;

const ARCHIVE_TEXT = `These records are a frozen snapshot of GoHighLevel data taken at the time of
extraction. They do not reflect the current state of NextKey's contacts, opportunities or
correspondence — for live data use the operational CRM tables (/contacts, /leads, /opportunities).
Source URLs (e.g. media file CDN links) may be dead since GHL was decommissioned.`;

export default function DisclaimerBanner({ variant = "compact" }: { variant?: Variant }) {
  if (variant === "archive") {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 mb-4">
        <strong>📦 Historical archive:</strong> {ARCHIVE_TEXT}
      </div>
    );
  }

  if (variant === "full") {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 my-4 text-xs text-amber-900 leading-relaxed">
        <p className="font-semibold mb-1">⚠️ General advice only — not personal financial advice</p>
        <p className="whitespace-pre-line">{FULL_TEXT}</p>
      </div>
    );
  }

  // compact (default)
  return (
    <details className="bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 my-3 group">
      <summary className="cursor-pointer p-3 font-semibold list-none flex items-center justify-between">
        <span>⚠️ General advice only — click to expand</span>
        <span className="text-amber-700 group-open:rotate-180 transition-transform">▾</span>
      </summary>
      <div className="px-3 pb-3 leading-relaxed whitespace-pre-line">{FULL_TEXT}</div>
    </details>
  );
}

export function DisclaimerInline({ children }: { children?: ReactNode }) {
  // For places where a tight one-liner is enough (e.g. inside a calculator card)
  return (
    <p className="text-[11px] text-gray-400 mt-3 leading-relaxed italic">
      {children ?? "General advice only — not a substitute for licensed professional advice. Verify all figures with the relevant authority."}
    </p>
  );
}
