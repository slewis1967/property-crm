import { supabase } from "../../utils/supabase";
import { currentUserEmail } from "../../utils/cf-access";
import InboxSidebar from "./InboxSidebar";
import InboxTable, { type EmailRow, type Thread } from "./InboxTable";

export const dynamic = "force-dynamic";

const VIEWS = new Set([
  "inbox", "starred", "sent", "drafts", "archive", "trash", "spam",
]);

// One row per system-view giving its title + filter description. Used by the
// header strip — keeps the page generic across view types without an if-ladder.
const VIEW_META: Record<string, { title: string; description: string }> = {
  inbox:    { title: "Inbox",    description: "Unread and recent inbound mail" },
  starred:  { title: "Starred",  description: "Threads you've flagged" },
  sent:     { title: "Sent",     description: "Outbound mail from this account" },
  drafts:   { title: "Drafts",   description: "Auto-saved compose state" },
  archive:  { title: "Archive",  description: "Out of the inbox, still around" },
  trash:    { title: "Trash",    description: "Auto-purged after 30 days" },
  spam:     { title: "Spam",     description: "Auto-purged after 30 days" },
};

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; folder?: string }>;
}) {
  const sp = await searchParams;
  const view = sp.view && VIEWS.has(sp.view) ? sp.view : sp.folder ? null : "inbox";
  const folderId = sp.folder ?? null;
  const owner = await currentUserEmail();

  // Build the query against the current selection. Per-user filter is
  // always on so each user sees only their own mail.
  let q = supabase
    .from("email_log")
    .select(
      "id,direction,to_email,to_name,from_email,from_name,subject,body_html,status,contact_id," +
      "message_id,thread_id,sent_at,created_at,is_read,is_starred,is_archived,is_trashed,is_spam," +
      "folder_id,labels,owner_user_email",
    )
    .eq("owner_user_email", owner)
    .order("created_at", { ascending: false })
    .limit(300);

  if (folderId) {
    q = q.eq("folder_id", folderId);
  } else {
    switch (view) {
      case "inbox":
        q = q.eq("direction", "inbound")
             .eq("is_archived", false)
             .eq("is_trashed", false)
             .eq("is_spam", false);
        break;
      case "starred":
        q = q.eq("is_starred", true).eq("is_trashed", false).eq("is_spam", false);
        break;
      case "sent":
        q = q.eq("direction", "outbound").eq("is_trashed", false).eq("is_spam", false);
        break;
      case "archive":
        q = q.eq("is_archived", true).eq("is_trashed", false).eq("is_spam", false);
        break;
      case "trash":
        q = q.eq("is_trashed", true);
        break;
      case "spam":
        q = q.eq("is_spam", true).eq("is_trashed", false);
        break;
      // 'drafts' is handled separately below — drafts live in email_drafts
    }
  }

  // Drafts come from a different table — render a different shape on that view.
  // For v1 the drafts view shows a stub list; the rich compose UI ships in the
  // next slice.
  let drafts: Array<{ id: string; subject: string | null; updated_at: string }> = [];
  if (view === "drafts") {
    const { data } = await supabase
      .from("email_drafts")
      .select("id,subject,updated_at")
      .eq("owner_user_email", owner)
      .order("updated_at", { ascending: false })
      .limit(100);
    drafts = data ?? [];
  }

  let all: EmailRow[] = [];
  if (view !== "drafts") {
    const { data: rows } = await q;
    all = (rows ?? []) as unknown as EmailRow[];
  }

  // Resolve the folder name for the header strip when a user folder is selected
  let folderName: string | null = null;
  if (folderId) {
    const { data } = await supabase
      .from("email_folders")
      .select("name")
      .eq("id", folderId)
      .eq("owner_user_email", owner)
      .maybeSingle();
    folderName = data?.name ?? null;
  }

  // Contact-name lookup for the thread list
  const contactIds = Array.from(new Set(all.map((e) => e.contact_id).filter(Boolean))) as string[];
  let contactNames: Record<string, string> = {};
  if (contactIds.length > 0) {
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id,name,full_name,email")
      .in("id", contactIds);
    if (contacts) {
      contactNames = Object.fromEntries(
        contacts.map((c) => [c.id, (c.full_name || c.name || c.email || "(unnamed)") as string]),
      );
    }
  }

  const threads = groupIntoThreads(all);

  const header = folderName
    ? { title: folderName, description: "Custom folder" }
    : view
      ? VIEW_META[view]
      : { title: "Inbox", description: "" };

  return (
    <div className="flex h-[calc(100vh-4rem)] -mx-8 -my-8">
      <InboxSidebar selection={{ view: view ?? undefined, folder: folderId ?? undefined }} />

      <div className="flex-1 overflow-y-auto px-8 py-6 min-w-0">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{header.title}</h1>
            <p className="text-gray-500 text-sm mt-0.5">{header.description}</p>
          </div>
          <p className="text-[11px] text-gray-400">
            {view === "drafts" ? `${drafts.length} drafts` : `${threads.length} threads`}
          </p>
        </div>

        {view === "drafts" ? (
          <DraftsList drafts={drafts} />
        ) : threads.length === 0 ? (
          <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-gray-500 text-sm">
            Nothing here yet.
          </div>
        ) : (
          <InboxTable threads={threads} contactNames={contactNames} />
        )}
      </div>
    </div>
  );
}

