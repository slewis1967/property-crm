"use client";

/**
 * NewFolderButton — inline "+ New folder" trigger for the inbox sidebar.
 *
 * Click → swap to an inline text input → Enter creates the folder via
 * POST /api/mail/folders → refresh the route so the sidebar picks up the
 * new row. Escape or click-away cancels.
 */
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function NewFolderButton() {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) {
      setEditing(false);
      setName("");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/mail/folders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Could not create folder");
        setSaving(false);
        return;
      }
      setEditing(false);
      setName("");
      setSaving(false);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-[10px] font-bold uppercase text-gray-400 hover:text-[#0F4C5C] tracking-wider transition"
        title="New folder"
      >
        + New
      </button>
    );
  }

  return (
    <div className="absolute left-3 right-3 bg-white border border-[#0F4C5C] rounded-md shadow-md p-2 z-10 mt-1">
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") {
            setEditing(false);
            setName("");
            setError(null);
          }
        }}
        onBlur={() => {
          // Allow submit-from-blur — easier than a dedicated button. Skip if
          // the field is empty so click-elsewhere cancels cleanly.
          if (name.trim()) submit();
          else {
            setEditing(false);
            setError(null);
          }
        }}
        disabled={saving}
        placeholder="Folder name"
        className="w-full px-2 py-1 text-sm border border-gray-200 rounded outline-none focus:border-[#0F4C5C]"
      />
      {error && <p className="text-[11px] text-red-600 mt-1">{error}</p>}
    </div>
  );
}
