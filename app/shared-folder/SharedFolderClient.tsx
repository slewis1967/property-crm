"use client";

/**
 * Shared Folder — the browser UI for the org-wide file library.
 *
 * Client-driven rather than the usual server-fetch-then-render: navigating
 * folders, searching, uploading and restoring are all interactions that would
 * otherwise mean a full server round trip each, and the listing is the same
 * shape every time. The URL is kept in sync with history.replaceState so a
 * folder can still be bookmarked and shared as a link.
 *
 * Uploads go browser → Supabase Storage directly via a signed URL; the bytes
 * never pass through a Netlify function. See app/api/shared-folder/upload-url.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "../../utils/supabase-browser";
import { fmtDateTime } from "../../utils/archive-helpers";
import {
  fmtBytes,
  iconFor,
  isViewable,
  MAX_FILE_BYTES,
  type SharedFolderItem,
  type TreeNode,
} from "../../utils/shared-folder";

type ListResponse = {
  ok: boolean;
  items?: SharedFolderItem[];
  folders?: TreeNode[];
  breadcrumbs?: Array<{ id: string; name: string }>;
  migration_hint?: string;
  stale_parent?: boolean;
  error?: string;
};

type UploadState = {
  key: string;
  name: string;
  status: "uploading" | "failed";
  error?: string;
};

const BRAND = "#0F4C5C";

/** How many files upload at once. Enough to keep a drop of twenty moving,
 *  few enough not to saturate a modest office connection. */
const UPLOAD_CONCURRENCY = 3;

/** "2.0 GB" — rendering this as "2048MB" reads like a mistake. */
const MAX_LABEL = fmtBytes(MAX_FILE_BYTES);

