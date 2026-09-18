// TEMPORARY latency probe — do not merge. Returns immediately so the
// round-trip time is pure platform overhead (edge -> server handler).
export const dynamic = "force-dynamic";
export function GET() {
  return new Response("next-ok", { headers: { "cache-control": "no-store" } });
}
