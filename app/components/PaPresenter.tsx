"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRoomContext } from "@livekit/components-react";
import PaPdfPage, { useControlBarInset } from "./PaPdfPage";
import { errMessage } from "../../utils/errors";
import {
  PA_TOPIC,
  isLivePa,
  paSummary,
  type PaListRow,
  type PaRoomMessage,
} from "../../utils/preliminary-assessments";
import { clampPage, contactIdFromRoom, sentForSigningLabel } from "../../utils/pa-presentation";

/**
 * Staff side of presenting a Preliminary Assessment on a call.
 *
 * Shows a "Present PA" button when the contact this room belongs to has a live
 * PA. Presenting puts the document on every applicant's screen and keeps them
 * on the rep's page; finishing moves their screens to "watch Your Loan Assist's
 * presentation"; and once someone confirms it was watched, the PA goes out for
 * e-signature.
 *
 * The room only ever carries a small PaRoomMessage (which PA, which page, which
 * step). The file itself travels over HTTPS: staff from the authed pdf route,
 * applicants from their guest link. That keeps a credit proposal off the data
 * channel and means a late joiner needs one message, not a file transfer.
 *
 * The message is re-sent every two seconds while a step is live. LiveKit data
 * messages are not replayed to people who join afterwards, so without the
 * repeat an applicant who drops and reconnects (a phone switching from wifi to
 * mobile data mid-call is routine) would be left looking at the video grid
 * while the rep talks through page 3.
 *
 * Must be rendered INSIDE <LiveKitRoom>.
 */

const REBROADCAST_MS = 2_000;
/** Idle: has a PA arrived for this client since the call started? */
const IDLE_POLL_MS = 60_000;
/** Video step: has an applicant pressed "We've finished watching"? */
const VIDEO_POLL_MS = 5_000;

type Phase = "idle" | "pa" | "video";

type SendState =
  | { kind: "none" }
  | { kind: "sending" }
  | { kind: "sent"; label: string }
  | { kind: "error"; message: string };

const pill: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  border: "none",
  cursor: "pointer",
  color: "#fff",
};

const barButton: React.CSSProperties = {
  ...pill,
  padding: "10px 14px",
  fontSize: 14,
  background: "rgba(255,255,255,0.14)",
};

