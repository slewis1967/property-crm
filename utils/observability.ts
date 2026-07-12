/**
 * API route observability wrapper.
 *
 * Wraps a Next.js route handler with:
 *   - Timing (x-response-time header)
 *   - Structured error logging (route name, status, duration, error message)
 *   - Consistent JSON error responses
 *
 * Usage:
 *   export const GET = withObservability("GET /api/properties/compare", handler);
 */

import { NextRequest, NextResponse } from "next/server";
import { alertOps } from "./alert";

type Handler = (req: NextRequest, ctx?: unknown) => Promise<NextResponse>;

export function withObservability(
  label: string,
  handler: Handler,
): Handler {
  return async (req: NextRequest, ctx?: unknown) => {
    const start = performance.now();
    try {
      const res = await handler(req, ctx);
      const ms = Math.round(performance.now() - start);
      res.headers.set("x-response-time", `${ms}ms`);

      if (res.status >= 500) {
        console.error(`[${label}] ${res.status} ${ms}ms`);
        // A handler that RETURNS a 5xx (rather than throwing) is still a
        // genuine failure the operator should see. Deduped by route label so
        // one misbehaving route can't flood. Awaited so the escalation email
        // is in flight before the serverless function can freeze.
        await alertOps({
          event: "route.5xx",
          message: `${label} returned ${res.status}`,
          context: { label, status: res.status, ms },
          discriminator: label,
        });
      } else if (res.status >= 400) {
        console.warn(`[${label}] ${res.status} ${ms}ms`);
      }
      return res;
    } catch (err) {
      const ms = Math.round(performance.now() - start);
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[${label}] uncaught ${ms}ms — ${message}`);
      // Uncaught throw = definitively broken. Escalate (deduped by route label).
      await alertOps({
        event: "route.uncaught",
        message: `${label} threw: ${message}`,
        context: { label, ms, error: message },
        severity: "critical",
        discriminator: label,
      });
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500, headers: { "x-response-time": `${ms}ms` } },
      );
    }
  };
}