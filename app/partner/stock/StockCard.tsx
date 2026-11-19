/**
 * One masked lot as a card: illustrated cover (no photos: stock is masked),
 * availability, "New" chip, facts, price and, where the plan shows it, the
 * partner's own fee. Server-safe so the dashboard and the stock browser share it.
 */
import Link from "next/link";
import { formatAud, type PartnerLot } from "../../../utils/partner";
import { Icon, LotCover, accentTint } from "../ui";

export function AvailabilityBadge({ availability, onDark = false }: { availability: PartnerLot["availability"]; onDark?: boolean }) {
  const label = availability === "available" ? "Available" : availability === "on_hold" ? "On hold" : "No longer available";
  const dot = availability === "available" ? "bg-emerald-500" : availability === "on_hold" ? "bg-amber-500" : "bg-slate-400";
  const style = onDark
    ? "pp-keep-light bg-white/95 text-slate-800 shadow-sm"
    : availability === "available"
      ? "bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200"
      : availability === "on_hold"
        ? "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200"
        : "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200";
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${style}`} style={onDark ? { background: "rgba(255,255,255,.95)" } : undefined}>
      <span className="relative flex h-1.5 w-1.5">
        {availability === "available" && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${dot}`} />}
        <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${dot}`} />
      </span>
      {label}
    </span>
  );
}

/** Beds / baths / car / study / land / home as icon chips. */
export function LotFactRow({ lot, large = false }: { lot: PartnerLot; large?: boolean }) {
  const facts: { icon: "bed" | "bath" | "car" | "land" | "home" | "study"; text: string; title: string }[] = [];
  if (lot.bedrooms) facts.push({ icon: "bed", text: String(lot.bedrooms), title: "Bedrooms" });
  if (lot.bathrooms) facts.push({ icon: "bath", text: String(lot.bathrooms), title: "Bathrooms" });
  if (lot.carSpaces) facts.push({ icon: "car", text: String(lot.carSpaces), title: "Car spaces" });
  if (lot.study) facts.push({ icon: "study", text: "Study", title: "Study" });
  if (lot.landSizeSqm) facts.push({ icon: "land", text: `${Math.round(lot.landSizeSqm)} m²`, title: "Land" });
  if (lot.houseSizeSqm) facts.push({ icon: "home", text: `${Math.round(lot.houseSizeSqm)} m²`, title: "Home" });
  if (!facts.length) return <div className="text-sm text-slate-500">Details on request</div>;
  return (
    <div className={`flex flex-wrap gap-x-4 gap-y-2 ${large ? "text-base" : "text-sm"} text-slate-700`}>
      {facts.map((f) => (
        <span key={f.title} className="inline-flex items-center gap-1.5" title={f.title}>
          <Icon name={f.icon} className={`${large ? "h-5 w-5" : "h-4 w-4"} text-slate-400`} />
          <span className="font-medium">{f.text}</span>
        </span>
      ))}
    </div>
  );
}

export default function StockCard({
  lot,
  showFees,
  isNew = false,
  compact = false,
}: {
  lot: PartnerLot;
  showFees: boolean;
  isNew?: boolean;
  compact?: boolean;
}) {
  return (
    <Link
      href={`/partner/stock/${lot.id}`}
      className="pp-lift group flex flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-8px_rgba(15,23,42,0.08)]"
    >
      <LotCover propertyType={lot.propertyType} seed={lot.ref} className={compact ? "h-28" : "h-36"}>
        <div className="flex h-full flex-col justify-between p-3.5" style={{ background: "linear-gradient(90deg, rgba(0,0,0,.28) 0%, rgba(0,0,0,.08) 55%, transparent 80%)" }}>
          <div className="flex items-start justify-between gap-2">
            <span className="flex flex-wrap gap-1.5">
              <span className="pp-glass rounded-full px-2.5 py-0.5 text-[11px] font-medium text-white">{lot.propertyType ?? "New build"}</span>
              {isNew && (
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-900" style={{ background: "var(--accent)" }}>
                  New
                </span>
              )}
            </span>
            <AvailabilityBadge availability={lot.availability} onDark />
          </div>
          <div className="flex items-center gap-1.5 text-white transition group-hover:translate-x-0.5">
            <Icon name="pin" className="h-4 w-4 opacity-80" />
            <span className="text-lg font-semibold leading-tight drop-shadow-sm">
              {[lot.suburb, lot.state].filter(Boolean).join(", ") || "Location on request"}
            </span>
          </div>
        </div>
      </LotCover>
      <div className="flex flex-1 flex-col p-4">
        <LotFactRow lot={lot} />
        <div className="mt-auto flex items-end justify-between gap-3 border-t border-slate-100 pt-3.5">
          <div>
            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{lot.ref}</div>
            <div className="text-xl font-bold tracking-tight text-slate-900">{lot.price ? formatAud(lot.price) : "Price on request"}</div>
          </div>
          {showFees ? (
            <div className="rounded-xl px-2.5 py-1.5 text-right" style={{ background: accentTint(14) }}>
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Your fee</div>
              <div className="text-sm font-bold text-slate-900">{lot.referralFee ? formatAud(lot.referralFee) : "Ask us"}</div>
            </div>
          ) : (
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-500 transition group-hover:bg-[var(--accent)] group-hover:text-slate-900">
              <Icon name="arrow-right" className="h-4 w-4" />
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
