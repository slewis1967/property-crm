"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { PartnerBranding } from "../../../../utils/partner";
import { formatAud } from "../../../../utils/partner";
import { SUBURB_REPORT_DISCLAIMER } from "../../../../utils/partner-suburbs";

type Intel = {
  medianPrice: number | null;
  priceGrowthPct: number | null;
  population: number | null;
  keyInfrastructure: string[];
  lastUpdated: string | null;
};

type LotLine = {
  id: string;
  ref: string;
  propertyType: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  landSizeSqm: number | null;
  price: number | null;
};

/** The narrative uses `**Heading**` lines and `- ` bullets; nothing else. */
function Narrative({ text, color }: { text: string; color: string }) {
  const blocks = text.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  return (
    <div className="space-y-3 text-[13.5px] leading-relaxed text-gray-800">
      {blocks.map((block, i) => {
        const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
        const out: React.ReactNode[] = [];
        let bullets: string[] = [];
        const flush = () => {
          if (bullets.length) out.push(<ul key={`u${out.length}`} className="list-disc space-y-1 pl-5">{bullets.map((b, j) => <li key={j}>{inline(b)}</li>)}</ul>);
          bullets = [];
        };
        for (const line of lines) {
          const heading = line.match(/^\*\*(.+?)\*\*\s*[—–-]?\s*(.*)$/);
          if (/^[-•*]\s+/.test(line)) {
            bullets.push(line.replace(/^[-•*]\s+/, ""));
          } else if (heading && line.startsWith("**")) {
            flush();
            out.push(<h3 key={`h${out.length}`} className="mt-2 text-sm font-semibold uppercase tracking-wide" style={{ color }}>{heading[1]}</h3>);
            if (heading[2]) out.push(<p key={`p${out.length}`}>{inline(heading[2])}</p>);
          } else {
            flush();
            out.push(<p key={`p${out.length}`}>{inline(line)}</p>);
          }
        }
        flush();
        return <div key={i}>{out}</div>;
      })}
    </div>
  );
}

function inline(text: string): React.ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((s, i) =>
    s.startsWith("**") && s.endsWith("**") ? <strong key={i}>{s.slice(2, -2)}</strong> : <span key={i}>{s}</span>,
  );
}

