import CallClient from "./CallClient";

/**
 * Standalone call room: /video/<room>.
 *
 * A thin server component that unwraps the dynamic [room] segment and hands it
 * to the client call UI. Auth + token minting happen client-side against
 * /api/livekit/token (which enforces Cloudflare Access), so this page itself
 * carries no secrets and works as a shareable link for any authorised user.
 */
export default async function VideoRoomPage({
  params,
}: {
  params: Promise<{ room: string }>;
}) {
  const { room } = await params;
  return <CallClient room={decodeURIComponent(room)} />;
}
