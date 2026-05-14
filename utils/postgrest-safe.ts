/**
 * Sanitize a value for safe interpolation inside a PostgREST `.or()` filter
 * (or any place where `,` `(` `)` `*` `\` `%` `_` would have special meaning).
 *
 * PostgREST parses `.or()` as a comma-separated list of clauses with paren
 * grouping; ilike's pattern uses `%` and `_` as wildcards. If user-supplied
 * text contains any of these, the filter either breaks or — worse — gets
 * additional clauses injected. Strip them to spaces before interpolating.
 *
 * Usage:
 *   const safe = orSafe(query);
 *   qb.or(`name.ilike.%${safe}%,email.ilike.%${safe}%`);
 */
export function orSafe(value: string | null | undefined): string {
  if (!value) return "";
  return value.replace(/[,()*\\%_]/g, " ").trim();
}
