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
  message_id?: string | null;
  in_reply_to?: string | null;
  thread_id?: string | null;
  tags: string[] | null;
};

type Thread = {
  thread_id: string;
  subject: string;
  messages: EmailRow[];
  latest_at: string;
  has_inbound: boolean;
  has_outbound: boolean;
};

export default function ContactEmailHistory({ contactId, refreshKey }: { contactId: string; refreshKey?: number }) {
  const [emails, setEmails] = useState<EmailRow[] | null>(null);
  const [expandedThread, setExpandedThread] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/emails?contact_id=${encodeURIComponent(contactId)}&limit=200`)
      .then((r) => r.json())
      .then((j) => setEmails(j.ok ? j.emails : []))
      .catch(() => setEmails([]));
  }, [contactId, refreshKey]);

  if (emails === null) {
    return <p className="text-xs text-gray-400 italic px-1">Loading email history…</p>;
  }
  if (emails.length === 0) {
    return <p className="text-xs text-gray-400 italic px-1">No emails sent or received yet.</p>;
  }

  const threads = groupIntoThreads(emails);

  return (
    <ul className="divide-y divide-gray-100">
      {threads.map((t) => {
        const expanded = expandedThread === t.thread_id;
        const latest = t.messages[t.messages.length - 1];
        return (
          <li key={t.thread_id} className="py-3 px-1">
            <button
              onClick={() => setExpandedThread(expanded ? null : t.thread_id)}
              className="w-full text-left hover:bg-gray-50 rounded-md px-2 py-1 -mx-2 transition"
            >
              <div className="flex items-center gap-2 mb-1">
                {t.has_inbound && t.has_outbound ? (
                  <span title="Two-way thread">🔄</span>
                ) : t.has_inbound ? (
                  <span title="Inbound only">📥</span>
                ) : (
                  <span title="Outbound only">📤</span>
                )}
                {latest && <StatusPill status={latest.status} />}
                <span className="text-xs text-gray-400">
                  {t.messages.length} message{t.messages.length === 1 ? "" : "s"}
                </span>
                <span className="ml-auto text-xs text-gray-400 whitespace-nowrap">
                  {fmtDateTime(t.latest_at)}
                </span>
              </div>
              <p className="font-medium text-sm truncate">{t.subject}</p>
              {latest && (
                <p className="text-xs text-gray-500 mt-0.5 truncate">
                  Latest{" "}
                  <span className="text-gray-400">{latest.direction === "inbound" ? "from" : "to"}</span>{" "}
                  {latest.direction === "inbound" ? latest.from_email : latest.to_email}
                </p>
              )}
            </button>
            {expanded && (
              <div className="mt-3 ml-4 mr-2 space-y-3">
                {t.messages.map((e) => (
                  <MessageCard key={e.id} email={e} />
                ))}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function MessageCard({ email }: { email: EmailRow }) {
  const isInbound = email.direction === "inbound";
  return (
    <div className={`px-4 py-3 border rounded-md ${isInbound ? "bg-blue-50 border-blue-200" : "bg-gray-50 border-gray-200"}`}>
      <div className="flex items-center gap-2 mb-2 text-xs text-gray-500">
        <span className="font-semibold text-gray-700">
          {isInbound ? "📥 From" : "📤 To"}{" "}
          {isInbound ? email.from_email : email.to_email}
        </span>
        <span className="ml-auto whitespace-nowrap">{fmtDateTime(email.sent_at ?? email.created_at)}</span>
      </div>
      {email.error && (
        <p className="text-xs text-red-700 italic mb-2">{email.error}</p>
      )}
      {email.body_html ? (
        <div
          className="email-body text-sm text-gray-800"
          dangerouslySetInnerHTML={{ __html: email.body_html }}
        />
      ) : (
        <p className="text-xs text-gray-400 italic">No body captured.</p>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "sent" ? "bg-green-100 text-green-700" :
    status === "received" ? "bg-blue-100 text-blue-700" :
    status === "failed" || status === "bounced" ? "bg-red-100 text-red-700" :
    status === "queued" ? "bg-amber-100 text-amber-800" :
    "bg-gray-100 text-gray-600";
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide ${cls}`}>
      {status}
    </span>
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
      });
    }
    const t = map.get(key)!;
    t.messages.push(e);
    if (e.direction === "inbound") t.has_inbound = true;
    if (e.direction === "outbound") t.has_outbound = true;
    const ts = e.sent_at ?? e.created_at;
    if (ts > t.latest_at) t.latest_at = ts;
  }
  // Sort messages within thread oldest→newest, threads newest-latest first
  const list = Array.from(map.values());
  for (const t of list) {
    t.messages.sort((a, b) => (a.sent_at ?? a.created_at).localeCompare(b.sent_at ?? b.created_at));
  }
  list.sort((a, b) => b.latest_at.localeCompare(a.latest_at));
  return list;
}

function stripReplyPrefix(subject: string): string {
  return subject.replace(/^(re:|fwd:|fw:)\s+/i, "").trim() || subject;
}

function fmtDateTime(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.valueOf())) return s;
  return d.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" });
}
