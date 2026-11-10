"use client";

/**
 * Review one introducer referral.
 *
 * The staff view of the same record the introducer sees, plus the four things
 * only we can do: ask for more, authorise a change, move the progress stage, and
 * decide. Accept/decline and unlock are owner-only and are hidden for everyone
 * else rather than shown and refused.
 *
 * The audit trail is on the page, not behind a tab. The whole design rests on
 * "nothing changed without authorisation", and that claim is only worth
 * anything if the evidence is where the decisions get made.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { INTRODUCER_FIELDS, INTRODUCER_STAGES, fieldLabel } from "../../../../../utils/introducer";

type Detail = {
  ok: true;
  client: Record<string, string | null> & { id: string; status: string };
  firm: { firm_name?: string; contact_email?: string; contact_name?: string; agreement_ref?: string } | null;
  submitted_by: { email: string; full_name: string | null } | null;
  stage_label: string;
  info_requests: {
    id: string;
    message: string;
    fields: string[];
    documents: string[];
    status: string;
    created_at: string;
    requested_by: string;
  }[];
  unlock_grants: {
    id: string;
    scope: string;
    fields: string[];
    field_labels: string[];
    reason: string;
    granted_by: string;
    expires_at: string;
    consumed_at: string | null;
    revoked_at: string | null;
    created_at: string;
  }[];
  documents: { id: string; label: string; filename: string; status: string; uploaded_at: string }[];
  events: { action: string; actor: string; actor_type: string; detail: Record<string, unknown>; created_at: string }[];
  viewer_is_super_admin: boolean;
};

const AU = { timeZone: "Australia/Brisbane" } as const;

function when(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-AU", AU);
}

/** Pure fetch — no state. Used by the mount effect and by every refresh. */
async function fetchDetail(
  id: string,
): Promise<{ ok: true; detail: Detail } | { ok: false; error: string }> {
  try {
    const res = await fetch(`/api/admin/introducers/submissions/${id}`);
    const json = await res.json();
    if (!res.ok) return { ok: false, error: json.error ?? "Could not load." };
    return { ok: true, detail: json as Detail };
  } catch {
    return { ok: false, error: "Could not reach the server." };
  }
}

