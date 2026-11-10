/**
 * Feed ordering helpers for the Aggregator Feed.
 *
 * Problem this solves: the feed is sorted newest-first, so a bulk import of one
 * builder's stock (e.g. 200+ rows added the same day) floods the first pages and
 * buries every other builder — they look "missing" even though they're active.
 *
 * `interleaveByBuilder` round-robins rows across builders: one property from each
 * builder, then the next from each, and so on. The first page therefore shows a
 * spread of builders instead of a wall of one. Within a builder, the incoming
 * order (created_at desc) is preserved, so each builder still leads with its
 * newest stock.
 */
export function interleaveByBuilder<T extends { builder_name?: string | null }>(
  rows: T[],
): T[] {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    const key = (r.builder_name ?? "∅").toString();
    let g = groups.get(key);
    if (!g) {
      g = [];
      groups.set(key, g);
    }
    g.push(r);
  }
  const lists = Array.from(groups.values());
  const out: T[] = [];
  let i = 0;
  let addedAny = true;
  while (addedAny) {
    addedAny = false;
    for (const list of lists) {
      if (i < list.length) {
        out.push(list[i]);
        addedAny = true;
      }
    }
    i++;
  }
  return out;
}
