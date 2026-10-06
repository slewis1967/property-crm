"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  VideoTrack,
  isTrackReference,
  useRoomContext,
  useTracks,
} from "@livekit/components-react";
import { RoomEvent, Track, type RemoteParticipant } from "livekit-client";
import PaPdfPage, { useControlBarInset } from "./PaPdfPage";
import {
  PA_TOPIC,
  parsePaRoomMessage,
  safeYlaVideoUrl,
} from "../../utils/preliminary-assessments";
import { clampPage, isPresenterIdentity } from "../../utils/pa-presentation";

/**
 * Applicant side of a Preliminary Assessment presentation.
 *
 * Does nothing until the rep presents. Then it covers the video grid with the
 * document, on whatever page the rep is on; and when the rep finishes, with a
 * card that sends the applicants to Your Loan Assist's presentation and lets
 * them say when they have watched it.
 *
 * Two trust rules, both deliberate:
 *
 * 1. A room message is only obeyed if its sender is NOT a guest. Applicants can
 *    publish data (chat needs it), so a message on our topic proves nothing by
 *    itself; the sender identity is assigned by our token route and cannot be
 *    chosen by the browser. See isPresenterIdentity().
 *
 * 2. The room message only says WHICH STEP. Everything of substance comes from
 *    the server over the guest link: the PDF bytes, and above all the video
 *    link. A link taken from a room message would let anyone who can publish
 *    data put a button on an applicant's phone pointing wherever they like.
 *
 * YLA's presentation sits behind an emailed code on YLA's own site, so it
 * cannot be embedded here and we cannot tell whether it was watched. That is
 * why this is a button to a new tab plus an honest "we've finished" button,
 * with the call left running underneath.
 *
 * Must be rendered INSIDE <LiveKitRoom>.
 */

/** The rep re-sends every 2s; four missed in a row means they have gone. */
const PRESENTER_SILENCE_MS = 8_000;
/** Do not hammer the file route if it is failing; try again on a later message. */
const FILE_RETRY_MS = 5_000;

// Springboard's colours: this screen is the applicants', and Springboard is the
// only name they know us by.
const NAVY = "#020e40";
const AMBER = "#c7894e";

type Step =
  | { type: "pa"; paId: string; page: number; pageCount: number; presenter: string }
  | { type: "video"; paId: string; presenter: string };

type VideoInfo = { paId: string; videoUrl: string | null; sent: boolean };

type Confirm =
  | { kind: "none" }
  | { kind: "sending" }
  | { kind: "done"; sent: boolean }
  | { kind: "error" };

