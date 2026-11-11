"use client";

import { useEffect, useState } from "react";

export type EmailComposeProps = {
  open: boolean;
  onClose: () => void;
  /** Defaults for the composer fields. */
  defaultTo?: string;
  defaultToName?: string;
  defaultSubject?: string;
  defaultBody?: string;
  /** Linkage — saved on the email_log row so the email shows up under the contact/opp. */
  contactId?: string | null;
  opportunityId?: string | null;
  /** Free-form tags for the email_log.tags column. */
  tags?: string[];
  /** Threading — when replying, the parent's RFC822 message_id and the
   * thread_id to inherit. Sets In-Reply-To/References on the outgoing email. */
  inReplyTo?: string | null;
  threadId?: string | null;
  /** Shared mailbox key when replying from a shared view (e.g. "springboard"):
   * sends as that brand and files the reply under the mailbox. */
  mailbox?: string | null;
  /** Display-only From line for a shared mailbox. */
  fromLabel?: string | null;
  /** Called after a successful send. Receives the new email_log row. */
  onSent?: (email: { id: string; to_email: string; subject: string }) => void;
};

/** One entry from GET /api/emails/sender. */
type SendAccountView = {
  key: string;
  label: string;
  from_email: string;
  from_name: string;
  signature_html: string | null;
};

export default function EmailComposeModal({
  open, onClose,
  defaultTo = "", defaultToName = "",
  defaultSubject = "", defaultBody = "",
  contactId, opportunityId, tags,
  inReplyTo, threadId, mailbox, fromLabel,
  onSent,
}: EmailComposeProps) {
  const [to, setTo] = useState(defaultTo);
  const [toName, setToName] = useState(defaultToName);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  // The business accounts this user can send from (NextKey as themselves,
  // Springboard for its mailbox members), each with the signature it adds.
  // Not used when replying from a shared mailbox view.
  const [accounts, setAccounts] = useState<SendAccountView[]>([]);
  const [fromKey, setFromKey] = useState<string>("nextkey");
  useEffect(() => {
    if (!open || mailbox) return;
    let cancelled = false;
    fetch("/api/emails/sender")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!cancelled && j?.ok && Array.isArray(j.accounts)) setAccounts(j.accounts);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, mailbox]);
  const account = accounts.find((a) => a.key === fromKey) ?? accounts[0] ?? null;

  async function aiDraft() {
    if (!contactId) {
      setError("AI draft needs a contact context — open compose from a contact page.");
      return;
    }
    setDrafting(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/email-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: contactId,
          // Use whatever's in the subject field as the topic hint, else nothing.
          instruction: subject || undefined,
          // If we're replying, the in_reply_to is the parent's RFC message_id;
          // we'd need the parent's email_log id to look up its body. The
          // EmailComposeModal doesn't currently receive that; AI draft for a
          // reply works on contact context alone, which is good enough for v1.
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "AI draft failed");
        return;
      }
      setSubject(json.subject);
      setBody(json.body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setDrafting(false);
    }
  }

  // Defaults are picked up via initial useState — parent should pass a
  // changing `key` prop when context switches (e.g. compose vs reply) to
  // force a fresh modal instance with the new defaults.

  if (!open) return null;

  // Body is rendered as HTML in the email — but the textarea here is plain
  // text. We wrap in <p> tags and convert paragraph breaks. Caller can pass
  // pre-formatted HTML via defaultBody if richer markup is needed.
  function bodyToHtml(text: string): string {
    return text
      .split(/\n\n+/)
      .map((para) => `<p>${escapeHtml(para).replace(/\n/g, "<br />")}</p>`)
      .join("");
  }

  async function send() {
    setSending(true);
    setError(null);
    try {
      const html = bodyToHtml(body);
      const res = await fetch("/api/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to,
          to_name: toName || undefined,
          subject,
          body_html: html,
          body_text: body,
          contact_id: contactId ?? undefined,
          opportunity_id: opportunityId ?? undefined,
          tags,
          in_reply_to: inReplyTo ?? undefined,
          thread_id: threadId ?? undefined,
          mailbox: mailbox ?? undefined,
          from_identity: mailbox ? undefined : (account?.key ?? fromKey),
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "Send failed");
        return;
      }
      onSent?.(json.email);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="font-semibold text-lg">Compose Email</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {!mailbox && (
            <label className="block">
              <span className="block text-xs text-gray-600 mb-1">From</span>
              <select
                value={account?.key ?? fromKey}
                onChange={(e) => setFromKey(e.target.value)}
                disabled={accounts.length === 0}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm bg-white"
              >
                {accounts.length === 0 && <option>Loading…</option>}
                {accounts.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.label}: {a.from_name} &lt;{a.from_email}&gt;
                  </option>
                ))}
              </select>
            </label>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="block md:col-span-2">
              <span className="block text-xs text-gray-600 mb-1">To</span>
              <input
                type="email"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                placeholder="recipient@example.com"
              />
            </label>
            <label className="block">
              <span className="block text-xs text-gray-600 mb-1">Recipient name (optional)</span>
              <input
                type="text"
                value={toName}
                onChange={(e) => setToName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                placeholder="Sarah"
              />
            </label>
          </div>
          <label className="block">
            <span className="block text-xs text-gray-600 mb-1">Subject</span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              placeholder="Re: your enquiry"
            />
          </label>
          <label className="block">
            <div className="flex items-center justify-between mb-1">
              <span className="block text-xs text-gray-600">Message</span>
              {contactId && (
                <button
                  type="button"
                  onClick={aiDraft}
                  disabled={drafting}
                  className="text-[11px] font-semibold px-2 py-1 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Generate a draft from contact context (uses subject line as topic hint if filled)"
                >
                  {drafting ? "Drafting…" : "✨ AI Draft"}
                </button>
              )}
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={12}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-sans"
              placeholder={"Hi Sarah,\n\nFollowing on from our chat earlier…"}
            />
            <span className="block text-[11px] text-gray-400 mt-1">
              {mailbox
                ? "Plain text. Paragraph breaks render as paragraphs. Sent as the shared mailbox — your personal signature is not added."
                : "Plain text. Paragraph breaks render as paragraphs. Your signature is auto-appended on send — no need to type it."}
            </span>
          </label>
          {!mailbox && account && (
            <div>
              <span className="block text-xs text-gray-600 mb-1">Signature added on send</span>
              {account.signature_html ? (
                <div
                  className="border border-gray-200 rounded-md px-3 py-1 bg-gray-50 text-sm"
                  // Rendered server-side by renderSignature from the saved signature (escaped).
                  dangerouslySetInnerHTML={{ __html: account.signature_html }}
                />
              ) : (
                <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  No signature on file for this account, so it can&apos;t send yet.
                </p>
              )}
            </div>
          )}
          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 p-5 border-t border-gray-100">
          <p className="text-xs text-gray-400">
            From: {fromLabel ?? (account ? `${account.from_name} <${account.from_email}>` : "…")}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={send}
              disabled={sending || !to || !subject || !body}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
