"use client";

/**
 * Rep-side dashboard for the client document portal.
 *
 * What a rep does here: create a request for a borrower, get a link to send
 * (copy it, or have us email it), and watch documents arrive until the set is
 * complete — at which point it's ready to hand to YLA. The client-facing upload
 * page lives at /portal/<token>; this is the internal side.
 */
import { useCallback, useEffect, useState } from "react";

const AMBER = "#B45309";

type RequestRow = {
  id: string;
  applicant_name: string;
  applicant_email: string | null;
  applicant_count: number;
  opportunity_id: string | null;
  status: string;
  submitted_at: string | null;
  created_by: string | null;
  created_at: string;
};

type Detail = {
  received: number;
  total: number;
  complete: boolean;
  slots: {
    docKey: string;
    label: string;
    applicantIndex: number | null;
    slot: number;
    document: { filename: string; status: string; check_notes: string | null } | null;
  }[];
};

export default function DocumentRequestsClient() {
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [migrationHint, setMigrationHint] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Create form
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [count, setCount] = useState(1);
  const [sendEmail, setSendEmail] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newLink, setNewLink] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Expanded detail per row
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);

  const fetchRows = useCallback(async () => {
    try {
      const res = await fetch("/api/document-requests", { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) return { error: json.error as string };
      return { rows: json.requests as RequestRow[], hint: json.migration_hint as string | undefined };
    } catch {
      return { error: "Could not load requests." };
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await fetchRows();
      if (cancelled) return;
      if (r.error) setLoadError(r.error);
      else {
        setRows(r.rows ?? []);
        setMigrationHint(r.hint ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchRows]);

  const reload = useCallback(async () => {
    const r = await fetchRows();
    if (!r.error) {
      setRows(r.rows ?? []);
      setMigrationHint(r.hint ?? null);
    }
  }, [fetchRows]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    setNewLink(null);
    setCopied(false);
    if (!name.trim()) {
      setCreateError("Applicant name is required.");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/document-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          applicant_name: name.trim(),
          applicant_email: email.trim() || undefined,
          applicant_phone: phone.trim() || undefined,
          applicant_count: count,
          send_email: sendEmail && !!email.trim(),
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setCreateError(json.error || "Could not create the request.");
        return;
      }
      setNewLink(json.link);
      if (sendEmail && email.trim() && !json.emailed) {
        setCreateError(`Request created, but the email didn't send (${json.email_error ?? "unknown"}). Copy the link below and send it manually.`);
      }
      setName("");
      setEmail("");
      setPhone("");
      setCount(1);
      await reload();
    } catch {
      setCreateError("Could not reach the server.");
    } finally {
      setCreating(false);
    }
  }

  async function toggleDetail(id: string) {
    if (openId === id) {
      setOpenId(null);
      setDetail(null);
      return;
    }
    setOpenId(id);
    setDetail(null);
    try {
      const res = await fetch(`/api/document-requests/${id}`, { cache: "no-store" });
      const json = await res.json();
      if (json.ok) setDetail(json);
    } catch {
      /* leave detail null; the row still shows */
    }
  }

  async function cancel(id: string) {
    if (!confirm("Cancel this request? The client's upload link will stop working.")) return;
    await fetch(`/api/document-requests/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    await reload();
    if (openId === id) {
      setOpenId(null);
      setDetail(null);
    }
  }

  function copyLink(link: string) {
    void navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Client documents</h1>
        <p className="mt-1 text-gray-600">
          Send a borrower a secure link to upload their Preliminary Assessment documents. Everything
          is converted to Your Loan Assist&apos;s format automatically.
        </p>
      </header>

      {migrationHint && (
        <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {migrationHint}
        </div>
      )}

      {/* Create */}
      <form onSubmit={create} className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-900">New request</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-gray-700">Applicant name *</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
              placeholder="e.g. Jane Smith"
            />
          </label>
          <label className="text-sm">
            <span className="text-gray-700">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
              placeholder="jane@example.com"
            />
          </label>
          <label className="text-sm">
            <span className="text-gray-700">Phone</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
              placeholder="0400 000 000"
            />
          </label>
          <label className="text-sm">
            <span className="text-gray-700">Number of applicants</span>
            <select
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2"
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
          Email the upload link to the applicant now
        </label>
        {createError && (
          <p className="mt-3 rounded bg-red-50 p-2 text-sm text-red-700">{createError}</p>
        )}
        {newLink && (
          <div className="mt-3 rounded-md border border-green-200 bg-green-50 p-3">
            <p className="text-sm font-medium text-green-800">Request created. Send this link:</p>
            <div className="mt-2 flex items-center gap-2">
              <input
                readOnly
                value={newLink}
                className="w-full rounded border border-green-300 bg-white px-2 py-1 text-sm"
                onFocus={(e) => e.target.select()}
              />
              <button
                type="button"
                onClick={() => copyLink(newLink)}
                className="shrink-0 rounded-md bg-green-700 px-3 py-1 text-sm font-medium text-white"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <p className="mt-2 text-xs text-green-700">
              This link is shown once. If you lose it, create a new request.
            </p>
          </div>
        )}
        <div className="mt-4">
          <button
            type="submit"
            disabled={creating}
            className="rounded-md px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            style={{ background: AMBER }}
          >
            {creating ? "Creating…" : "Create request"}
          </button>
        </div>
      </form>

      {/* List */}
      <div className="mt-8">
        {loadError ? (
          <p className="rounded bg-red-50 p-3 text-sm text-red-700">{loadError}</p>
        ) : rows === null ? (
          <p className="text-gray-500">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-gray-500">No requests yet.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li key={r.id} className="rounded-lg border border-gray-200 bg-white">
                <div className="flex items-center justify-between gap-3 p-4">
                  <button type="button" onClick={() => void toggleDetail(r.id)} className="min-w-0 flex-1 text-left">
                    <p className="font-medium text-gray-900">{r.applicant_name}</p>
                    <p className="truncate text-sm text-gray-500">
                      {r.applicant_email || "no email"} · {r.applicant_count} applicant
                      {r.applicant_count > 1 ? "s" : ""} · {new Date(r.created_at).toLocaleDateString()}
                    </p>
                  </button>
                  <StatusPill status={r.status} />
                  {r.status !== "cancelled" && r.status !== "submitted" && (
                    <button
                      type="button"
                      onClick={() => void cancel(r.id)}
                      className="shrink-0 text-sm text-gray-400 hover:text-red-600"
                    >
                      Cancel
                    </button>
                  )}
                </div>
                {openId === r.id && (
                  <div className="border-t border-gray-100 p-4">
                    {!detail ? (
                      <p className="text-sm text-gray-500">Loading…</p>
                    ) : (
                      <>
                        <p className="mb-3 text-sm font-medium text-gray-700">
                          {detail.received} of {detail.total} received
                          {detail.complete && <span className="ml-2 text-green-700">— ready to submit</span>}
                        </p>
                        <ul className="space-y-1 text-sm">
                          {detail.slots.map((s, i) => (
                            <li key={i} className="flex items-center gap-2">
                              <span className={s.document ? "text-green-600" : "text-gray-300"}>
                                {s.document ? "✓" : "○"}
                              </span>
                              <span className={s.document ? "text-gray-700" : "text-gray-500"}>
                                {s.document ? s.document.filename : slotLabel(s)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function slotLabel(s: { label: string; docKey: string; slot: number; applicantIndex: number | null }): string {
  let label = s.label;
  if (s.docKey === "photo_id") label += s.slot === 1 ? " (front)" : " (back)";
  else if (s.slot > 1 || s.docKey === "payslip") label += ` ${s.slot}`;
  if (s.applicantIndex) label += ` — applicant ${s.applicantIndex}`;
  return label;
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    open: "bg-amber-100 text-amber-800",
    submitted: "bg-green-100 text-green-800",
    cancelled: "bg-gray-100 text-gray-500",
    expired: "bg-gray-100 text-gray-500",
  };
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${map[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}
