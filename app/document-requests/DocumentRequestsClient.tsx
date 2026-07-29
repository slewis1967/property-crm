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
  client_ref: string | null;
  applicant_name: string;
  applicant_email: string | null;
  opportunity_id: string | null;
  status: string;
  drive_folder_url: string | null;
  submitted_at: string | null;
  created_by: string | null;
  created_at: string;
  verification_status: string | null;
  yla_submitted_at: string | null;
  /** Optional: absent until the 20260727 migration runs, so the UI must cope. */
  training_video_released_at?: string | null;
  /** Optional: absent until the 20260729 migration runs. Gates the walkthrough. */
  pa_received_at?: string | null;
};

/**
 * HELD = the sweep verified and packaged it to Drive, but YLA_SUBMIT_HOLD kept
 * a human in the loop, so nothing has been sent. "passed" with no submission
 * timestamp is exactly that state (a real submission always stamps both).
 */
function isHeldForRelease(r: RequestRow): boolean {
  return r.verification_status === "passed" && !r.yla_submitted_at && !!r.drive_folder_url;
}

type WeeklyEntry = {
  title: string;
  invite: string;
  body: string;
  count: number;
  all_ids: string[];
  requests: { id: string; applicant_name: string; drive_folder_url: string }[];
};

type Detail = {
  received: number;
  total: number;
  complete: boolean;
  slots: {
    docKey: string;
    label: string;
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
  const [sendEmail, setSendEmail] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newLink, setNewLink] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Expanded detail per row
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [exportMsg, setExportMsg] = useState<{ id: string; text: string; url?: string; error?: boolean } | null>(null);
  const [videoBusy, setVideoBusy] = useState<string | null>(null);
  const [videoMsg, setVideoMsg] = useState<{ id: string; text: string; error?: boolean } | null>(null);

  // Weekly YLA calendar entry
  const [weekly, setWeekly] = useState<WeeklyEntry | null>(null);
  const [weeklyOpen, setWeeklyOpen] = useState(false);
  const [weeklyCopied, setWeeklyCopied] = useState<"title" | "body" | null>(null);
  const [marking, setMarking] = useState(false);

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
    await refreshDetail(id);
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

  const fetchWeekly = useCallback(async (): Promise<WeeklyEntry | null> => {
    try {
      const res = await fetch("/api/document-requests/weekly-entry", { cache: "no-store" });
      const json = await res.json();
      return json.ok ? (json as WeeklyEntry) : null;
    } catch {
      return null;
    }
  }, []);

  const loadWeekly = useCallback(async () => {
    const w = await fetchWeekly();
    if (w) setWeekly(w);
  }, [fetchWeekly]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const w = await fetchWeekly();
      if (!cancelled && w) setWeekly(w);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchWeekly]);

  function copyText(text: string, which: "title" | "body") {
    void navigator.clipboard.writeText(text).then(() => {
      setWeeklyCopied(which);
      setTimeout(() => setWeeklyCopied(null), 2000);
    });
  }

  async function markWeeklySubmitted() {
    if (!weekly || weekly.count === 0) return;
    if (!confirm(`Mark ${weekly.count} client${weekly.count === 1 ? "" : "s"} as submitted to YLA? They'll drop out of next week's entry.`)) {
      return;
    }
    setMarking(true);
    try {
      await fetch("/api/document-requests/weekly-entry", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: weekly.all_ids }),
      });
      await loadWeekly();
      await reload();
    } finally {
      setMarking(false);
    }
  }

  async function exportToDrive(id: string, complete: boolean) {
    setExportMsg(null);
    if (!complete && !confirm("This set is incomplete. Export a partial set to Drive anyway? YLA reject partial sets.")) {
      return;
    }
    setExporting(id);
    try {
      const res = await fetch(`/api/document-requests/${id}/export${complete ? "" : "?force=1"}`, {
        method: "POST",
      });
      const json = await res.json();
      if (json.ok) {
        setExportMsg({ id, text: `Exported ${json.uploaded} file${json.uploaded === 1 ? "" : "s"} to Drive.`, url: json.folder_url });
        await reload();
        await loadWeekly();
        if (openId === id) await refreshDetail(id);
      } else {
        setExportMsg({ id, text: json.error || "Export failed.", url: json.folder_url, error: true });
      }
    } catch {
      setExportMsg({ id, text: "Could not reach the server.", error: true });
    } finally {
      setExporting(null);
    }
  }

  /** Release a held package: email YLA the COMP-8317 invite with the Drive link. */
  async function sendToYla(id: string, applicant: string) {
    setExportMsg(null);
    if (!confirm(`Send ${applicant}'s application to Your Loan Assist now?\n\nThis emails programs@yourloanassist.com.au the calendar invite with the Drive link. It can't be unsent.`)) {
      return;
    }
    setSending(id);
    try {
      const res = await fetch(`/api/document-requests/${id}/submit-to-yla`, { method: "POST" });
      const json = await res.json();
      if (json.ok && json.submitted) {
        setExportMsg({ id, text: "Sent to YLA." });
      } else if (json.ok && json.dryRun) {
        // YLA_AUTOSUBMIT_ENABLED is off, so the primitive only ever previews.
        setExportMsg({ id, text: "Nothing sent — YLA sending is switched off (YLA_AUTOSUBMIT_ENABLED).", error: true });
      } else {
        setExportMsg({ id, text: json.error || `Could not send to YLA (${json.stage || res.status}).`, error: true });
      }
      await reload();
      await loadWeekly();
    } catch {
      // The release re-verifies with the AI before sending, so a slow request can
      // time out at the gateway AFTER the email has gone. Never claim it failed —
      // reload and let the row's own state say whether it sent.
      setExportMsg({
        id,
        text: "Lost contact before the result came back — reloading. Check whether it now shows as sent before trying again.",
        error: true,
      });
      await reload();
    } finally {
      setSending(null);
    }
  }

  async function refreshDetail(id: string) {
    try {
      const res = await fetch(`/api/document-requests/${id}`, { cache: "no-store" });
      const json = await res.json();
      if (json.ok) setDetail(json);
    } catch {
      /* keep prior detail */
    }
  }

  /**
   * Show or hide the director ID walkthrough for one client.
   *
   * Opt-in per client because the video is only correct where the SMSF has a
   * CORPORATE trustee — releasing it to an individual-trustee fund would tell
   * that client to obtain an identifier they are not required to hold.
   */
  async function toggleTrainingVideo(id: string, release: boolean) {
    setVideoBusy(id);
    setVideoMsg(null);
    try {
      const res = await fetch(`/api/document-requests/${id}/training-video`, {
        method: release ? "POST" : "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setVideoMsg({ id, text: json.error || "Could not update the video.", error: true });
        return;
      }
      setVideoMsg({
        id,
        text: release
          ? "Released — the client can now see it under Help."
          : "Hidden again — the client can no longer see it.",
        error: false,
      });
      await reload();
    } catch {
      setVideoMsg({ id, text: "Could not reach the server.", error: true });
    } finally {
      setVideoBusy(null);
    }
  }

  /** Mark the Preliminary Assessment back from YLA (or undo it). */
  async function togglePaReceived(id: string, received: boolean) {
    setVideoBusy(id);
    setVideoMsg(null);
    try {
      const res = await fetch(`/api/document-requests/${id}/pa-received`, {
        method: received ? "POST" : "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setVideoMsg({ id, text: json.error || "Could not update the PA status.", error: true });
        return;
      }
      setVideoMsg({
        id,
        text: received
          ? "PA marked as received. You can now release the walkthrough."
          : "PA marked as not received — the walkthrough is hidden again.",
        error: false,
      });
      await reload();
    } catch {
      setVideoMsg({ id, text: "Could not reach the server.", error: true });
    } finally {
      setVideoBusy(null);
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

      {/* Weekly YLA entry */}
      {weekly && weekly.count > 0 && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-blue-900">
                Ready for this week&apos;s YLA submission
              </h2>
              <p className="text-sm text-blue-800">
                {weekly.count} client{weekly.count === 1 ? "" : "s"} exported to Drive and not yet sent to YLA.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setWeeklyOpen((v) => !v)}
              className="rounded-md border border-blue-300 bg-white px-3 py-2 text-sm font-medium text-blue-800"
            >
              {weeklyOpen ? "Hide" : "Build calendar entry"}
            </button>
          </div>

          {weeklyOpen && (
            <div className="mt-4 space-y-3">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-blue-700">Calendar title</span>
                  <button type="button" onClick={() => copyText(weekly.title, "title")} className="text-xs font-medium text-blue-700 hover:underline">
                    {weeklyCopied === "title" ? "Copied" : "Copy"}
                  </button>
                </div>
                <input readOnly value={weekly.title} onFocus={(e) => e.target.select()} className="mt-1 w-full rounded border border-blue-200 bg-white px-2 py-1 font-mono text-sm" />
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-blue-700">
                    Body — invite {weekly.invite}
                  </span>
                  <button type="button" onClick={() => copyText(weekly.body, "body")} className="text-xs font-medium text-blue-700 hover:underline">
                    {weeklyCopied === "body" ? "Copied" : "Copy"}
                  </button>
                </div>
                <textarea readOnly value={weekly.body} rows={Math.min(12, weekly.count + 2)} onFocus={(e) => e.target.select()} className="mt-1 w-full rounded border border-blue-200 bg-white px-2 py-1 font-mono text-xs" />
              </div>

              <div className="flex items-center gap-3">
                <button type="button" onClick={() => void markWeeklySubmitted()} disabled={marking} className="rounded-md bg-blue-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
                  {marking ? "Marking…" : "Mark all as submitted to YLA"}
                </button>
                <span className="text-xs text-blue-700">
                  Do this after you&apos;ve created and sent the calendar entry.
                </span>
              </div>
            </div>
          )}
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
                    <p className="font-medium text-gray-900">
                      {r.applicant_name}
                      {r.client_ref && (
                        <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600">
                          {r.client_ref}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-sm text-gray-500">
                      {r.applicant_email || "no email"} · {new Date(r.created_at).toLocaleDateString()}
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

                        {r.status !== "submitted" && r.status !== "cancelled" && (
                          <div className="mt-4 flex items-center gap-3">
                            <button
                              type="button"
                              disabled={exporting === r.id}
                              onClick={() => void exportToDrive(r.id, detail.complete)}
                              className={`rounded-md px-3 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                                detail.complete ? "bg-green-700 hover:bg-green-800" : "bg-gray-500 hover:bg-gray-600"
                              }`}
                            >
                              {exporting === r.id
                                ? "Sending to Drive…"
                                : detail.complete
                                  ? "Send to Drive"
                                  : "Send partial set to Drive"}
                            </button>
                            {!detail.complete && (
                              <span className="text-xs text-gray-500">
                                Not all documents are in yet.
                              </span>
                            )}
                          </div>
                        )}

                        {/* Held by YLA_SUBMIT_HOLD: verified and packaged, waiting
                            on a human to release it to YLA. */}
                        {isHeldForRelease(r) && (
                          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                            <p className="text-sm font-semibold text-amber-900">
                              Ready for YLA — held for your check
                            </p>
                            <p className="mt-1 text-sm text-amber-800">
                              Verified and packaged to Drive, including the signed Needs Analysis and
                              Credit File Authorisation. Nothing has been sent yet.
                            </p>
                            <div className="mt-3 flex flex-wrap items-center gap-3">
                              <a
                                href={r.drive_folder_url!}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded-md bg-white px-3 py-2 text-sm font-medium text-amber-900 shadow-sm ring-1 ring-amber-300 hover:bg-amber-100"
                              >
                                Check the Drive folder ↗
                              </a>
                              <button
                                type="button"
                                disabled={sending === r.id}
                                onClick={() => void sendToYla(r.id, r.applicant_name)}
                                className="rounded-md bg-amber-700 px-3 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
                              >
                                {sending === r.id ? "Sending…" : "Send to YLA"}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Director ID walkthrough — opt-in per client. Only
                            correct for an SMSF with a corporate trustee. */}
                        <div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3">
                          {/* PA-back marker. The walkthrough stays hidden until this
                              is set, because before the assessment returns we don't
                              know the fund will have a corporate trustee. */}
                          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900">
                                Preliminary Assessment from YLA
                              </p>
                              <p className="mt-0.5 text-xs text-gray-600">
                                {r.pa_received_at
                                  ? `Received ${new Date(r.pa_received_at).toLocaleDateString("en-AU")}.`
                                  : "Not back yet."}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={videoBusy === r.id}
                              onClick={() => void togglePaReceived(r.id, !r.pa_received_at)}
                              className="flex-shrink-0 rounded-md bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-50"
                            >
                              {videoBusy === r.id
                                ? "Saving…"
                                : r.pa_received_at
                                  ? "Mark not received"
                                  : "Mark PA received"}
                            </button>
                          </div>

                          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-900">
                                Director ID walkthrough
                              </p>
                              <p className="mt-0.5 text-xs text-gray-600">
                                {!r.pa_received_at
                                  ? "Locked until the Preliminary Assessment is back from YLA."
                                  : r.training_video_released_at
                                    ? "Visible to this client under Help."
                                    : "Hidden. Release only if their fund will have a corporate trustee."}
                              </p>
                            </div>
                            <button
                              type="button"
                              disabled={videoBusy === r.id || !r.pa_received_at}
                              title={
                                !r.pa_received_at
                                  ? "The Preliminary Assessment has to be back from YLA first."
                                  : undefined
                              }
                              onClick={() =>
                                void toggleTrainingVideo(r.id, !r.training_video_released_at)
                              }
                              className={`flex-shrink-0 rounded-md px-3 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${
                                r.training_video_released_at
                                  ? "bg-white text-gray-800 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50"
                                  : "bg-[#020e40] text-white hover:bg-[#0a1a5a]"
                              }`}
                            >
                              {videoBusy === r.id
                                ? "Saving…"
                                : r.training_video_released_at
                                  ? "Hide from client"
                                  : "Release to client"}
                            </button>
                          </div>
                          {videoMsg?.id === r.id && (
                            <p
                              className={`mt-2 text-xs ${
                                videoMsg.error ? "text-red-700" : "text-green-800"
                              }`}
                            >
                              {videoMsg.text}
                            </p>
                          )}
                        </div>

                        {r.status === "submitted" && r.drive_folder_url && (
                          <p className="mt-4 text-sm">
                            <a
                              href={r.drive_folder_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-blue-700 hover:underline"
                            >
                              Open Drive folder →
                            </a>
                            <span className="ml-2 text-gray-500">Paste this into the Thursday calendar entry.</span>
                          </p>
                        )}

                        {exportMsg?.id === r.id && (
                          <div
                            className={`mt-3 rounded-md p-3 text-sm ${
                              exportMsg.error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-800"
                            }`}
                          >
                            <p>{exportMsg.text}</p>
                            {exportMsg.url && (
                              <a
                                href={exportMsg.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="mt-1 inline-block font-medium underline"
                              >
                                Open Drive folder →
                              </a>
                            )}
                          </div>
                        )}
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

function slotLabel(s: { label: string; docKey: string; slot: number }): string {
  let label = s.label;
  if (s.docKey === "photo_id") label += s.slot === 1 ? " (front)" : " (back)";
  else if (s.slot > 1 || s.docKey === "payslip") label += ` ${s.slot}`;
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
