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

type Handler = (req: NextRequest, ctx?: any) => Promise<NextResponse>;

export function withObservability(
  label: string,
  handler: Handler,
): Handler {
  return async (req: NextRequest, ctx?: any) => {
    const start = performance.now();
    try {
      const res = await handler(req, ctx);
      const ms = Math.round(performance.now() - start);
      res.headers.set("x-response-time", `${ms}ms`);

      if (res.status >= 500) {
        console.error(`[${label}] ${res.status} ${ms}ms`);
      } else if (res.status >= 400) {
        console.warn(`[${label}] ${res.status} ${ms}ms`);
      }
      return res;
    } catch (err) {
      const ms = Math.round(performance.now() - start);
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[${label}] uncaught ${ms}ms — ${message}`);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500, headers: { "x-response-time": `${ms}ms` } },
      );
    }
  };
}