export default function SuburbReport({
  suburb,
  state,
  stats,
  lots,
  branding,
  firmName,
  preparedBy,
  asAt,
}: {
  suburb: string;
  state: string | null;
  stats: { count: number; available: number; minPrice: number | null; maxPrice: number | null };
  lots: LotLine[];
  branding: PartnerBranding;
  firmName: string;
  preparedBy: string;
  asAt: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [intel, setIntel] = useState<Intel | null>(null);
  const [narrative, setNarrative] = useState<string | null>(null);

  const fetchReport = useCallback(async (): Promise<{ intel: Intel | null; narrative: string | null }> => {
    const res = await fetch(`/api/partner/suburbs/report?suburb=${encodeURIComponent(suburb)}&state=${encodeURIComponent(state ?? "")}`);
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) throw new Error(json.error ?? "Couldn't load the research.");
    return { intel: json.intel ?? null, narrative: json.narrative ?? null };
  }, [suburb, state]);

  const apply = useCallback((p: Promise<{ intel: Intel | null; narrative: string | null }>, alive: () => boolean) => {
    p.then((r) => {
      if (!alive()) return;
      setIntel(r.intel);
      setNarrative(r.narrative);
      setError(null);
    })
      .catch((e: unknown) => alive() && setError(e instanceof Error ? e.message : "Couldn't load the research."))
      .finally(() => alive() && setLoading(false));
  }, []);

  // First load: state only changes once the request settles.
  useEffect(() => {
    let alive = true;
    apply(fetchReport(), () => alive);
    return () => { alive = false; };
  }, [apply, fetchReport]);

  const load = () => {
    setLoading(true);
    setError(null);
    apply(fetchReport(), () => true);
  };

  const place = `${suburb}${state ? `, ${state}` : ""}`;
  const brandName = branding.whiteLabel ? branding.displayName : firmName;

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print {
          .no-print { display: none !important; }
          .sheet { box-shadow: none !important; margin: 0 !important; width: auto !important; padding: 0 !important; }
          body { background: #fff !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <div className="no-print mx-auto flex max-w-[210mm] flex-wrap items-center justify-between gap-2 px-4 pt-4">
        <Link href="/partner/suburbs" className="text-sm text-gray-600 hover:text-gray-900">← All suburbs</Link>
        <button
          onClick={() => window.print()}
          disabled={loading}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: branding.accentColor }}
        >
          Print / save as PDF
        </button>
      </div>

      <article className="sheet mx-auto my-4 w-[210mm] max-w-full bg-white p-[14mm] text-gray-900 shadow">
        <header className="flex items-center justify-between border-b-2 pb-3" style={{ borderColor: branding.primaryColor }}>
          {branding.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt={branding.displayName} className="h-10 w-auto" />
          ) : (
            <div className="text-xl font-bold" style={{ color: branding.primaryColor }}>{brandName}</div>
          )}
          <div className="text-right text-xs text-gray-500">
            <div>Suburb research</div>
            <div>{asAt}</div>
          </div>
        </header>

        <h1 className="mt-5 text-2xl font-semibold" style={{ color: branding.primaryColor }}>{place}</h1>

        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 print:grid-cols-4">
          {[
            { n: intel?.medianPrice ? formatAud(intel.medianPrice) : "—", l: "Median price" },
            { n: intel?.priceGrowthPct != null ? `${intel.priceGrowthPct}%` : "—", l: "Price growth (past)" },
            { n: intel?.population ? intel.population.toLocaleString("en-AU") : "—", l: "Population" },
            { n: String(stats.available), l: "New homes available" },
          ].map((s) => (
            <div key={s.l} className="rounded-md border border-gray-200 px-3 py-3 text-center">
              <div className="text-lg font-bold" style={{ color: branding.primaryColor }}>{s.n}</div>
              <div className="text-[10px] uppercase tracking-wide text-gray-500">{s.l}</div>
            </div>
          ))}
        </div>

        <section className="mt-6">
          {loading && (
            <p className="no-print rounded-lg bg-gray-50 p-4 text-sm text-gray-600">
              Researching {place}. The first report for a suburb takes up to a minute; after that it opens straight away.
            </p>
          )}
          {error && (
            <div className="no-print rounded-lg bg-red-50 p-4 text-sm text-red-800">
              {error} <button className="underline" onClick={() => void load()}>Try again</button>
            </div>
          )}
          {!loading && !error && narrative && <Narrative text={narrative} color={branding.primaryColor} />}
          {!loading && !error && !narrative && (
            <p className="text-sm text-gray-600">The research for this suburb isn&apos;t available right now. Please try again later.</p>
          )}
          {intel?.keyInfrastructure?.length ? (
            <div className="mt-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: branding.primaryColor }}>Key infrastructure</h3>
              <ul className="mt-1 list-disc pl-5 text-[13.5px]">{intel.keyInfrastructure.map((k) => <li key={k}>{k}</li>)}</ul>
            </div>
          ) : null}
        </section>

        {lots.length > 0 && (
          <section className="mt-6" style={{ breakInside: "avoid" }}>
            <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: branding.primaryColor }}>New homes available here</h2>
            <table className="mt-2 w-full text-[13px]">
              <tbody>
                {lots.map((l) => (
                  <tr key={l.id} className="border-b border-gray-100">
                    <td className="py-1.5 pr-2">
                      <Link href={`/partner/stock/${l.id}`} className="no-underline">{l.ref}</Link>
                    </td>
                    <td className="py-1.5 pr-2 text-gray-600">
                      {[l.bedrooms && `${l.bedrooms} bed`, l.bathrooms && `${l.bathrooms} bath`, l.propertyType, l.landSizeSqm && `${Math.round(l.landSizeSqm)} m² land`].filter(Boolean).join(" · ")}
                    </td>
                    <td className="py-1.5 text-right font-medium">{l.price ? formatAud(l.price) : "Price on request"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {stats.available > lots.length && (
              <p className="mt-1 text-[11px] text-gray-500">The {lots.length} lowest-priced of {stats.available} available.</p>
            )}
          </section>
        )}

        <footer className="mt-8 border-t border-gray-200 pt-3 text-[10px] leading-relaxed text-gray-500">
          <p className="mb-2 text-[11px] text-gray-700">Prepared by {preparedBy ? `${preparedBy}, ` : ""}{firmName} · {asAt}</p>
          <p>{SUBURB_REPORT_DISCLAIMER}</p>
        </footer>
      </article>
    </div>
  );
}
