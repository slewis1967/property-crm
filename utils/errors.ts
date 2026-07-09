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
  return fallback;
}
