"use client";

import { useState } from "react";
import { formatDateTime } from "../../../../utils/datetime";

type NoteEntry = { text: string; created_at: string };

/**
 * Stage picker + notes for one lead. The stage goes through the same
 * PATCH /api/opportunities/[id] the kanban uses; notes go through
 * POST /api/opportunities/[id]/note, which prepends on the server so a note
 * added on the desktop in the meantime isn't lost.
 */
export default function LeadActions({
  leadId,
  stage: initialStage,
  stages,
  pipelineName,
  notes: initialNotes,
}: {
  leadId: string;
  stage: string;
  stages: string[];
  pipelineName: string | null;
  notes: NoteEntry[];
}) {
  const [stage, setStage] = useState(initialStage);
  const [savingStage, setSavingStage] = useState(false);
  const [notes, setNotes] = useState(initialNotes);
  const [draft, setDraft] = useState("");
  const [savingNote, setSavingNote] = useState(false);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");

  const say = (msg: string) => {
    setFlash(msg);
    setTimeout(() => setFlash(""), 1800);
  };

  const changeStage = async (next: string) => {
    const prev = stage;
    setStage(next);
    setSavingStage(true);
    setError("");
    try {
      const res = await fetch(`/api/opportunities/${leadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: next }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      say(`Moved to ${next}`);
    } catch {
      setStage(prev);
      setError("Couldn't change the stage — try again.");
    } finally {
      setSavingStage(false);
    }
  };

  const addNote = async () => {
    const text = draft.trim();
    if (!text) return;
    setSavingNote(true);
    setError("");
    try {
      const res = await fetch(`/api/opportunities/${leadId}/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setNotes(Array.isArray(data.notes) ? data.notes : [{ text, created_at: new Date().toISOString() }, ...notes]);
      setDraft("");
      say("Note saved");
    } catch (e) {
      setError(`Note not saved: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <>
      <section className="px-4 pt-5">
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">
          Stage{pipelineName ? ` · ${pipelineName}` : ""}
        </label>
        <select
          value={stage}
          onChange={(e) => changeStage(e.target.value)}
          disabled={savingStage}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base font-medium shadow-sm"
        >
          {stages.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </section>

      {(error || flash) && (
        <p className={`mx-4 mt-3 rounded-lg px-3 py-2 text-sm ${error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}>
          {error || flash}
        </p>
      )}

      <section className="px-4 pt-5">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Notes</h2>
        <div className="rounded-xl bg-white p-3 shadow-sm">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            placeholder="Add a note — call outcome, next step…"
            className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-base outline-none focus:border-[#0F4C5C]"
          />
          <button
            type="button"
            onClick={addNote}
            disabled={savingNote || !draft.trim()}
            className="mt-2 w-full rounded-lg bg-[#0F4C5C] py-2.5 text-sm font-semibold text-white disabled:opacity-40"
          >
            {savingNote ? "Saving…" : "Save note"}
          </button>
        </div>
        {notes.length > 0 && (
          <ul className="mt-3 space-y-2">
            {notes.slice(0, 20).map((n, i) => (
              <li key={`${n.created_at}-${i}`} className="rounded-xl bg-white px-4 py-3 shadow-sm">
                <p className="text-xs text-gray-400">{formatDateTime(n.created_at, "")}</p>
                <p className="mt-0.5 whitespace-pre-wrap text-sm">{n.text}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
