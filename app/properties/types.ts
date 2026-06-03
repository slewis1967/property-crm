/**
 * Property shape passed to the aggregator feed grid.
 *
 * The server component normalises Supabase's snake_case columns into
 * a stable camelCase shape (see app/properties/page.tsx). PropertyGrid
 * uses BOTH the normalised aliases and the raw Supabase column names
 * (e.g. brochure_url for images) — don't narrow this to a strict
 * type without auditing every access first.
 *
 * Field type is `any` intentionally: with 800+ lines of field access
 * patterns, a full type definition would be a long, brittle exercise.
 * The goal of this type is to surface a real type at the prop boundary
 * (so callers see what they're passing) while keeping the existing
 * `?.` and `|| ""` fallbacks that make the grid resilient to
 * partially-populated rows.
 */
export type PropertyGridItem = {
  id: string;
  // Supabase row + normalised aliases. Field access is loose because
  // the source is dynamic and columns come and go.
  [key: string]: any;
};
