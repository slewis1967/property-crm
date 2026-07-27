"use client";

import { useEffect, useRef, useState } from "react";
import { useLocalParticipant } from "@livekit/components-react";
import type { LocalVideoTrack } from "livekit-client";
import { VirtualBackground } from "@livekit/track-processors";

/**
 * Branded virtual background for the local camera feed.
 *
 * Replaces whatever is behind the presenter with a photographic office interior
 * carrying the Springboard Homes logo on the wall (public/video-background.jpg)
 * using MediaPipe selfie segmentation, wired through @livekit/track-processors.
 * The processing runs entirely client-side on the outgoing camera track, so
 * remote participants (and any recording) see the branded feed.
 *
 * The signage sits in the LEFT THIRD of the image on purpose: the presenter is
 * composited over the middle, so anything centred gets hidden behind their head
 * and shoulders. Keep the centre of any replacement backdrop clear.
 *
 * Behaviour: ON by default the moment a camera track appears, with a toggle to
 * turn it off. Fails soft — on browsers/devices where segmentation isn't
 * supported (or the WASM assets can't load), the toggle shows "unavailable"
 * and the raw camera is used, so a call never breaks over branding.
 *
 * Must be rendered INSIDE <LiveKitRoom> (it reads room context).
 */
// JPEG, not PNG: this is a photograph now, and the PNG of the same image was
// ~1MB that every participant downloads before their camera can go live.
const BG_URL = "/video-background.jpg";

export default function VirtualBackgroundControl() {
  const { cameraTrack } = useLocalParticipant();
  const [enabled, setEnabled] = useState(true);
  const [status, setStatus] = useState<
    "idle" | "working" | "on" | "off" | "error"
  >("idle");

  // The published camera track's underlying LocalVideoTrack (the thing we
  // attach the processor to). Undefined until the camera is live.
  const track = cameraTrack?.track as LocalVideoTrack | undefined;

  // Which track object we've already applied the processor to. Compared by
  // identity so that if LiveKit swaps the track (camera off → on, device
  // change) we re-apply to the new one when still enabled.
  const appliedTrack = useRef<LocalVideoTrack | null>(null);

  useEffect(() => {
    if (!track) return;
    let cancelled = false;

    (async () => {
      try {
        if (enabled && appliedTrack.current !== track) {
          setStatus("working");
          await track.setProcessor(VirtualBackground(BG_URL));
          if (cancelled) return;
          appliedTrack.current = track;
          setStatus("on");
        } else if (!enabled && appliedTrack.current === track) {
          setStatus("working");
          await track.stopProcessor();
          if (cancelled) return;
          appliedTrack.current = null;
          setStatus("off");
        }
      } catch (err) {
        // Unsupported browser / WASM load failure — leave the raw feed running.
        console.error("[VirtualBackground] could not apply processor:", err);
        if (!cancelled) setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [track, enabled]);

  // No camera track yet (camera disabled, still connecting) — nothing to toggle.
  if (!track) return null;

  const base: React.CSSProperties = {
    position: "absolute",
    top: 12,
    left: 12,
    zIndex: 10,
    padding: "6px 12px",
    borderRadius: 8,
    fontSize: 13,
    fontWeight: 600,
    border: "none",
    cursor: "pointer",
    color: "#fff",
  };

  if (status === "error") {
    return (
      <button
        style={{ ...base, background: "#6b7280", cursor: "default" }}
        disabled
        title="Your browser or device doesn't support virtual backgrounds — using the raw camera."
      >
        🖼 Background unavailable
      </button>
    );
  }

  if (status === "working") {
    return (
      <button style={{ ...base, background: "#6b7280" }} disabled>
        🖼 …
      </button>
    );
  }

  return (
    <button
      style={{
        ...base,
        background: enabled ? "#0F4C5C" : "rgba(0,0,0,0.55)",
      }}
      onClick={() => setEnabled((v) => !v)}
      title={
        enabled
          ? "NextKey branded background is on — click to show your real background"
          : "Show the NextKey branded background"
      }
    >
      {enabled ? "🖼 Background: On" : "🖼 Background: Off"}
    </button>
  );
}
