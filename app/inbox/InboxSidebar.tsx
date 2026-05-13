/**
 * InboxSidebar — left rail with system + user folders for the inbox view.
 *
 * Server component. Fetches the current user's folders and per-folder
 * unread counts in one round-trip cluster. URL is the single source of
 * truth for selection: ?view=inbox|starred|sent|drafts|archive|trash|spam
 * or ?folder=<uuid>. The page reads the same param.
 */
import Link from "next/link";
import { supabase } from "../../utils/supabase";
import { currentUserEmail } from "../../utils/cf-access";
import NewFolderButton from "./NewFolderButton";

type FolderRow = {
  id: string;
  name: string;
  parent_id: string | null;
  color: string | null;
  system: boolean;
};

type Selection = { view?: string; folder?: string };

// Lucide-style stand-in via emoji to avoid adding an icon dep. Order matters
// — Inbox first because that's the default landing view.
const SYSTEM_ORDER: Array<{ name: string; view: string; icon: string }> = [
  { name: "Inbox",    view: "inbox",    icon: "📥" },
  { name: "Starred",  view: "starred",  icon: "⭐" },
  { name: "Sent",     view: "sent",     icon: "📤" },
  { name: "Drafts",   view: "drafts",   icon: "📝" },
  { name: "Archive",  view: "archive",  icon: "🗄️" },
  { name: "Spam",     view: "spam",     icon: "🚫" },
  { name: "Trash",    view: "trash",    icon: "🗑️" },
];

export default async function InboxSidebar({ selection }: { selection: Selection }) {
  const owner = await currentUserEmail();

  const [{ data: folders }, inboxUnread, draftsCount] = await Promise.all([
    supabase
      .from("email_folders")
      .select("id,name,parent_id,color,system")
      .eq("owner_user_email", owner)
      .eq("system", false)
      .order("name", { ascending: true }),
    // Inbox unread = inbound + not read + not archived/trashed/spam
    supabase
      .from("email_log")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_email", owner)
      .eq("direction", "inbound")
      .eq("is_read", false)
      .eq("is_archived", false)
      .eq("is_trashed", false)
      .eq("is_spam", false),
    supabase
      .from("email_drafts")
      .select("id", { count: "exact", head: true })
      .eq("owner_user_email", owner),
  ]);

  const userFolders = (folders ?? []) as FolderRow[];
  const inboxCount = inboxUnread.count ?? 0;
  const draftCount = draftsCount.count ?? 0;

  // Unread counts for user-created folders. Single grouped query is awkward
  // through PostgREST so we do one count per folder in parallel — at the
  // expected scale (typically <20 user folders) the round-trip cost is fine.
  const folderUnreadCounts = await Promise.all(
    userFolders.map((f) =>
      supabase
        .from("email_log")
        .select("id", { count: "exact", head: true })
        .eq("owner_user_email", owner)
        .eq("folder_id", f.id)
        .eq("is_read", false)
        .eq("is_trashed", false),
    ),
  );

  const activeView = selection.view ?? (selection.folder ? null : "inbox");

  return (
    <aside className="hidden md:flex md:flex-col w-56 flex-shrink-0 border-r border-gray-200 bg-white">
      <div className="p-3">
        <Link
          href="/inbox/compose"
          className="block w-full px-4 py-2.5 rounded-lg bg-[#0F4C5C] text-white text-sm font-semibold text-center hover:bg-[#0B3D4A] transition shadow-sm"
        >
          ✏️ Compose
        </Link>
      </div>

      <nav className="px-2 pb-4">
        <p className="text-[10px] font-bold uppercase text-gray-400 px-2 pt-2 pb-1 tracking-wider">
          Mail
        </p>
        {SYSTEM_ORDER.map((s) => {
          const isActive = activeView === s.view;
          const badge =
            s.view === "inbox" && inboxCount > 0
              ? inboxCount
              : s.view === "drafts" && draftCount > 0
                ? draftCount
                : null;
          return (
            <Link
              key={s.view}
              href={`/inbox?view=${s.view}`}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition ${
                isActive ? "bg-[#0F4C5C] text-white font-semibold" : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <span className="text-base leading-none">{s.icon}</span>
              <span className="flex-1 truncate">{s.name}</span>
              {badge !== null && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    isActive ? "bg-white text-[#0F4C5C]" : "bg-[#0F4C5C] text-white"
                  }`}
                >
                  {badge}
                </span>
              )}
            </Link>
          );
        })}

        <div className="flex items-center justify-between px-2 pt-4 pb-1">
          <p className="text-[10px] font-bold uppercase text-gray-400 tracking-wider">Folders</p>
          <NewFolderButton />
        </div>
        {userFolders.length === 0 && (
          <p className="text-[11px] text-gray-400 px-2 py-1 italic">No folders yet</p>
        )}
        {userFolders.map((f, i) => {
          const isActive = selection.folder === f.id;
          const unread = folderUnreadCounts[i].count ?? 0;
          return (
            <Link
              key={f.id}
              href={`/inbox?folder=${f.id}`}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm transition ${
                isActive ? "bg-[#0F4C5C] text-white font-semibold" : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: f.color ?? "#94A3B8" }}
              />
              <span className="flex-1 truncate">{f.name}</span>
              {unread > 0 && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    isActive ? "bg-white text-[#0F4C5C]" : "bg-[#0F4C5C] text-white"
                  }`}
                >
                  {unread}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-3 border-t border-gray-200 text-[11px] text-gray-400">
        Signed in as<br />
        <span className="text-gray-600 font-medium">{owner}</span>
      </div>
    </aside>
  );
}
