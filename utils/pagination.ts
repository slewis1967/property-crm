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

export function coercePage(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

export interface PaginatedResponse<T> {
  rows: T[];
  page: number;
  pageSize: PageSize;
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
  pageSize: PageSize,
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
