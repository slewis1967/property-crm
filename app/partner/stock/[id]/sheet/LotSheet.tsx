"use client";

/**
 * The lot sheet itself (A4, print-ready) plus a screen-only panel to adjust the
 * assumptions before printing. The figures come from the same pure engine as
 * client shortlists (computeReport), so a sheet and a shortlist for the same
 * lot agree.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import type { PartnerBranding } from "../../../../../utils/partner";
import { formatAud } from "../../../../../utils/partner";
import {
  DEFAULT_ASSUMPTIONS,
  computeReport,
  type ShortlistAssumptions,
} from "../../../../../utils/property-shortlist";
import { LOT_SHEET_DISCLAIMER, sheetTitle, type SheetLot } from "../../../../../utils/partner-lot-sheet";

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "" || value === false) return null;
  return (
    <div className="flex justify-between gap-3 border-b border-gray-100 py-1.5 text-[13px] last:border-0">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium text-gray-900">{value}</dd>
    </div>
  );
}

function num(v: string): number | null {
  const n = Number(v.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function LotSheet({
  lot,
  lotId,
  branding,
  firmName,
  preparedBy,
  initialClientName,
  asAt,
}: {
  lot: SheetLot;
  lotId: string;
  branding: PartnerBranding;
  firmName: string;
  preparedBy: string;
  initialClientName: string;
  asAt: string;
}) {
  const [a, setA] = useState<ShortlistAssumptions>(DEFAULT_ASSUMPTIONS);
  const [rent, setRent] = useState(lot.rentWeekly ? String(lot.rentWeekly) : "");
  const [clientName, setClientName] = useState(initialClientName);
  const rentWeekly = num(rent);
  const rentIsDevelopers = rentWeekly !== null && rentWeekly === lot.rentWeekly;

  const report = useMemo(
    () =>
      computeReport(
        { price: lot.price, landPrice: lot.landPrice, contract: lot.contract, state: lot.state, rentWeekly },
        a,
      ),
    [lot.price, lot.landPrice, lot.contract, lot.state, rentWeekly, a],
  );

  const field = "mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm";
  const brandName = branding.whiteLabel ? branding.displayName : firmName;

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print {
          .no-print { display: none !important; }
          .sheet { box-shadow: none !important; margin: 0 !important; width: auto !important; min-height: 0 !important; padding: 0 !important; }
          body { background: #fff !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {/* Screen-only controls */}
      <div className="no-print mx-auto max-w-[210mm] px-4 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link href={`/partner/stock/${lotId}`} className="text-sm text-gray-600 hover:text-gray-900">← Back to the lot</Link>
          <button
            onClick={() => window.print()}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
            style={{ background: branding.accentColor }}
          >
            Print / save as PDF
          </button>
        </div>
        <div className="mt-3 grid gap-3 rounded-xl border border-gray-200 bg-white p-4 text-xs font-medium text-gray-600 sm:grid-cols-4">
          <label className="sm:col-span-2">
            Prepared for (printed on the sheet)
            <input className={field} value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Client name (optional)" />
          </label>
          <label>
            Deposit %
            <input className={field} type="number" min={0} max={100} value={a.depositPct}
              onChange={(e) => setA({ ...a, depositPct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} />
          </label>
          <label>
            Interest rate %
            <input className={field} type="number" step="0.05" min={0} max={20} value={a.interestRatePct}
              onChange={(e) => setA({ ...a, interestRatePct: Math.min(20, Math.max(0, Number(e.target.value) || 0)) })} />
          </label>
          <label>
            Loan term (years)
            <input className={field} type="number" min={1} max={40} value={a.loanTermYears}
              onChange={(e) => setA({ ...a, loanTermYears: Math.min(40, Math.max(1, Math.round(Number(e.target.value) || 30))) })} />
          </label>
          <label>
            Repayments
            <select className={field} value={a.repayment} onChange={(e) => setA({ ...a, repayment: e.target.value === "io" ? "io" : "pi" })}>
              <option value="pi">Principal &amp; interest</option>
              <option value="io">Interest only</option>
            </select>
          </label>
          <label>
            Rent estimate ($/week)
            <input className={field} inputMode="numeric" value={rent} onChange={(e) => setRent(e.target.value)} placeholder="None" />
          </label>
          <label className="flex items-end gap-2 pb-1">
            <input type="checkbox" checked={a.firstHomeBuyer} onChange={(e) => setA({ ...a, firstHomeBuyer: e.target.checked })} />
            First home buyer (duty)
          </label>
        </div>
      </div>

      {/* The sheet */}
      <article className="sheet mx-auto my-4 min-h-[297mm] w-[210mm] max-w-full bg-white p-[12mm] text-gray-900 shadow">
        <header className="flex items-center justify-between border-b-2 pb-3" style={{ borderColor: branding.primaryColor }}>
          <div>
            {branding.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={branding.logoUrl} alt={branding.displayName} className="h-10 w-auto" />
            ) : (
              <div className="text-xl font-bold" style={{ color: branding.primaryColor }}>{brandName}</div>
            )}
          </div>
          <div className="text-right text-xs text-gray-500">
            <div>Property summary</div>
            <div>Ref {lot.ref} · {asAt}</div>
          </div>
        </header>

        <section className="mt-5">
          {clientName && <div className="text-xs uppercase tracking-wide text-gray-500">Prepared for {clientName}</div>}
          <h1 className="mt-1 text-2xl font-semibold" style={{ color: branding.primaryColor }}>{sheetTitle(lot)}</h1>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <div className="text-3xl font-bold">{lot.price ? formatAud(lot.price) : "Price on request"}</div>
            <div className="text-sm text-gray-600">
              {[
                lot.bedrooms && `${lot.bedrooms} bed`,
                lot.bathrooms && `${lot.bathrooms} bath`,
                lot.carSpaces && `${lot.carSpaces} car`,
                lot.study && "study",
              ].filter(Boolean).join(" · ")}
            </div>
          </div>
          {lot.availability !== "available" && (
            <p className="mt-2 text-sm font-medium text-amber-700">
              {lot.availability === "on_hold" ? "Currently on hold. Ask about similar homes." : "No longer available."}
            </p>
          )}
        </section>

        <div className="mt-5 grid gap-6 sm:grid-cols-2 print:grid-cols-2">
          <section>
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide" style={{ color: branding.primaryColor }}>The home</h2>
            <dl>
              <Fact label="Type" value={lot.propertyType} />
              <Fact label="Land" value={lot.landSizeSqm && `${Math.round(lot.landSizeSqm)} m²`} />
              <Fact label="Frontage" value={lot.frontageM && `${lot.frontageM} m`} />
              <Fact label="Home size" value={lot.houseSizeSqm && `${Math.round(lot.houseSizeSqm)} m²`} />
              <Fact label="Land price" value={lot.landPrice && formatAud(lot.landPrice)} />
              <Fact label="Build price" value={lot.buildPrice && formatAud(lot.buildPrice)} />
              <Fact label="Contract" value={lot.contract} />
              <Fact label="Land titled" value={lot.titled === null ? null : lot.titled ? "Yes" : "Not yet"} />
              <Fact label="Land registration" value={lot.landRegistration} />
              <Fact label="Completion" value={lot.completion} />
            </dl>
          </section>

          <section>
            <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide" style={{ color: branding.primaryColor }}>Estimated costs</h2>
            {report ? (
              <dl>
                <Fact label={`Deposit (${a.depositPct}%)`} value={formatAud(report.deposit)} />
                <Fact label="Loan" value={formatAud(report.loan)} />
                <Fact
                  label={report.dutyBasis === "land" ? "Stamp duty (on land, est.)" : "Stamp duty (est.)"}
                  value={report.duty === null ? "Ask us" : formatAud(report.duty)}
                />
                <Fact label="Legal and other costs (est.)" value={formatAud(report.closingCosts)} />
                <Fact label="Upfront cash (est.)" value={formatAud(report.upfrontCash)} />
                <Fact
                  label={`Repayments (${a.interestRatePct}%, ${a.repayment === "io" ? "interest only" : `${a.loanTermYears} yrs P&I`})`}
                  value={`${formatAud(report.monthlyRepayment)} / month`}
                />
                {report.rentWeekly !== null && (
                  <>
                    <Fact label={rentIsDevelopers ? "Rent (developer's estimate)" : "Rent (estimate)"} value={`${formatAud(report.rentWeekly)} / week`} />
                    <Fact label="Gross yield (est.)" value={report.grossYieldPct !== null ? `${report.grossYieldPct.toFixed(2)}%` : null} />
                    <Fact label="Running costs (est.)" value={report.annualCosts !== null ? `${formatAud(report.annualCosts)} / year` : null} />
                    <Fact
                      label="Cashflow before tax (est.)"
                      value={report.weeklyCashflow !== null ? `${report.weeklyCashflow < 0 ? "−" : ""}${formatAud(Math.abs(report.weeklyCashflow))} / week` : null}
                    />
                  </>
                )}
              </dl>
            ) : (
              <p className="text-sm text-gray-600">Price on request, so no estimates yet.</p>
            )}
            {report?.lmiLikely && (
              <p className="mt-2 text-[11px] text-gray-500">With a deposit under 20%, lenders usually charge mortgage insurance, which is not included.</p>
            )}
          </section>
        </div>

        <p className="mt-6 rounded-lg bg-gray-50 p-3 text-[12px] text-gray-700">
          The builder, estate and street address are provided once the home is reserved for you.
        </p>

        <footer className="mt-6 border-t border-gray-200 pt-3 text-[10px] leading-relaxed text-gray-500">
          <p className="mb-2 text-[11px] text-gray-700">
            Prepared by {preparedBy ? `${preparedBy}, ` : ""}{firmName} · {asAt}
          </p>
          <p>{LOT_SHEET_DISCLAIMER}</p>
        </footer>
      </article>
    </div>
  );
}
