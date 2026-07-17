/**
 * Narrow an unknown catch binding to a displayable message.
 *
 * `catch (e: any)` was repeated across routes and modals purely to reach
 * `e.message` — which is also unsound, since a thrown non-Error yields
 * `undefined` and the caller renders an empty string.
 */
export function errMessage(e: unknown, fallback = "unknown error"): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === "string" && e) return e;
  // Supabase / PostgREST errors are plain objects ({ message, details, hint,
  // code }), not Error instances — reach their message too rather than falling
  // through to the useless "unknown error".
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message?: unknown }).message;
    if (typeof m === "string" && m) return m;
  }
  return fallback;
}
