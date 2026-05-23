/**
 * Startup environment validation.
 *
 * Next.js calls `register()` on server start. We check that the critical
 * env vars are set BEFORE any route is served — a missing key surfaces as
 * a clear startup error instead of a cryptic runtime failure deep in a
 * voice-assistant or compliance-review call.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("./utils/validate-env");
    validateEnv();
  }
}