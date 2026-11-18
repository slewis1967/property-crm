/**
 * Shared look for the partner portal.
 *
 * Every colour that carries the firm's identity comes from the two CSS custom
 * properties PortalShell sets (--brand, --accent), so a white-labelled firm
 * gets the same design in its own colours with no per-page branding code.
 *
 * Stock is masked (no photos: images can show signage or a builder's name),
 * so lots get an illustrated cover instead: a brand-coloured gradient with a
 * line drawing of the property type. Nothing in it is specific to the lot.
 *
 * Server-safe: no hooks, no "use client", so pages and client components can
 * both import it.
 */
import Link from "next/link";

export const BRAND = "var(--brand)";
export const ACCENT = "var(--accent)";
/** A soft tint of the brand colour, for backgrounds. */
export const brandTint = (pct: number) => `color-mix(in srgb, var(--brand) ${pct}%, white)`;
export const accentTint = (pct: number) => `color-mix(in srgb, var(--accent) ${pct}%, white)`;

/* ------------------------------------------------------------------ icons */

type IconName =
  | "bed" | "bath" | "car" | "land" | "home" | "pin" | "study" | "arrow-left" | "arrow-right"
  | "search" | "users" | "handshake" | "chart" | "doc" | "layers" | "grid" | "check" | "star"
  | "clock" | "message" | "printer" | "lock" | "sparkle" | "logout" | "map";

const PATHS: Record<IconName, React.ReactNode> = {
  bed: <><path d="M3 18v-7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v7" /><path d="M3 15h18M3 18v2M21 18v2" /><path d="M7 9V7a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2" /></>,
  bath: <><path d="M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4z" /><path d="M6 12V6a2 2 0 0 1 3.5-1.3" /><path d="M7 19l-1 2M17 19l1 2" /></>,
  car: <><path d="M5 16V12l2-5h10l2 5v4" /><path d="M3 16h18v2H3z" /><circle cx="7.5" cy="13.5" r=".8" /><circle cx="16.5" cy="13.5" r=".8" /></>,
  land: <><path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3z" /><path d="M9 4v13M15 7v13" /></>,
  home: <><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></>,
  pin: <><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  study: <><path d="M4 19V6a2 2 0 0 1 2-2h12v15H6a2 2 0 0 0-2 2" /><path d="M8 8h6" /></>,
  "arrow-left": <path d="M19 12H5M11 6l-6 6 6 6" />,
  "arrow-right": <path d="M5 12h14M13 6l6 6-6 6" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4-4" /></>,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14a6.5 6.5 0 0 1 3.5 6" /></>,
  handshake: <><path d="M2 11l4-4 4 2 3-2 3 1 6 4" /><path d="M6 13l4 4a1.5 1.5 0 0 0 2-2l-2-2M12 15l1.5 1.5a1.5 1.5 0 0 0 2-2L13 12" /><path d="M15 15.5a1.5 1.5 0 0 0 2-2l-1.5-1.5" /></>,
  chart: <><path d="M4 20V4M4 20h16" /><path d="M8 16v-4M12 16V8M16 16v-6" /></>,
  doc: <><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></>,
  layers: <><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></>,
  grid: <><rect x="4" y="4" width="7" height="7" rx="1.5" /><rect x="13" y="4" width="7" height="7" rx="1.5" /><rect x="4" y="13" width="7" height="7" rx="1.5" /><rect x="13" y="13" width="7" height="7" rx="1.5" /></>,
  map: <><path d="M9 4 3 6.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z" /><path d="M9 4v13.5M15 6.5V20" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  star: <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  message: <path d="M4 5h16v11H9l-5 4z" />,
  printer: <><path d="M7 9V3h10v6" /><rect x="3" y="9" width="18" height="8" rx="2" /><path d="M7 14h10v7H7z" /></>,
  lock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" />,
  logout: <><path d="M15 4h4v16h-4" /><path d="M10 8l-4 4 4 4M6 12h10" /></>,
};