export default function PaPresenter({ room }: { room: string }) {
  const lkRoom = useRoomContext();
  const contactId = useMemo(() => contactIdFromRoom(room), [room]);

  const [pa, setPa] = useState<PaListRow | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [send, setSend] = useState<SendState>({ kind: "none" });

  const anchorRef = useRef<HTMLDivElement | null>(null);
  const bottomInset = useControlBarInset(anchorRef);

  /* ── The client's live PA ─────────────────────────────────────────────── */

  const refresh = useCallback(async () => {
    if (!contactId) return;
    try {
      const res = await fetch(`/api/preliminary-assessments?contact_id=${encodeURIComponent(contactId)}`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || !data.ok || !Array.isArray(data.assessments)) return;
      // Newest first from the API, so the first live one is the current PA.
      const live = (data.assessments as PaListRow[]).find((a) => isLivePa(a.status)) ?? null;
      setPa(live);
    } catch {
      // A failed poll just means the button appears a little later. Nothing to
      // tell the rep mid-call.
    }
  }, [contactId]);

  useEffect(() => {
    if (!contactId || phase === "pa") return;
    const first = window.setTimeout(refresh, 0);
    const timer = window.setInterval(refresh, phase === "video" ? VIDEO_POLL_MS : IDLE_POLL_MS);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [contactId, phase, refresh]);

  /* ── Telling the room ─────────────────────────────────────────────────── */

  const publish = useCallback(
    (msg: PaRoomMessage) => {
      // Rejects while the room is still connecting or mid-reconnect. The next
      // two-second tick resends, so a dropped one costs nothing.
      lkRoom.localParticipant
        .publishData(new TextEncoder().encode(JSON.stringify(msg)), { reliable: true, topic: PA_TOPIC })
        .catch(() => {});
    },
    [lkRoom],
  );

  const paId = pa?.id ?? null;
  const liveMessage = useMemo<PaRoomMessage | null>(() => {
    if (!paId) return null;
    // Nothing goes out until the page count is known: the receiver clamps the
    // page to it, so a guessed count would pin every applicant to page 1.
    if (phase === "pa" && pageCount > 0) {
      return { type: "pa", paId, page: clampPage(page, pageCount), pageCount };
    }
    if (phase === "video") return { type: "video", paId };
    return null;
  }, [paId, phase, page, pageCount]);

  useEffect(() => {
    if (!liveMessage) return;
    publish(liveMessage);
    const timer = window.setInterval(() => publish(liveMessage), REBROADCAST_MS);
    return () => window.clearInterval(timer);
  }, [liveMessage, publish]);

  // If the rep's call screen goes away mid-step (they leave, or navigate), clear
  // the applicants' screens rather than leaving them on a page nobody is turning.
  const liveRef = useRef(false);
  useEffect(() => {
    liveRef.current = liveMessage !== null;
  }, [liveMessage]);
  useEffect(() => {
    return () => {
      if (liveRef.current) publish({ type: "idle" });
    };
  }, [publish]);

  /* ── Actions ──────────────────────────────────────────────────────────── */

  const callPresent = useCallback(
    async (action: "start" | "finish" | "video-confirmed") => {
      if (!pa) throw new Error("No Preliminary Assessment to present.");
      const res = await fetch(`/api/preliminary-assessments/${encodeURIComponent(pa.id)}/present`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, room }),
      });
      const data = await res.json().catch(() => ({}));
      if (data && typeof data === "object" && data.assessment) setPa(data.assessment as PaListRow);
      if (!res.ok || !data.ok) throw new Error(data.error || `Request failed (${res.status})`);
      return data as { ok: true; sentTo?: string[]; alreadySent?: boolean };
    },
    [pa, room],
  );

  async function start() {
    if (!pa || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Server first: this is what unlocks the file for the applicants. If it
      // fails, their phones would 404 on a document the rep is talking through.
      await callPresent("start");
      const res = await fetch(`/api/preliminary-assessments/${encodeURIComponent(pa.id)}/pdf`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Couldn't load the PA document (${res.status})`);
      setBytes(new Uint8Array(await res.arrayBuffer()));
      setPage(1);
      setPageCount(0);
      setSend({ kind: "none" });
      setPhase("pa");
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function stop() {
    publish({ type: "idle" });
    setPhase("idle");
    setBytes(null);
    setError(null);
  }

  async function finish() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await callPresent("finish");
      setBytes(null);
      setPhase("video");
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmVideo() {
    if (send.kind === "sending") return;
    setSend({ kind: "sending" });
    try {
      const data = await callPresent("video-confirmed");
      setSend({
        kind: "sent",
        label: sentForSigningLabel(data.sentTo?.length ?? 0, Boolean(data.alreadySent)),
      });
    } catch (err) {
      setSend({ kind: "error", message: errMessage(err) });
    }
  }

  // Arrow keys turn the page while presenting, unless the rep is typing in chat.
  useEffect(() => {
    if (phase !== "pa" || pageCount < 1) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") setPage((p) => clampPage(p + 1, pageCount));
      if (e.key === "ArrowLeft" || e.key === "PageUp") setPage((p) => clampPage(p - 1, pageCount));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, pageCount]);

  if (!contactId || !pa) return <div ref={anchorRef} style={{ display: "none" }} />;

  const who = paSummary({
    applicants: pa.applicants,
    signature_lines: [],
    page_count: null,
    property: pa.property,
    email_from: "",
  });

  /* ── Presenting the document ──────────────────────────────────────────── */

  if (phase === "pa") {
    const current = clampPage(page, Math.max(1, pageCount));
    return (
      <div
        ref={anchorRef}
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: bottomInset,
          zIndex: 20,
          background: "#1f2937",
          display: "flex",
          flexDirection: "column",
          color: "#fff",
        }}
      >
        <div
          style={{
            padding: "8px 12px",
            fontSize: 13,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "baseline",
            background: "rgba(0,0,0,0.35)",
          }}
        >
          <strong>Preliminary Assessment{who ? `: ${who}` : ""}</strong>
          <span style={{ opacity: 0.8 }}>
            {pageCount > 0 ? "The applicants see the page you are on." : "Opening for the applicants…"}
          </span>
        </div>

        <div style={{ flex: 1, minHeight: 0, padding: 8 }}>
          <PaPdfPage
            data={bytes}
            page={current}
            onPageCount={setPageCount}
            onError={(message) => setError(message)}
          />
        </div>

        {error && (
          <div style={{ padding: "6px 12px", background: "#7f1d1d", fontSize: 13 }}>{error}</div>
        )}

        <div
          style={{
            padding: 8,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.35)",
          }}
        >
          <button
            style={{ ...barButton, opacity: current <= 1 ? 0.45 : 1 }}
            disabled={current <= 1}
            onClick={() => setPage(clampPage(current - 1, pageCount))}
          >
            ← Previous
          </button>
          <span style={{ fontSize: 14, minWidth: 96, textAlign: "center" }}>
            {pageCount > 0 ? `Page ${current} of ${pageCount}` : "Loading…"}
          </span>
          <button
            style={{ ...barButton, opacity: current >= pageCount ? 0.45 : 1 }}
            disabled={current >= pageCount}
            onClick={() => setPage(clampPage(current + 1, pageCount))}
          >
            Next →
          </button>
          <button style={{ ...barButton, marginLeft: 8 }} onClick={stop} disabled={busy}>
            Stop presenting
          </button>
          <button
            style={{ ...barButton, background: "#0F4C5C", opacity: busy ? 0.6 : 1 }}
            onClick={finish}
            disabled={busy}
          >
            {busy ? "…" : "Finish and show the video"}
          </button>
        </div>
      </div>
    );
  }

  /* ── Idle button / video-step panel ───────────────────────────────────────
   *
   * Top-left, one row BELOW the background toggle (top: 12) and clear of the
   * Record button (top-right), so nothing overlaps at any width, including
   * when the background toggle is showing its longest label.
   */
  const dock: React.CSSProperties = {
    position: "absolute",
    top: 52,
    left: 12,
    zIndex: 10,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 6,
    maxWidth: "min(340px, calc(100% - 24px))",
  };

  if (phase === "video") {
    // An applicant may have confirmed from their own phone. The poll picks that
    // up from the row, so the rep sees the same outcome without pressing anything.
    const sentByRow = Boolean(pa.signing_sent_at);
    const sentLabel =
      send.kind === "sent"
        ? send.label
        : sentByRow
          ? sentForSigningLabel(pa.applicants.length)
          : null;
    const failure =
      send.kind === "error" ? send.message : !sentByRow && pa.signing_error ? pa.signing_error : null;

    return (
      <div
        ref={anchorRef}
        style={{
          ...dock,
          background: "rgba(17,24,39,0.92)",
          color: "#fff",
          borderRadius: 10,
          padding: 12,
          fontSize: 13,
          lineHeight: 1.45,
          alignItems: "stretch",
        }}
      >
        <strong style={{ fontSize: 14 }}>The applicants have the video on their screens</strong>
        <span style={{ opacity: 0.85 }}>
          It opens on Your Loan Assist&apos;s site in a new tab and asks them for a code sent to their
          email. The call stays open while they watch.
        </span>

        {sentLabel ? (
          <div style={{ background: "#065f46", borderRadius: 8, padding: "8px 10px", fontWeight: 600 }}>
            ✓ {sentLabel}
          </div>
        ) : (
          <>
            {pa.video_confirmed_at && send.kind !== "sending" && !failure && (
              <span style={{ opacity: 0.85 }}>An applicant has confirmed they watched it.</span>
            )}
            {failure && (
              <div style={{ background: "#7f1d1d", borderRadius: 8, padding: "8px 10px" }}>
                Not sent: {failure}
              </div>
            )}
            <button
              style={{ ...pill, padding: "10px 12px", background: "#0F4C5C", opacity: send.kind === "sending" ? 0.6 : 1 }}
              onClick={confirmVideo}
              disabled={send.kind === "sending"}
            >
              {send.kind === "sending"
                ? "Sending…"
                : failure
                  ? "Try sending again"
                  : "Video watched: send for signing"}
            </button>
          </>
        )}

        <button style={{ ...pill, background: "rgba(255,255,255,0.14)" }} onClick={stop}>
          {sentLabel ? "Done" : "Close and return applicants to the call"}
        </button>
      </div>
    );
  }

  const canResumeVideo = Boolean(pa.video_shown_at) && !pa.signing_sent_at;
  return (
    <div ref={anchorRef} style={dock}>
      <button
        style={{ ...pill, background: "#0F4C5C", opacity: busy ? 0.6 : 1 }}
        onClick={start}
        disabled={busy}
        title={who ? `Show ${who}'s Preliminary Assessment on the applicants' screens` : undefined}
      >
        {busy ? "📄 Opening…" : "📄 Present PA"}
      </button>
      {canResumeVideo && (
        <button
          style={{ ...pill, background: "rgba(0,0,0,0.55)" }}
          onClick={finish}
          disabled={busy}
          title="Already presented. Put the video step back on the applicants' screens."
        >
          ▶ Back to the video step
        </button>
      )}
      {pa.signing_sent_at && (
        <span style={{ ...pill, cursor: "default", background: "rgba(6,95,70,0.9)" }}>✓ Sent for signing</span>
      )}
      {error && (
        <span
          style={{ ...pill, cursor: "default", background: "#7f1d1d", fontWeight: 500, whiteSpace: "normal" }}
        >
          {error}
        </span>
      )}
    </div>
  );
}
