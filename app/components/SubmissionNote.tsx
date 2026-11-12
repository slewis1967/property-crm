"use client";

import { useEffect, useState } from "react";
import { errMessage } from "../../utils/errors";

/**
 * "Note for YLA" on an application's document panel. Whatever is saved here is
 * printed in the submission email and exported to the Drive folder as an
 * Advisor Notes PDF (utils/yla-submission-note.ts).
 */
export default function SubmissionNote({ requestId }: { requestId: string }) {
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState("");
  const [locked, setLocked] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/document-requests/${requestId}/submission-note`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json().catch(() => ({}));
        if (!alive) return;
        if (!res.ok || json.ok === false) {
          // Column not migrated yet: hide quietly rather than show a broken box.
          if (res.status === 503) setUnavailable(true);
          else setError(json.error || `Failed (${res.status})`);
          return;
        }
        setNote(json.note || "");
        setSaved(json.note || "");
        setLocked(!!json.locked);
        setOpen(!!json.note);
      })
      .catch((e) => alive && setError(errMessage(e)));
    return () => {
      alive = false;
    };
  }, [requestId]);

  if (unavailable) return null;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/document-requests/${requestId}/submission-note`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.ok === false) throw new Error(json.error || `Failed (${res.status})`);
      setSaved(json.note || "");
      setNote(json.note || "");
    } catch (e) {
      setError(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1.5 text-[11px] font-medium text-teal-700 hover:underline"
      >
        + Add a note for YLA
      </button>
    );
  }

  const dirty = note.trim() !== saved.trim();
  return (
    <div className="mt-2">
      <label className="block text-[11px] font-semibold text-gray-600">
        Note for YLA <span className="font-normal text-gray-400">(sent with the submission)</span>
      </label>
      {locked ? (
        <p className="mt-1 whitespace-pre-wrap rounded border border-gray-200 bg-gray-50 p-2 text-xs text-gray-700">
          {saved || "—"}
        </p>
      ) : (
        <>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={4000}
            placeholder="e.g. The rental income declared is the projected rent of the investment property being purchased."
            className="mt-1 w-full rounded border border-gray-300 p-2 text-xs focus:border-teal-600 focus:outline-none"
          />
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy || !dirty}
              className="rounded bg-teal-700 px-2 py-1 text-[11px] font-medium text-white disabled:bg-gray-300"
            >
              {busy ? "Saving…" : "Save note"}
            </button>
            {!dirty && saved && <span className="text-[11px] text-green-700">Saved</span>}
          </div>
        </>
      )}
      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
