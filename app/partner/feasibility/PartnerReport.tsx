"use client";

import FeasibilityReportBody, { type FeasibilityReport } from "../../components/FeasibilityReportBody";
import type { PartnerBranding } from "../../../utils/partner";
import { PARTNER_FEASIBILITY_DISCLAIMER } from "../../../utils/partner-feasibility";

/**
 * A feasibility report in the firm's own letterhead (NextKey's unless they
 * hold white-label), print-ready. The body is the same renderer the staff tool
 * uses; only the header and footer differ.
 */
export default function PartnerReport({
  report,
  address,
  branding,
  firmName,
  preparedBy,
  dateLabel,
}: {
  report: FeasibilityReport;
  address: string;
  branding: PartnerBranding;
  firmName: string;
  preparedBy: string;
  dateLabel: string;
}) {
  const brandName = branding.whiteLabel ? branding.displayName : firmName;
  return (
    <div>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #partner-feasibility, #partner-feasibility * { visibility: visible !important; }
          #partner-feasibility { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none !important; margin: 0 !important; }
          .no-print { display: none !important; }
          @page { size: A4; margin: 16mm 14mm; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
      <div className="no-print mb-3 flex justify-end">
        <button
          onClick={() => window.print()}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
          style={{ background: branding.accentColor }}
        >
          Print / save as PDF
        </button>
      </div>
      <div id="partner-feasibility" className="mx-auto max-w-[900px] bg-white px-10 py-8 text-[#1a2332] shadow-sm">
        <div className="mb-2 flex items-start justify-between border-b-[3px] pb-4" style={{ borderColor: branding.primaryColor }}>
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt={branding.displayName} className="h-10 w-auto" />
          ) : (
            <div className="text-2xl font-bold" style={{ color: branding.primaryColor }}>{brandName}</div>
          )}
          <div className="text-right text-[11px] leading-5 text-gray-500">
            Preliminary planning feasibility
            <br />
            {dateLabel}
          </div>
        </div>

        <FeasibilityReportBody report={report} address={address} color={branding.primaryColor} />

        <div className="mt-6 border-t border-gray-200 pt-3 text-[11px] text-gray-500">
          <p className="mb-1 text-gray-700">Prepared by {preparedBy ? `${preparedBy}, ` : ""}{firmName} · {dateLabel}</p>
          <p>{PARTNER_FEASIBILITY_DISCLAIMER}</p>
        </div>
      </div>
    </div>
  );
}
