"use client";

import Link from "next/link";
import { useState } from "react";
import EmailComposeModal from "../components/EmailComposeModal";

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

export default function InboxTable({
  threads,
  contactNames,
}: {
  threads: Thread[];
  contactNames: Record<string, string>;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [replyContext, setReplyContext] = useState<{ email: EmailRow; thread: Thread } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const openReply = (email: EmailRow, thread: Thread) => {
    setReplyContext({ email, thread });
  };
  const closeReply = () => setReplyContext(null);

  if (threads.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <p className="text-sm text-gray-500">No threads match this filter.</p>
      </div>
    );
  }

  return (
    <>
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="text-left py-2 px-4 text-gray-500 font-medium w-8"></th>
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
            return (
              <RowGroup key={t.thread_id}>
                <tr
                  className={`border-b border-gray-50 cursor-pointer transition ${isOpen ? "bg-blue-50" : "hover:bg-gray-50"}`}
                  onClick={() => setExpanded(isOpen ? null : t.thread_id)}
                >
                  <td className="py-2 px-4 text-center">{isOpen ? "▼" : dirIcon}</td>
                  <td className="py-2 px-4">
                    <p className="font-medium truncate max-w-md">{t.subject}</p>
                    {latest && (
                      <p className="text-xs text-gray-400 mt-0.5 truncate max-w-md">
                        {latest.direction === "inbound" ? "from" : "to"}{" "}
                        {latest.direction === "inbound" ? latest.from_email : latest.to_email}
                      </p>
                    )}
                  </td>
                  <td className="py-2 px-4">
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
                  <td className="py-2 px-4 text-right text-xs text-gray-600">
                    {t.messages.length}
                    {t.unread_inbound > 0 && (
                      <span className="ml-2 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700">
                        {t.unread_inbound} new
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-4 text-right text-xs text-gray-500 whitespace-nowrap">
                    {fmtDateTime(t.latest_at)}
                  </td>
                </tr>
                {isOpen && (
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <td colSpan={5} className="px-6 py-4">
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
          dangerouslySetInnerHTML={{ __html: email.body_html }}
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