export default function SubmissionReview({ id }: { id: string }) {
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await fetchDetail(id);
    if (result.ok) setData(result.detail);
    else setError(result.error);
  }, [id]);

  // The fetch is awaited before any setState so this doesn't trip the
  // cascading-render rule, and the cancellation guard keeps a slow response
  // from writing into an unmounted component.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchDetail(id);
      if (cancelled) return;
      if (result.ok) setData(result.detail);
      else setError(result.error);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function call(path: string, method: string, body: unknown, label: string) {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "That didn't work.");
        return false;
      }
      await load();
      return true;
    } catch {
      setError("Could not reach the server.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  if (error && !data) {
    return <div className="p-6 text-red-800">{error}</div>;
  }
  if (!data) return <div className="p-6 text-gray-500">Loading…</div>;

  const c = data.client;
  const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || "Unnamed";
  const decided = c.status === "accepted" || c.status === "declined" || c.status === "withdrawn";
  const openRequests = data.info_requests.filter((r) => r.status === "open");
  const liveGrant = data.unlock_grants.find(
    (g) => !g.consumed_at && !g.revoked_at && new Date(g.expires_at) > new Date(),
  );

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-4 lg:p-6">
      <div className="mx-auto max-w-5xl">
        <Link href="/admin/introducers" className="text-sm text-gray-600 hover:text-gray-900">
          ← Back to introducers
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{name}</h1>
            <p className="mt-1 text-sm text-gray-600">
              {c.client_ref ? `${c.client_ref} · ` : ""}
              {data.firm?.firm_name ?? "—"}
              {data.submitted_by ? ` · submitted by ${data.submitted_by.full_name ?? data.submitted_by.email}` : ""}
              {` · ${when(c.submitted_at)}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {c.pack_type === "full" && (
              <span className="rounded-full bg-gray-900 px-3 py-1 text-sm font-medium text-white">
                Tier 2 pack
              </span>
            )}
            <span className="rounded-full bg-gray-100 px-3 py-1 text-sm font-medium text-gray-800">
              {c.status}
            </span>
          </div>
        </div>

        {notice && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
            {notice}
          </div>
        )}
        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        {c.pack_type === "full" && <PackBanner client={c} />}

        {c.consent_confirmed_at && (
          <div className="mt-4 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
            <strong className="text-gray-900">Consent confirmed {when(c.consent_confirmed_at)}.</strong>{" "}
            {c.consent_statement}
          </div>
        )}

        {liveGrant && (
          <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <strong>A change is currently authorised</strong> —{" "}
            {liveGrant.scope === "full" ? "the whole referral" : liveGrant.field_labels.join(", ")}, until{" "}
            {when(liveGrant.expires_at)} (granted by {liveGrant.granted_by}: {liveGrant.reason}).
            {data.viewer_is_super_admin && (
              <button
                onClick={() =>
                  call(`/api/admin/introducers/submissions/${id}/unlock`, "DELETE", { grant_id: liveGrant.id }, "revoke")
                }
                disabled={busy !== null}
                className="ml-2 font-semibold underline"
              >
                Revoke
              </button>
            )}
          </div>
        )}

        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ClientCard client={c} />

            {data.documents.length > 0 && (
              <section className="mt-5 rounded-xl border border-gray-200 bg-white p-5">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                  Documents supplied
                </h2>
                <ul className="mt-3 space-y-2 text-sm">
                  {data.documents.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3">
                      <span className="text-gray-900">{d.label}</span>
                      <span className="flex items-center gap-3">
                        <span className="text-gray-500">{when(d.uploaded_at)}</span>
                        <button
                          onClick={async () => {
                            const res = await fetch(
                              `/api/admin/introducers/submissions/${id}/documents/${d.id}`,
                            );
                            const json = await res.json();
                            if (json.ok) window.open(json.url, "_blank", "noopener");
                            else setError(json.error ?? "Could not open that document.");
                          }}
                          className="font-medium text-gray-700 underline"
                        >
                          Open
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <AuditTrail events={data.events} />
          </div>

          <div className="space-y-5">
            {!decided && (
              <>
                <StageCard
                  stage={c.stage}
                  message={c.message_to_introducer}
                  busy={busy === "stage"}
                  onSave={(stage, message) =>
                    call(
                      `/api/admin/introducers/submissions/${id}`,
                      "PATCH",
                      { stage, message_to_introducer: message },
                      "stage",
                    )
                  }
                />

                <InfoRequestCard
                  openRequests={openRequests}
                  client={c}
                  busy={busy === "info"}
                  onCreate={(body) =>
                    call(`/api/admin/introducers/submissions/${id}/info-request`, "POST", body, "info")
                  }
                  onCancel={(requestId) =>
                    call(
                      `/api/admin/introducers/submissions/${id}/info-request`,
                      "DELETE",
                      { info_request_id: requestId },
                      "info",
                    )
                  }
                />

                {data.viewer_is_super_admin ? (
                  <>
                    <UnlockCard
                      busy={busy === "unlock"}
                      onGrant={(body) =>
                        call(`/api/admin/introducers/submissions/${id}/unlock`, "POST", body, "unlock")
                      }
                    />
                    <DecisionCard
                      busy={busy === "decision"}
                      onDecide={(body) =>
                        call(`/api/admin/introducers/submissions/${id}/decision`, "POST", body, "decision")
                      }
                    />
                  </>
                ) : (
                  <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-600">
                    Accepting, declining, and authorising a change to a submitted referral are
                    reserved to the account owner. Ask Sean to action those.
                  </div>
                )}
              </>
            )}

            {decided && (
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <h2 className="font-semibold text-gray-900">Decided</h2>
                <p className="mt-1 text-sm text-gray-600">
                  {c.status} by {c.decided_by ?? "—"} on {when(c.decided_at)}.
                </p>
                {c.decision_reason && (
                  <p className="mt-2 text-sm text-gray-700">{c.decision_reason}</p>
                )}
                {c.opportunity_id && (
                  <Link
                    href={`/opportunities?id=${c.opportunity_id}`}
                    className="mt-3 inline-block text-sm font-medium text-gray-700 underline"
                  >
                    Open the opportunity
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * What a Tier 2 pack is, said on the screen where someone first meets one.
 *
 * The whole point of the banner is that this row did NOT pass a human. Somebody
 * opening it a year from now will otherwise read `accepted` and assume a
 * colleague made that call — so the banner names the rule, names the introducer
 * whose accreditation stood in for the review, and points at the two records the
 * submission created.
 */
function PackBanner({ client }: { client: Record<string, string | null> }) {
  return (
    <section className="mt-4 rounded-lg border border-gray-900/15 bg-white px-4 py-3">
      <h2 className="text-sm font-semibold text-gray-900">
        Full submission pack — accepted on accreditation, not on review
      </h2>
      <p className="mt-1 text-sm text-gray-600">
        A Tier 2 introducer submitted this complete, so it created its own opportunity and fact find
        and went straight to the assessor. No one here approved it; the accreditation, the
        unexpired-check and the signed consent form did. The audit trail below records who and when.
      </p>
      <div className="mt-3 flex flex-wrap gap-4 text-sm">
        {/* The Needs Analysis first: it is the document YLA receive, and the one
            whose signature gates the submission. The fact find is the source it
            was derived from and goes to brokers instead. */}
        {client.needs_analysis_id ? (
          <Link
            href={`/needs-analysis/${client.needs_analysis_id}`}
            className="font-medium text-gray-700 underline"
          >
            Open the Needs Analysis
          </Link>
        ) : (
          <span className="text-amber-800">
            No Needs Analysis on this pack — YLA cannot be sent one.
          </span>
        )}
        {client.fact_find_id && (
          <Link
            href={`/fact-find/${client.fact_find_id}`}
            className="font-medium text-gray-700 underline"
          >
            Open the fact find
          </Link>
        )}
        {client.document_request_id ? (
          <Link href="/document-requests" className="font-medium text-gray-700 underline">
            Document collection
          </Link>
        ) : (
          <span className="text-amber-800">
            No document request on this pack — the client has not been asked for documents.
          </span>
        )}
      </div>
    </section>
  );
}

function ClientCard({ client }: { client: Record<string, string | null> }) {
  const groups = [
    { key: "client", title: "Client" },
    { key: "applicant2", title: "Second applicant" },
    { key: "circumstances", title: "Situation" },
  ] as const;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5">
      {groups.map((g) => {
        const fields = INTRODUCER_FIELDS.filter((f) => f.group === g.key);
        const any = fields.some((f) => client[f.key]);
        if (!any) return null;
        return (
          <div key={g.key} className="mb-5 last:mb-0">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{g.title}</h2>
            <dl className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {fields.map((f) =>
                client[f.key] ? (
                  <div key={f.key} className={f.type === "textarea" ? "sm:col-span-2" : undefined}>
                    <dt className="text-xs text-gray-500">{f.label}</dt>
                    <dd className="whitespace-pre-wrap text-gray-900">{client[f.key]}</dd>
                  </div>
                ) : null,
              )}
            </dl>
          </div>
        );
      })}
    </section>
  );
}

function StageCard({
  stage,
  message,
  busy,
  onSave,
}: {
  stage: string | null;
  message: string | null;
  busy: boolean;
  onSave: (stage: string, message: string) => Promise<boolean>;
}) {
  const [value, setValue] = useState(stage ?? "received");
  const [msg, setMsg] = useState(message ?? "");

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="font-semibold text-gray-900">Progress</h2>
      <p className="mt-1 text-xs text-gray-500">
        What the introducer sees. Keep it coarse — this is their whole window into the file.
      </p>
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
      >
        {INTRODUCER_STAGES.map((s) => (
          <option key={s.key} value={s.key}>
            {s.label}
          </option>
        ))}
      </select>
      <label className="mt-3 block text-sm">
        <span className="font-medium text-gray-700">Message to the introducer</span>
        <textarea
          rows={3}
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder="Optional. Shown verbatim in their portal."
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </label>
      <button
        onClick={() => onSave(value, msg)}
        disabled={busy}
        className="mt-3 w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Saving…" : "Update"}
      </button>
    </div>
  );
}

function InfoRequestCard({
  openRequests,
  client,
  busy,
  onCreate,
  onCancel,
}: {
  openRequests: Detail["info_requests"];
  client: Record<string, string | null>;
  busy: boolean;
  onCreate: (body: unknown) => Promise<boolean>;
  onCancel: (id: string) => Promise<boolean>;
}) {
  const [message, setMessage] = useState("");
  const [fields, setFields] = useState<string[]>([]);
  const [documents, setDocuments] = useState("");

  // Only blank fields can be requested — a field with a value needs an unlock,
  // and offering it here would produce a 409 the user can't act on.
  const requestable = INTRODUCER_FIELDS.filter((f) => !client[f.key]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="font-semibold text-gray-900">Ask for more</h2>

      {openRequests.length > 0 && (
        <ul className="mt-3 space-y-2">
          {openRequests.map((r) => (
            <li key={r.id} className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <p className="whitespace-pre-wrap">{r.message}</p>
              <p className="mt-1 text-xs">
                {[...r.fields.map(fieldLabel), ...r.documents].join(", ") || "—"}
              </p>
              <button onClick={() => onCancel(r.id)} className="mt-1 text-xs font-semibold underline">
                Cancel this request
              </button>
            </li>
          ))}
        </ul>
      )}

      <textarea
        rows={3}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="What do you need, and why?"
        className="mt-3 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
      />

      {requestable.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-gray-700">
            Missing details to request ({fields.length} selected)
          </summary>
          <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
            {requestable.map((f) => (
              <label key={f.key} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={fields.includes(f.key)}
                  onChange={(e) =>
                    setFields((s) => (e.target.checked ? [...s, f.key] : s.filter((x) => x !== f.key)))
                  }
                />
                {f.label}
              </label>
            ))}
          </div>
        </details>
      )}

      <label className="mt-3 block text-sm">
        <span className="font-medium text-gray-700">Documents (one per line)</span>
        <textarea
          rows={2}
          value={documents}
          onChange={(e) => setDocuments(e.target.value)}
          placeholder={"Signed referral consent\nProof of income"}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </label>

      <button
        onClick={async () => {
          const ok = await onCreate({
            message,
            fields,
            documents: documents.split("\n").map((d) => d.trim()).filter(Boolean),
          });
          if (ok) {
            setMessage("");
            setFields([]);
            setDocuments("");
          }
        }}
        disabled={busy || !message}
        className="mt-3 w-full rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Sending…" : "Request from introducer"}
      </button>
      <p className="mt-2 text-xs text-gray-500">
        Opens only these items. Anything already submitted stays locked.
      </p>
    </div>
  );
}

function UnlockCard({
  busy,
  onGrant,
}: {
  busy: boolean;
  onGrant: (body: unknown) => Promise<boolean>;
}) {
  const [reason, setReason] = useState("");
  const [scope, setScope] = useState<"fields" | "full">("fields");
  const [fields, setFields] = useState<string[]>([]);
  const [hours, setHours] = useState(48);

  return (
    <div className="rounded-xl border border-amber-300 bg-white p-5">
      <h2 className="font-semibold text-gray-900">Authorise a change</h2>
      <p className="mt-1 text-xs text-gray-500">
        Owner only. Single-use and time-boxed — the introducer gets one save inside the window.
      </p>

      <label className="mt-3 block text-sm">
        <span className="font-medium text-gray-700">Reason *</span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Client's mobile was entered wrong"
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </label>

      <div className="mt-3 flex gap-2 text-sm">
        <button
          onClick={() => setScope("fields")}
          className={`rounded-lg px-3 py-1.5 font-medium ${scope === "fields" ? "bg-gray-900 text-white" : "border border-gray-300 text-gray-700"}`}
        >
          Named fields
        </button>
        <button
          onClick={() => setScope("full")}
          className={`rounded-lg px-3 py-1.5 font-medium ${scope === "full" ? "bg-gray-900 text-white" : "border border-gray-300 text-gray-700"}`}
        >
          Whole referral
        </button>
      </div>

      {scope === "fields" && (
        <details className="mt-3" open>
          <summary className="cursor-pointer text-sm font-medium text-gray-700">
            Fields ({fields.length} selected)
          </summary>
          <div className="mt-2 max-h-48 space-y-1 overflow-y-auto">
            {INTRODUCER_FIELDS.map((f) => (
              <label key={f.key} className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={fields.includes(f.key)}
                  onChange={(e) =>
                    setFields((s) => (e.target.checked ? [...s, f.key] : s.filter((x) => x !== f.key)))
                  }
                />
                {f.label}
              </label>
            ))}
          </div>
        </details>
      )}

      <label className="mt-3 block text-sm">
        <span className="font-medium text-gray-700">Window (hours)</span>
        <input
          type="number"
          min={1}
          max={336}
          value={hours}
          onChange={(e) => setHours(Number(e.target.value))}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </label>

      <button
        onClick={async () => {
          const ok = await onGrant({ reason, scope, fields, hours });
          if (ok) {
            setReason("");
            setFields([]);
          }
        }}
        disabled={busy || !reason || (scope === "fields" && fields.length === 0)}
        className="mt-3 w-full rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: "#da9845" }}
      >
        {busy ? "Authorising…" : "Authorise the change"}
      </button>
    </div>
  );
}

function DecisionCard({
  busy,
  onDecide,
}: {
  busy: boolean;
  onDecide: (body: unknown) => Promise<boolean>;
}) {
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="font-semibold text-gray-900">Decision</h2>
      <p className="mt-1 text-xs text-gray-500">
        Owner only. Accepting creates the opportunity in the pipeline — nothing exists there until
        you do.
      </p>

      <label className="mt-3 block text-sm">
        <span className="font-medium text-gray-700">Message to the introducer</span>
        <textarea
          rows={2}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </label>

      <button
        onClick={() => onDecide({ action: "accept", message_to_introducer: message })}
        disabled={busy}
        className="mt-3 w-full rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Working…" : "Accept — create the opportunity"}
      </button>

      <label className="mt-4 block text-sm">
        <span className="font-medium text-gray-700">Reason (required to decline)</span>
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </label>
      <button
        onClick={() => onDecide({ action: "decline", reason, message_to_introducer: message })}
        disabled={busy || !reason}
        className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 disabled:opacity-50"
      >
        Decline
      </button>
    </div>
  );
}

function AuditTrail({ events }: { events: Detail["events"] }) {
  if (events.length === 0) return null;
  return (
    <section className="mt-5 rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Audit trail</h2>
      <p className="mt-1 text-xs text-gray-500">Append-only. Every authorisation is recorded here.</p>
      <ul className="mt-3 space-y-2 text-sm">
        {events.map((e, i) => (
          <li key={i} className="flex flex-wrap justify-between gap-2 border-b border-gray-100 pb-2 last:border-0">
            <span className="text-gray-900">
              <strong className="font-medium">{e.action.replace(/_/g, " ")}</strong>
              <span className="text-gray-500"> — {e.actor}</span>
              {typeof e.detail?.reason === "string" && e.detail.reason && (
                <span className="block text-gray-600">{e.detail.reason as string}</span>
              )}
            </span>
            <span className="text-gray-500">{when(e.created_at)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
