import JoinClient from "./JoinClient";

/**
 * Public guest-join page: /join/<guest-token>.
 *
 * Unwraps the signed guest token from the path and hands it to the client,
 * which redeems it at /api/livekit/guest-token for a LiveKit join token. No
 * CRM login required — but Cloudflare Access must have a bypass for `/join/*`
 * (and `/api/livekit/guest-token`) or external guests hit the Access wall.
 */
export default async function GuestJoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <JoinClient guestToken={decodeURIComponent(token)} />;
}
