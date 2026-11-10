import SignClient from "./SignClient";

// PUBLIC page — no auth. Reachable by external signers once a Cloudflare Access
// BYPASS policy is added for /sign/* (see the PR notes). No app chrome is applied
// (AppShell renders /sign/* standalone).
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign your document — NextKey",
};

export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SignClient token={token} />;
}
