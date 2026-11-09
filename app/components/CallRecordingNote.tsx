"use client";

import { useState } from "react";

/**
 * The extras on a note written by the work-phone call recorder: a Play button for the
 * recording and the transcript behind a toggle. The review itself is the note's text.
 * Shared by the phone lead page and the desktop opportunity page.
 */
export default function CallRecordingNote({
  leadId,
  recordingPath,
  transcript,
}: {
  leadId: string;
  recordingPath?: string;
  transcript?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showTranscript, setShowTranscript] = useState(false);

  if (!recordingPath && !transcript) return null;

  const play = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/opportunities/${encodeURIComponent(leadId)}/recording?path=${encodeURIComponent(recordingPath ?? "")}`,
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error || `HTTP ${res.status}`);
      setUrl(data.url);
    } catch (e) {
      setError(`Couldn't load the recording: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-2 space-y-2">
      {recordingPath &&
        (url ? (
          <audio controls autoPlay src={url} className="w-full" />
        ) : (
          <button
            type="button"
            onClick={play}
            disabled={loading}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-[#0F4C5C] disabled:opacity-50"
          >
            {loading ? "Loading…" : "▶ Play recording"}
          </button>
        ))}
      {transcript && (
        <div>
          <button
            type="button"
            onClick={() => setShowTranscript((v) => !v)}
            className="text-xs font-medium text-gray-500 underline"
          >
            {showTranscript ? "Hide transcript" : "Show transcript"}
          </button>
          {showTranscript && (
            <p className="mt-1 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-2 text-xs text-gray-600">
              {transcript}
            </p>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
