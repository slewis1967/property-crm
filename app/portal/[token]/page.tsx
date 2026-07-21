import PortalClient from "./PortalClient";

// PUBLIC page — no auth. Reachable by a borrower once a Cloudflare Access
// BYPASS policy exists for /portal/* and /api/portal/*. No app chrome
// (AppShell renders /portal/* standalone), because the person opening this is a
// client on their phone, not a CRM user.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Upload your documents — Springboard Homes",
};

export default async function PortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <PortalClient token={token} />;
}
