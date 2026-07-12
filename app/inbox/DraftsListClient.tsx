"use client";

import Link from "next/link";
import { useState } from "react";

export type DraftListItem = {
  id: string;
  to: string[];
  subject: string | null;
  snippet: string;
  updated_at: string;
};

export default function DraftsListClient({ drafts: initial }: { drafts: DraftListItem[] }) {
  const [drafts, setDrafts] = useState<DraftListItem[]>(initial);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(id: string) {
    if (!window.confirm("Discard this draft? This can't be undone.")) return;
    const prev = drafts;
    setError(null);
    setDeletingId(id);
    // Optimistically drop the row; restore it if the request fails.
    setDrafts((list) => list.filter((d) => d.id !== id));
    try {
      const res = await fetch(`/api/mail/drafts/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Couldn't discard draft");
    } catch (e) {
      setDrafts(prev);
      setError((e as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  if (drafts.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
        <p className="text-sm text-gray-500">No saved drafts.</p>
        <p className="text-[11px] text-gray-400 mt-1">
          Start a new message and it&rsquo;ll autosave here.
        </p>
        <Link
          href="/inbox/compose"
          className="inline-block mt-4 px-4 py-2 rounded-lg bg-[#0F4C5C] text-white text-sm font-semibold hover:bg-[#0B3D4A] transition shadow-sm"
        >
          ✏️ New message
        </Link>
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
      <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
        {drafts.map((d) => {
          const recipients = d.to.filter(Boolean).join(", ") || "(no recipient)";
          const isDeleting = deletingId === d.id;
          return (
            <div
              key={d.id}
              className="group relative flex items-start gap-2 hover:bg-gray-50 transition"
            >
              <Link
                href={`/inbox/compose?draft=${d.id}`}
                className="block flex-1 min-w-0 p-3"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-xs font-medium text-[#0F4C5C] truncate">{recipients}</p>
                  <p className="text-[11px] text-gray-400 whitespace-nowrap flex-shrink-0">
                    {fmtDateTime(d.updated_at)}
                  </p>
                </div>
                <p className="text-sm font-medium text-gray-900 truncate mt-0.5">
                  {d.subject || "(no subject)"}
                </p>
                {d.snippet && (
                  <p className="text-xs text-gray-500 truncate mt-0.5">{d.snippet}</p>
                )}
              </Link>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void handleDelete(d.id);
                }}
                disabled={isDeleting}
                aria-label="Discard draft"
                title="Discard draft"
                className="flex-shrink-0 self-center mr-3 px-2 py-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 text-sm transition disabled:opacity-50"
              >
                {isDeleting ? "…" : "🗑️"}
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

function fmtDateTime(s: string): string {
  const d = new Date(s);
  if (isNaN(d.valueOf())) return s;
  return `updated ${d.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}`;
}