export default function PaAudience({ guestToken }: { guestToken: string }) {
  const lkRoom = useRoomContext();
  const base = useMemo(() => `/join/${encodeURIComponent(guestToken)}/pa`, [guestToken]);

  const [step, setStep] = useState<Step | null>(null);
  const [bytes, setBytes] = useState<{ paId: string; data: Uint8Array } | null>(null);
  const [fileFailed, setFileFailed] = useState(false);
  const [renderFailed, setRenderFailed] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [video, setVideo] = useState<VideoInfo | null>(null);
  const [confirm, setConfirm] = useState<Confirm>({ kind: "none" });
  const [retryTick, setRetryTick] = useState(0);

  const lastHeard = useRef(0);
  // The applicant pressed "Back to the call" on the finished card. The rep's
  // screen keeps re-sending the video step, so remember not to reopen it.
  const dismissed = useRef<string | null>(null);
  const fileState = useRef<{ paId: string; status: "loading" | "ready" | "failed"; at: number } | null>(null);

  const anchorRef = useRef<HTMLDivElement | null>(null);
  const bottomInset = useControlBarInset(anchorRef);

  /* ── Listen to the rep ────────────────────────────────────────────────── */

  useEffect(() => {
    const onData = (
      payload: Uint8Array,
      participant?: RemoteParticipant,
      _kind?: unknown,
      topic?: string,
    ) => {
      if (topic !== PA_TOPIC) return;
      const sender = participant?.identity;
      if (!isPresenterIdentity(sender)) return;

      let raw: unknown;
      try {
        raw = JSON.parse(new TextDecoder().decode(payload));
      } catch {
        return;
      }
      const msg = parsePaRoomMessage(raw);
      if (!msg) return;

      lastHeard.current = Date.now();
      if (msg.type === "idle") {
        dismissed.current = null;
        setStep(null);
        return;
      }
      if (msg.type === "video") {
        if (dismissed.current === msg.paId) return;
        setStep((prev) =>
          prev?.type === "video" && prev.paId === msg.paId && prev.presenter === sender
            ? prev
            : { type: "video", paId: msg.paId, presenter: sender as string },
        );
        return;
      }
      dismissed.current = null;
      setStep((prev) =>
        prev?.type === "pa" &&
        prev.paId === msg.paId &&
        prev.page === msg.page &&
        prev.pageCount === msg.pageCount &&
        prev.presenter === sender
          ? prev
          : { type: "pa", paId: msg.paId, page: msg.page, pageCount: msg.pageCount, presenter: sender as string },
      );
    };
    lkRoom.on(RoomEvent.DataReceived, onData);
    return () => {
      lkRoom.off(RoomEvent.DataReceived, onData);
    };
  }, [lkRoom]);

  // The rep left, lost their connection, or closed the tab mid-document: go
  // back to the call instead of leaving a page up that nobody is turning. Only
  // the document step times out. The video card stays, because the applicants
  // may be away in the other tab for ten minutes with the rep on mute.
  const stepType = step?.type ?? null;
  useEffect(() => {
    if (stepType !== "pa") return;
    const timer = window.setInterval(() => {
      if (Date.now() - lastHeard.current > PRESENTER_SILENCE_MS) setStep(null);
      // A failed download is retried from here rather than from the rep's
      // messages: those only change state on a page turn, and a rep may sit on
      // page 1 for minutes.
      const file = fileState.current;
      if (file?.status === "failed" && Date.now() - file.at >= FILE_RETRY_MS) setRetryTick((n) => n + 1);
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [stepType]);

  /* ── The document ─────────────────────────────────────────────────────── */

  const paId = step?.paId ?? null;

  useEffect(() => {
    if (stepType !== "pa" || !paId) return;
    const cur = fileState.current;
    if (cur && cur.paId === paId) {
      if (cur.status !== "failed") return;
      if (Date.now() - cur.at < FILE_RETRY_MS) return;
    }
    fileState.current = { paId, status: "loading", at: Date.now() };

    (async () => {
      try {
        const res = await fetch(`${base}/file`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = new Uint8Array(await res.arrayBuffer());
        fileState.current = { paId, status: "ready", at: Date.now() };
        setBytes({ paId, data });
        setFileFailed(false);
        setRenderFailed(false);
      } catch {
        fileState.current = { paId, status: "failed", at: Date.now() };
        setFileFailed(true);
      }
    })();
    // No cancel flag on purpose: the download is keyed by PA, and a re-run of
    // this effect must not throw away a file that is half way down a 3G link.
  }, [stepType, paId, retryTick, base]);

  /* ── The video step ───────────────────────────────────────────────────── */

  useEffect(() => {
    if (stepType !== "video" || !paId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(base, { cache: "no-store" });
        const data = await res.json();
        if (cancelled || !res.ok || !data.ok) return;
        setVideo({
          paId,
          // Checked again here even though the server already did: this value
          // becomes an href.
          videoUrl: safeYlaVideoUrl(typeof data.videoUrl === "string" ? data.videoUrl : null),
          sent: data.sent === true,
        });
      } catch {
        // The card still shows, without the button, and says to ask the consultant.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stepType, paId, base]);

  const confirmWatched = useCallback(async () => {
    setConfirm({ kind: "sending" });
    try {
      const res = await fetch(base, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "video-watched" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error("failed");
      setConfirm({ kind: "done", sent: data.sent === true });
    } catch {
      setConfirm({ kind: "error" });
    }
  }, [base]);

  /* ── The rep's camera, small, over the document, so the applicants can still
   *    see who is talking. Not on the video card: on a phone it sat over the
   *    buttons. ── */

  const cameras = useTracks([Track.Source.Camera], { onlySubscribed: true });
  const presenterCamera = step
    ? cameras.find((t) => isTrackReference(t) && t.participant.identity === step.presenter && !t.publication.isMuted)
    : undefined;

  if (!step) return <div ref={anchorRef} style={{ display: "none" }} />;

  const overlay: React.CSSProperties = {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    // Leaves LiveKit's own control bar (mute, camera, leave) usable underneath.
    bottom: bottomInset,
    zIndex: 20,
    display: "flex",
    flexDirection: "column",
    color: "#fff",
  };

  const pip = presenterCamera && isTrackReference(presenterCamera) && (
    <div
      style={{
        position: "absolute",
        right: 8,
        bottom: 8,
        width: "min(28vw, 168px)",
        aspectRatio: "4 / 3",
        borderRadius: 10,
        overflow: "hidden",
        background: "#000",
        boxShadow: "0 2px 12px rgba(0,0,0,0.5)",
        border: "2px solid rgba(255,255,255,0.7)",
        // Decorative: taps go through to the page (and its scrolling) beneath.
        pointerEvents: "none",
        zIndex: 2,
      }}
    >
      <VideoTrack trackRef={presenterCamera} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
    </div>
  );

  /* ── Document ─────────────────────────────────────────────────────────── */

  if (step.type === "pa") {
    const ready = bytes && bytes.paId === step.paId ? bytes.data : null;
    const unusable = renderFailed || (fileFailed && !ready);
    return (
      <div ref={anchorRef} style={{ ...overlay, background: "#1f2937" }}>
        <div
          style={{
            padding: "8px 12px",
            fontSize: 13,
            display: "flex",
            gap: 8,
            alignItems: "center",
            justifyContent: "space-between",
            background: "rgba(0,0,0,0.35)",
          }}
        >
          <span>
            <strong>Your Preliminary Assessment</strong>
            <span style={{ opacity: 0.8 }}>
              {" "}
              · page {clampPage(step.page, step.pageCount)} of {step.pageCount}
            </span>
          </span>
          {ready && !unusable && (
            <button
              onClick={() => setZoomed((z) => !z)}
              style={{
                padding: "6px 12px",
                borderRadius: 8,
                border: "none",
                fontSize: 13,
                fontWeight: 600,
                color: "#fff",
                background: "rgba(255,255,255,0.16)",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {zoomed ? "Fit page" : "Zoom in"}
            </button>
          )}
        </div>

        <div style={{ flex: 1, minHeight: 0, position: "relative", padding: 6 }}>
          {unusable ? (
            // An older phone that cannot draw the page, or a download that keeps
            // failing: still let them read it, in the phone's own PDF viewer.
            <div
              style={{
                height: "100%",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 14,
                textAlign: "center",
                padding: 16,
                fontSize: 15,
                lineHeight: 1.5,
              }}
            >
              <span>We couldn&apos;t show the document on this screen.</span>
              <a
                href={`${base}/file`}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  padding: "12px 18px",
                  borderRadius: 10,
                  background: AMBER,
                  color: NAVY,
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                Open the document
              </a>
              <span style={{ opacity: 0.8, fontSize: 13 }}>
                It opens in a new tab. Come back to this tab to stay on the call.
              </span>
            </div>
          ) : (
            <PaPdfPage
              data={ready}
              page={step.page}
              zoom={zoomed ? 2 : 1}
              onError={() => setRenderFailed(true)}
            />
          )}
          {pip}
        </div>
      </div>
    );
  }

  /* ── Video step ───────────────────────────────────────────────────────── */

  const info = video && video.paId === step.paId ? video : null;
  const finished = confirm.kind === "done" || info?.sent === true;
  const sentOk = confirm.kind === "done" ? confirm.sent : info?.sent === true;

  const bigButton: React.CSSProperties = {
    display: "block",
    width: "100%",
    padding: "16px 18px",
    borderRadius: 12,
    border: "none",
    fontSize: 17,
    fontWeight: 700,
    textAlign: "center",
    textDecoration: "none",
    cursor: "pointer",
    boxSizing: "border-box",
  };

  return (
    <div ref={anchorRef} style={{ ...overlay, background: NAVY, overflowY: "auto" }}>
      <div
        style={{
          margin: "auto",
          width: "100%",
          maxWidth: 480,
          padding: "24px 20px",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          fontSize: 16,
          lineHeight: 1.55,
        }}
      >
        {finished ? (
          <>
            <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.25 }}>Thank you.</h2>
            <p style={{ margin: 0 }}>
              {sentOk
                ? "Your documents are on their way to your email to sign."
                : "Your consultant will send your documents to your email to sign shortly."}
            </p>
            <button
              style={{ ...bigButton, background: "rgba(255,255,255,0.14)", color: "#fff" }}
              onClick={() => {
                dismissed.current = step.paId;
                setStep(null);
              }}
            >
              Back to the call
            </button>
          </>
        ) : (
          <>
            <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.25 }}>
              Next: a short presentation from Your Loan Assist
            </h2>
            <p style={{ margin: 0 }}>
              It opens in a new tab. It will ask for the email address you applied with, then send a
              code to that email. Type the code in and the presentation will start.
            </p>
            <p style={{ margin: 0, opacity: 0.85 }}>
              This call stays open while you watch. Come back to this tab when it finishes.
            </p>

            {info?.videoUrl ? (
              <a
                href={info.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ ...bigButton, background: AMBER, color: NAVY }}
              >
                Watch the presentation
              </a>
            ) : (
              <p style={{ margin: 0, padding: "12px 14px", borderRadius: 10, background: "rgba(255,255,255,0.1)" }}>
                {info
                  ? "We don't have the link to the presentation here. Please ask your consultant for it."
                  : "Getting the link…"}
              </p>
            )}

            <button
              style={{
                ...bigButton,
                background: "transparent",
                color: "#fff",
                border: "2px solid rgba(255,255,255,0.7)",
                opacity: confirm.kind === "sending" ? 0.6 : 1,
              }}
              onClick={confirmWatched}
              disabled={confirm.kind === "sending"}
            >
              {confirm.kind === "sending" ? "One moment…" : "We've finished watching"}
            </button>
            {confirm.kind === "error" && (
              <p style={{ margin: 0, color: "#fecaca" }}>
                That didn&apos;t go through. Please press it again, or tell your consultant you have
                finished.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
