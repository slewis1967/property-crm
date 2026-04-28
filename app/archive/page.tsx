import Link from "next/link";
import { supabase } from "../../utils/supabase";
import DisclaimerBanner from "../components/DisclaimerBanner";

export const dynamic = "force-dynamic";

const TABLES = [
  { table: "ghl_archive_contacts",          label: "Contacts",          href: "/archive/contacts",       emoji: "👥" },
  { table: "ghl_archive_conversations",     label: "Conversations",     href: "/archive/conversations",  emoji: "💬" },
  { table: "ghl_archive_messages",          label: "Messages",          href: "/archive/conversations",  emoji: "✉️" },
  { table: "ghl_archive_notes",             label: "Notes",             href: "/archive/notes",          emoji: "📝" },
  { table: "ghl_archive_opportunities",     label: "Opportunities",     href: "/archive/opportunities",  emoji: "🗂️" },
  { table: "ghl_archive_tasks",             label: "Tasks",             href: "/archive/tasks",          emoji: "📌" },
  { table: "ghl_archive_appointments",      label: "Appointments",      href: "/archive/calendars",      emoji: "📅" },
  { table: "ghl_archive_forms",             label: "Forms",             href: "/archive/forms",          emoji: "📋" },
  { table: "ghl_archive_form_submissions",  label: "Form submissions",  href: "/archive/forms",          emoji: "📥" },
  { table: "ghl_archive_funnels",           label: "Funnels",           href: "/archive/forms",          emoji: "🔻" },
  { table: "ghl_archive_pipelines",         label: "Pipelines",         href: "/archive/opportunities",  emoji: "🪜" },
  { table: "ghl_archive_workflows",         label: "Workflows",         href: "/archive",                emoji: "⚙️" },
  { table: "ghl_archive_email_templates",   label: "Email templates",   href: "/archive",                emoji: "📧" },
  { table: "ghl_archive_email_schedules",   label: "Email schedules",   href: "/archive",                emoji: "⏰" },
  { table: "ghl_archive_media_files",       label: "Media files",       href: "/archive/media",          emoji: "🗃️" },
  { table: "ghl_archive_users",             label: "Users",             href: "/archive",                emoji: "🧑" },
  { table: "ghl_archive_tags",              label: "Tags",              href: "/archive",                emoji: "🏷️" },
  { table: "ghl_archive_custom_fields",     label: "Custom fields",     href: "/archive",                emoji: "⚙️" },
];

async function getCount(table: string): Promise<number | null> {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) return null;
  return count ?? 0;
}

export default async function ArchiveOverview() {
  const counts = await Promise.all(TABLES.map((t) => getCount(t.table)));

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h1 className="text-3xl font-bold">GHL Archive</h1>
        <span className="text-xs text-gray-400">Read-only · service-key-protected</span>
      </div>
      <p className="text-gray-500 text-sm mb-4">
        Frozen snapshot of every record that lived in GoHighLevel before decommissioning. Click any tile to browse.
      </p>

      <DisclaimerBanner variant="archive" />

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {TABLES.map((t, i) => {
          const n = counts[i];
          const present = n !== null && n > 0;
          return (
            <Link
              href={t.href}
              key={t.table}
              className={`block p-5 rounded-xl border ${
                present ? "bg-white border-gray-200 hover:border-gray-400" : "bg-gray-50 border-gray-100"
              } shadow-sm transition`}
            >
              <div className="text-2xl mb-2">{t.emoji}</div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t.label}</h3>
              <p className={`mt-1 text-2xl font-bold ${present ? "text-gray-900" : "text-gray-300"}`}>
                {n === null ? "—" : n.toLocaleString()}
              </p>
              <p className="text-[11px] text-gray-400 mt-1 font-mono truncate">{t.table}</p>
            </Link>
          );
        })}
      </div>

      <div className="mt-8 bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm">
        <p className="font-semibold text-amber-900">📦 Archive integrity</p>
        <p className="text-amber-800 mt-1">
          These tables are populated by <code className="bg-amber-100 px-1 rounded">projects/ghl_to_supabase.py</code>{" "}
          which mirrors the local DuckDB extract. Counts of <strong>0</strong> mean either the data isn't in your GHL
          account, or the sync script hasn't been run yet for that surface.
        </p>
      </div>
    </div>
  );
}
