// TEMPORARY latency probe — do not merge. Plain Netlify function on a path the
// Next proxy matcher EXCLUDES (_next/static), so no edge function runs.
export default async () => new Response("plain-noedge-ok", { headers: { "cache-control": "no-store" } });
export const config = { path: "/_next/static/zz-probe-noedge" };
