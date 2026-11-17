/**
 * The body of a planning feasibility report (title through disclaimer):
 * status pills, key stats, satellite figure, sections and blocks. Shared by
 * the staff tool (/feasibility, NextKey letterhead) and the partner portal
 * (/partner/feasibility, the firm's own letterhead), which each wrap it in
 * their own header and footer. `color` is the heading/accent colour.
 *
 * Renders only what the report JSON says; every value is plain text.
 */
import type { CSSProperties } from "react";

export type Tone = "good" | "warn" | "bad" | "info";

export type Block =
  | { type: "p"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "callout"; tone?: Tone; title?: string; text: string }
  | { type: "table"; columns?: string[]; rows: string[][] };

export type FeasibilityReport = {
  title?: string;
  subtitle?: string;
  meta?: { scope?: string; statusPills?: { label: string; tone?: Tone }[] };
  keyStats?: { n: string; l: string }[];
  sections?: { heading: string; blocks: Block[] }[];
  disclaimer?: string;
  location?: { lat: number; lng: number };
};

const CALLOUT: Record<Tone, string> = {
  good: "background:#ECFDF5;border-color:#059669;",
  warn: "background:#FFFBEB;border-color:#D97706;",
  bad: "background:#FEF2F2;border-color:#DC2626;",
  info: "background:#EFF6FF;border-color:#0F4C5C;",
};

const PILL: Record<Tone, string> = {
  good: "bg-emerald-100 text-emerald-800",
  warn: "bg-amber-100 text-amber-800",
  bad: "bg-red-100 text-red-800",
  info: "bg-[#E0F2F1] text-[#0F4C5C]",
};

function esriSatUrl(lat: number, lng: number, d = 0.0016): string {
  const bbox = `${lng - d},${lat - d},${lng + d},${lat + d}`;
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${bbox}&bboxSR=4326&imageSR=4326&size=800,500&format=jpg&f=image`;
}

export default function FeasibilityReportBody({
  report,
  address,
  color,
}: {
  report: FeasibilityReport;
  address: string;
  color: string;
}) {
  return (
    <>
        <h1 className="text-2xl font-bold mt-6 mb-1">
          {report.title || "Preliminary Planning Feasibility Assessment"}
        </h1>
        {report.subtitle && <p className="text-sm text-gray-500">{report.subtitle}</p>}

        {(report.meta?.scope || report.meta?.statusPills?.length) && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {report.meta?.statusPills?.map((p, i) => (
              <span
                key={i}
                className={`inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full ${PILL[p.tone || "info"]}`}
              >
                {p.label}
              </span>
            ))}
            {report.meta?.scope && <span className="text-xs text-gray-500">{report.meta.scope}</span>}
          </div>
        )}

        {!!report.keyStats?.length && (
          <div className="flex gap-3 my-5">
            {report.keyStats.slice(0, 4).map((s, i) => (
              <div key={i} className="flex-1 border border-gray-200 rounded-md px-3 py-3 text-center">
                <div className="text-lg font-bold" style={{ color: color }}>
                  {s.n}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-gray-500">{s.l}</div>
              </div>
            ))}
          </div>
        )}

        {(report.location || address) && (
          <figure
            className="my-5 border border-gray-200 rounded-md overflow-hidden"
            style={{ breakInside: "avoid" }}
          >
            {report.location && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={esriSatUrl(report.location.lat, report.location.lng)}
                alt={`Satellite view of ${address || "the site"}`}
                className="w-full block"
              />
            )}
            <figcaption className="text-[11px] text-gray-500 px-3 py-2 flex flex-wrap gap-2 justify-between items-center">
              <span>
                Satellite view{address ? ` — ${address}` : ""} · Imagery: Esri World Imagery
              </span>
              {address && (
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[#0F4C5C] font-semibold no-print"
                >
                  Open live in Google Maps ↗
                </a>
              )}
            </figcaption>
          </figure>
        )}

        {report.sections?.map((sec, si) => (
          <section key={si} style={{ breakInside: "avoid" }}>
            <h2
              className="text-[15px] font-semibold uppercase tracking-wide border-b border-gray-200 pb-1.5 mt-8 mb-3"
              style={{ color: color }}
            >
              {sec.heading}
            </h2>
            {sec.blocks?.map((b, bi) => (
              <BlockView key={bi} block={b} />
            ))}
          </section>
        ))}

        {report.disclaimer && (
          <div className="text-[11.5px] text-gray-500 border-t border-gray-200 mt-9 pt-3.5">
            <span className="font-semibold">Important disclaimer. </span>
            {report.disclaimer}
          </div>
        )}
    </>
  );
}

function BlockView({ block }: { block: Block }) {
  if (block.type === "p") {
    return <p className="text-[13.5px] leading-relaxed my-2">{block.text}</p>;
  }
  if (block.type === "bullets") {
    return (
      <ul className="list-disc pl-5 my-2 space-y-1">
        {block.items.map((it, i) => (
          <li key={i} className="text-[13.5px] leading-snug">
            {it}
          </li>
        ))}
      </ul>
    );
  }
  if (block.type === "callout") {
    return (
      <div
        className="my-3 rounded border-l-4 px-4 py-3 text-[13.5px]"
        style={{ ...parseStyle(CALLOUT[block.tone || "info"]), breakInside: "avoid" }}
      >
        {block.title && <span className="font-semibold">{block.title}. </span>}
        {block.text}
      </div>
    );
  }
  if (block.type === "table") {
    return (
      <table className="w-full border-collapse my-3 text-[13px]" style={{ breakInside: "avoid" }}>
        {block.columns?.length ? (
          <thead>
            <tr>
              {block.columns.map((c, i) => (
                <th
                  key={i}
                  className="text-left px-3 py-2 border-b border-gray-200 font-semibold"
                  style={{ background: "#EAF2F4" }}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {block.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 border-b border-gray-200 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return null;
}

function parseStyle(css: string): CSSProperties {
  const out: Record<string, string> = {};
  for (const rule of css.split(";")) {
    const [k, v] = rule.split(":");
    if (!k || !v) continue;
    const key = k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[key] = v.trim();
  }
  return out as CSSProperties;
}
