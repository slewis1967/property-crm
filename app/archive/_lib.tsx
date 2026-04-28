import { ReactNode } from "react";

/** Format a Date / ISO string / null for compact AU display. */
export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.valueOf())) return "—";
  return date.toLocaleDateString("en-AU", { year: "2-digit", month: "short", day: "numeric" });
}

/** Format with date+time. */
export function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.valueOf())) return "—";
  return date.toLocaleString("en-AU", {
    year: "2-digit",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtCurrency(n: number | null | undefined): string {
  if (n === null || n === undefined || !isFinite(n)) return "—";
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function truncate(s: string | null | undefined, len = 80): string {
  if (!s) return "—";
  return s.length > len ? s.slice(0, len) + "…" : s;
}

/** Standard archive-page header. */
export function ArchiveHeader({
  title,
  total,
  description,
}: {
  title: string;
  total: number;
  description?: string;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-baseline gap-3">
        <h1 className="text-3xl font-bold">{title}</h1>
        <span className="text-sm text-gray-500">
          {total.toLocaleString()} {total === 1 ? "record" : "records"}
        </span>
      </div>
      {description && <p className="text-gray-500 text-sm mt-1">{description}</p>}
    </div>
  );
}

/** Common search bar (uses URL param `q`). */
export function SearchBar({ q, placeholder }: { q: string; placeholder: string }) {
  return (
    <form method="get" className="mb-4">
      <input
        type="search"
        name="q"
        defaultValue={q}
        placeholder={placeholder}
        className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </form>
  );
}

/** Pagination controls — keep simple URL-driven approach. */
export function Pager({
  page,
  pageSize,
  total,
  baseHref,
  q,
}: {
  page: number;
  pageSize: number;
  total: number;
  baseHref: string;
  q: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const prev = Math.max(1, page - 1);
  const next = Math.min(totalPages, page + 1);
  const qParam = q ? `&q=${encodeURIComponent(q)}` : "";
  const link = (p: number) => `${baseHref}?page=${p}${qParam}`;

  return (
    <div className="flex items-center justify-between mt-4 text-sm">
      <div className="text-gray-500">
        Page {page} of {totalPages} — {total.toLocaleString()} total
      </div>
      <div className="flex gap-2">
        {page > 1 && (
          <a href={link(prev)} className="px-3 py-1 border border-gray-200 rounded hover:bg-gray-50">
            ← Prev
          </a>
        )}
        {page < totalPages && (
          <a href={link(next)} className="px-3 py-1 border border-gray-200 rounded hover:bg-gray-50">
            Next →
          </a>
        )}
      </div>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
      <p className="text-gray-400">{children}</p>
    </div>
  );
}