export function Icon({ name, className = "h-4 w-4", strokeWidth = 1.8 }: { name: IconName; className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}

/* ----------------------------------------------------------------- layout */

/** The heading block at the top of every page: optional back link, eyebrow, title, subtitle, actions. */
export function PageHeader({
  title,
  eyebrow,
  subtitle,
  back,
  actions,
  icon,
}: {
  title: React.ReactNode;
  eyebrow?: React.ReactNode;
  subtitle?: React.ReactNode;
  back?: { href: string; label: string };
  actions?: React.ReactNode;
  icon?: IconName;
}) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-900">
          <Icon name="arrow-left" className="h-4 w-4" />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-start gap-4">
          {icon && (
            <span
              className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm sm:flex"
              style={{ background: `linear-gradient(135deg, ${BRAND}, color-mix(in srgb, var(--brand) 70%, white))` }}
            >
              <Icon name={icon} className="h-6 w-6" />
            </span>
          )}
          <div>
            {eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: ACCENT }}>{eyebrow}</div>}
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-[1.75rem]">{title}</h1>
            {subtitle && <div className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-600">{subtitle}</div>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({ children, className = "", padded = true }: { children: React.ReactNode; className?: string; padded?: boolean }) {
  return (
    <div className={`rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-8px_rgba(15,23,42,0.08)] ${padded ? "p-5 sm:p-6" : ""} ${className}`}>
      {children}
    </div>
  );
}

export function CardTitle({ children, icon, aside }: { children: React.ReactNode; icon?: IconName; aside?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-[0.95rem] font-semibold text-slate-900">
        {icon && (
          <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: brandTint(9), color: BRAND }}>
            <Icon name={icon} className="h-4 w-4" />
          </span>
        )}
        {children}
      </h2>
      {aside}
    </div>
  );
}

export function StatTile({ label, value, icon, hint, tone = "brand" }: { label: string; value: React.ReactNode; icon: IconName; hint?: string; tone?: "brand" | "accent" }) {
  const color = tone === "brand" ? BRAND : ACCENT;
  return (
    <Card className="flex items-center gap-4" padded={false}>
      <div className="flex w-full items-center gap-4 p-4 sm:p-5">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: tone === "brand" ? brandTint(9) : accentTint(16), color }}>
          <Icon name={icon} className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
          <div className="truncate text-xl font-semibold text-slate-900">{value}</div>
          {hint && <div className="text-xs text-slate-500">{hint}</div>}
        </div>
      </div>
    </Card>
  );
}

export function EmptyState({ icon, title, children }: { icon: IconName; title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 px-6 py-12 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl" style={{ background: brandTint(8), color: BRAND }}>
        <Icon name={icon} className="h-7 w-7" />
      </span>
      <div className="mt-4 font-semibold text-slate-900">{title}</div>
      {children && <div className="mx-auto mt-1 max-w-md text-sm text-slate-600">{children}</div>}
    </div>
  );
}

/** Primary call to action, in the firm's accent colour. */
export const buttonPrimary =
  "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:brightness-105 hover:shadow disabled:opacity-50 bg-[var(--accent)]";
export const buttonSecondary =
  "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-slate-400 hover:text-slate-900 disabled:opacity-50";
export const inputClass =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-[var(--brand)] focus:outline-none focus:ring-4 focus:ring-[color-mix(in_srgb,var(--brand)_12%,transparent)]";

/** Table wrapper + header cell styles shared by the list pages. */
export const tableWrap = "overflow-x-auto rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-8px_rgba(15,23,42,0.08)]";
export const th = "px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500";
export const td = "px-5 py-3.5";
export const tr = "border-t border-slate-100 transition hover:bg-slate-50/70";

/* ------------------------------------------------------------ deal stages */

const STAGE_TONES: Record<string, string> = {
  requested: "bg-sky-50 text-sky-800 ring-sky-200",
  hold: "bg-amber-50 text-amber-800 ring-amber-200",
  eoi: "bg-violet-50 text-violet-800 ring-violet-200",
  unconditional: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  settled: "bg-emerald-50 text-emerald-800 ring-emerald-200",
};

