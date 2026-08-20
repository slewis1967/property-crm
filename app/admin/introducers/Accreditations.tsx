"use client";

/**
 * The accreditation pipeline, staff side.
 *
 * One card per application, and exactly ONE action offered on each — whatever
 * that application is actually waiting for. A panel that shows every possible
 * button greyed out makes the operator work out what to do next; this makes the
 * state answer that question, which is the same principle the applicant's
 * roadmap follows.
 *
 * Everything here is super-admin gated at the API. Staff can watch, and that is
 * deliberate: seeing where an accreditation is stuck is not the same authority
 * as clearing someone's identity or opening portal access.
 */
import { useCallback, useEffect, useState } from "react";
import AuditFile from "./AuditFile";
import { daysUntil, isExpiredOn } from "../../../utils/introducer-onboarding";

type Application = {
  id: string;
  introducer_id: string | null;
  legal_name: string;
  email: string;
  firm_name: string | null;
  tier: string;
  agreement_variant: string;
  recruits_introducers?: boolean | null;
  state: string;
  accreditation_no: string | null;
  exam_score: number | null;
  exam_total: number | null;
  id_check_result: string | null;
  created_at: string;
  withdrawn_reason: string | null;
  /** Both absent until 20260819_introducer_accreditation_expiry.sql runs. */
  accreditation_expires_at?: string | null;
  smsf_competency_expires_at?: string | null;
};

const STATE_LABEL: Record<string, string> = {
  invited: "Invited",
  nda_signed: "NDA signed",
  id_uploaded: "Identity to review",
  id_verified: "Identity verified",
  course_started: "Sitting the course",
  exam_passed: "Exam passed",
  certificate_issued: "Certificate issued",
  agreement_sent: "Agreement out",
  agreement_signed: "Agreement signed",
  activated: "Active",
  withdrawn: "Stopped",
};

/** What each state is waiting on, in the operator's language. */
const WAITING_ON: Record<string, string> = {
  invited: "Waiting for them to sign the confidentiality agreement.",
  nda_signed: "Waiting for them to upload their licence.",
  id_uploaded: "Waiting on you — their identity needs reviewing.",
  id_verified: "Ready for their course invitation.",
  course_started: "Waiting for them to pass the exam.",
  exam_passed: "Ready for their certificate.",
  certificate_issued: "Ready to send the introducer agreement.",
  agreement_sent: "Waiting for them to sign the agreement.",
  agreement_signed: "Ready to activate — this opens portal access.",
  activated: "Accredited and live in the portal.",
  withdrawn: "Stopped. Start a new accreditation if they should continue.",
};

const TONE: Record<string, string> = {
  id_uploaded: "border-amber-300 bg-amber-50",
  agreement_signed: "border-emerald-300 bg-emerald-50",
  activated: "border-gray-200 bg-white",
  withdrawn: "border-gray-200 bg-gray-50",
};

