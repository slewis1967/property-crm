/**
 * Supabase returns at most 1000 rows per request (PostgREST default). Any
 * `.select()` without an explicit `.range()` that feeds an in-JS count or
 * aggregation is silently wrong the moment the table passes 1000 rows —
 * e.g. one all-contacts broadcast inserts thousands of sequence_enrollments
 * and every enrolment/lead chart would freeze at 1000.
 *
 * fetchAllRows pages through with .range() until a short page signals the
 * end. Pass a factory that applies .range(from, to) to a fresh query so it
 * can be re-issued per page.
 *
 *   const { data, error } = await fetchAllRows((from, to) =>
 *     supabase.from("property_leads").select("*")
 *       .order("created_at", { ascending: false })
 *       .range(from, to),
 *   );
 */
type PageResult<T> = { data: T[] | null; error: { message: string } | null };

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 1000,
): Promise<{ data: T[]; error: string | null }> {
  const all: T[] = [];
  // Hard ceiling so a pathological query can't loop forever / OOM the
  // function. 200k rows is far beyond any current table; if a real
  // dataset exceeds this the aggregation belongs in SQL, not JS.
  const MAX = 200_000;
  for (let from = 0; from < MAX; from += pageSize) {
    const { data, error } = await page(from, from + pageSize - 1);
    if (error) return { data: all, error: error.message };
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
  }
  return { data: all, error: null };
}
