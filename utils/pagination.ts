/**
 * Shared pagination utilities for the CRM list endpoints.
 *
 * The list views (properties, contacts, …) all started by loading every
 * row into the browser — fine at 50 rows, but 7k+ contacts and 200+
 * stock rows bloats the RSC payload and tips cold-starts past Netlify's
 * 10s function budget.
 *
 * Both endpoints now:
 *   1. Return the first page in the initial server render (fast first paint)
 *   2. Accept ?page=N&pageSize=M for the "Load more" calls
 *   3. Return the total count so the UI can show "Showing X of Y"
 *
 * Page sizes are pinned to a known set (25/50/75/100) so the user can
 * choose granularity without us exposing arbitrary cap values.
 */

export const ALLOWED_PAGE_SIZES = [25, 50, 75, 100] as const;
export type PageSize = (typeof ALLOWED_PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 50;

export function coercePageSize(raw: unknown): PageSize {
  const n = Number(raw);
  if (ALLOWED_PAGE_SIZES.includes(n as PageSize)) return n as PageSize;
  return DEFAULT_PAGE_SIZE;
}

/**
 * The Aggregator Feed wants its "Show N per page" dropdown to scale with
 * the live stock count rather than the fixed 25/50/75/100 the contacts
 * list uses — so the increments below are properties-specific.
 *
 * Increment is 50, and the final option is the exact total so the user
 * can load every active row in one go. A cap keeps a runaway stock pool
 * from generating an absurd dropdown / hammering Supabase in one range.
 */
export const PROPERTIES_PAGE_SIZE_STEP = 50;
export const MAX_PROPERTIES_PAGE_SIZE = 1000;

/**
 * Build the dropdown options for the properties feed: 50, 100, 150 … up
 * to (and including) `total`. The last option equals `total` so it reads
 * as "show everything"; everything is clamped to MAX_PROPERTIES_PAGE_SIZE.
 * Always returns at least one option (the step) so the <select> is never
 * empty, even when the feed is empty.
 */
export function propertyPageSizeOptions(total: number): number[] {
  const step = PROPERTIES_PAGE_SIZE_STEP;
  const max = Math.min(
    Math.max(Number.isFinite(total) ? Math.floor(total) : 0, step),
    MAX_PROPERTIES_PAGE_SIZE,
  );
  const opts: number[] = [];
  for (let n = step; n < max; n += step) opts.push(n);
  opts.push(max); // exact total (or the cap) as the final "show all" option
  return opts;
}

/**
 * Coerce a properties pageSize from the URL: any positive integer,
 * clamped to [1, MAX_PROPERTIES_PAGE_SIZE]. Unlike coercePageSize this
 * isn't pinned to a fixed set, because the dropdown is now data-driven
 * (50, 100, 150 … total). Garbage falls back to DEFAULT_PAGE_SIZE.
 */
export function coercePropertiesPageSize(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(Math.floor(n), MAX_PROPERTIES_PAGE_SIZE);
}

export function coercePage(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

export interface PaginatedResponse<T> {
  rows: T[];
  page: number;
  /** Either a pinned PageSize (contacts) or a data-driven properties size. */
  pageSize: number;
  /** Total matching rows in the database (cheap to fetch with `count: exact`). */
  total: number;
  /** True if there are more pages after this one. */
  hasMore: boolean;
}

/**
 * Build the standard pagination metadata block from the request inputs
 * and the total count returned by Supabase. `rows.length` is the actual
 * row count, which may be less than pageSize on the final page.
 */
export function paginate<T>(
  rows: T[],
  page: number,
  pageSize: number,
  total: number,
): PaginatedResponse<T> {
  return {
    rows,
    page,
    pageSize,
    total,
    hasMore: page * pageSize < total,
  };
}