function DraftsList({
  drafts,
}: {
  drafts: Array<{ id: string; subject: string | null; updated_at: string }>;
}) {
  if (drafts.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-12 text-center text-gray-500 text-sm">
        No drafts.<br />
        <span className="text-[11px] text-gray-400">
          Auto-saved compose state appears here in the next slice.
        </span>
      </div>
    );
  }
  return (
    <div className="bg-white border border-gray-200 rounded-lg divide-y divide-gray-100">
      {drafts.map((d) => (
        <div key={d.id} className="p-3 hover:bg-gray-50">
          <p className="text-sm font-medium text-gray-900">{d.subject || "(no subject)"}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">
            updated {new Date(d.updated_at).toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );
}

function groupIntoThreads(emails: EmailRow[]): Thread[] {
  const map = new Map<string, Thread>();
  for (const e of emails) {
    const key = e.thread_id || e.message_id || e.id;
    if (!map.has(key)) {
      map.set(key, {
        thread_id: key,
        subject: stripReplyPrefix(e.subject),
        messages: [],
        latest_at: e.sent_at ?? e.created_at,
        has_inbound: false,
        has_outbound: false,
        contact_id: e.contact_id,
        unread_inbound: 0,
      });
    }
    const t = map.get(key)!;
    t.messages.push(e);
    if (e.direction === "inbound") t.has_inbound = true;
    if (e.direction === "outbound") t.has_outbound = true;
    if (!t.contact_id && e.contact_id) t.contact_id = e.contact_id;
    const ts = e.sent_at ?? e.created_at;
    if (ts > t.latest_at) t.latest_at = ts;
  }
  for (const t of map.values()) {
    t.messages.sort((a, b) => (a.sent_at ?? a.created_at).localeCompare(b.sent_at ?? b.created_at));
    const lastOutbound = t.messages.filter((m) => m.direction === "outbound").pop();
    const cutoff = lastOutbound ? (lastOutbound.sent_at ?? lastOutbound.created_at) : "";
    t.unread_inbound = t.messages.filter(
      (m) => m.direction === "inbound" && (m.sent_at ?? m.created_at) > cutoff,
    ).length;
  }
  const list = Array.from(map.values());
  list.sort((a, b) => b.latest_at.localeCompare(a.latest_at));
  return list;
}

function stripReplyPrefix(subject: string): string {
  return subject.replace(/^(re:|fwd:|fw:)\s+/i, "").trim() || subject;
}
