"use client";

import { useState } from "react";
import { errMessage } from "../../utils/errors";

/**
 * "Request Documents" — creates a client document-collection request pre-filled
 * from the record the rep is looking at (opportunity or contact) and, when the
 * client has an email, sends them the secure upload link in one click.
 *
 * Pre-fill removes the retyping the standalone /document-requests page needs;
 * the confirm step exists because clicking this emails a real client, so the
 * rep sees exactly who it's going to first. When there's no email on file, it
 * still creates the request and hands back a link to send by hand.
 *
 * Calls POST /api/document-requests (authed) — same endpoint the standalone
 * dashboard uses; nothing new server-side.
 */
export default function RequestDocumentsButton({
  applicantName,
  applicantEmail,
  applicantPhone,
  opportunityId,
  contactId,
  applicantCount,
  applicant2Name,
  className,
}: {
  applicantName: string | null | undefined;
  applicantEmail?: string | null;
  applicantPhone?: string | null;
  opportunityId?: string | null;
  contactId?: string | null;
  /** Best-effort pre-fill; the rep can change it before sending. */
  applicantCount?: number;
  /** Second applicant's name, e.g. from a linked co-applicant contact. Pre-fills the field. */
  applicant2Name?: string | null;
  className?: string;
}) {
  const initialCount = applicantCount && applicantCount >= 1 ? applicantCount : 1;
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(initialCount);
  const [name2, setName2] = useState((applicant2Name || "").trim());
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<
    { link: string; emailed: boolean; emailError?: string | null; clientRef?: string | null } | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const name = (applicantName || "").trim();
  const email = (applicantEmail || "").trim();

  async function send() {
    setError(null);
    if (count >= 2 && !name2.trim()) {
      setError("Enter the second applicant's name so their documents are named correctly.");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/document-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          applicant_name: name,
          applicant_email: email || undefined,
          applicant_phone: (applicantPhone || "").trim() || undefined,
          applicant_count: count,
          applicant2_name: count >= 2 && name2.trim() ? name2.trim() : undefined,
          opportunity_id: opportunityId || undefined,
          contact_id: contactId || undefined,
          send_email: !!email,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Couldn't create the request");
      setResult({
        link: data.link,
        emailed: !!data.emailed,
        emailError: data.email_error,
        clientRef: data.request?.client_ref ?? null,
      });
    } catch (err) {
      setError(errMessage(err));
    } finally {
      setSending(false);
    }
  }

  function reset() {
    setOpen(false);
    setResult(null);
    setError(null);
    setCopied(false);
    setCount(initialCount);
    setName2((applicant2Name || "").trim());
  }

  // Prefill from the latest props when the popover opens — linked-contact data
  // (which supplies applicant2Name/count) can load after this button mounts,
  // and the rep only opens the popover once it's on screen.
  function openPopover() {
    setCount(initialCount);
    setName2((applicant2Name || "").trim());
    setError(null);
    setOpen(true);
  }

  function copy(link: string) {
    void navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => (open ? reset() : openPopover())}
        className={className}
        title={!name ? "This record has no name" : "Request Preliminary Assessment documents"}
        disabled={!name}
      >
        📎 Request Documents
      </button>

      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
          {!result ? (
            <>
              <p className="text-sm font-semibold text-gray-900">Request documents</p>
              <p className="mt-1 text-sm text-gray-600">
                {name || "This record"} will be asked to upload their Preliminary Assessment documents.
              </p>

              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-gray-500">Send to</dt>
                  <dd className="truncate text-right text-gray-900">
                    {email || <span className="text-amber-700">no email — link only</span>}
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-gray-500">Applicants</dt>
                  <dd>
                    <select
                      value={count}
                      onChange={(e) => setCount(Number(e.target.value))}
                      className="rounded border border-gray-300 px-2 py-0.5 text-sm"
                    >
                      {[1, 2, 3, 4].map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </dd>
                </div>
              </dl>

              {count >= 2 && (
                <label className="mt-3 block text-sm">
                  <span className="text-gray-500">Second applicant&apos;s name</span>
                  <input
                    value={name2}
                    onChange={(e) => setName2(e.target.value)}
                    placeholder="e.g. Alex Smith"
                    className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                  <span className="mt-1 block text-xs text-gray-400">
                    So their documents are named correctly for YLA.
                  </span>
                </label>
              )}

              {error && <p className="mt-3 rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}

              <div className="mt-4 flex items-center justify-end gap-2">
                <button type="button" onClick={reset} className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={sending}
                  className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {sending ? "Working…" : email ? "Send link" : "Create link"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-green-800">
                {result.emailed ? `Link sent to ${email}` : "Request created"}
                {result.clientRef && (
                  <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 font-mono text-xs text-green-800">
                    {result.clientRef}
                  </span>
                )}
              </p>
              {!result.emailed && email && result.emailError && (
                <p className="mt-1 text-xs text-amber-700">
                  Couldn&apos;t email it ({result.emailError}). Copy the link and send it manually.
                </p>
              )}
              {!email && (
                <p className="mt-1 text-xs text-gray-600">No email on file — copy this and send it to the client.</p>
              )}
              <div className="mt-3 flex items-center gap-2">
                <input
                  readOnly
                  value={result.link}
                  onFocus={(e) => e.target.select()}
                  className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                />
                <button
                  type="button"
                  onClick={() => copy(result.link)}
                  className="shrink-0 rounded-md bg-gray-700 px-2 py-1 text-xs font-medium text-white"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-400">This link is shown once. Track progress under Client Documents.</p>
              <div className="mt-3 text-right">
                <button type="button" onClick={reset} className="rounded px-3 py-1 text-sm text-gray-600 hover:bg-gray-50">
                  Done
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
