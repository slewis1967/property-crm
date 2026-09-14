import ShortlistClient from "./ShortlistClient";

// PUBLIC page — no auth. Reachable by a client once a Cloudflare Access BYPASS
// app exists for /shortlist/* and /api/shortlist/*. No app chrome (AppShell
// renders /shortlist/* standalone). All data comes through the token-scoped API.
export const dynamic = "force-dynamic";

export default async function ShortlistPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <ShortlistClient token={token} />;
}