export function StagePill({ stage, label }: { stage: string; label: string }) {
  const tone = STAGE_TONES[stage] ?? "bg-slate-100 text-slate-600 ring-slate-200";
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${tone}`}>{label}</span>;
}

/** Initials for an avatar circle. */
export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "·";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/* -------------------------------------------------------------- lot cover */

type CoverKind = "house" | "townhouse" | "apartment" | "land" | "duplex";

export function coverKind(propertyType: string | null | undefined): CoverKind {
  const t = (propertyType ?? "").toLowerCase();
  if (/apart|unit|flat/.test(t)) return "apartment";
  if (/town|terrace|villa/.test(t)) return "townhouse";
  if (/dual|duplex|dual-occ|dual occ/.test(t)) return "duplex";
  if (/^land$|land only|vacant/.test(t)) return "land";
  return "house";
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const DRAWINGS: Record<CoverKind, React.ReactNode> = {
  house: (
    <>
      <path d="M70 92V62l40-30 40 30v30" />
      <path d="M62 66l48-36 48 36" />
      <path d="M100 92V72h20v20" />
      <rect x="78" y="66" width="14" height="12" rx="1" />
      <rect x="128" y="66" width="14" height="12" rx="1" />
      <path d="M134 40v-12h8v18" />
    </>
  ),
  townhouse: (
    <>
      <path d="M40 92V54l24-18 24 18v38M88 92V54l24-18 24 18v38M136 92V54l24-18 24 18v38" />
      <path d="M58 92V78h12v14M106 92V78h12v14M154 92V78h12v14" />
      <rect x="57" y="56" width="14" height="10" rx="1" /><rect x="105" y="56" width="14" height="10" rx="1" /><rect x="153" y="56" width="14" height="10" rx="1" />
    </>
  ),
  apartment: (
    <>
      <path d="M82 92V22h56v70" />
      <path d="M138 92V46h30v46M52 92V56h30" />
      <path d="M92 32h10M118 32h10M92 46h10M118 46h10M92 60h10M118 60h10M92 74h10M118 74h10" />
      <path d="M146 58h14M146 70h14M60 66h14M60 78h14" />
      <path d="M104 92V82h12v10" />
    </>
  ),
  duplex: (
    <>
      <path d="M48 92V60l36-26 36 26M120 60l36-26 36 26v32M48 92h144" />
      <path d="M120 60v32" />
      <path d="M74 92V76h14v14M146 92V76h14v14" />
      <rect x="96" y="64" width="14" height="10" rx="1" /><rect x="130" y="64" width="14" height="10" rx="1" />
    </>
  ),
  land: (
    <>
      <path d="M10 92c30-22 60-26 100-14s70 4 100-12" />
      <path d="M10 80c40-16 70-14 110-4" opacity=".55" />
      <path d="M118 74V40" />
      <path d="M118 40l18 6-18 6" />
      <path d="M60 86l6-6 6 6M160 74l5-5 5 5" opacity=".7" />
    </>
  ),
};

/**
 * Illustrated header for a lot. `seed` (the lot ref) only nudges the sun and
 * hills so a grid of cards doesn't look stamped; it reveals nothing.
 */
export function LotCover({
  propertyType,
  seed,
  className = "h-32",
  children,
}: {
  propertyType: string | null | undefined;
  seed: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const kind = coverKind(propertyType);
  const h = hash(seed);
  const sunX = 170 + (h % 120);
  const sunY = 18 + ((h >> 4) % 18);
  const angle = 120 + ((h >> 8) % 40);
  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{
        background: `linear-gradient(${angle}deg, color-mix(in srgb, var(--brand) 92%, black) 0%, var(--brand) 45%, color-mix(in srgb, var(--brand) 72%, white) 100%)`,
      }}
    >
      <svg viewBox="0 0 320 100" preserveAspectRatio="xMaxYMax meet" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <circle cx={sunX} cy={sunY} r="11" fill="var(--accent)" opacity=".85" />
        <circle cx={sunX} cy={sunY} r="22" fill="var(--accent)" opacity=".18" />
        <path d={`M-900 100V${86 + (h % 6)}h900c60-${8 + (h % 8)} 120-${4 + (h % 6)} 180 2s100 0 140-8V100z`} fill="white" opacity=".07" />
        <g transform="translate(176 22) scale(.7)" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" opacity=".55">
          {DRAWINGS[kind]}
        </g>
      </svg>
      {children && <div className="relative h-full">{children}</div>}
    </div>
  );
}
