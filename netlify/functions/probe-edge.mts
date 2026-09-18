// TEMPORARY latency probe — do not merge. Plain Netlify function on a path the
// Next proxy edge function DOES match.
export default async () => new Response("plain-ok", { headers: { "cache-control": "no-store" } });
export const config = { path: "/api/cron/probe-plain" };
