"use client";

import { useEffect, useState } from "react";

type EmailRow = {
  id: string;
  direction: string;
  to_email: string;
  to_name: string | null;
  from_email: string;
  from_name: string | null;
  subject: string;
  body_html: string | null;
  status: string;
  error: string | null;
  sent_by: string | null;
  sent_at: string | null;
  created_at: string;
  tags: string[] | null;
};

export default function ContactEmailHistory({ contactId, refreshKey }: { contactId: string; refreshKey?: number }) {
  const [emails, setEmails] = useState<EmailRow[] | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/emails?contact_id=${encodeURIComponent(contactId)}&limit=50`)
      .then((r) => r.json())
      .then((j) => setEmails(j.ok ? j.emails : []))
      .catch(() => setEmails([]));
  }, [contactId, refreshKey]);

  if (emails === null) {
    return <p className="text-xs text-gray-400 italic px-1">Loading email history…</p>;
  }
  if (emails.length === 0) {
    return <p className="text-xs text-gray-400 italic px-1">No emails sent yet.</p>;
  }

  return (
    <ul className="divide-y divide-gray-100">
      {emails.map((e) => {
        const expanded = expandedId === e.id;
        const statusCls =
          e.status === "sent" ? "bg-green-100 text-green-700" :
          e.status === "failed" ? "bg-red-100 text-red-700" :
          e.status === "queued" ? "bg-amber-100 text-amber-800" :
          e.status === "bounced" ? "bg-red-100 text-red-700" :
          "bg-gray-100 text-gray-600";
        return (
          <li key={e.id} className="py-3 px-1">
            <button
              onClick={() => setExpandedId(expanded ? null : e.id)}
              className="w-full text-left hover:bg-gray-50 rounded-md px-2 py-1 -mx-2 transition"
            >
              <div className="flex items-center gap-2 mb-1">
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide ${statusCls}`}>
                  {e.status}
                </span>
                <span className="text-xs text-gray-400 capitalize">{e.direction}</span>
                <span className="ml-auto text-xs text-gray-400 whitespace-nowrap">
                  {fmtDateTime(e.sent_at ?? e.created_at)}
                </span>
              </div>
              <p className="font-medium text-sm truncate">{e.subject}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                <span className="text-gray-400">to</span> {e.to_email}
                {e.sent_by ? <> · <span className="text-gray-400">by</span> {e.sent_by}</> : null}
              </p>
              {e.error && (
                <p className="text-xs text-red-700 mt-1 italic">{e.error}</p>
              )}
            </button>
            {expanded && e.body_html && (
              <div className="mt-3 ml-4 mr-2 px-4 py-3 bg-gray-50 border border-gray-200 rounded-md">
                <div
                  className="email-body text-sm text-gray-700 prose-sm"
                  dangerouslySetInnerHTML={{ __html: e.body_html }}
                />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function fmtDateTime(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.valueOf())) return s;
  return d.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}
