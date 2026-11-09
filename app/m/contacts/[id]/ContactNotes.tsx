"use client";

import { useState } from "react";

/**
 * A contact's notes (one free-text log, newest entries at the end) with an
 * add box. Saving goes through POST /api/contacts/[id]/note, which appends on
 * the server, so it can't overwrite notes written on the desktop since this
 * page loaded.
 */
export default function ContactNotes({ contactId, notes: initial }: { contactId: string; notes: string | null }) {
  const [notes, setNotes] = useState(initial ?? "");
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const save = async () => {
    const text = draft.trim();
    if (!text) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/contacts/${contactId}/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setNotes(typeof data.notes === "string" ? data.notes : notes);
      setDraft("");
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch (e) {
      setError(`Note not saved: ${e instanceof Error ? e.message : "unknown error"}`);
    } finally {
      setSaving(false);
    }
  };

  // Long logs are cut to their most recent part until tapped.
  const TAIL = 1200;
  const long = notes.length > TAIL;
  const shown = long && !expanded ? `…${notes.slice(-TAIL)}` : notes;

  return (
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
          onClick={save}
          disabled={saving || !draft.trim()}
          className="mt-2 w-full rounded-lg bg-[#0F4C5C] py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save note"}
        </button>
        {error && <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      </div>
      {notes.trim() && (
        <div className="mt-3 rounded-xl bg-white px-4 py-3 shadow-sm">
          <p className="whitespace-pre-wrap break-words text-sm text-gray-800">{shown}</p>
          {long && (
            <button type="button" onClick={() => setExpanded(!expanded)} className="mt-2 text-xs font-medium text-[#0F4C5C]">
              {expanded ? "Show less" : "Show all notes"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
