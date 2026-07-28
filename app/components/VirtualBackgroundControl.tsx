"use client";

import { useEffect, useRef, useState } from "react";
import { useLocalParticipant } from "@livekit/components-react";
import type { LocalVideoTrack } from "livekit-client";
import { VirtualBackground, BackgroundBlur } from "@livekit/track-processors";
import backdrop from "../assets/video-background.jpg";

export type BackgroundMode = "brand" | "blur";

/** Matches the blur other conferencing tools use — enough to unread a room. */
const BLUR_RADIUS = 12;

/**
 * Virtual background for the local camera feed, in one of two modes.
 *
 * `"brand"` (staff) replaces whatever is behind the presenter with the
 * Springboard Homes office (app/assets/video-background.jpg). `"blur"` (guests)
 * just blurs their real room. Both run MediaPipe selfie segmentation through
 * @livekit/track-processors, entirely client-side on the outgoing camera track,
 * so remote participants (and any recording) see the processed feed.
 *
 * **Guests get blur, not the office, on purpose.** A borrower joining from their
 * kitchen against our branded wall reads as though they work here — and blur
 * still spares them showing their actual room. The mode is chosen by the page:
 * /join passes "blur", the authed /video page takes the "brand" default.
 *
 * In brand mode the signage sits RIGHT OF CENTRE on purpose: the presenter is
 * composited over the middle of the frame, so a centred logo just hides behind
 * their head and shoulders. Keep the centre of any replacement backdrop clear.
 *
 * Behaviour: ON by default the moment a camera track appears, with a toggle to
 * turn it off. Fails soft — on browsers/devices where segmentation isn't
 * supported (or the WASM assets can't load), the toggle shows "unavailable"
 * and the raw camera is used, so a call never breaks over branding.
 *
 * Must be rendered INSIDE <LiveKitRoom> (it reads room context).
 */
// IMPORTED, not served from public/ — and that's load-bearing. Everything under
// public/ is behind Cloudflare Access (`/logo.png`, `/manifest.json` and the old
// `/video-background.png` all 302 to the login page), while `/_next/*` is open.
// A guest on /join has no Access session, so a public/ backdrop failed to fetch
// for exactly the clients this is meant to impress, and they silently got their
// real room instead. Importing it emits the file under /_next/static/media/,
// which guests can actually load. JPEG, not PNG: a photo as PNG is ~1MB that
// every participant downloads before their camera can go live.
const BG_URL = backdrop.src;

export default function VirtualBackgroundControl({
  mode = "brand",
}: {
  mode?: BackgroundMode;
}) {
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
          await track.setProcessor(
            mode === "brand"
              ? VirtualBackground(BG_URL)
              : BackgroundBlur(BLUR_RADIUS),
          );
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
  }, [track, enabled, mode]);

  // Tell the stylesheet when the branded backdrop is live, so it can stop
  // LiveKit mirroring the local tile. LiveKit flips your own camera view
  // (rotateY(180deg)) to make it behave like a mirror — but the processor has
  // already composited the office wall into that same frame, so the flip
  // reversed the Springboard logo and its wording for whoever was looking at
  // their own tile. Brand mode only: blur has no wording to read backwards, and
  // with blur or a raw camera a mirrored self-view is the familiar, wanted
  // behaviour, so guests keep theirs.
  useEffect(() => {
    const root = document.documentElement;
    if (mode === "brand" && status === "on") {
      root.dataset.lkBrandedBg = "on";
    } else {
      delete root.dataset.lkBrandedBg;
    }
    return () => {
      delete root.dataset.lkBrandedBg;
    };
  }, [status, mode]);

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
        mode === "brand"
          ? enabled
            ? "Springboard office background is on — click to show your real background"
            : "Show the Springboard office background"
          : enabled
            ? "Your background is blurred — click to show your real background"
            : "Blur your background"
      }
    >
      {mode === "brand"
        ? enabled
          ? "🖼 Background: On"
          : "🖼 Background: Off"
        : enabled
          ? "🫧 Blur: On"
          : "🫧 Blur: Off"}
    </button>
  );
}
