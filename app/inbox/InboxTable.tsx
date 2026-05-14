"use client";

import Link from "next/link";
import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import EmailComposeModal from "../components/EmailComposeModal";
import { sanitizeEmailHtml } from "../../utils/sanitize-email";

export type EmailRow = {
  id: string;
  direction: string;
  to_email: string;
  to_name: string | null;
  from_email: string;
  from_name: string | null;
  subject: string;
  body_html: string | null;
  status: string;
  contact_id: string | null;
  message_id: string | null;
  thread_id: string | null;
  sent_at: string | null;
  created_at: string;
  // Phase 1 state columns — present after the 2026-05-12 migration.
  is_read?: boolean;
  is_starred?: boolean;
  is_archived?: boolean;
  is_trashed?: boolean;
  is_spam?: boolean;
  folder_id?: string | null;
  labels?: string[] | null;
};

export type Thread = {
  thread_id: string;
  subject: string;
  messages: EmailRow[];
  latest_at: string;
  has_inbound: boolean;
  has_outbound: boolean;
  contact_id: string | null;
  unread_inbound: number;
};

export type FolderOption = { id: string; name: string };

export default function InboxTable({
  threads,
  contactNames,
  folders = [],
}: {
  threads: Thread[];
  contactNames: Record<string, string>;
  folders?: FolderOption[];
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [replyContext, setReplyContext] = useState<{ email: EmailRow; thread: Thread } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [showFolderMenu, setShowFolderMenu] = useState(false);

  const allThreadIds = useMemo(() => threads.map((t) => t.thread_id), [threads]);
  const allSelected = selected.size > 0 && selected.size === allThreadIds.length;
  const partialSelected = selected.size > 0 && !allSelected;

  const collectIds = useCallback(
    (threadIds: string[]): string[] => {
      const set = new Set(threadIds);
      return threads.filter((t) => set.has(t.thread_id)).flatMap((t) => t.messages.map((m) => m.id));
    },
    [threads],
  );

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allThreadIds));
    }
  };

  const toggleOne = (threadId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      return next;
    });
  };

  const openReply = (email: EmailRow, thread: Thread) => {
    setReplyContext({ email, thread });
  };
  const closeReply = () => setReplyContext(null);

  const applyBulk = useCallback(
    async (patch: Record<string, unknown>) => {
      if (selected.size === 0) return;
      setBusy(true);
      try {
        const ids = collectIds(Array.from(selected));
        const res = await fetch("/api/emails/bulk", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids, patch }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          // Don't trash the selection — surface the error and let the user retry
          alert(data.error ?? "Bulk action failed");
          setBusy(false);
          return;
        }
        setSelected(new Set());
        setShowFolderMenu(false);
        router.refresh();
      } catch (e) {
        alert((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [selected, collectIds, router],
  );

  // Single-row mark-read on thread open. Fires once when a thread is expanded
  // and contains any unread inbound messages — silent (no error toast) since
  // this is a side-effect of normal browsing.
  const markThreadRead = useCallback(
    async (thread: Thread) => {
      const unreadIds = thread.messages
        .filter((m) => m.direction === "inbound" && m.is_read === false)
        .map((m) => m.id);
      if (unreadIds.length === 0) return;
      try {
        await fetch("/api/emails/bulk", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: unreadIds, patch: { is_read: true } }),
        });
        // No router.refresh — would close the expanded view. Sidebar counts
        // update on the next full nav.
      } catch {
        /* swallow — read state is best-effort */
      }
    },
    [],
  );

  const handleExpand = (t: Thread) => {
    const willOpen = expanded !== t.thread_id;
    setExpanded(willOpen ? t.thread_id : null);
    if (willOpen) void markThreadRead(t);
  };

  if (threads.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <p className="text-sm text-gray-500">Nothing here yet.</p>
      </div>
    );
  }

  return (
    <>
      {selected.size > 0 && (
        <BulkActionBar
          count={selected.size}
          busy={busy}
          folders={folders}
          showFolderMenu={showFolderMenu}
          onToggleFolderMenu={() => setShowFolderMenu((s) => !s)}
          onClear={() => { setSelected(new Set()); setShowFolderMenu(false); }}
          onMarkRead={() => applyBulk({ is_read: true })}
          onMarkUnread={() => applyBulk({ is_read: false })}
          onStar={() => applyBulk({ is_starred: true })}
          onUnstar={() => applyBulk({ is_starred: false })}
          onArchive={() => applyBulk({ is_archived: true, is_read: true })}
          onTrash={() => applyBulk({ is_trashed: true })}
          onSpam={() => applyBulk({ is_spam: true })}
          onMoveToFolder={(folderId) => applyBulk({ folder_id: folderId })}
        />
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left py-2 px-3 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => { if (el) el.indeterminate = partialSelected; }}
                  onChange={toggleAll}
                  className="rounded border-gray-300 cursor-pointer"
                  aria-label="Select all"
                />
              </th>
              <th className="text-left py-2 px-2 text-gray-500 font-medium w-8"></th>
              <th className="text-left py-2 px-4 text-gray-500 font-medium">Thread</th>
              <th className="text-left py-2 px-4 text-gray-500 font-medium">Contact</th>
              <th className="text-right py-2 px-4 text-gray-500 font-medium">Messages</th>
              <th className="text-right py-2 px-4 text-gray-500 font-medium whitespace-nowrap">Latest</th>
            </tr>
          </thead>
          <tbody>
            {threads.map((t) => {
              const contactName = t.contact_id ? contactNames[t.contact_id] : null;
              const latest = t.messages[t.messages.length - 1];
              const dirIcon = t.has_inbound && t.has_outbound ? "🔄" : t.has_inbound ? "📥" : "📤";
              const isOpen = expanded === t.thread_id;
              const isSelected = selected.has(t.thread_id);
              const isStarred = t.messages.some((m) => m.is_starred);
              return (
                <RowGroup key={t.thread_id}>
                  <tr
                    className={`border-b border-gray-50 cursor-pointer transition ${
                      isOpen ? "bg-blue-50" : isSelected ? "bg-amber-50" : "hover:bg-gray-50"
                    }`}
                  >
                    <td className="py-2 px-3" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(t.thread_id)}
                        className="rounded border-gray-300 cursor-pointer"
                        aria-label={`Select ${t.subject}`}
                      />
                    </td>
                    <td className="py-2 px-2 text-center" onClick={() => handleExpand(t)}>
                      <span title={isStarred ? "Starred" : ""}>
                        {isStarred ? "⭐" : isOpen ? "▼" : dirIcon}
                      </span>
                    </td>
                    <td className="py-2 px-4" onClick={() => handleExpand(t)}>
                      <p className="font-medium truncate max-w-md">{t.subject}</p>
                      {latest && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate max-w-md">
                          {latest.direction === "inbound" ? "from" : "to"}{" "}
                          {latest.direction === "inbound" ? latest.from_email : latest.to_email}
                        </p>
                      )}
                    </td>
                    <td className="py-2 px-4" onClick={() => handleExpand(t)}>
                      {t.contact_id && contactName ? (
                        <Link
                          href={`/contacts/${t.contact_id}`}
                          className="text-blue-600 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {contactName}
                        </Link>
                      ) : (
                        <span className="text-gray-400 text-xs">unmatched</span>
                      )}
                    </td>
                    <td className="py-2 px-4 text-right text-xs text-gray-600" onClick={() => handleExpand(t)}>
                      {t.messages.length}
                      {t.unread_inbound > 0 && (
                        <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700">
                          {t.unread_inbound} new
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-4 text-right text-xs text-gray-500 whitespace-nowrap" onClick={() => handleExpand(t)}>
                      {fmtDateTime(t.latest_at)}
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="border-b border-gray-100 bg-gray-50">
                      <td colSpan={6} className="px-6 py-4">
                        <div className="space-y-3">
                          {t.messages.map((e) => (
                            <MessageCard
                              key={e.id}
                              email={e}
                              onReply={() => openReply(e, t)}
                            />
                          ))}
                        </div>
                        {t.contact_id && (
                          <div className="mt-3 pt-3 border-t border-gray-200">
                            <Link
                              href={`/contacts/${t.contact_id}`}
                              className="text-xs text-blue-600 hover:underline font-semibold"
                            >
                              Open contact for full context →
                            </Link>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </RowGroup>
              );
            })}
          </tbody>
        </table>
      </div>

      {replyContext && (
        <EmailComposeModal
          key={`inbox-reply-${replyContext.email.id}-${refreshKey}`}
          open={true}
          onClose={closeReply}
          defaultTo={replyContext.email.from_email}
          defaultToName={replyContext.email.from_name ?? ""}
          defaultSubject={prefixReply(replyContext.email.subject)}
          defaultBody={quotedBody(replyContext.email)}
          contactId={replyContext.thread.contact_id ?? undefined}
          inReplyTo={replyContext.email.message_id ?? undefined}
          threadId={replyContext.thread.thread_id}
          tags={["inbox-reply"]}
          onSent={() => { setReplyContext(null); setRefreshKey((k) => k + 1); }}
        />
      )}
    </>
  );
}

function BulkActionBar({
  count, busy, folders, showFolderMenu,
  onToggleFolderMenu, onClear,
  onMarkRead, onMarkUnread, onStar, onUnstar,
  onArchive, onTrash, onSpam, onMoveToFolder,
}: {
  count: number;
  busy: boolean;
  folders: FolderOption[];
  showFolderMenu: boolean;
  onToggleFolderMenu: () => void;
  onClear: () => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onStar: () => void;
  onUnstar: () => void;
  onArchive: () => void;
  onTrash: () => void;
  onSpam: () => void;
  onMoveToFolder: (folderId: string | null) => void;
}) {
  return (
    <div className="sticky top-0 z-10 mb-3 bg-[#0F4C5C] text-white rounded-lg shadow-md px-3 py-2 flex items-center gap-2">
      <button
        onClick={onClear}
        className="px-2 py-1 rounded hover:bg-white/10 text-sm"
        disabled={busy}
        title="Clear selection"
      >
        ✕
      </button>
      <span className="text-sm font-semibold mr-2">{count} selected</span>
      <div className="h-5 w-px bg-white/20" />
      <BulkBtn onClick={onMarkRead} disabled={busy}>Mark read</BulkBtn>
      <BulkBtn onClick={onMarkUnread} disabled={busy}>Mark unread</BulkBtn>
      <BulkBtn onClick={onStar} disabled={busy}>⭐ Star</BulkBtn>
      <BulkBtn onClick={onUnstar} disabled={busy}>Unstar</BulkBtn>
      <div className="h-5 w-px bg-white/20" />
      <BulkBtn onClick={onArchive} disabled={busy}>🗄️ Archive</BulkBtn>
      <BulkBtn onClick={onTrash} disabled={busy}>🗑️ Trash</BulkBtn>
      <BulkBtn onClick={onSpam} disabled={busy}>🚫 Spam</BulkBtn>
      <div className="h-5 w-px bg-white/20" />
      <div className="relative">
        <BulkBtn onClick={onToggleFolderMenu} disabled={busy}>📁 Move to…</BulkBtn>
        {showFolderMenu && (
          <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg min-w-[180px] py-1 z-20">
            <button
              onClick={() => onMoveToFolder(null)}
              className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
              disabled={busy}
            >
              (No folder)
            </button>
            {folders.length === 0 && (
              <p className="px-3 py-1.5 text-xs text-gray-400 italic">No folders yet</p>
            )}
            {folders.map((f) => (
              <button
                key={f.id}
                onClick={() => onMoveToFolder(f.id)}
                className="w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                disabled={busy}
              >
                {f.name}
              </button>
            ))}
          </div>
        )}
      </div>
      {busy && <span className="ml-2 text-xs text-white/70">Working…</span>}
    </div>
  );
}

function BulkBtn({
  onClick, disabled, children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="px-2 py-1 rounded hover:bg-white/10 text-xs font-medium transition disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function prefixReply(subject: string): string {
  if (/^(re|fwd|fw):/i.test(subject.trim())) return subject;
  return `Re: ${subject}`;
}

function quotedBody(parent: EmailRow): string {
  const author = parent.from_name || parent.from_email;
  const when = parent.sent_at ?? parent.created_at;
  const dateStr = when ? new Date(when).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }) : "earlier";
  const original = (parent.body_html
    ? parent.body_html
        .replace(/<style[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim()
    : "(no body captured)").slice(0, 1500);
  return `\n\n\nOn ${dateStr}, ${author} wrote:\n> ${original.split("\n").join("\n> ")}`;
}

function RowGroup({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function MessageCard({ email, onReply }: { email: EmailRow; onReply?: () => void }) {
  const isInbound = email.direction === "inbound";
  return (
    <div className={`px-4 py-3 border rounded-md ${isInbound ? "bg-blue-50 border-blue-200" : "bg-white border-gray-200"}`}>
      <div className="flex items-center gap-2 mb-2 text-xs text-gray-500">
        <span className="font-semibold text-gray-700">
          {isInbound ? "📥 From" : "📤 To"}{" "}
          {isInbound ? email.from_email : email.to_email}
        </span>
        <span className="ml-auto whitespace-nowrap">{fmtDateTime(email.sent_at ?? email.created_at)}</span>
        {isInbound && onReply && (
          <button
            onClick={(e) => { e.stopPropagation(); onReply(); }}
            className="ml-2 px-2 py-0.5 text-[11px] font-semibold bg-blue-600 text-white rounded hover:bg-blue-700"
            title="Reply to this message"
          >
            ↩ Reply
          </button>
        )}
      </div>
      <p className="font-medium text-sm mb-2">{email.subject}</p>
      {email.body_html ? (
        <div
          className="email-body text-sm text-gray-800"
          dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(email.body_html) }}
        />
      ) : (
        <p className="text-xs text-gray-400 italic">No body captured.</p>
      )}
    </div>
  );
}

function fmtDateTime(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.valueOf())) return s;
  return d.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}
