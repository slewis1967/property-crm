"use client";

import { useState } from "react";
import { errMessage } from "../../utils/errors";
import { describeDelivery, deliveryActionLabel } from "../../utils/document-request-delivery";

/**
 * "Request Documents" — creates a document-collection request per applicant,
 * pre-filled from the record the rep is looking at, and emails each applicant
 * their own secure upload link.
 *
 * Each applicant gets their OWN request (their own link, their own personal
 * documents). A joint deal's requests share an application_id + one NK reference
 * so they later export into a single Drive folder for YLA. Pre-fill removes the
 * retyping; a confirm step exists because this emails real clients.
 *
 * Calls POST /api/document-requests (authed) once per applicant.
 */
type Created = { label: string; link: string; email: string; emailed: boolean; emailError?: string | null };

export default function RequestDocumentsButton({
  applicantName,
  applicantEmail,
  applicantPhone,
  opportunityId,
  contactId,
  applicantCount,
  applicant2Name,
  applicant2Email,
  className,
}: {
  applicantName: string | null | undefined;
  applicantEmail?: string | null;
  applicantPhone?: string | null;
  opportunityId?: string | null;
  contactId?: string | null;
  /** Best-effort pre-fill; the rep can change it before sending. */
  applicantCount?: number;
  /** Second applicant, e.g. from a linked co-applicant contact or a fact find. */
  applicant2Name?: string | null;
  applicant2Email?: string | null;
  className?: string;
}) {
  const initialCount = applicantCount && applicantCount >= 1 ? applicantCount : 1;
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(initialCount);
  const [name2, setName2] = useState((applicant2Name || "").trim());
  const [email2, setEmail2] = useState((applicant2Email || "").trim());
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<Created[] | null>(null);
  const [clientRef, setClientRef] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  // Where the completed + verified set goes: 'yla' (default) or a broker id.
  const [brokers, setBrokers] = useState<{ id: string; name: string; active: boolean }[]>([]);
  const [destination, setDestination] = useState("yla");

  const name = (applicantName || "").trim();
  const email = (applicantEmail || "").trim();

  // Who actually gets emailed, per applicant. See utils/document-request-delivery
  // for why this is not a single willSend flag.
  const { sendCount, linkOnlyCount } = describeDelivery(
    count >= 2 ? [email, email2] : [email],
  );

  async function createOne(body: Record<string, unknown>): Promise<{ ok: boolean; data?: Record<string, unknown>; error?: string }> {
    try {
      const res = await fetch("/api/document-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) return { ok: false, error: data.error || "Couldn't create the request" };
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: errMessage(err) };
    }
  }

  async function send() {
    setError(null);
    if (count >= 2 && !name2.trim()) {
      setError("Enter the second applicant's name so their documents are named correctly.");
      return;
    }
    setSending(true);
    try {
      // Applicant 1 first — it gets the shared NK reference the others reuse.
      const applicationId = count >= 2 ? crypto.randomUUID() : null;
      const first = await createOne({
        applicant_name: name,
        applicant_email: email || undefined,
        applicant_phone: (applicantPhone || "").trim() || undefined,
        opportunity_id: opportunityId || undefined,
        contact_id: contactId || undefined,
        application_id: applicationId || undefined,
        submit_target: destination === "yla" ? "yla" : "broker",
        broker_id: destination === "yla" ? undefined : destination,
        send_email: !!email,
      });
      if (!first.ok) {
        setError(first.error!);
        return;
      }
      const ref = (first.data!.request as { client_ref?: string })?.client_ref ?? null;
      setClientRef(ref);
      const created: Created[] = [
        {
          label: name || "Applicant 1",
          link: first.data!.link as string,
          email,
          emailed: !!first.data!.emailed,
          emailError: (first.data!.email_error as string | null) ?? null,
        },
      ];

      if (count >= 2) {
        const e2 = email2.trim();
        const second = await createOne({
          applicant_name: name2.trim(),
          applicant_email: e2 || undefined,
          opportunity_id: opportunityId || undefined,
          application_id: applicationId || undefined,
          client_ref: ref || undefined, // share the reference + folder
          submit_target: destination === "yla" ? "yla" : "broker",
          broker_id: destination === "yla" ? undefined : destination,
          send_email: !!e2,
        });
        if (second.ok) {
          created.push({
            label: name2.trim(),
            link: second.data!.link as string,
            email: e2,
            emailed: !!second.data!.emailed,
            emailError: (second.data!.email_error as string | null) ?? null,
          });
        } else {
          setError(`Applicant 1 created, but applicant 2 failed: ${second.error}`);
        }
      }

      setResults(created);
    } finally {
      setSending(false);
    }
  }

  function reset() {
    setOpen(false);
    setResults(null);
    setClientRef(null);
    setError(null);
    setCopiedIdx(null);
    setCount(initialCount);
    setName2((applicant2Name || "").trim());
    setEmail2((applicant2Email || "").trim());
  }

  // Prefill from the latest props when the popover opens — linked-contact / fact
  // find data can load after this button mounts, and the rep opens the popover
  // once it's on screen.
  async function openPopover() {
    const seedName2 = (applicant2Name || "").trim();
    setCount(initialCount);
    setName2(seedName2);
    setEmail2((applicant2Email || "").trim());
    setError(null);
    setOpen(true);

    // Load the broker list so the rep can route this set to a broker instead of
    // YLA. Best-effort — no brokers just means YLA is the only option.
    fetch("/api/settings/brokers")
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok && Array.isArray(j.brokers)) setBrokers(j.brokers.filter((b: { active: boolean }) => b.active));
      })
      .catch(() => {});

    // Fill the second applicant from the newest Fact Find / Needs Analysis when a
    // linked contact didn't already supply one. Best-effort.
    if (!seedName2 && contactId) {
      try {
        const res = await fetch(
          `/api/document-requests/prefill?contact_id=${encodeURIComponent(contactId)}`,
          { cache: "no-store" },
        );
        const data = await res.json();
        if (data?.ok && data.applicant2_name) {
          setName2((cur) => (cur.trim() ? cur : data.applicant2_name));
          if (data.applicant2_email) setEmail2((cur) => (cur.trim() ? cur : data.applicant2_email));
          setCount((cur) => (cur >= 2 ? cur : 2));
        }
      } catch {
        /* prefill is best-effort */
      }
    }
  }

  function copy(link: string, idx: number) {
    void navigator.clipboard.writeText(link).then(() => {
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 2000);
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
        <div className="absolute right-0 z-20 mt-2 w-96 rounded-lg border border-gray-200 bg-white p-4 shadow-lg">
          {!results ? (
            <>
              <p className="text-sm font-semibold text-gray-900">Request documents</p>
              <p className="mt-1 text-sm text-gray-600">
                {linkOnlyCount === 0
                  ? "Each applicant is emailed their own secure upload link automatically."
                  : "Each applicant needs their own secure upload link — add an email below and it is sent automatically."}
              </p>

              <div className="mt-3 flex items-center justify-between gap-2 text-sm">
                <span className="text-gray-500">Applicants</span>
                <select
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                  className="rounded border border-gray-300 px-2 py-0.5 text-sm"
                >
                  {[1, 2].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>

              {brokers.length > 0 && (
                <div className="mt-3 flex items-center justify-between gap-2 text-sm">
                  <span className="text-gray-500">Submit completed set to</span>
                  <select
                    value={destination}
                    onChange={(e) => setDestination(e.target.value)}
                    className="rounded border border-gray-300 px-2 py-0.5 text-sm"
                    title="Where the verified documents are sent once collected"
                  >
                    <option value="yla">Your Loan Assist (YLA)</option>
                    {brokers.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="mt-3 rounded-md border border-gray-100 bg-gray-50 p-2 text-sm">
                <p className="font-medium text-gray-900">Applicant 1 — {name || "Unknown"}</p>
                {email ? (
                  <p className="text-gray-500">{email}</p>
                ) : (
                  <p className="text-amber-700">No email on file — you&apos;ll need to send their link yourself.</p>
                )}
              </div>

              {count >= 2 && (
                <div className="mt-2 space-y-2 rounded-md border border-gray-100 bg-gray-50 p-2">
                  <p className="text-sm font-medium text-gray-900">Applicant 2</p>
                  <input
                    value={name2}
                    onChange={(e) => setName2(e.target.value)}
                    placeholder="Name (e.g. Alex Smith)"
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                  <input
                    type="email"
                    value={email2}
                    onChange={(e) => setEmail2(e.target.value)}
                    placeholder="Email — for their own upload link"
                    className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                  {!email2.trim() && (
                    <p className="text-xs text-amber-700">
                      No email — this applicant gets a link only, and you&apos;ll need to send it to
                      them. Each applicant must supply their own documents.
                    </p>
                  )}
                </div>
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
                  {sending ? "Sending…" : deliveryActionLabel({ sendCount, linkOnlyCount })}
                </button>
              </div>
            </>
          ) : (
            <>
              {(() => {
                const allSent = results.every((r) => r.emailed);
                const anySent = results.some((r) => r.emailed);
                return (
                  <p className={`text-sm font-semibold ${allSent ? "text-green-800" : "text-amber-800"}`}>
                    {allSent
                      ? results.length > 1
                        ? "Links sent to both applicants"
                        : "Link sent"
                      : anySent
                        ? "Some links sent — action needed below"
                        : "Links created — action needed below"}
                    {clientRef && (
                      <span className="ml-2 rounded bg-green-100 px-1.5 py-0.5 font-mono text-xs text-green-800">
                        {clientRef}
                      </span>
                    )}
                  </p>
                );
              })()}
              {error && <p className="mt-1 text-xs text-amber-700">{error}</p>}

              <div className="mt-3 space-y-3">
                {results.map((r, i) =>
                  r.emailed ? (
                    // Delivered automatically — no copying needed.
                    <div key={i} className="flex items-start gap-2 rounded-md bg-green-50 p-2">
                      <span className="text-green-600">✓</span>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{r.label}</p>
                        <p className="text-xs text-green-700">Emailed to {r.email}</p>
                      </div>
                    </div>
                  ) : (
                    // Couldn't auto-send (no email, or the send failed) — fall back
                    // to a copyable link so the request isn't stuck.
                    <div key={i} className="rounded-md border border-amber-200 bg-amber-50 p-2">
                      <p className="text-sm font-medium text-gray-900">{r.label}</p>
                      <p className="text-xs text-amber-700">
                        {r.email
                          ? `Couldn't email ${r.email} — send the link below.`
                          : "No email on file — add one to their contact to auto-send, or send the link below."}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <input
                          readOnly
                          value={r.link}
                          onFocus={(e) => e.target.select()}
                          className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => copy(r.link, i)}
                          className="shrink-0 rounded-md bg-gray-700 px-2 py-1 text-xs font-medium text-white"
                        >
                          {copiedIdx === i ? "Copied" : "Copy"}
                        </button>
                      </div>
                    </div>
                  ),
                )}
              </div>
              <p className="mt-2 text-xs text-gray-400">Track progress under Client Documents.</p>
              <div className="mt-2 text-right">
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
