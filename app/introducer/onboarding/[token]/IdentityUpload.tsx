"use client";

import { useState } from "react";

/**
 * The licence upload, front and back.
 *
 * Bytes go straight from the browser to storage via a signed URL — they never
 * pass through the Netlify function, whose body limit turns a phone photo into
 * a 500. Same approach as every other upload in the CRM.
 *
 * The copy states why we are asking and what happens to it. Someone handing
 * over photo ID to a firm they have not signed with yet is entitled to that,
 * and saying it plainly costs nothing.
 */
type Side = "front" | "back";
type SlotState = { file: File | null; done: boolean; busy: boolean; error: string | null };

const EMPTY: SlotState = { file: null, done: false, busy: false, error: null };

export default function IdentityUpload({ token }: { token: string }) {
  const [slots, setSlots] = useState<Record<Side, SlotState>>({ front: EMPTY, back: EMPTY });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (side: Side, patch: Partial<SlotState>) =>
    setSlots((s) => ({ ...s, [side]: { ...s[side], ...patch } }));

  async function upload(side: Side, file: File) {
    set(side, { file, busy: true, error: null, done: false });
    try {
      const res = await fetch(`/api/introducer/onboarding/${encodeURIComponent(token)}/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ side, filename: file.name, size: file.size, mime_type: file.type }),
      });
      const json = await res.json();
      if (!res.ok) {
        set(side, { busy: false, error: json.error ?? "Could not upload that." });
        return;
      }

      const put = await fetch(json.upload_url, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) {
        set(side, { busy: false, error: "The upload didn’t finish. Try again." });
        return;
      }
      set(side, { busy: false, done: true, error: null });
    } catch {
      set(side, { busy: false, error: "Could not reach the server." });
    }
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/introducer/onboarding/${encodeURIComponent(token)}/submit-id`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not submit.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
        <p className="font-semibold">Thanks — that’s with us.</p>
        <p className="mt-1">
          We’ll check it and email you when the course opens. That’s usually quick, but it can take a
          business day.
        </p>
      </div>
    );
  }

  const bothDone = slots.front.done && slots.back.done;

  return (
    <div className="mt-4">
      <p className="text-sm text-gray-600">
        We need to confirm you are who you say you are before you sit the accreditation, because your
        name goes on the certificate and on the introducer register. A photo of your driver licence is
        enough — both sides.
      </p>
      <p className="mt-2 text-xs text-gray-500">
        It is stored encrypted, only Springboard staff can open it, every access is logged, and it is
        destroyed when your accreditation ends.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {(["front", "back"] as const).map((side) => (
          <Slot
            key={side}
            side={side}
            state={slots[side]}
            onPick={(f) => upload(side, f)}
          />
        ))}
      </div>

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <button
        onClick={submit}
        disabled={!bothDone || submitting}
        className="mt-4 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        style={{ backgroundColor: "#020e40" }}
      >
        {submitting ? "Sending…" : "Submit for checking"}
      </button>
      {!bothDone && (
        <p className="mt-2 text-xs text-gray-500">Add both sides before you submit.</p>
      )}
    </div>
  );
}

function Slot({
  side,
  state,
  onPick,
}: {
  side: Side;
  state: SlotState;
  onPick: (f: File) => void;
}) {
  const label = side === "front" ? "Front of licence" : "Back of licence";
  return (
    <label
      className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-5 text-center transition"
      style={{ borderColor: state.done ? "#c7894e" : "#d1d5db" }}
    >
      <input
        type="file"
        accept="image/jpeg,image/png,image/heic,image/heif,image/webp,application/pdf"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onPick(f);
        }}
      />
      <span className="text-sm font-semibold" style={{ color: "#020e40" }}>
        {label}
      </span>
      <span className="mt-1 text-xs text-gray-500">
        {state.busy
          ? "Uploading…"
          : state.done
            ? "Added — tap to replace"
            : "Tap to take a photo or choose a file"}
      </span>
      {state.error && <span className="mt-1 text-xs text-red-600">{state.error}</span>}
    </label>
  );
}
