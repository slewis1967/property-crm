"use client";

/**
 * VoiceAssistant — floating mic button + transcript pane.
 *
 * Push-to-talk: hold the mic button (mouse-down or touch-start) to begin
 * recording; release to stop. Web Speech API captures the audio + transcribes
 * to text. The text goes to /api/voice/converse, the assistant's reply is
 * spoken back via speechSynthesis, and the transcript pane shows the running
 * conversation.
 *
 * History flows through the API on every turn so Claude has full context for
 * confirm-before-send flows.
 *
 * Browser support: Chrome / Edge — yes. Safari — yes via webkit prefix.
 * Firefox — no Web Speech API; the button is hidden if neither is available.
 */
import { useCallback, useEffect, useRef, useState } from "react";

// Minimal subset of SpeechRecognition types we touch (the W3C spec ships with
// many properties, no point reproducing the full Type definition file).
type RecResultItem = { transcript: string };
type RecResult = ArrayLike<RecResultItem> & { isFinal: boolean };
type Recognition = {
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { results: ArrayLike<RecResult> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
};

type RecognitionCtor = new () => Recognition;

type Turn = { role: "user" | "assistant"; text: string; side_effects?: SideEffect[] };
type SideEffect = { kind: string; [key: string]: unknown };

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export default function VoiceAssistant() {
  const [supported, setSupported] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [interim, setInterim] = useState("");

  const recogRef = useRef<Recognition | null>(null);
  // Conversation history kept in Anthropic message-param shape; sent back on
  // each turn so tool-use loops + confirm flows can pick up where they left off.
  const apiHistoryRef = useRef<Array<{ role: string; content: unknown }>>([]);

  useEffect(() => {
    const ctor = getRecognitionCtor();
    setSupported(Boolean(ctor));
  }, []);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    // Slight slow-down + slightly lower pitch reads more naturally than the
    // defaults on Chrome/Edge default voices.
    utter.rate = 1.0;
    utter.pitch = 1.0;
    // Try to pick an AU/UK voice if one is available
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find((v) => /en-AU|en-GB/.test(v.lang)) ?? voices.find((v) => v.lang.startsWith("en"));
    if (preferred) utter.voice = preferred;
    window.speechSynthesis.speak(utter);
  }, []);

  const submit = useCallback(async (transcript: string) => {
    if (!transcript.trim()) return;
    setTurns((t) => [...t, { role: "user", text: transcript }]);
    setThinking(true);
    setError(null);
    try {
      const res = await fetch("/api/voice/converse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript, history: apiHistoryRef.current }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Voice API failed");
        setThinking(false);
        return;
      }
      apiHistoryRef.current = data.history;
      const reply: string = data.reply || "";
      const effects: SideEffect[] = data.side_effects || [];
      setTurns((t) => [...t, { role: "assistant", text: reply, side_effects: effects.length ? effects : undefined }]);
      speak(reply);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setThinking(false);
    }
  }, [speak]);

  const start = useCallback(() => {
    const ctor = getRecognitionCtor();
    if (!ctor) return;
    stopSpeaking();  // Don't let the previous reply talk over the new utterance
    setError(null);
    setInterim("");
    const r = new ctor();
    r.continuous = false;
    r.interimResults = true;
    r.lang = "en-AU";
    r.onresult = (e) => {
      // Walk the results list once, treating each chunk as either finalised
      // or interim. Final chunks accumulate as "the full utterance so far"
      // and become what we submit on `onend`; interim shows as italic preview.
      let combined = "";
      for (let i = 0; i < e.results.length; i++) {
        combined += e.results[i][0]?.transcript ?? "";
      }
      setInterim(combined);
    };
    r.onerror = (e) => {
      setError(`Mic error: ${e.error}`);
      setRecording(false);
    };
    r.onend = () => {
      setRecording(false);
      // Use the final interim text as the transcript. start() resets to ""
      // each time we begin a fresh session.
      setInterim((current) => {
        const txt = current.trim();
        if (txt) void submit(txt);
        return "";
      });
    };
    r.start();
    recogRef.current = r;
    setRecording(true);
  }, [submit, stopSpeaking]);

  const stop = useCallback(() => {
    recogRef.current?.stop();
    recogRef.current = null;
  }, []);

  // Keyboard shortcut: hold spacebar (only when assistant is open + not typing
  // in a form field) for hands-free push-to-talk.
  useEffect(() => {
    if (!open) return;
    const isTypingInForm = (el: EventTarget | null) =>
      el instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(el.tagName);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || isTypingInForm(e.target)) return;
      e.preventDefault();
      if (!recording) start();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isTypingInForm(e.target)) return;
      e.preventDefault();
      if (recording) stop();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [open, recording, start, stop]);

  const reset = () => {
    apiHistoryRef.current = [];
    setTurns([]);
    setError(null);
    setInterim("");
    stopSpeaking();
  };

  // Don't render anything if the browser can't do speech recognition
  if (supported === false) return null;

  return (
    <>
      {/* Floating launch button — bottom right, always present */}
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 rounded-full bg-[#0F4C5C] text-white shadow-lg hover:bg-[#0B3D4A] flex items-center justify-center text-2xl z-40 transition"
          title="Open voice assistant"
          aria-label="Open voice assistant"
        >
          🎙️
        </button>
      )}

      {open && (
        <div className="fixed bottom-6 right-6 w-[360px] max-h-[70vh] bg-white border border-gray-200 rounded-xl shadow-xl flex flex-col z-40">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-[#0F4C5C] text-white rounded-t-xl">
            <div>
              <p className="text-sm font-semibold">Voice assistant</p>
              <p className="text-[10px] opacity-80">
                {recording ? "Listening…" : thinking ? "Thinking…" : "Hold mic or spacebar to talk"}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={reset}
                className="text-[10px] px-2 py-1 rounded hover:bg-white/10"
                title="Clear conversation"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => { stop(); stopSpeaking(); setOpen(false); }}
                className="text-lg w-7 h-7 rounded hover:bg-white/10 flex items-center justify-center"
                title="Close"
              >
                ×
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2 min-h-[120px]">
            {turns.length === 0 && !recording && (
              <p className="text-xs text-gray-400 text-center py-6">
                Try: &ldquo;Find Justino&rdquo;, &ldquo;Log a call with Ketkii…&rdquo;, or &ldquo;Remind me to follow up with Hamish on Friday&rdquo;.
              </p>
            )}
            {turns.map((t, i) => (
              <div
                key={i}
                className={`text-sm rounded-lg px-3 py-2 max-w-[85%] ${
                  t.role === "user"
                    ? "bg-blue-50 text-blue-900 ml-auto"
                    : "bg-gray-100 text-gray-800"
                }`}
              >
                <p>{t.text}</p>
                {t.side_effects && t.side_effects.length > 0 && (
                  <div className="mt-1.5 pt-1.5 border-t border-gray-200/60 space-y-0.5">
                    {t.side_effects.map((sx, j) => (
                      <p key={j} className="text-[10px] text-gray-500">
                        ✓ {labelSideEffect(sx)}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {interim && (
              <div className="text-sm rounded-lg px-3 py-2 max-w-[85%] ml-auto bg-blue-50/60 text-blue-700 italic">
                {interim}…
              </div>
            )}
            {error && (
              <div className="text-xs px-3 py-2 bg-red-50 text-red-700 border border-red-200 rounded">
                {error}
              </div>
            )}
          </div>

          <div className="border-t border-gray-100 p-3 flex items-center justify-center">
            <button
              type="button"
              onMouseDown={start}
              onMouseUp={stop}
              onMouseLeave={recording ? stop : undefined}
              onTouchStart={(e) => { e.preventDefault(); start(); }}
              onTouchEnd={(e) => { e.preventDefault(); stop(); }}
              disabled={thinking}
              className={`w-16 h-16 rounded-full shadow-md flex items-center justify-center text-2xl transition select-none ${
                recording
                  ? "bg-red-500 text-white animate-pulse"
                  : thinking
                    ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                    : "bg-[#0F4C5C] text-white hover:bg-[#0B3D4A]"
              }`}
              title="Hold to talk"
              aria-label="Hold to talk"
            >
              🎤
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function labelSideEffect(sx: SideEffect): string {
  switch (sx.kind) {
    case "find_contact":  return `Found: ${(sx.top as { name?: string } | undefined)?.name ?? sx.query}`;
    case "log_call":      return `Note logged on ${sx.contact_name}`;
    case "create_task":   return `Task: ${sx.title}${sx.due_date ? ` (due ${sx.due_date})` : ""}`;
    case "draft_sms":     return `SMS drafted — awaiting confirmation`;
    case "send_sms":      return `SMS sent`;
    case "draft_email":   return `Email drafted — awaiting confirmation`;
    case "send_email":    return `Email sent`;
    default:              return String(sx.kind);
  }
}
