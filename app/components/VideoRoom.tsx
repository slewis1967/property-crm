"use client";

import { useEffect, useState } from "react";
import "@livekit/components-styles";
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
} from "@livekit/components-react";
import VirtualBackgroundControl, {
  type BackgroundMode,
} from "./VirtualBackgroundControl";
import PaPresenter from "./PaPresenter";
import PaAudience from "./PaAudience";
import { errMessage } from "../../utils/errors";

/**
 * Floating Record toggle. Calls the CRM's /api/livekit/record endpoint to
 * start/stop server-side recording (LiveKit egress). Only shown when a `room`
 * is known and `recordable` is set. Fails soft — if recording isn't configured
 * (egress not deployed) the endpoint 503s and we surface a short message.
 */
function RecordToggle({ room }: { room: string }) {
  const [state, setState] = useState<
    | { phase: "idle" }
    | { phase: "starting" }
    | { phase: "recording"; egressId: string }
    | { phase: "stopping"; egressId: string }
    | { phase: "error"; error: string }
  >({ phase: "idle" });

  async function start() {
    setState({ phase: "starting" });
    try {
      const res = await fetch("/api/livekit/record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ room, action: "start" }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Couldn't start");
      setState({ phase: "recording", egressId: data.egressId });
    } catch (err) {
      setState({ phase: "error", error: errMessage(err) });
    }
  }

  async function stop(egressId: string) {
    setState({ phase: "stopping", egressId });
    try {
      const res = await fetch("/api/livekit/record", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "stop", egressId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Couldn't stop");
      setState({ phase: "idle" });
    } catch (err) {
      setState({ phase: "error", error: errMessage(err) });
    }
  }

  const base: React.CSSProperties = {
    position: "absolute",
    top: 12,
    right: 12,
    zIndex: 10,
    padding: "6px 12px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    border: "none",
    cursor: "pointer",
    color: "#fff",
  };

  if (state.phase === "recording") {
    return (
      <button style={{ ...base, background: "#dc2626" }} onClick={() => stop(state.egressId)}>
        ⏺ Recording — Stop
      </button>
    );
  }
  if (state.phase === "starting" || state.phase === "stopping") {
    return <button style={{ ...base, background: "#6b7280" }} disabled>…</button>;
  }
  if (state.phase === "error") {
    return (
      <button style={{ ...base, background: "#6b7280" }} onClick={() => setState({ phase: "idle" })} title={state.error}>
        Recording unavailable
      </button>
    );
  }
  return (
    <button style={{ ...base, background: "rgba(0,0,0,0.55)" }} onClick={start}>
      ⏺ Record
    </button>
  );
}

/**
 * Reusable LiveKit conference UI.
 *
 * Given a pre-minted, room-scoped token (from /api/livekit/token) and the
 * wss:// server URL, renders the full call experience (grid, screenshare,
 * device controls, chat). Self-contained: drop it into any page behind a
 * client boundary.
 *
 * Pass `room` to show the Record toggle (server-side recording via egress).
 * `onLeave` fires when the user disconnects so the host page can close a modal
 * or route away.
 *
 * `room` and `guestToken` also decide which half of the Preliminary Assessment
 * presentation mounts: a page that knows the room name is the authed staff
 * page (the presenter), a page holding a guest link token is an applicant (the
 * audience). Never both, and neither on calls that have nothing to present.
 */
export default function VideoRoom({
  token,
  serverUrl,
  room,
  guestToken,
  onLeave,
  background = "brand",
}: {
  token: string;
  serverUrl: string;
  room?: string;
  /**
   * The signed guest link token, on the public /join page only. It is the
   * applicant's credential for the PA being presented (/join/<token>/pa), so
   * the audience overlay needs it; staff pages never pass one.
   */
  guestToken?: string;
  onLeave?: () => void;
  /**
   * What replaces the local camera's real background. Staff pages take the
   * "brand" default (the Springboard office); the public /join page passes
   * "blur", so a client joining from their kitchen isn't sat against our
   * branded wall looking like they work here.
   */
  background?: BackgroundMode;
}) {
  return (
    <div style={{ height: "100%", width: "100%", position: "relative" }}>
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
        {room && <RecordToggle room={room} />}
        {/* Springboard office backdrop for staff, blur for guests; on by
            default either way, with a top-left toggle. */}
        <VirtualBackgroundControl mode={background} />
        <VideoConference />
        {/* Preliminary Assessment presentation. Both render nothing until there
            is something to present, sit above the grid but stop short of the
            control bar, and leave RoomAudioRenderer alone, so nobody loses
            sound or their mute button while a document is on screen. */}
        {room && <PaPresenter room={room} />}
        {!room && guestToken && <PaAudience guestToken={guestToken} />}
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
    <VideoRoom
      token={state.token}
      serverUrl={state.url}
      room={room}
      onLeave={onLeave}
    />
  );
}
