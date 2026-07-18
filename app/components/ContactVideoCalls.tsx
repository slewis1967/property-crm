"use client";

import { useEffect, useState } from "react";
import { errMessage } from "../../utils/errors";

type CallSession = {
  sid: string;
  startedAt: string;
  endedAt: string | null;
  durationSec: number | null;
  participants: string[];
  participantCount: number;
  recordingUrl: string | null;
};

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtDuration(sec: number | null): string {
  if (sec == null) return "in progress";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

/**
 * Video-call history for a contact, shown on the contact detail page next to
 * appointments / email. Reads the aggregated sessions from
 * /api/livekit/calls and renders start time, duration, participants and a link
 * to the recording when one exists. Renders nothing (not even a heading) when
 * there are no calls, so it stays out of the way until video is actually used.
 */
export default function ContactVideoCalls({ contactId }: { contactId: string }) {
  const [state, setState] = useState<
    | { phase: "loading" }
    | { phase: "ready"; sessions: CallSession[] }
    | { phase: "error"; error: string }
  >({ phase: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/livekit/calls?contactId=${encodeURIComponent(contactId)}`,
        );
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || `Request failed (${res.status})`);
        }
        if (!cancelled) {
          setState({ phase: "ready", sessions: data.sessions ?? [] });
        }
      } catch (err) {
        if (!cancelled) setState({ phase: "error", error: errMessage(err) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  // Stay invisible until there's something to show (or an error worth showing).
  if (state.phase === "loading") return null;
  if (state.phase === "error") return null;
  if (state.sessions.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-700">
        🎥 Video calls
        <span className="text-xs font-normal text-gray-400">
          ({state.sessions.length})
        </span>
      </h3>
      <ul className="space-y-2">
        {state.sessions.map((s) => (
          <li
            key={s.sid}
            className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs"
          >
            <div className="min-w-0">
              <div className="font-medium text-gray-700">
                {fmtWhen(s.startedAt)}
                <span className="ml-2 font-normal text-gray-400">
                  {fmtDuration(s.durationSec)}
                </span>
              </div>
              <div className="truncate text-gray-500">
                {s.participantCount} participant
                {s.participantCount === 1 ? "" : "s"}
                {s.participants.length > 0 && ` · ${s.participants.join(", ")}`}
              </div>
            </div>
            {s.recordingUrl && (
              <a
                href={s.recordingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-md border border-gray-200 bg-white px-2 py-1 font-semibold text-gray-600 transition hover:bg-gray-50"
              >
                ▶ Recording
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
