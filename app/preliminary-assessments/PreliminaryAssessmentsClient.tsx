"use client";

/**
 * Preliminary Assessments — every PA Your Loan Assist has sent back.
 *
 * Rows arrive from the mailbox feeder and are matched to a contact by the
 * applicants' email addresses. Whatever that could not place is matched here by
 * hand; a matched PA can be opened on a call with the client ("Open call"), where
 * the rep presents it and sends it for signature.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatDateTime } from "../../utils/datetime";
import { errMessage } from "../../utils/errors";
import type { PaListRow, PaStatus } from "../../utils/preliminary-assessments";
import PaResendButton from "../components/PaResendButton";

const TEAL = "#0F4C5C";

type ContactOption = { id: string; label: string; email: string; haystack: string };

const STATUS_COLOR: Record<PaStatus, string> = {
  Received: "bg-sky-100 text-sky-800",
  Presented: "bg-indigo-100 text-indigo-800",
  "Sent for signing": "bg-amber-100 text-amber-800",
  Signed: "bg-emerald-100 text-emerald-800",
  Superseded: "bg-gray-100 text-gray-500",
};

/** Search-as-you-type over the contact list, for matching one PA by hand. */
function MatchControl({
  row,
  contacts,
  onLoadContacts,
  onMatched,
}: {
  row: PaListRow;
  contacts: ContactOption[] | null;
  onLoadContacts: () => void;
  onMatched: (updated: PaListRow, label: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const results = useMemo(() => {
    if (!contacts) return [];
    const q = query.trim().toLowerCase();
    // Before the rep types anything, offer contacts that share an applicant's
    // email or surname — a hint for the eye only; the rep still chooses.
    const hints = row.applicants
      .flatMap((a) => [a.email, a.name.split(/\s+/).pop() ?? ""])
      .map((h) => h.toLowerCase())
      .filter((h) => h.length > 2);
    const wanted = q ? [q] : hints;
    if (wanted.length === 0) return [];
    return contacts.filter((c) => wanted.some((w) => c.haystack.includes(w))).slice(0, 8);
  }, [contacts, query, row.applicants]);

  async function choose(contact: ContactOption) {
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`/api/preliminary-assessments/${row.id}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: contact.id }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `Request failed (${res.status})`);
      onMatched(data.assessment as PaListRow, contact.label);
      setOpen(false);
    } catch (e) {
      setError(errMessage(e, "Could not match"));
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          onLoadContacts();
        }}
        className="rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
      >
        Match to a contact
      </button>
    );
  }

  return (
    <div className="w-64">
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name, email or phone"
          aria-label={`Find a contact for YLA ref ${row.yla_ref}`}
          className="w-full rounded-md border border-gray-300 px-2 py-1 text-xs focus:border-teal-600 focus:outline-none"
        />
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md px-1.5 py-1 text-xs text-gray-500 hover:bg-gray-100"
        >
          Cancel
        </button>
      </div>
      {contacts === null ? (
        <div className="mt-1 text-xs text-gray-400">Loading contacts…</div>
      ) : results.length === 0 ? (
        <div className="mt-1 text-xs text-gray-400">
          {query.trim() ? "No contact matches that." : "Type to search contacts."}
        </div>
      ) : (
        <ul className="mt-1 max-h-56 overflow-auto rounded-md border border-gray-200 bg-white shadow-sm">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                disabled={saving}
                onClick={() => choose(c)}
                className="block w-full px-2 py-1.5 text-left text-xs hover:bg-gray-50 disabled:opacity-50"
              >
                <span className="font-medium text-gray-800">{c.label}</span>
                {c.email && <span className="block truncate text-gray-500">{c.email}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <div className="mt-1 text-xs text-red-600">{error}</div>}
    </div>
  );
}

export default function PreliminaryAssessmentsClient() {
  const [rows, setRows] = useState<PaListRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [showSuperseded, setShowSuperseded] = useState(false);
  const [contacts, setContacts] = useState<ContactOption[] | null>(null);
  const [contactsRequested, setContactsRequested] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/preliminary-assessments");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || !data.ok) throw new Error(data.error || `Request failed (${res.status})`);
        setRows(data.assessments ?? []);
        setNames(data.contacts ?? {});
        setHint(data.migration_hint ?? "");
      } catch (e) {
        if (!cancelled) setError(errMessage(e, "Load failed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // The contact list is only fetched once a rep actually opens a match control.
  useEffect(() => {
    if (!contactsRequested) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/contacts/search");
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
        type Raw = { id: string; name?: string | null; full_name?: string | null; email?: string | null; phone?: string | null };
        setContacts(
          ((data.contacts ?? []) as Raw[]).map((c) => {
            const label = (c.full_name || c.name || c.email || "Unnamed contact").trim();
            const email = (c.email ?? "").trim();
            return { id: c.id, label, email, haystack: `${label} ${email} ${c.phone ?? ""}`.toLowerCase() };
          }),
        );
      } catch (e) {
        if (!cancelled) {
          setContacts([]);
          setError(errMessage(e, "Could not load contacts"));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contactsRequested]);

  function applyUpdate(updated: PaListRow, label?: string) {
    setRows((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
    if (label && updated.contact_id) setNames((prev) => ({ ...prev, [updated.contact_id as string]: label }));
  }

  async function unmatch(row: PaListRow) {
    if (!window.confirm(`Remove the contact from YLA ref ${row.yla_ref}? It will stay unmatched until you match it again.`)) {
      return;
    }
    setError("");
    try {
      const res = await fetch(`/api/preliminary-assessments/${row.id}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: null }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `Request failed (${res.status})`);
      applyUpdate(data.assessment as PaListRow);
    } catch (e) {
      setError(errMessage(e, "Could not remove the match"));
    }
  }

  const supersededCount = rows.filter((r) => r.status === "Superseded").length;
  const visible = showSuperseded ? rows : rows.filter((r) => r.status !== "Superseded");
  const unmatched = rows.filter((r) => !r.contact_id && r.status !== "Superseded").length;

  return (
    <div className="mx-auto max-w-7xl p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: TEAL }}>
            Preliminary Assessments
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Assessments returned by Your Loan Assist. Match each one to its client, then open a call to present it.
          </p>
        </div>
        {supersededCount > 0 && (
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={showSuperseded} onChange={(e) => setShowSuperseded(e.target.checked)} />
            Show {supersededCount} replaced by a newer assessment
          </label>
        )}
      </div>

      {hint && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{hint}</div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      {unmatched > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {unmatched} assessment{unmatched === 1 ? " is" : "s are"} not matched to a contact yet. No contact has an
          applicant&apos;s email address, so {unmatched === 1 ? "it needs" : "they need"} matching by hand.
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2">YLA ref</th>
              <th className="px-3 py-2">Applicants</th>
              <th className="px-3 py-2">Property</th>
              <th className="px-3 py-2">Received</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Contact</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-gray-400">
                  Loading…
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-gray-400">
                  No preliminary assessments yet. They appear here when Your Loan Assist emails one back.
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr key={row.id} className={row.status === "Superseded" ? "text-gray-400" : "text-gray-700"}>
                  <td className="px-3 py-2 align-top font-mono font-semibold">{row.yla_ref}</td>
                  <td className="px-3 py-2 align-top">
                    {row.applicants.length === 0 ? (
                      <span className="text-gray-400">Not read from the PDF</span>
                    ) : (
                      row.applicants.map((a, i) => (
                        <div key={`${a.email}-${i}`}>
                          <div className="font-medium">{a.name || "—"}</div>
                          {a.email && <div className="text-xs text-gray-500">{a.email}</div>}
                        </div>
                      ))
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">{row.property || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2 align-top">{formatDateTime(row.received_at)}</td>
                  <td className="px-3 py-2 align-top">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_COLOR[row.status]}`}>
                      {row.status}
                    </span>
                    {row.signing_error && (
                      <div className="mt-1 max-w-[14rem] text-xs text-red-600">Signing email failed: {row.signing_error}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 align-top">
                    {row.contact_id ? (
                      <div>
                        <Link href={`/contacts/${row.contact_id}`} className="font-medium text-teal-700 hover:underline">
                          {names[row.contact_id] || "View contact"}
                        </Link>
                        <div className="text-xs text-gray-400">
                          {row.matched_by === "auto:email" ? "matched on email" : "matched by hand"}
                          {/* Once it is out for signature the signers are fixed; moving it then would mislead. */}
                          {(row.status === "Received" || row.status === "Presented") && (
                            <>
                              {" · "}
                              <button type="button" onClick={() => unmatch(row)} className="underline hover:text-gray-600">
                                remove
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ) : row.status === "Superseded" ? (
                      "—"
                    ) : (
                      <MatchControl
                        row={row}
                        contacts={contacts}
                        onLoadContacts={() => setContactsRequested(true)}
                        onMatched={applyUpdate}
                      />
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right align-top">
                    <a
                      href={`/api/preliminary-assessments/${row.id}/pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-600 transition hover:bg-gray-50"
                    >
                      View PDF
                    </a>
                    {row.status === "Sent for signing" && (
                      <span className="ml-2">
                        <PaResendButton
                          paId={row.id}
                          className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
                        />
                      </span>
                    )}
                    {row.contact_id && row.status !== "Superseded" && (
                      <a
                        href={`/video/contact-${encodeURIComponent(row.contact_id)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 rounded-md px-2 py-1 text-xs font-semibold text-white transition hover:opacity-90"
                        style={{ backgroundColor: TEAL }}
                      >
                        Open call
                      </a>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
