"use client";

import { useEffect, useState } from "react";
import "@livekit/components-styles";
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
} from "@livekit/components-react";
import { errMessage } from "../../utils/errors";

/**
 * Reusable LiveKit conference UI.
 *
 * Given a pre-minted, room-scoped token (from /api/livekit/token) and the
 * wss:// server URL, renders the full call experience (grid, screenshare,
 * device controls, chat). Self-contained: drop it into any page behind a
 * client boundary.
 *
 * `onLeave` fires when the user disconnects so the host page can close a modal
 * or route away.
 */
export default function VideoRoom({
  token,
  serverUrl,
  onLeave,
}: {
  token: string;
  serverUrl: string;
  onLeave?: () => void;
}) {
  return (
    <div style={{ height: "100%", width: "100%" }}>
      <LiveKitRoom
        token={token}
        serverUrl={serverUrl}
        connect
        video
        audio
        onDisconnected={onLeave}
        data-lk-theme="default"
        style={{ height: "100%" }}
      >
        <VideoConference />
        {/* Renders remote participant audio; VideoConference handles video. */}
        <RoomAudioRenderer />
      </LiveKitRoom>
    </div>
  );
}

/**
 * Convenience wrapper that fetches a token for a room from the CRM's own
 * endpoint and then renders <VideoRoom>. Handles the loading/error states so
 * pages don't have to. Used by app/video/[room]/CallClient.
 */
export function VideoRoomForRoom({
  room,
  displayName,
  onLeave,
}: {
  room: string;
  displayName?: string;
  onLeave?: () => void;
}) {
  const [state, setState] = useState<
    | { phase: "loading" }
    | { phase: "ready"; token: string; url: string }
    | { phase: "error"; error: string }
  >({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/livekit/token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ room, displayName }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || `Token request failed (${res.status})`);
        }
        if (!cancelled) {
          setState({ phase: "ready", token: data.token, url: data.url });
        }
      } catch (err) {
        if (!cancelled) setState({ phase: "error", error: errMessage(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [room, displayName]);

  if (state.phase === "loading") {
    return <div style={{ padding: 24 }}>Connecting to call…</div>;
  }
  if (state.phase === "error") {
    return (
      <div style={{ padding: 24, color: "#b91c1c" }}>
        Couldn’t start the call: {state.error}
      </div>
    );
  }
  return (
    <VideoRoom token={state.token} serverUrl={state.url} onLeave={onLeave} />
  );
}
