"use client";

import { useEffect, useState } from "react";

type Memory = {
  id: string;
  slug: string;
  kind: string;
  title: string;
  body: string;
  source: string | null;
  entity_type: string | null;
  entity_id: string | null;
  tags: string[];
  confidence: number;
  usefulness: number;
  usage_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

type KindFilter = "all" | "knowledge" | "learning" | "contact_memory" | "opportunity_memory" | "playbook";

const KIND_TABS: { key: KindFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "knowledge", label: "Knowledge" },
  { key: "learning", label: "Learnings" },
  { key: "contact_memory", label: "Contacts" },
  { key: "opportunity_memory", label: "Deals" },
  { key: "playbook", label: "Playbooks" },
];

const KIND_BADGE: Record<string, string> = {
  knowledge: "bg-blue-100 text-blue-800",
  learning: "bg-emerald-100 text-emerald-800",
  contact_memory: "bg-purple-100 text-purple-800",
  opportunity_memory: "bg-amber-100 text-amber-800",
  playbook: "bg-indigo-100 text-indigo-800",
};

const NEW_KINDS = ["knowledge", "learning", "playbook"] as const;

export default function BrainClient() {
  const [kind, setKind] = useState<KindFilter>("all");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Memory[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    const params = new URLSearchParams({ limit: "200" });
    if (kind !== "all") params.set("kind", kind);
    if (q.trim()) params.set("q", q.trim());
    try {
      const res = await fetch(`/api/memory?${params.toString()}`);
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "failed to load");
      setError(null);
      setItems(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load");
      setItems([]);
    }
  };

  useEffect(() => {
    // load() only setState()s after `await fetch` (a microtask), so this is not
    // a synchronous cascading render — the rule can't see past the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id);
    try {
      const res = await fetch(`/api/memory/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "update failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "update failed");
    } finally {
      setBusy(null);
      setEditing(null);
    }
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {KIND_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setKind(t.key)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
                kind === t.key
                  ? "bg-gray-900 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex-1 min-w-[200px]" />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
          className="flex items-center gap-2"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search memories…"
            className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-gray-400"
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 text-sm"
          >
            Search
          </button>
        </form>
        <button
          onClick={() => setCreating((v) => !v)}
          className="px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-700 text-sm font-medium"
        >
          {creating ? "Cancel" : "+ New memory"}
        </button>
      </div>

      {creating && (
        <NewMemoryForm
          onCreated={() => {
            setCreating(false);
            load();
          }}
          onError={setError}
        />
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">
          {error}
        </div>
      )}

      {/* List */}
      {items === null ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500">
          No memories{q ? ` matching “${q}”` : ""}. The agents will fill this in as they
          learn, or add one yourself.
        </p>
      ) : (
        <div className="grid gap-3">
          {items.map((m) =>
            editing === m.id ? (
              <EditCard key={m.id} m={m} busy={busy === m.id} onSave={(b) => patch(m.id, b)} onCancel={() => setEditing(null)} />
            ) : (
              <MemoryCard
                key={m.id}
                m={m}
                busy={busy === m.id}
                onEdit={() => setEditing(m.id)}
                onReinforce={(d) => patch(m.id, { reinforce: d })}
                onArchive={() => {
                  if (confirm(`Archive “${m.title}”? It stops being recalled (not deleted).`)) {
                    patch(m.id, { archived: true });
                  }
                }}
              />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function MemoryCard({
  m,
  busy,
  onEdit,
  onReinforce,
  onArchive,
}: {
  m: Memory;
  busy: boolean;
  onEdit: () => void;
  onReinforce: (delta: number) => void;
  onArchive: () => void;
}) {
  return (
    <div className="rounded-lg bg-white border border-gray-200 shadow-sm p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900">{m.title}</h3>
          <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-gray-500">
            <span className={`px-2 py-0.5 rounded-full font-medium ${KIND_BADGE[m.kind] ?? "bg-gray-100 text-gray-700"}`}>
              {m.kind}
            </span>
            {m.source && <span>via {m.source}</span>}
            {m.entity_type && <span>· {m.entity_type}</span>}
            <span>· used {m.usage_count}×</span>
            <span>· score {m.usefulness > 0 ? `+${m.usefulness}` : m.usefulness}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            disabled={busy}
            onClick={() => onReinforce(0.5)}
            title="Helpful — boost recall"
            className="px-2 py-1 rounded hover:bg-gray-100 disabled:opacity-50"
          >
            👍
          </button>
          <button
            disabled={busy}
            onClick={() => onReinforce(-0.5)}
            title="Misleading — demote"
            className="px-2 py-1 rounded hover:bg-gray-100 disabled:opacity-50"
          >
            👎
          </button>
          <button
            disabled={busy}
            onClick={onEdit}
            className="px-2 py-1 rounded text-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50"
          >
            Edit
          </button>
          <button
            disabled={busy}
            onClick={onArchive}
            className="px-2 py-1 rounded text-sm text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          >
            Archive
          </button>
        </div>
      </div>
      {m.body && <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{m.body}</p>}
      {m.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {m.tags.map((t) => (
            <span key={t} className="px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-xs">
              #{t}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function EditCard({
  m,
  busy,
  onSave,
  onCancel,
}: {
  m: Memory;
  busy: boolean;
  onSave: (body: Record<string, unknown>) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(m.title);
  const [body, setBody] = useState(m.body);
  const [tags, setTags] = useState(m.tags.join(", "));
  return (
    <div className="rounded-lg bg-white border-2 border-gray-300 shadow-sm p-4 space-y-2">
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full px-3 py-1.5 rounded-lg border border-gray-300 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-gray-400"
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={4}
        className="w-full px-3 py-1.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
      />
      <input
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        placeholder="comma, separated, tags"
        className="w-full px-3 py-1.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
      />
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-100">
          Cancel
        </button>
        <button
          disabled={busy}
          onClick={() =>
            onSave({
              title,
              body,
              tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
            })
          }
          className="px-3 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-700 text-sm font-medium disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function NewMemoryForm({
  onCreated,
  onError,
}: {
  onCreated: () => void;
  onError: (e: string) => void;
}) {
  const [kind, setKind] = useState<(typeof NEW_KINDS)[number]>("knowledge");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          title: title.trim(),
          body: body.trim(),
          tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
          source: "human",
        }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || "create failed");
      setTitle("");
      setBody("");
      setTags("");
      onCreated();
    } catch (err) {
      onError(err instanceof Error ? err.message : "create failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-lg bg-gray-50 border border-gray-200 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as (typeof NEW_KINDS)[number])}
          className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm bg-white"
        >
          {NEW_KINDS.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title — a clear one-line fact"
          className="flex-1 px-3 py-1.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
        />
      </div>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={3}
        placeholder="Details…"
        className="w-full px-3 py-1.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
      />
      <div className="flex items-center gap-2">
        <input
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="comma, separated, tags"
          className="flex-1 px-3 py-1.5 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400"
        />
        <button
          type="submit"
          disabled={saving || !title.trim()}
          className="px-4 py-1.5 rounded-lg bg-gray-900 text-white hover:bg-gray-700 text-sm font-medium disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save memory"}
        </button>
      </div>
    </form>
  );
}