export default function Accreditations({
  viewerIsSuperAdmin,
  viewerCanOverrideCourse,
}: {
  viewerIsSuperAdmin: boolean;
  /** Narrower than super-admin, and deliberately so — see utils/super-admin.ts. */
  viewerCanOverrideCourse: boolean;
}) {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [migrationPending, setMigrationPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/introducers/applications");
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not load accreditations.");
        return;
      }
      setApps(json.applications ?? []);
      setMigrationPending(!!json.migration_pending);
      setError(null);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/admin/introducers/applications").catch(() => null);
      if (cancelled || !res) {
        if (!cancelled) { setError("Could not reach the server."); setLoading(false); }
        return;
      }
      const json = await res.json();
      if (cancelled) return;
      if (!res.ok) setError(json.error ?? "Could not load accreditations.");
      else {
        setApps(json.applications ?? []);
        setMigrationPending(!!json.migration_pending);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <p className="mt-6 text-sm text-gray-500">Loading…</p>;

  if (migrationPending) {
    return (
      <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="font-semibold text-amber-900">Accreditation is not switched on yet</h2>
        <p className="mt-1 text-sm text-amber-900">
          The onboarding migration has not been applied to the database, so there is nothing to show.
          Run <code className="rounded bg-amber-100 px-1">migrations/20260813_introducer_onboarding.sql</code>{" "}
          in the Supabase SQL editor, then its <code className="rounded bg-amber-100 px-1">.verify.sql</code>{" "}
          and check every row says PASS.
        </p>
      </div>
    );
  }

  const live = apps.filter((a) => a.state !== "activated" && a.state !== "withdrawn");
  const finished = apps.filter((a) => a.state === "activated" || a.state === "withdrawn");

  return (
    <div className="mt-5">
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
          {notice}
        </div>
      )}

      {!apps.length && (
        <p className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-600">
          No accreditations yet. Start one from the Introducer firms tab.
        </p>
      )}

      {live.length > 0 && (
        <>
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500">In progress</h2>
          <div className="mt-2 space-y-3">
            {live.map((a) => (
              <Card
                key={a.id}
                app={a}
                viewerIsSuperAdmin={viewerIsSuperAdmin}
                viewerCanOverrideCourse={viewerCanOverrideCourse}
                onDone={async (msg) => {
                  setNotice(msg);
                  setError(null);
                  await load();
                }}
                onError={setError}
              />
            ))}
          </div>
        </>
      )}

      {finished.length > 0 && (
        <>
          <h2 className="mt-8 text-xs font-semibold uppercase tracking-wider text-gray-500">Finished</h2>
          <div className="mt-2 space-y-3">
            {finished.map((a) => (
              <Card
                key={a.id}
                app={a}
                viewerIsSuperAdmin={viewerIsSuperAdmin}
                viewerCanOverrideCourse={viewerCanOverrideCourse}
                onDone={async (msg) => { setNotice(msg); await load(); }}
                onError={setError}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Card({
  app,
  viewerIsSuperAdmin,
  viewerCanOverrideCourse,
  onDone,
  onError,
}: {
  app: Application;
  viewerIsSuperAdmin: boolean;
  viewerCanOverrideCourse: boolean;
  onDone: (msg: string) => Promise<void>;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [showFile, setShowFile] = useState(false);

  async function act(url: string, body: Record<string, unknown> | null, success: string) {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json();
      if (!res.ok) {
        onError(json.error ?? "That didn’t work.");
        return;
      }
      await onDone(
        json.emailed === false || json.invite_sent === false
          ? `${success} — but the email did not send.`
          : success,
      );
    } catch {
      onError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  const base = `/api/admin/introducers/applications/${app.id}`;

  return (
    <div className={`rounded-xl border p-4 ${TONE[app.state] ?? "border-gray-200 bg-white"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-gray-900">{app.legal_name}</p>
          <p className="text-sm text-gray-600">
            {app.firm_name ? `${app.firm_name} · ` : ""}
            {app.email}
          </p>
          <p className="mt-1 text-sm text-gray-600">{WAITING_ON[app.state] ?? app.state}</p>
          {app.state === "withdrawn" && app.withdrawn_reason && (
            <p className="mt-1 text-sm text-gray-500">{app.withdrawn_reason}</p>
          )}
        </div>
        <div className="text-right">
          <span className="rounded-full bg-gray-900 px-2.5 py-0.5 text-xs font-semibold text-white">
            {STATE_LABEL[app.state] ?? app.state}
          </span>
          {app.tier === "t2" && (
            <span className="ml-1 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">
              Tier 2
            </span>
          )}
          {app.agreement_variant === "paid" && (
            <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
              Paid
            </span>
          )}
          {app.recruits_introducers && (
            <span className="ml-1 rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-900">
              Recruiter
            </span>
          )}
          {app.accreditation_no && (
            <p className="mt-1 font-mono text-xs tabular-nums text-gray-500">{app.accreditation_no}</p>
          )}
          {app.exam_score != null && app.exam_total != null && (
            <p className="text-xs tabular-nums text-gray-500">
              Exam {app.exam_score}/{app.exam_total}
            </p>
          )}
          <Validity app={app} />
        </div>
      </div>

      {/* Readable by any staff member: seeing the file is not the same authority
          as acting on it, and an audit request should not need the owner. */}
      <div className="mt-3">
        <button
          onClick={() => setShowFile((v) => !v)}
          className="text-sm text-gray-600 underline underline-offset-2 hover:text-gray-900"
        >
          {showFile ? "Hide audit file" : "Audit file"}
        </button>
      </div>
      {showFile && <AuditFile applicationId={app.id} onClose={() => setShowFile(false)} />}

      {viewerIsSuperAdmin && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {app.state === "invited" && (
            <>
              {/* The normal path now that the document exists. Deliberately
                  leaves the application at `invited`: it advances when they
                  actually sign, not when we send. Marking an agreement executed
                  on the strength of an email having left the building would be
                  a lie in the audit file. */}
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  act(
                    `${base}/nda`,
                    { action: "esign" },
                    "Confidentiality agreement emailed — they sign it on screen.",
                  )
                }
                className="rounded-lg px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: "#020e40" }}
              >
                Send for e-signature
              </button>
              {/* Kept for the ones who sign on paper or email a scan back. */}
              <Prompt
                label="Record NDA signed"
                placeholder="How was it signed? e.g. emailed back, signed on paper"
                busy={busy}
                onSubmit={(method) => act(`${base}/nda`, { method }, "NDA recorded — they’ve been asked for their licence.")}
              />
            </>
          )}

          {app.state === "id_uploaded" && (
            <IdentityReview
              app={app}
              open={reviewing}
              setOpen={setReviewing}
              busy={busy}
              onDecision={async (decision, note) => {
                setBusy(true);
                try {
                  const res = await fetch(`${base}/identity`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ decision, note }),
                  });
                  const json = await res.json();
                  if (!res.ok) { onError(json.error ?? "That didn’t work."); return; }
                  setReviewing(false);
                  await onDone(
                    decision === "pass"
                      ? "Identity verified — send their course invitation next."
                      : "Recorded, and the application has been stopped.",
                  );
                } finally {
                  setBusy(false);
                }
              }}
            />
          )}

          {app.state === "id_verified" && (
            <>
              <Action busy={busy} onClick={() => act(`${base}/exam-invite`, null, "Course invitation sent.")}>
                Send course invitation
              </Action>
              {viewerCanOverrideCourse && (
                <Override
                  busy={busy}
                  onConfirm={() =>
                    act(
                      `${base}/exam-invite`,
                      { override: true },
                      "Course invitation sent with the gates open — recorded in the audit file.",
                    )
                  }
                />
              )}
            </>
          )}

          {app.state === "course_started" && (
            <>
              <Action busy={busy} ghost onClick={() => act(`${base}/exam-invite`, null, "Course link re-sent.")}>
                Re-send course link
              </Action>
              {viewerCanOverrideCourse && (
                <Override
                  busy={busy}
                  onConfirm={() =>
                    act(
                      `${base}/exam-invite`,
                      { override: true },
                      "Link sent with the gates open — their progress is kept. Recorded in the audit file.",
                    )
                  }
                />
              )}
            </>
          )}

          {app.state === "exam_passed" && (
            <Action busy={busy} onClick={() => act(`${base}/certificate`, null, "Certificate issued.")}>
              Issue certificate
            </Action>
          )}

          {(app.state === "certificate_issued" || app.state === "agreement_sent") && (
            <>
              {/* The normal path now that the documents exist. Two of them, sent
                  one at a time, so this button is live at `agreement_sent` too:
                  pressing it again after the referral agreement is signed sends
                  the commission schedule. Deliberately does not mark anything
                  executed — the application advances when they sign. */}
              {app.agreement_variant === "paid" ? (
                <Prompt
                  label={app.state === "agreement_sent" ? "Send the next document" : "Send for e-signature"}
                  placeholder="Referral fee, e.g. $5,000 per settled referral, including GST"
                  busy={busy}
                  onSubmit={(fee) =>
                    act(
                      `${base}/agreement`,
                      { action: "esign", fee_per_settlement: fee },
                      "Emailed — they sign it on screen.",
                    )
                  }
                />
              ) : (
                <Action
                  busy={busy}
                  onClick={() =>
                    act(`${base}/agreement`, { action: "esign" }, "Emailed — they sign it on screen.")
                  }
                >
                  {app.state === "agreement_sent" ? "Send the next document" : "Send for e-signature"}
                </Action>
              )}

              {/* Granted BEFORE the schedule issues, because the schedule
                  snapshots it — flipping this afterwards would leave the row
                  disagreeing with the document they signed. Paid only; the
                  standard arrangement pays nothing at all, so there is nothing
                  for a network to earn. */}
              {app.agreement_variant === "paid" && (
                <Action
                  busy={busy}
                  onClick={() =>
                    act(
                      `${base}/agreement`,
                      { action: "esign", recruits_introducers: !app.recruits_introducers },
                      app.recruits_introducers
                        ? "Network entitlement removed — document sent."
                        : "Recruiter arrangement granted — document sent.",
                    )
                  }
                >
                  {app.recruits_introducers ? "Remove network fee" : "Pays on recruits’ deals"}
                </Action>
              )}

              {/* Notice only: tells them the step is open and points at their
                  roadmap, where they can start signing themselves. */}
              {app.state === "certificate_issued" && (
                <Action
                  busy={busy}
                  onClick={() => act(`${base}/agreement`, { action: "send" }, "Notice sent.")}
                >
                  Just tell them it&rsquo;s ready
                </Action>
              )}

              {/* Kept for the ones who sign on paper or email a scan back. */}
              {app.state === "agreement_sent" && (
                <Prompt
                  label="Record agreement signed"
                  placeholder="How was it executed? e.g. emailed back, signed on paper"
                  busy={busy}
                  onSubmit={(method) =>
                    act(`${base}/agreement`, { action: "signed", method }, "Agreement recorded — ready to activate.")
                  }
                />
              )}
            </>
          )}

          {app.state === "agreement_signed" && (
            <Action busy={busy} onClick={() => act(`${base}/activate`, null, "Activated — their portal invitation has gone out.")}>
              Activate and open the portal
            </Action>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * How long this accreditation has left.
 *
 * Shown from the moment the certificate is issued, not only once it is close to
 * running out: an expiry nobody sees until the warning fires is one that gets
 * discovered by a refused referral.
 *
 * Silent when there is no date. Everyone certificated before expiries were
 * recorded has none, and inventing "unknown — assume expired" on their card
 * would put a red badge on every established introducer we have.
 */
function Validity({ app }: { app: Application }) {
  if (!app.accreditation_expires_at) return null;

  // The comparison is made against the local calendar day rather than an
  // instant, matching the server: an expiry is a date, not a moment.
  const today = new Date().toLocaleDateString("en-CA");
  const expired = isExpiredOn(app.accreditation_expires_at, today);
  const left = daysUntil(app.accreditation_expires_at, today);
  const smsfExpired = isExpiredOn(app.smsf_competency_expires_at, today);

  return (
    <div className="mt-1">
      <p
        className={`text-xs tabular-nums ${
          expired ? "font-semibold text-red-700" : left <= 60 ? "font-semibold text-amber-700" : "text-gray-500"
        }`}
      >
        {expired
          ? `Accreditation expired ${fmtDay(app.accreditation_expires_at)}`
          : `Valid until ${fmtDay(app.accreditation_expires_at)}${left <= 60 ? ` · ${left} days` : ""}`}
      </p>
      {/* Reported, never enforced. A lapsed SMSF competency narrows what an
          introducer may discuss; it does not stop a referral, and a badge that
          implied otherwise would have staff suspending people over it. */}
      {smsfExpired && (
        <p className="text-xs text-amber-700">SMSF competency lapsed {fmtDay(app.smsf_competency_expires_at!)}</p>
      )}
      {expired && app.state === "activated" && (
        <p className="mt-0.5 max-w-[16rem] text-xs text-red-700">
          They cannot submit referrals. Start a new accreditation to renew.
        </p>
      )}
    </div>
  );
}

/** "2027-08-14" → "14 Aug 2027". A calendar day, printed as one. */
function fmtDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function Action({
  children,
  busy,
  ghost,
  onClick,
}: {
  children: React.ReactNode;
  busy: boolean;
  ghost?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={
        ghost
          ? "rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 disabled:opacity-50"
          : "rounded-lg bg-gray-900 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
      }
    >
      {busy ? "Working…" : children}
    </button>
  );
}

/**
 * Reopen the course for someone who is stuck in it.
 *
 * The case this exists for: a candidate fails the exam, every topic they missed
 * re-locks, and they are sent back through modules they have already worked
 * through before they can try again. This lets them go straight back to those
 * sections.
 *
 * Two clicks rather than one, and it says what it costs in between. The reading
 * timers are the only evidence the register holds that a candidate was in front
 * of the material — the exam itself only evidences that they can answer. Turning
 * them off is the right call for sitting the course ourselves or supervising a
 * re-sitting, and the wrong one for someone accrediting at a distance, so the
 * button makes the operator say which they meant.
 *
 * UNLIKE AN ORDINARY RE-SEND, this one keeps their progress. Every other
 * re-issued link is a deliberate fresh start; this is the opposite, and the
 * panel says so, because an operator who has learned that re-sending wipes
 * people would otherwise never reach for it on the candidate who most needs it.
 */
/* Rendered only for whoever holds `canOverrideCourse` — narrower than
   super-admin, because this changes what an accreditation MEANS rather than who
   holds one. Hiding it is a courtesy to everyone else, not the control: the
   route checks the same authority, and a hidden button is a decoration. */
function Override({ busy, onConfirm }: { busy: boolean; onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <Action busy={busy} ghost onClick={() => setAsking(true)}>
        Reopen the course for them
      </Action>
    );
  }

  return (
    <div className="w-full rounded-lg border border-amber-300 bg-amber-50 p-3">
      <p className="text-sm text-amber-900">
        This link turns off the reading timers, the cooling-off between attempts and the 24-hour lock
        after five failures, and reopens every module they have already attempted — including any that
        a failed exam sent them back through. <strong>Their progress is kept</strong>, unlike an
        ordinary re-send.
      </p>
      <p className="mt-2 text-sm text-amber-900">
        A module they have never opened stays locked, and they still have to pass at 100%. It is
        recorded on the application, and a pass sat this way is marked as one in the audit file.
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Action busy={busy} onClick={() => { setAsking(false); onConfirm(); }}>
          Send it
        </Action>
        <Action busy={false} ghost onClick={() => setAsking(false)}>
          Cancel
        </Action>
      </div>
    </div>
  );
}

/** An action that will not fire without the operator saying how. */
function Prompt({
  label,
  placeholder,
  busy,
  onSubmit,
}: {
  label: string;
  placeholder: string;
  busy: boolean;
  onSubmit: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");

  if (!open) return <Action busy={busy} onClick={() => setOpen(true)}>{label}</Action>;

  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="min-w-[18rem] flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
      />
      <Action busy={busy} onClick={() => value.trim() && onSubmit(value.trim())}>
        Save
      </Action>
      <Action busy={false} ghost onClick={() => setOpen(false)}>
        Cancel
      </Action>
    </div>
  );
}

/** Look at the licence before deciding. The images are fetched on demand and
 *  their URLs expire — they are not left sitting in the page. */
function IdentityReview({
  app,
  open,
  setOpen,
  busy,
  onDecision,
}: {
  app: Application;
  open: boolean;
  setOpen: (v: boolean) => void;
  busy: boolean;
  onDecision: (decision: "pass" | "fail", note: string) => Promise<void>;
}) {
  const [images, setImages] = useState<{ side: string; url: string | null }[]>([]);
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);

  async function openReview() {
    setLoading(true);
    setOpen(true);
    try {
      const res = await fetch(`/api/admin/introducers/applications/${app.id}/identity`);
      const json = await res.json();
      if (res.ok) setImages(json.images ?? []);
    } finally {
      setLoading(false);
    }
  }

  if (!open) return <Action busy={busy} onClick={openReview}>Review identity</Action>;

  return (
    <div className="w-full rounded-lg border border-gray-200 bg-white p-3">
      <p className="text-sm text-gray-600">
        Compare the licence to <strong>{app.legal_name}</strong>. Opening these is recorded.
      </p>
      {loading ? (
        <p className="mt-2 text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {images.map((i) => (
            <div key={i.side}>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{i.side}</p>
              {i.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={i.url} alt={`Licence ${i.side}`} className="mt-1 w-full rounded border border-gray-200" />
              ) : (
                <p className="mt-1 text-sm text-gray-500">Could not load.</p>
              )}
            </div>
          ))}
          {!images.length && <p className="text-sm text-gray-500">No documents found.</p>}
        </div>
      )}

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (required if you cannot verify them)"
        className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
      />

      <div className="mt-2 flex flex-wrap gap-2">
        <Action busy={busy} onClick={() => onDecision("pass", note)}>
          Verified — open the course
        </Action>
        <button
          onClick={() => note.trim() && onDecision("fail", note)}
          disabled={busy || !note.trim()}
          className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 disabled:opacity-40"
          title={note.trim() ? undefined : "Add a note first — a refusal has to say why"}
        >
          Cannot verify
        </button>
        <Action busy={false} ghost onClick={() => setOpen(false)}>
          Close
        </Action>
      </div>
    </div>
  );
}
