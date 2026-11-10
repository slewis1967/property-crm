"use client";

import { useRouter } from "next/navigation";
import { VideoRoomForRoom } from "../../components/VideoRoom";

/**
 * Client host for the standalone call page. Full-viewport call; on leave, sends
 * the user back to wherever they came from (or the dashboard).
 */
export default function CallClient({ room }: { room: string }) {
  const router = useRouter();
  return (
    <div style={{ position: "fixed", inset: 0, background: "#111" }}>
      <VideoRoomForRoom
        room={room}
        onLeave={() => {
          // Prefer going back; fall back to the dashboard.
          if (window.history.length > 1) router.back();
          else router.push("/");
        }}
      />
    </div>
  );
}