export default function SharedFolderClient({ initialParent }: { initialParent: string | null }) {
  const [parent, setParent] = useState<string | null>(initialParent);
  const [items, setItems] = useState<SharedFolderItem[]>([]);
  const [folders, setFolders] = useState<TreeNode[]>([]);
  const [crumbs, setCrumbs] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [trash, setTrash] = useState(false);

  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [dragging, setDragging] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [movingId, setMovingId] = useState<string | null>(null);
  const [confirmPurgeId, setConfirmPurgeId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const fileInput = useRef<HTMLInputElement>(null);

  /**
   * Refetch the current view. Safe to call from an event handler or from an
   * async action — never from an effect body, which is why the effect below
   * keys off `reloadKey` instead of a callback.
   */
  const reload = useCallback(() => {
    setLoading(true);
    setReloadKey((k) => k + 1);
  }, []);

  // Every setState here happens after the first await (or in `finally`), never
  // synchronously in the effect body — the shape react-hooks/set-state-in-effect
  // requires, and the same one CalendarClient uses. `cancelled` drops a stale
  // response if the user navigates again before this one resolves.
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (trash) params.set("view", "trash");
    else if (search) params.set("q", search);
    else if (parent) params.set("parent", parent);

    (async () => {
      try {
        const res = await fetch(`/api/shared-folder?${params.toString()}`, { cache: "no-store" });
        const json = (await res.json()) as ListResponse;
        if (cancelled) return;
        if (!json.ok) {
          setError(json.error ?? "Could not load the shared folder");
          return;
        }
        setItems(json.items ?? []);
        setFolders(json.folders ?? []);
        setCrumbs(json.breadcrumbs ?? []);
        setHint(json.migration_hint ?? null);
        setError(null);
        // The folder was deleted out from under this tab — fall back to the
        // root rather than leaving the user staring at an empty folder.
        if (json.stale_parent) setParent(null);
      } catch {
        if (!cancelled) setError("Could not reach the server");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [parent, search, trash, reloadKey]);

  // Keep the address bar pointing at the folder on screen so it can be
  // bookmarked, without a server round trip on every navigation.
  useEffect(() => {
    const url = parent && !trash && !search ? `/shared-folder?parent=${parent}` : "/shared-folder";
    window.history.replaceState(null, "", url);
  }, [parent, trash, search]);

  const liveFolders = useMemo(() => folders.filter((f) => !f.deleted_at), [folders]);

  const openFolder = (id: string | null) => {
    setLoading(true);
    setSearch("");
    setQuery("");
    setTrash(false);
    setParent(id);
  };

  // ---------------------------------------------------------------- uploads

  const uploadOne = useCallback(
    async (file: File, key: string) => {
      const fail = (msg: string) =>
        setUploads((u) => u.map((x) => (x.key === key ? { ...x, status: "failed", error: msg } : x)));

      if (file.size > MAX_FILE_BYTES) {
        fail(`Too large (max ${MAX_LABEL})`);
        return;
      }

      try {
        const signRes = await fetch("/api/shared-folder/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            parent_id: parent,
            filename: file.name,
            size: file.size,
            mime_type: file.type || null,
          }),
        });
        const sign = (await signRes.json()) as {
          ok: boolean;
          item_id?: string;
          token?: string;
          path?: string;
          bucket?: string;
          error?: string;
        };
        if (!sign.ok || !sign.token || !sign.path || !sign.item_id || !sign.bucket) {
          fail(sign.error ?? "Could not start the upload");
          return;
        }

        const { error: upErr } = await supabaseBrowser.storage
          .from(sign.bucket)
          .uploadToSignedUrl(sign.path, sign.token, file, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          });
        if (upErr) {
          fail(upErr.message);
          return;
        }

        // Only now does the row become visible in the listing.
        const confirmRes = await fetch(`/api/shared-folder/${sign.item_id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: true }),
        });
        const confirmed = (await confirmRes.json()) as { ok: boolean; error?: string };
        if (!confirmed.ok) {
          fail(confirmed.error ?? "Upload finished but could not be saved");
          return;
        }

        setUploads((u) => u.filter((x) => x.key !== key));
      } catch {
        fail("Upload failed");
      }
    },
    [parent],
  );

  const startUploads = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      const queued = files.map((f, i) => ({
        file: f,
        key: `${f.name}-${f.size}-${i}-${performance.now()}`,
      }));
      setUploads((u) => [
        ...u,
        ...queued.map(({ file, key }) => ({ key, name: file.name, status: "uploading" as const })),
      ]);

      // Simple worker pool — a shared pointer into the queue, drained by
      // UPLOAD_CONCURRENCY loops.
      let next = 0;
      const worker = async () => {
        for (;;) {
          const i = next;
          next += 1;
          if (i >= queued.length) return;
          await uploadOne(queued[i].file, queued[i].key);
        }
      };
      await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, queued.length) }, worker));
      reload();
    },
    [uploadOne, reload],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (trash) return;
    void startUploads(Array.from(e.dataTransfer.files ?? []));
  };

  // ---------------------------------------------------------------- actions

  const download = async (item: SharedFolderItem) => {
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/shared-folder/${item.id}`);
      const json = (await res.json()) as { ok: boolean; url?: string; error?: string };
      if (json.ok && json.url) window.location.href = json.url;
      else setError(json.error ?? "Could not prepare the download");
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Open the file in a new tab.
   *
   * Two things here are load-bearing and both were found by clicking the
   * button rather than by reasoning about it:
   *
   * 1. The tab is opened synchronously, BEFORE the await, and parked on
   *    about:blank while the signed URL is minted. Popup blockers only permit
   *    window.open inside the gesture that triggered it; called after the
   *    fetch resolves it is silently swallowed and the button looks dead.
   *
   * 2. No "noopener" in the feature string. Per spec, noopener makes
   *    window.open return NULL — so the handle vanishes, the fallback fires,
   *    the user's current tab navigates away from the CRM, and an orphan blank
   *    tab is left behind. We sever the back-reference with `tab.opener = null`
   *    instead, which is the same protection while keeping the handle.
   *
   * location.replace, not .href, so about:blank never enters that tab's
   * history and Back doesn't strand the user on a blank page.
   */
  const view = async (item: SharedFolderItem) => {
    const tab = window.open("about:blank", "_blank");
    if (tab) {
      try {
        tab.opener = null;
      } catch {
        // Cross-origin guard; nothing to do, the tab is still ours to navigate.
      }
    }
    setBusyId(item.id);
    try {
      const res = await fetch(`/api/shared-folder/${item.id}?disposition=inline`);
      const json = (await res.json()) as { ok: boolean; url?: string; error?: string };
      if (json.ok && json.url) {
        // Only fall back to this tab if the popup was genuinely blocked.
        if (tab) tab.location.replace(json.url);
        else window.location.href = json.url;
      } else {
        tab?.close();
        setError(json.error ?? "Could not open that file");
      }
    } catch {
      tab?.close();
      setError("Could not open that file");
    } finally {
      setBusyId(null);
    }
  };

  const patchItem = async (id: string, body: Record<string, unknown>) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/shared-folder/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) setError(json.error ?? "That didn't work");
      else reload();
    } finally {
      setBusyId(null);
    }
  };

  const removeItem = async (id: string, permanent: boolean) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/shared-folder/${id}${permanent ? "?permanent=1" : ""}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!json.ok) setError(json.error ?? "Could not delete that");
      else reload();
    } finally {
      setBusyId(null);
      setConfirmPurgeId(null);
    }
  };

  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    const res = await fetch("/api/shared-folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parent_id: parent, name }),
    });
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!json.ok) {
      setError(json.error ?? "Could not create the folder");
      return;
    }
    setNewFolderName("");
    setNewFolderOpen(false);
    reload();
  };

  // ------------------------------------------------------------------ view

  const heading = trash ? "Trash" : search ? `Search: “${search}”` : "Shared Folder";

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!trash) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={`rounded-xl transition ${dragging ? "ring-2 ring-offset-4 ring-[#0F4C5C]" : ""}`}
    >
      <div className="mb-6">
        <div className="flex items-baseline gap-3">
          <h1 className="text-3xl font-bold">{heading}</h1>
          <span className="text-sm text-gray-500">
            {items.length.toLocaleString()} {items.length === 1 ? "item" : "items"}
          </span>
        </div>
        <p className="text-gray-500 text-sm mt-1">
          Shared with everyone in the organisation. Anyone who can sign in to the CRM can view,
          upload and edit here.
        </p>
      </div>

      {hint && (
        <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <strong>Not set up yet.</strong> {hint}
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-start justify-between gap-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="shrink-0 underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={trash}
          onClick={() => fileInput.current?.click()}
          className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
          style={{ backgroundColor: BRAND }}
        >
          ⬆ Upload files
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            void startUploads(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />

        <button
          type="button"
          disabled={trash}
          onClick={() => setNewFolderOpen((v) => !v)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-40"
        >
          📁 New folder
        </button>

        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setLoading(true);
            setTrash(false);
            setSearch(query.trim());
          }}
        >
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search all folders…"
            className="w-56 rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F4C5C]"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                setQuery("");
                setSearch("");
              }}
              className="text-sm text-gray-500 underline"
            >
              Clear
            </button>
          )}
        </form>

        <div className="ml-auto">
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setTrash((v) => !v);
              setSearch("");
              setQuery("");
            }}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              trash ? "border-gray-800 bg-gray-800 text-white" : "border-gray-300 hover:bg-gray-50"
            }`}
          >
            🗑 {trash ? "Back to files" : "Trash"}
          </button>
        </div>
      </div>

      {newFolderOpen && !trash && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
          <input
            autoFocus
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void createFolder();
              if (e.key === "Escape") setNewFolderOpen(false);
            }}
            placeholder="Folder name"
            className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={() => void createFolder()}
            className="rounded px-3 py-1 text-sm font-semibold text-white"
            style={{ backgroundColor: BRAND }}
          >
            Create
          </button>
          <button type="button" onClick={() => setNewFolderOpen(false)} className="text-sm text-gray-500">
            Cancel
          </button>
        </div>
      )}

      {/* Breadcrumbs */}
      {!trash && !search && (
        <nav className="mb-3 flex flex-wrap items-center gap-1 text-sm text-gray-600">
          <button type="button" onClick={() => openFolder(null)} className="hover:underline">
            Shared Folder
          </button>
          {crumbs.map((c, i) => (
            <span key={c.id} className="flex items-center gap-1">
              <span className="text-gray-400">/</span>
              {i === crumbs.length - 1 ? (
                <span className="font-semibold text-gray-900">{c.name}</span>
              ) : (
                <button type="button" onClick={() => openFolder(c.id)} className="hover:underline">
                  {c.name}
                </button>
              )}
            </span>
          ))}
        </nav>
      )}

      {/* In-flight uploads */}
      {uploads.length > 0 && (
        <div className="mb-4 space-y-1 rounded-lg border border-gray-200 bg-white p-3 text-sm">
          {uploads.map((u) => (
            <div key={u.key} className="flex items-center justify-between gap-3">
              <span className="truncate">
                {u.status === "uploading" ? "⏳" : "⚠️"} {u.name}
              </span>
              <span className={u.status === "failed" ? "text-red-600" : "text-gray-500"}>
                {u.status === "failed" ? (u.error ?? "Failed") : "Uploading…"}
              </span>
              {u.status === "failed" && (
                <button
                  type="button"
                  onClick={() => setUploads((s) => s.filter((x) => x.key !== u.key))}
                  className="text-gray-400 hover:text-gray-700"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Listing */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-gray-400">Loading…</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            {trash
              ? "Nothing in the trash."
              : search
                ? "No files match that search."
                : "This folder is empty — drop files anywhere on this page to add them."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2 font-semibold">Name</th>
                  <th className="px-4 py-2 font-semibold">Size</th>
                  <th className="px-4 py-2 font-semibold">Modified</th>
                  <th className="px-4 py-2 font-semibold">Added by</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const busy = busyId === item.id;
                  return (
                    <tr key={item.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                      <td className="px-4 py-2">
                        {renamingId === item.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              autoFocus
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  setRenamingId(null);
                                  void patchItem(item.id, { name: renameValue });
                                }
                                if (e.key === "Escape") setRenamingId(null);
                              }}
                              className="w-64 rounded border border-gray-300 px-2 py-1 text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setRenamingId(null);
                                void patchItem(item.id, { name: renameValue });
                              }}
                              className="text-sm font-semibold"
                              style={{ color: BRAND }}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setRenamingId(null)}
                              className="text-sm text-gray-500"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : item.kind === "folder" && !trash ? (
                          <button
                            type="button"
                            onClick={() => openFolder(item.id)}
                            className="flex items-center gap-2 font-medium hover:underline"
                          >
                            <span>{iconFor(item)}</span>
                            {item.name}
                          </button>
                        ) : (
                          <span className="flex items-center gap-2">
                            <span>{iconFor(item)}</span>
                            {item.name}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-gray-500">{fmtBytes(item.size_bytes)}</td>
                      <td className="px-4 py-2 text-gray-500">{fmtDateTime(item.updated_at)}</td>
                      <td className="px-4 py-2 text-gray-500">{item.created_by}</td>
                      <td className="px-4 py-2 text-right whitespace-nowrap">
                        {trash ? (
                          <span className="flex items-center justify-end gap-3">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void patchItem(item.id, { restore: true })}
                              className="text-sm font-semibold disabled:opacity-40"
                              style={{ color: BRAND }}
                            >
                              Restore
                            </button>
                            {confirmPurgeId === item.id ? (
                              <>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void removeItem(item.id, true)}
                                  className="text-sm font-semibold text-red-600 disabled:opacity-40"
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmPurgeId(null)}
                                  className="text-sm text-gray-500"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmPurgeId(item.id)}
                                className="text-sm text-red-600"
                              >
                                Delete forever
                              </button>
                            )}
                          </span>
                        ) : (
                          <span className="flex items-center justify-end gap-3">
                            {isViewable(item) && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void view(item)}
                                title={`Open ${item.name} in a new tab`}
                                className="text-sm font-semibold disabled:opacity-40"
                                style={{ color: BRAND }}
                              >
                                View
                              </button>
                            )}
                            {item.kind === "file" && (
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void download(item)}
                                className="text-sm text-gray-600 hover:underline disabled:opacity-40"
                              >
                                Download
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                setRenamingId(item.id);
                                setRenameValue(item.name);
                              }}
                              className="text-sm text-gray-600 hover:underline"
                            >
                              Rename
                            </button>
                            {movingId === item.id ? (
                              <select
                                autoFocus
                                defaultValue=""
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setMovingId(null);
                                  if (v !== "") {
                                    void patchItem(item.id, { parent_id: v === "__root__" ? null : v });
                                  }
                                }}
                                onBlur={() => setMovingId(null)}
                                className="rounded border border-gray-300 px-2 py-1 text-sm"
                              >
                                <option value="">Move to…</option>
                                <option value="__root__">Shared Folder (root)</option>
                                {liveFolders
                                  .filter((f) => f.id !== item.id)
                                  .map((f) => (
                                    <option key={f.id} value={f.id}>
                                      {f.name}
                                    </option>
                                  ))}
                              </select>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setMovingId(item.id)}
                                className="text-sm text-gray-600 hover:underline"
                              >
                                Move
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void removeItem(item.id, false)}
                              className="text-sm text-red-600 disabled:opacity-40"
                            >
                              Delete
                            </button>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!trash && (
        <p className="mt-3 text-xs text-gray-400">
          Deleted items go to the Trash and can be restored by anyone in the organisation. Files up
          to {MAX_LABEL}.
        </p>
      )}
    </div>
  );
}
