"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import BulkUploadModal from "./BulkUploadModal";
import DeleteReasonModal from "../components/DeleteReasonModal";
import { ALLOWED_PAGE_SIZES, type PageSize } from "../../utils/pagination";
import { toCsv, type CsvColumn } from "../../utils/csv";

export type Contact = {
  id: string;
  created_at: string | null;
  updated_at: string | null;
  name: string | null;
  full_name: string | null;
  first_name: string | null;
  email: string | null;
  phone: string | null;
  buyer_type: string | null;
  state: string | null;
  preferred_state: string | null;
  budget: number | null;
  budget_min: number | null;
  budget_max: number | null;
  finance_status: string | null;
  timeframe: string | null;
  lead_score: number | null;
  temperature: string | null;
  status: string | null;
  source: string | null;
  ghl_contact_id: string | null;
  tags: string[] | null;
  notes: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const displayName = (c: Contact) => c.full_name || c.name || "Unknown";

const tempStyle = (t: string | null) => {
  if (t === "hot") return { badge: "bg-red-100 text-red-700 border-red-200", dot: "bg-red-500" };
  if (t === "warm") return { badge: "bg-amber-100 text-amber-700 border-amber-200", dot: "bg-amber-400" };
  return { badge: "bg-blue-100 text-blue-700 border-blue-200", dot: "bg-blue-400" };
};

const statusStyle = (s: string | null) => {
  if (s === "matched") return "bg-green-100 text-green-700";
  if (s === "contacted") return "bg-sky-100 text-sky-700";
  if (s === "new") return "bg-gray-100 text-gray-500";
  return "bg-purple-100 text-purple-700";
};

const tagColor = (tag: string) => {
  if (tag.startsWith("source:")) return "bg-gray-100 text-gray-500";
  if (tag === "elvis-triaged") return "bg-purple-100 text-purple-600";
  if (["hot", "warm", "cold"].includes(tag)) {
    if (tag === "hot") return "bg-red-100 text-red-600";
    if (tag === "warm") return "bg-amber-100 text-amber-600";
    return "bg-blue-100 text-blue-600";
  }
  if (["fhb", "investor", "downsizer", "sda"].includes(tag)) return "bg-indigo-100 text-indigo-600";
  return "bg-gray-100 text-gray-600";
};

const fmt = (n: number | null | undefined) =>
  n ? `$${Number(n).toLocaleString()}` : "—";

const avatar = (c: Contact) => {
  const n = displayName(c);
  return n !== "Unknown" ? n[0].toUpperCase() : "?";
};

const avatarBg = (c: Contact) => {
  const colors = ["bg-violet-600","bg-blue-600","bg-emerald-600","bg-rose-600","bg-amber-600","bg-cyan-600","bg-pink-600","bg-indigo-600"];
  const n = displayName(c);
  return colors[n.charCodeAt(0) % colors.length];
};

// ── Contact Types ─────────────────────────────────────────────────────────────

const CONTACT_TYPES = [
  { key: "Investor",         label: "Investor",          icon: "📈" },
  { key: "First Home Buyer", label: "First Home Buyer",  icon: "🏠" },
  { key: "Home Buyer",       label: "Home Buyer",        icon: "🏡" },
  { key: "SMSF Buyer",       label: "SMSF Buyer",        icon: "🏦" },
  { key: "Downsizer",        label: "Downsizer",         icon: "📦" },
  { key: "NDIS",             label: "NDIS",              icon: "♿" },
  { key: "Other",            label: "Other",             icon: "👤" },
  { key: "Business Contact", label: "Business Contact",  icon: "💼" },
];

// ── Main Component ────────────────────────────────────────────────────────────

export default function ContactsClient({
  initialContacts,
  initialTotal = 0,
  initialPageSize = 50,
}: {
  initialContacts: Contact[];
  /** Total contacts at server-render time (live + archive, deduped).
   *  The client updates this as more pages arrive. */
  initialTotal?: number;
  /** Page size the server used for the first render. Preserved across
   *  the "Load more" call so chunk size stays consistent. */
  initialPageSize?: PageSize;
}) {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>(initialContacts);
  const [pageSize, setPageSize] = useState<PageSize>(initialPageSize);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(initialTotal);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const hasMore = contacts.length < total;
  const fetchSeq = useRef(0);
  const [selected, setSelected] = useState<Contact | null>(null);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [search, setSearch] = useState("");
  const [filterTemp, setFilterTemp] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterTag, setFilterTag] = useState<string>("all");
  const [activeTypeKey, setActiveTypeKey] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"updated" | "score" | "name" | "created">("updated");
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<{ ids: string[]; label: string } | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showAssignType, setShowAssignType] = useState(false);
  const [assigningRow, setAssigningRow] = useState<string | null>(null);
  const [showAddTag, setShowAddTag] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [taggingBusy, setTaggingBusy] = useState(false);
  const [tagError, setTagError] = useState<string | null>(null);
  const [savingNote, setSavingNote] = useState(false);
  const [noteText, setNoteText] = useState("");
  // Last-persisted note value. State (not a ref) so the "Save" button's
  // dirty check can be read during render without touching a ref.
  const [savedNote, setSavedNote] = useState("");

  // Restore saved page size on first mount. We just update the
  // dropdown state; the data on screen is whatever the server
  // shipped. If the saved size differs the user will see the
  // mismatch in the selector but it self-corrects on the next
  // explicit user action or hard refresh.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("contacts.pageSize");
      if (saved && (ALLOWED_PAGE_SIZES as readonly number[]).includes(Number(saved))) {
        // Defer out of the effect body so we're not calling setState
        // synchronously on mount (avoids cascading-render lint + churn).
        queueMicrotask(() => setPageSize(Number(saved) as PageSize));
      }
    } catch {}
  }, []);

  const setPageSizeAndReset = useCallback((next: PageSize) => {
    try { localStorage.setItem("contacts.pageSize", String(next)); } catch {}
    setPageSize(next);
    setPage(1);
    setLoadingMore(true);
    setLoadError(null);
    fetchSeq.current += 1;
    const seq = fetchSeq.current;
    fetch(`/api/contacts/list?page=1&pageSize=${next}`)
      .then((r) => r.ok ? r.json() : r.json().then((b: { error?: string }) => Promise.reject(new Error(b?.error || `HTTP ${r.status}`))))
      .then((data: { rows: Contact[]; total: number; pageSize: PageSize }) => {
        if (seq !== fetchSeq.current) return;
        setContacts(data.rows);
        setTotal(data.total);
        setPageSize(data.pageSize as PageSize);
        setPage(1);
        setCheckedIds(new Set());
        setSelected(null);
      })
      .catch((e: unknown) => {
        if (seq !== fetchSeq.current) return;
        setLoadError(e instanceof Error ? e.message : "Failed to load contacts");
      })
      .finally(() => {
        if (seq === fetchSeq.current) setLoadingMore(false);
      });
  }, []);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    setLoadError(null);
    fetchSeq.current += 1;
    const seq = fetchSeq.current;
    const nextPage = page + 1;
    fetch(`/api/contacts/list?page=${nextPage}&pageSize=${pageSize}`)
      .then((r) => r.ok ? r.json() : r.json().then((b: { error?: string }) => Promise.reject(new Error(b?.error || `HTTP ${r.status}`))))
      .then((data: { rows: Contact[]; total: number; pageSize: PageSize }) => {
        if (seq !== fetchSeq.current) return;
        setContacts((prev) => [...prev, ...data.rows]);
        setTotal(data.total);
        setPage(nextPage);
      })
      .catch((e: unknown) => {
        if (seq !== fetchSeq.current) return;
        setLoadError(e instanceof Error ? e.message : "Failed to load more");
      })
      .finally(() => {
        if (seq === fetchSeq.current) setLoadingMore(false);
      });
  }, [loadingMore, hasMore, page, pageSize]);

  const openContact = (c: Contact) => {
    router.push(`/contacts/${c.id}`);
  };

  const toggleCheck = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCheckedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const requestDelete = (ids: string[], label: string) => {
    setDeleteError(null);
    setConfirmDelete({ ids, label });
  };

  const executeDelete = async (reason: string, name: string) => {
    if (!confirmDelete) return;
    const { ids } = confirmDelete;
    setDeleteBusy(true);
    setDeleteError(null);

    try {
      let res: Response;
      if (ids.length === 1) {
        res = await fetch(`/api/contacts/${ids[0]}`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason, deleter_name: name }),
        });
      } else {
        res = await fetch("/api/contacts/bulk-delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, reason, deleter_name: name }),
        });
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.error || "Failed to delete. Please try again.");
        return;
      }
      setConfirmDelete(null);
      setDeletingIds(new Set(ids));
      setContacts(prev => prev.filter(c => !ids.includes(c.id)));
      setCheckedIds(prev => { const n = new Set(prev); ids.forEach(id => n.delete(id)); return n; });
      setDeletingIds(new Set());
    } catch {
      setDeleteError("Failed to delete. Please try again.");
    } finally {
      setDeleteBusy(false);
    }
  };

  const assignType = async (ids: string[], type: string) => {
    setShowAssignType(false);
    setAssigningRow(null);
    if (ids.length === 1) {
      await fetch(`/api/contacts/${ids[0]}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyer_type: type }),
      });
    } else {
      await fetch("/api/contacts/bulk-update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, buyer_type: type }),
      });
    }
    setContacts(prev => prev.map(c => ids.includes(c.id) ? { ...c, buyer_type: type } : c));
    setCheckedIds(new Set());
  };

  // Save notes via API
  const saveNote = async () => {
    if (!selected || noteText === savedNote) return;
    setSavingNote(true);
    try {
      await fetch(`/api/contacts/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: noteText }),
      });
      setSavedNote(noteText);
    } finally {
      setSavingNote(false);
    }
  };

  // ── Filtering + Sorting ──────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = contacts.filter((c) => {
      if (q) {
        const hit =
          [c.name, c.full_name, c.email, c.phone, c.buyer_type, c.state, c.preferred_state]
            .some((v) => v?.toLowerCase().includes(q)) ||
          (c.tags || []).some((t) => t.toLowerCase().includes(q));
        if (!hit) return false;
      }
      if (filterTemp !== "all") {
        if (filterTemp === "none") {
          if (c.temperature) return false;
        } else if (c.temperature !== filterTemp) return false;
      }
      if (filterStatus !== "all" && c.status !== filterStatus) return false;
      if (filterTag !== "all") {
        if (filterTag === "__notags__") {
          if (c.tags && c.tags.length > 0) return false;
        } else if (!(Array.isArray(c.tags) && c.tags.includes(filterTag))) return false;
      }
      if (activeTypeKey !== "all") {
        if (activeTypeKey === "__unassigned__") {
          if (c.buyer_type) return false;
        } else if ((c.buyer_type || "").toLowerCase() !== activeTypeKey.toLowerCase()) {
          return false;
        }
      }
      return true;
    });
    return out.sort((a, b) => {
      if (sortBy === "score") return (b.lead_score ?? -1) - (a.lead_score ?? -1);
      if (sortBy === "name") {
        return (a.full_name || a.name || "Unknown").localeCompare(b.full_name || b.name || "Unknown");
      }
      if (sortBy === "created") return (b.created_at || "").localeCompare(a.created_at || "");
      return (b.updated_at || "").localeCompare(a.updated_at || "");
    });
  }, [contacts, search, filterTemp, filterStatus, filterTag, activeTypeKey, sortBy]);

  // Select-all toggles the currently-filtered set (respects the active
  // search / tag / type filters). Declared after `filtered` so it never
  // references the memo before its declaration.
  const toggleCheckAll = () => {
    if (checkedIds.size === filtered.length) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(filtered.map((c) => c.id)));
    }
  };

  // Rows targeted by a bulk action: the checked selection, or — when
  // nothing is checked — the whole currently-filtered list.
  const exportRows = checkedIds.size > 0 ? filtered.filter((c) => checkedIds.has(c.id)) : filtered;

  // Client-side CSV export. Builds the CSV with the pure `toCsv` helper,
  // then triggers a download via a Blob object URL — no server round-trip.
  const exportCsv = () => {
    const columns: CsvColumn<Contact>[] = [
      { header: "Name", value: (c) => displayName(c) },
      { header: "Email", value: (c) => c.email },
      { header: "Phone", value: (c) => c.phone },
      { header: "Type", value: (c) => c.buyer_type },
      { header: "State", value: (c) => c.preferred_state || c.state },
      { header: "Status", value: (c) => c.status },
      { header: "Temperature", value: (c) => c.temperature },
      { header: "Lead Score", value: (c) => c.lead_score },
      { header: "Tags", value: (c) => (c.tags || []).join("; ") },
    ];
    // Prepend a UTF-8 BOM so Excel opens non-ASCII names correctly.
    const csv = "\uFEFF" + toCsv(exportRows, columns);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `contacts-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Add a tag to every checked contact. Optimistic — the UI updates first,
  // then each contact is PATCHed (reusing the existing /api/contacts/[id]
  // tags update path); on any failure we roll back to the pre-change state.
  const applyBulkTag = async () => {
    const tag = tagInput.trim();
    const ids = Array.from(checkedIds);
    if (!tag || ids.length === 0) return;

    setTaggingBusy(true);
    setTagError(null);
    const snapshot = contacts;

    const nextContacts = contacts.map((c) =>
      checkedIds.has(c.id) && !(c.tags || []).includes(tag)
        ? { ...c, tags: [...(c.tags || []), tag] }
        : c
    );
    setContacts(nextContacts);

    try {
      const targets = nextContacts.filter((c) => checkedIds.has(c.id));
      const results = await Promise.all(
        targets.map((c) =>
          fetch(`/api/contacts/${c.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tags: c.tags }),
          }).then((r) => r.ok).catch(() => false)
        )
      );
      if (results.some((ok) => !ok)) throw new Error("Some contacts could not be updated");
      setShowAddTag(false);
      setTagInput("");
      setCheckedIds(new Set());
    } catch (e) {
      setContacts(snapshot); // rollback
      setTagError(e instanceof Error ? e.message : "Failed to add tag");
    } finally {
      setTaggingBusy(false);
    }
  };

  // Unique tag values across all contacts, with a count for each. Used to
  // populate the tag-filter dropdown — sorted by frequency so the heavy
  // hitters land at the top.
  const tagOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of contacts) {
      for (const t of (c.tags || [])) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [contacts]);

  // Stats
  const hot = contacts.filter((c) => c.temperature === "hot").length;
  const warm = contacts.filter((c) => c.temperature === "warm").length;
  const matched = contacts.filter((c) => c.status === "matched").length;
  const avgScore = contacts.filter((c) => c.lead_score).length
    ? Math.round(contacts.reduce((s, c) => s + (c.lead_score || 0), 0) / contacts.filter((c) => c.lead_score).length)
    : 0;

  const unassignedCount = contacts.filter(c => !c.buyer_type).length;

  // ── Panel contact (kept in sync if contacts array updates) ──────────────────
  const panel = selected;

  return (
    <>
    {showBulkUpload && (
      <BulkUploadModal
        onClose={() => setShowBulkUpload(false)}
        onUploaded={(count) => {
          setShowBulkUpload(false);
          window.location.reload();
        }}
      />
    )}

    {/* Confirm delete dialog — requires a reason + the user's name */}
    <DeleteReasonModal
      open={confirmDelete !== null}
      entityLabel={confirmDelete?.label ?? ""}
      entityType="contact"
      busy={deleteBusy}
      error={deleteError}
      onCancel={() => { setConfirmDelete(null); setDeleteError(null); }}
      onConfirm={executeDelete}
    />
    <div className="flex h-full gap-0 -mx-4 lg:-mx-8 -my-4 lg:-my-8 overflow-hidden">

      {/* ── TYPE SIDEBAR — hidden on mobile (type filter folds into the
            top-bar select on smaller screens via the additional dropdown
            added below the search bar). ── */}
      <div className="hidden md:flex w-52 flex-shrink-0 bg-white border-r border-gray-100 flex-col overflow-y-auto">
        <div className="px-4 pt-5 pb-3">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Contact Types</p>
        </div>
        <nav className="flex-1 px-2 pb-4 space-y-0.5">
          {/* All */}
          <button
            onClick={() => { setActiveTypeKey("all"); setCheckedIds(new Set()); }}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition ${activeTypeKey === "all" ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"}`}
          >
            <span className="flex items-center gap-2"><span>👥</span> All Contacts</span>
            <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${activeTypeKey === "all" ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500"}`}>{contacts.length}</span>
          </button>

          <div className="pt-2 pb-1 px-3">
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">By Type</p>
          </div>

          {CONTACT_TYPES.map(ct => {
            const count = contacts.filter(c => (c.buyer_type || "").toLowerCase() === ct.key.toLowerCase()).length;
            const active = activeTypeKey === ct.key;
            return (
              <button key={ct.key}
                onClick={() => { setActiveTypeKey(ct.key); setCheckedIds(new Set()); }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition ${active ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"}`}
              >
                <span className="flex items-center gap-2"><span>{ct.icon}</span> {ct.label}</span>
                {count > 0 && <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${active ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500"}`}>{count}</span>}
              </button>
            );
          })}

          {unassignedCount > 0 && (
            <>
              <div className="pt-2 pb-1 px-3">
                <p className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Other</p>
              </div>
              <button
                onClick={() => { setActiveTypeKey("__unassigned__"); setCheckedIds(new Set()); }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition ${activeTypeKey === "__unassigned__" ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-50"}`}
              >
                <span className="flex items-center gap-2"><span>❓</span> Unassigned</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${activeTypeKey === "__unassigned__" ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-500"}`}>{unassignedCount}</span>
              </button>
            </>
          )}
        </nav>
      </div>

      {/* ── MAIN PANE ── */}
      <div className={`flex flex-col flex-1 min-w-0 overflow-hidden transition-all duration-200 ${panel ? "mr-[420px]" : ""}`}>

        {/* Header */}
        <div className="px-8 pt-8 pb-4 bg-white border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {activeTypeKey === "all" ? "All Contacts" : activeTypeKey === "__unassigned__" ? "Unassigned" : (CONTACT_TYPES.find(t => t.key === activeTypeKey)?.icon + " " + activeTypeKey)}
              </h1>
              <p className="text-gray-400 text-sm mt-0.5">
                {contacts.length.toLocaleString()} loaded
                {contacts.length < total && (
                  <span> of {total.toLocaleString()}</span>
                )}{" "}
                · {filtered.length.toLocaleString()} showing
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700 font-medium">🔥 {hot} hot</span>
              <span className="text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">⚡ {warm} warm</span>
              <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700 font-medium">✓ {matched} matched</span>
              <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600 font-medium">avg score {avgScore}</span>
              {checkedIds.size > 0 && (
                <div className="flex items-center gap-2">
                  {/* Assign Type dropdown */}
                  <div className="relative">
                    <button
                      onClick={() => setShowAssignType(v => !v)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
                    >
                      Assign Type ▾
                    </button>
                    {showAssignType && (
                      <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-200 rounded-xl shadow-xl z-50 py-1 overflow-hidden">
                        {CONTACT_TYPES.map(ct => (
                          <button key={ct.key}
                            onClick={() => assignType(Array.from(checkedIds), ct.key)}
                            className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition"
                          >
                            <span>{ct.icon}</span> {ct.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Add tag to selected */}
                  <div className="relative">
                    <button
                      onClick={() => { setShowAddTag(v => !v); setTagError(null); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
                    >
                      🏷️ Add Tag ▾
                    </button>
                    {showAddTag && (
                      <div className="absolute top-full left-0 mt-1 w-60 bg-white border border-gray-200 rounded-xl shadow-xl z-50 p-3">
                        <p className="text-xs font-semibold text-gray-500 mb-2">
                          Tag {checkedIds.size} selected contact{checkedIds.size !== 1 ? "s" : ""}
                        </p>
                        <input
                          autoFocus
                          list="bulk-tag-options"
                          value={tagInput}
                          onChange={(e) => setTagInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") applyBulkTag(); }}
                          placeholder="Tag name…"
                          className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <datalist id="bulk-tag-options">
                          {tagOptions.map(([tag]) => (
                            <option key={tag} value={tag} />
                          ))}
                        </datalist>
                        {tagError && <p className="text-xs text-red-600 mt-1.5">{tagError}</p>}
                        <div className="flex gap-2 mt-2.5">
                          <button
                            onClick={() => { setShowAddTag(false); setTagInput(""); setTagError(null); }}
                            className="flex-1 py-1.5 text-xs font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={applyBulkTag}
                            disabled={!tagInput.trim() || taggingBusy}
                            className="flex-1 py-1.5 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 transition disabled:opacity-50"
                          >
                            {taggingBusy ? "Applying…" : "Apply"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => requestDelete(Array.from(checkedIds), `${checkedIds.size} contact${checkedIds.size !== 1 ? "s" : ""}`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                  >
                    🗑️ Delete {checkedIds.size}
                  </button>
                </div>
              )}
              <button
                onClick={exportCsv}
                disabled={exportRows.length === 0}
                title={checkedIds.size > 0 ? `Export ${checkedIds.size} selected` : "Export the filtered list"}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition disabled:opacity-50"
              >
                ⬇ Export CSV{checkedIds.size > 0 ? ` (${checkedIds.size})` : ""}
              </button>
              <button
                onClick={() => setShowBulkUpload(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
              >
                ↑ Bulk Upload
              </button>
            </div>
          </div>

          {/* Search + Filters */}
          <div className="flex gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">🔍</span>
              <input
                className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Search name, email, phone, tags…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Mobile-only type selector — desktop has the same filter as a
                sidebar to the left, hidden under md. */}
            <select
              className="md:hidden text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={activeTypeKey}
              onChange={(e) => { setActiveTypeKey(e.target.value); setCheckedIds(new Set()); }}
            >
              <option value="all">All contact types ({contacts.length})</option>
              {CONTACT_TYPES.map((ct) => {
                const count = contacts.filter((c) => (c.buyer_type || "").toLowerCase() === ct.key.toLowerCase()).length;
                return (
                  <option key={ct.key} value={ct.key}>
                    {ct.icon} {ct.label}{count > 0 ? ` (${count})` : ""}
                  </option>
                );
              })}
              {unassignedCount > 0 && (
                <option value="__unassigned__">❓ Unassigned ({unassignedCount})</option>
              )}
            </select>

            <select
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filterTemp}
              onChange={(e) => setFilterTemp(e.target.value)}
            >
              <option value="all">All temperatures</option>
              <option value="hot">🔥 Hot</option>
              <option value="warm">⚡ Warm</option>
              <option value="cold">❄️ Cold</option>
              <option value="none">No temp</option>
            </select>

            <select
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="new">New</option>
              <option value="matched">Matched</option>
              <option value="contacted">Contacted</option>
            </select>

            <select
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={filterTag}
              onChange={(e) => setFilterTag(e.target.value)}
            >
              <option value="all">All tags</option>
              <option value="__notags__">No tags</option>
              {tagOptions.map(([tag, count]) => (
                <option key={tag} value={tag}>
                  {tag} ({count})
                </option>
              ))}
            </select>

            <select
              className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "updated" | "score" | "name" | "created")}
            >
              <option value="updated">Sort: Last updated</option>
              <option value="score">Sort: Lead score</option>
              <option value="name">Sort: Name</option>
              <option value="created">Sort: Created</option>
            </select>
          </div>
        </div>

        {/* Contact List */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <p className="text-lg mb-1">No contacts found</p>
              <p className="text-sm">Try adjusting your search or filters</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100 sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-3 w-8">
                    <input type="checkbox"
                      checked={filtered.length > 0 && checkedIds.size === filtered.length}
                      ref={el => { if (el) el.indeterminate = checkedIds.size > 0 && checkedIds.size < filtered.length; }}
                      onChange={toggleCheckAll}
                      onClick={e => e.stopPropagation()}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                    />
                  </th>
                  <th className="text-left px-2 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-8"></th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Contact</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Budget</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">State</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Score</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tags</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Updated</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((c) => {
                  const ts = tempStyle(c.temperature);
                  const isSelected = panel?.id === c.id;
                  const isChecked = checkedIds.has(c.id);
                  const isDeleting = deletingIds.has(c.id);
                  return (
                    <tr
                      key={c.id}
                      onClick={() => openContact(c)}
                      className={`cursor-pointer transition-colors hover:bg-blue-50 ${isSelected ? "bg-blue-50 border-l-2 border-blue-500" : ""} ${isChecked ? "bg-blue-50" : ""} ${isDeleting ? "opacity-40 pointer-events-none" : ""}`}
                    >
                      {/* Checkbox */}
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <input type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          onClick={e => toggleCheck(c.id, e)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 cursor-pointer"
                        />
                      </td>
                      {/* Avatar */}
                      <td className="px-2 py-3">
                        <div className={`w-8 h-8 rounded-full ${avatarBg(c)} text-white flex items-center justify-center text-xs font-bold flex-shrink-0`}>
                          {avatar(c)}
                        </div>
                      </td>

                      {/* Name + email */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {c.temperature && (
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ts.dot}`}></span>
                          )}
                          <div>
                            <p className="font-semibold text-gray-900">{displayName(c)}</p>
                            <p className="text-xs text-gray-400">{c.email || c.phone || "—"}</p>
                          </div>
                        </div>
                      </td>

                      {/* Buyer type — click to change */}
                      <td className="px-4 py-3 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <div className="relative inline-block">
                          <button
                            onClick={() => setAssigningRow(assigningRow === c.id ? null : c.id)}
                            className={`px-2 py-0.5 rounded text-xs font-medium border transition hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-700 ${c.buyer_type ? "bg-indigo-50 text-indigo-700 border-indigo-200" : "bg-gray-50 text-gray-400 border-gray-200"}`}
                          >
                            {c.buyer_type || "Set type ▾"}
                          </button>
                          {assigningRow === c.id && (
                            <div className="absolute top-full left-0 mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-xl z-50 py-1 overflow-hidden">
                              {CONTACT_TYPES.map(ct => (
                                <button key={ct.key}
                                  onClick={() => assignType([c.id], ct.key)}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition"
                                >
                                  <span>{ct.icon}</span> {ct.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Budget */}
                      <td className="px-4 py-3 text-gray-700 whitespace-nowrap font-medium">
                        {fmt(c.budget_max || c.budget)}
                      </td>

                      {/* State */}
                      <td className="px-4 py-3 text-gray-500">{c.preferred_state || c.state || "—"}</td>

                      {/* Score */}
                      <td className="px-4 py-3">
                        {c.lead_score != null ? (
                          <div className="flex items-center gap-1.5">
                            <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${c.lead_score >= 70 ? "bg-green-500" : c.lead_score >= 40 ? "bg-amber-400" : "bg-red-400"}`}
                                style={{ width: `${Math.min(c.lead_score, 100)}%` }}
                              />
                            </div>
                            <span className="text-xs font-semibold text-gray-700">{c.lead_score}</span>
                          </div>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        {c.status ? (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${statusStyle(c.status)}`}>
                            {c.status}
                          </span>
                        ) : "—"}
                      </td>

                      {/* Tags */}
                      <td className="px-4 py-3">
                        <div className="flex gap-1 flex-wrap max-w-[200px]">
                          {(c.tags || []).slice(0, 3).map((tag, i) => (
                            <span key={i} className={`px-1.5 py-0.5 rounded text-xs font-medium ${tagColor(tag)}`}>
                              {tag}
                            </span>
                          ))}
                          {(c.tags || []).length > 3 && (
                            <span className="px-1.5 py-0.5 rounded text-xs text-gray-400">+{(c.tags || []).length - 3}</span>
                          )}
                        </div>
                      </td>

                      {/* Updated */}
                      <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                        {c.updated_at ? new Date(c.updated_at).toLocaleDateString("en-AU") : "—"}
                      </td>

                      {/* Delete */}
                      <td className="px-2 py-3" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={() => requestDelete([c.id], displayName(c))}
                          className="p-1.5 rounded-lg text-gray-300 hover:text-red-600 hover:bg-red-50 transition"
                          title="Delete contact"
                        >
                          🗑️
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {/* Page size selector + Load more button. Lives at the
              bottom of the table region so the user can pull more
              rows after they finish scrolling. */}
          <div className="flex items-center justify-between mt-4 gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label htmlFor="contacts-page-size" className="text-xs text-gray-500">
                Show
              </label>
              <select
                id="contacts-page-size"
                value={pageSize}
                onChange={(e) => setPageSizeAndReset(Number(e.target.value) as PageSize)}
                disabled={loadingMore}
                className="text-xs px-2 py-1 border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
              >
                {ALLOWED_PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>{n} per page</option>
                ))}
              </select>
              {loadingMore && <span className="text-xs text-gray-400">loading…</span>}
            </div>
            {loadError && (
              <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {loadError}
              </div>
            )}
            {hasMore ? (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="px-5 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-50 disabled:cursor-wait"
              >
                {loadingMore
                  ? "Loading…"
                  : `Load more (${contacts.length.toLocaleString()} of ${total.toLocaleString()})`}
              </button>
            ) : (
              contacts.length > 0 && (
                <p className="text-xs text-gray-400">All {total.toLocaleString()} loaded</p>
              )
            )}
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL (slide-out) ── */}
      <div
        className={`fixed top-0 right-0 h-full w-[420px] bg-white border-l border-gray-200 shadow-2xl flex flex-col transition-transform duration-200 z-50 ${panel ? "translate-x-0" : "translate-x-full"}`}
      >
        {panel && (
          <>
            {/* Panel header */}
            <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full ${avatarBg(panel)} text-white flex items-center justify-center text-lg font-bold flex-shrink-0`}>
                  {avatar(panel)}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 leading-tight">{displayName(panel)}</h2>
                  <p className="text-sm text-gray-400">{panel.email || "No email"}</p>
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition mt-0.5"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Badges row */}
              <div className="px-6 py-4 flex flex-wrap gap-2 border-b border-gray-50">
                {panel.temperature && (
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border capitalize ${tempStyle(panel.temperature).badge}`}>
                    {panel.temperature === "hot" ? "🔥" : panel.temperature === "warm" ? "⚡" : "❄️"} {panel.temperature}
                  </span>
                )}
                {panel.status && (
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${statusStyle(panel.status)}`}>
                    {panel.status}
                  </span>
                )}
                {panel.buyer_type && (
                  <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 capitalize">
                    {panel.buyer_type}
                  </span>
                )}
                {panel.source && (
                  <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500 capitalize">
                    {panel.source.replace(/_/g, " ")}
                  </span>
                )}
              </div>

              {/* Contact details */}
              <div className="px-6 py-4 border-b border-gray-50">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Contact Info</p>
                <div className="space-y-2.5">
                  {[
                    ["📧 Email", panel.email],
                    ["📱 Phone", panel.phone],
                    ["🏡 State", panel.preferred_state || panel.state],
                    ["⏱ Timeframe", panel.timeframe],
                    ["💰 Finance", panel.finance_status],
                    ["🔑 GHL ID", panel.ghl_contact_id],
                  ].filter(([, v]) => v).map(([label, value]) => (
                    <div key={label as string} className="flex items-center justify-between">
                      <span className="text-sm text-gray-400">{label}</span>
                      <span className="text-sm font-medium text-gray-900 text-right max-w-[220px] break-words">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Lead profile */}
              <div className="px-6 py-4 border-b border-gray-50">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Lead Profile</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-400">Lead Score</p>
                    <p className="text-xl font-bold text-gray-900 mt-0.5">{panel.lead_score ?? "—"}</p>
                    {panel.lead_score != null && (
                      <div className="mt-1.5 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${panel.lead_score >= 70 ? "bg-green-500" : panel.lead_score >= 40 ? "bg-amber-400" : "bg-red-400"}`}
                          style={{ width: `${Math.min(panel.lead_score, 100)}%` }}
                        />
                      </div>
                    )}
                  </div>
                  <div className="bg-gray-50 rounded-lg p-3">
                    <p className="text-xs text-gray-400">Budget</p>
                    <p className="text-lg font-bold text-gray-900 mt-0.5">
                      {fmt(panel.budget_max || panel.budget)}
                    </p>
                    {panel.budget_min && panel.budget_max && panel.budget_min !== panel.budget_max && (
                      <p className="text-xs text-gray-400">{fmt(panel.budget_min)} – {fmt(panel.budget_max)}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Tags */}
              {panel.tags && panel.tags.length > 0 && (
                <div className="px-6 py-4 border-b border-gray-50">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {panel.tags.map((tag, i) => (
                      <span key={i} className={`px-2 py-0.5 rounded text-xs font-medium ${tagColor(tag)}`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Notes */}
              <div className="px-6 py-4 border-b border-gray-50">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Notes</p>
                  {noteText !== savedNote && (
                    <button
                      onClick={saveNote}
                      disabled={savingNote}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50"
                    >
                      {savingNote ? "Saving…" : "Save"}
                    </button>
                  )}
                </div>
                <textarea
                  className="w-full text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-lg p-3 min-h-[100px] resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Add notes about this contact…"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  onBlur={saveNote}
                />
              </div>

              {/* Dates */}
              <div className="px-6 py-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Timeline</p>
                <div className="space-y-2 text-xs text-gray-500">
                  {panel.created_at && (
                    <div className="flex justify-between">
                      <span>Created</span>
                      <span className="font-medium">{new Date(panel.created_at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}</span>
                    </div>
                  )}
                  {panel.updated_at && (
                    <div className="flex justify-between">
                      <span>Last updated</span>
                      <span className="font-medium">{new Date(panel.updated_at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Panel footer actions */}
            <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
              {panel.email && (
                <a
                  href={`mailto:${panel.email}`}
                  className="flex-1 text-center text-sm font-medium py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
                >
                  ✉️ Email
                </a>
              )}
              {panel.phone && (
                <a
                  href={`tel:${panel.phone}`}
                  className="flex-1 text-center text-sm font-medium py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 transition"
                >
                  📱 Call
                </a>
              )}
            </div>
          </>
        )}
      </div>
    </div>
    </>
  );
}
