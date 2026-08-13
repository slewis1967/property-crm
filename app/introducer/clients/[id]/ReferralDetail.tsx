"use client";

/**
 * One referral, from the introducer's side.
 *
 * Everything on this page comes from GET /api/introducer/clients/<id>, including
 * which fields are currently editable and why. Deriving that here from the
 * status would mean two implementations of the lock that could disagree — so the
 * server decides, and this renders the decision.
 *
 * Four states it has to make legible:
 *   draft         — ordinary form, plus a submit button that says what it does
 *   locked        — read-only, with a plain explanation of how to get a change made
 *   info_request  — read-only EXCEPT the specific things we asked for
 *   authorised    — a change window is open, and it says what and for how long
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import ReferralFields, { type FieldValues } from "../../ReferralFields";
import { supabaseBrowser } from "../../../../utils/supabase-browser";
import { INTRODUCER_STAGES } from "../../../../utils/introducer";

type Labelled = { key: string; label: string };

type InfoRequest = {
  id: string;
  message: string;
  fields: Labelled[];
  documents: string[];
  due_at: string | null;
  created_at: string;
};

type DocRow = {
  id: string;
  label: string;
  filename: string;
  status: string;
  size_bytes: number | null;
  uploaded_at: string;
  info_request_id: string | null;
};

type Payload = {
  ok: true;
  client: Record<string, string | null> & { id: string; status: string; stage_label: string; status_label: string };
  missing_required: Labelled[];
  consent_statement: string;
  editable: string[];
  basis: "draft" | "authorised" | "info_request" | "locked";
  grantExpiresAt?: string;
  info_requests: InfoRequest[];
  documents: DocRow[];
  history: { action: string; actor_type: string; created_at: string }[];
};

const ACCEPTED = "application/pdf,image/jpeg,image/png,image/heic,image/heif,image/webp";

type FetchResult =
  | { ok: true; payload: Payload }
  | { ok: false; error: string; signedOut?: boolean };

/** Pure fetch — no state. Both the mount effect and manual refreshes use it. */
async function fetchDetail(id: string): Promise<FetchResult> {
  try {
    const res = await fetch(`/api/introducer/clients/${id}`);
    const json = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        error: json.error ?? "Could not load this referral.",
        signedOut: res.status === 401,
      };
    }
    return { ok: true, payload: json as Payload };
  } catch {
    return { ok: false, error: "We couldn't reach the server." };
  }
}

export default function ReferralDetail({ id }: { id: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const justSubmitted = search.get("submitted") === "1";

  const [data, setData] = useState<Payload | null>(null);
  const [values, setValues] = useState<FieldValues>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);

  // Applying the payload is separated from fetching it so the mount effect can
  // await the fetch and only then touch state — setState in an effect body
  // triggers the cascading-render lint rule, and the async boundary is also what
  // makes the cancellation guard below meaningful.
  const apply = useCallback((payload: Payload) => {
    setData(payload);
    const next: FieldValues = {};
    for (const [k, v] of Object.entries(payload.client as Record<string, unknown>)) {
      if (typeof v === "string") next[k] = v;
    }
    setValues(next);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    const result = await fetchDetail(id);
    if (result.ok) apply(result.payload);
    else if (result.signedOut) router.push("/introducer");
    else setError(result.error);
  }, [id, apply, router]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchDetail(id);
      if (cancelled) return;
      if (result.ok) apply(result.payload);
      else if (result.signedOut) router.push("/introducer");
      else setError(result.error);
    })();
    return () => {
      cancelled = true;
    };
  }, [id, apply, router]);

  if (error && !data) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-red-800">{error}</div>
    );
  }
  if (!data) return <p className="text-gray-500">Loading…</p>;

  const client = data.client;
  const name = `${client.first_name ?? ""} ${client.last_name ?? ""}`.trim() || "Unnamed referral";
  const isDraft = client.status === "draft";
  const canEditAnything = data.editable.length > 0;

  const requestedFields = new Set(data.info_requests.flatMap((r) => r.fields.map((f) => f.key)));

  async function save() {
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      const patch: Record<string, string> = {};
      for (const key of data!.editable) patch[key] = values[key] ?? "";
      const res = await fetch(`/api/introducer/clients/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not save.");
        return;
      }
      setNotice("Saved.");
      await load();
    } catch {
      setError("We couldn't reach the server.");
    } finally {
      setBusy(null);
    }
  }

  async function submit() {
    setBusy("submit");
    setError(null);
    try {
      // Save first so nothing typed since the last save is left behind.
      const patch: Record<string, string> = {};
      for (const key of data!.editable) patch[key] = values[key] ?? "";
      await fetch(`/api/introducer/clients/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });

      const res = await fetch(`/api/introducer/clients/${id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not submit.");
        return;
      }
      setNotice("Submitted. We'll be in touch.");
      await load();
      router.refresh();
    } catch {
      setError("We couldn't reach the server.");
    } finally {
      setBusy(null);
    }
  }

  async function answerInfoRequest(requestId: string) {
    setBusy(`answer:${requestId}`);
    setError(null);
    try {
      // Persist any fields they filled in for this request before closing it.
      const patch: Record<string, string> = {};
      for (const key of data!.editable) patch[key] = values[key] ?? "";
      if (Object.keys(patch).length > 0) {
        const saved = await fetch(`/api/introducer/clients/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!saved.ok) {
          const j = await saved.json();
          setError(j.error ?? "Could not save what you entered.");
          return;
        }
      }

      const res = await fetch(`/api/introducer/clients/${id}/info-requests/${requestId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "answer" }),
      });
      const json = await res.json();
      if (!res.ok) {
        const outstanding = [
          ...(json.outstanding_fields ?? []).map((f: Labelled) => f.label),
          ...(json.outstanding_documents ?? []),
        ];
        setError(
          outstanding.length > 0
            ? `Still needed: ${outstanding.join(", ")}.`
            : json.error ?? "Could not send.",
        );
        return;
      }
      setNotice("Thanks — sent back to Springboard.");
      await load();
    } catch {
      setError("We couldn't reach the server.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <Link href="/introducer/clients" className="text-sm text-gray-600 hover:text-gray-900">
        ← Back to your referrals
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">{name}</h1>
          <p className="mt-1 text-sm text-gray-600">
            {client.client_ref ? `${client.client_ref} · ` : ""}
            {client.status_label}
          </p>
        </div>
        {isDraft && (
          <span className="rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
            Not submitted
          </span>
        )}
      </div>

      {justSubmitted && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          Referral submitted. We&apos;ll review it and come back to you.
        </div>
      )}
      {notice && (
        <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-900">
          {notice}
        </div>
      )}
      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {!isDraft && <Progress stage={client.stage} />}

      {client.message_to_introducer && (
        <div className="mt-5 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            From Springboard
          </h2>
          <p className="mt-2 whitespace-pre-wrap text-gray-900">{client.message_to_introducer}</p>
        </div>
      )}

      {data.info_requests.map((req) => (
        <InfoRequestCard
          key={req.id}
          request={req}
          clientId={id}
          documents={data.documents.filter((d) => d.info_request_id === req.id)}
          busy={busy === `answer:${req.id}`}
          onUploaded={load}
          onAnswer={() => answerInfoRequest(req.id)}
          onError={setError}
        />
      ))}

      {data.basis === "authorised" && (
        <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <h2 className="font-semibold text-amber-900">A change has been authorised</h2>
          <p className="mt-1 text-sm text-amber-900">
            You can update the unlocked fields below
            {data.grantExpiresAt
              ? ` until ${new Date(data.grantExpiresAt).toLocaleString("en-AU", { timeZone: "Australia/Brisbane" })}`
              : ""}
            . Save when you&apos;re done — the referral re-locks afterwards.
          </p>
        </div>
      )}

      {data.basis === "locked" && (
        <div className="mt-5 rounded-xl border border-gray-200 bg-white p-4">
          <h2 className="font-semibold text-gray-900">This referral is locked</h2>
          <p className="mt-1 text-sm text-gray-600">
            The details below are exactly as you submitted them. If something needs correcting,
            contact your Springboard manager and they&apos;ll authorise the change.
          </p>
        </div>
      )}

      <div className="mt-5 rounded-xl border border-gray-200 bg-white p-5">
        <ReferralFields
          values={values}
          editable={data.editable}
          onChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))}
          highlight={[...requestedFields]}
        />
      </div>

      {isDraft && (
        <div className="mt-5 rounded-xl border border-gray-200 bg-white p-5">
          {data.missing_required.length > 0 && (
            <p className="mb-3 text-sm text-gray-600">
              Still needed to submit: {data.missing_required.map((f) => f.label).join(", ")}.
            </p>
          )}
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <span className="text-sm leading-relaxed text-gray-700">{data.consent_statement}</span>
          </label>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={submit}
              disabled={busy !== null || !consent}
              className="rounded-lg px-5 py-2.5 font-semibold text-white disabled:opacity-50"
              style={{ background: "#c7894e" }}
            >
              {busy === "submit" ? "Submitting…" : "Submit referral"}
            </button>
            <button
              onClick={save}
              disabled={busy !== null}
              className="rounded-lg border border-gray-300 px-5 py-2.5 font-medium text-gray-700 disabled:opacity-50"
            >
              {busy === "save" ? "Saving…" : "Save draft"}
            </button>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-gray-500">
            Once submitted, these details are locked and can only be changed if Springboard authorises it.
          </p>
        </div>
      )}

      {!isDraft && canEditAnything && data.basis === "authorised" && (
        <button
          onClick={save}
          disabled={busy !== null}
          className="mt-5 rounded-lg px-5 py-2.5 font-semibold text-white disabled:opacity-50"
          style={{ background: "#c7894e" }}
        >
          {busy === "save" ? "Saving…" : "Save the authorised change"}
        </button>
      )}

      {data.documents.length > 0 && (
        <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Documents you&apos;ve supplied
          </h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            {data.documents.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3">
                <span className="truncate text-gray-900">{d.label}</span>
                <span className="shrink-0 text-gray-500">
                  {new Date(d.uploaded_at).toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane" })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** The progress timeline — the only window into the CRM an introducer gets. */
function Progress({ stage }: { stage: string | null }) {
  const index = INTRODUCER_STAGES.findIndex((s) => s.key === stage);
  const notProceeding = stage === "not_proceeding";
  const visible = INTRODUCER_STAGES.filter((s) => s.key !== "not_proceeding");

  if (notProceeding) {
    return (
      <div className="mt-5 rounded-xl border border-gray-200 bg-white p-4">
        <p className="font-medium text-gray-900">Not proceeding</p>
        <p className="mt-1 text-sm text-gray-600">This referral isn&apos;t moving forward.</p>
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-xl border border-gray-200 bg-white p-5">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Progress</h2>
      <ol className="mt-3 space-y-2">
        {visible.map((s, i) => {
          const done = index >= 0 && i < index;
          const current = index >= 0 && i === index;
          return (
            <li key={s.key} className="flex items-start gap-3">
              <span
                className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                  current ? "bg-amber-500" : done ? "bg-green-600" : "bg-gray-300"
                }`}
              />
              <span className={current ? "font-medium text-gray-900" : done ? "text-gray-700" : "text-gray-400"}>
                {s.label}
                {current && <span className="mt-0.5 block text-sm font-normal text-gray-600">{s.blurb}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** One open "we need more from you" request, with its uploads. */
function InfoRequestCard({
  request,
  clientId,
  documents,
  busy,
  onUploaded,
  onAnswer,
  onError,
}: {
  request: InfoRequest;
  clientId: string;
  documents: DocRow[];
  busy: boolean;
  onUploaded: () => Promise<void>;
  onAnswer: () => void;
  onError: (msg: string) => void;
}) {
  const [uploading, setUploading] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const supplied = new Set(documents.map((d) => d.label.toLowerCase()));

  async function upload(label: string, file: File) {
    setUploading(label);
    try {
      const res = await fetch(`/api/introducer/clients/${clientId}/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          info_request_id: request.id,
          label,
          filename: file.name,
          size: file.size,
          mime_type: file.type,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        onError(json.error ?? "Could not upload that file.");
        return;
      }
      // Straight to storage — the bytes never pass through our server.
      const { error } = await supabaseBrowser.storage
        .from(json.bucket)
        .uploadToSignedUrl(json.path, json.token, file, { contentType: file.type });
      if (error) {
        onError("The upload didn't complete. Please try again.");
        return;
      }
      await onUploaded();
    } catch {
      onError("The upload didn't complete. Please try again.");
    } finally {
      setUploading(null);
    }
  }

  return (
    <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 p-5">
      <h2 className="font-semibold text-amber-900">We need a little more</h2>
      <p className="mt-2 whitespace-pre-wrap text-sm text-amber-900">{request.message}</p>

      {request.fields.length > 0 && (
        <p className="mt-3 text-sm text-amber-900">
          <strong>Details:</strong> {request.fields.map((f) => f.label).join(", ")} — the highlighted
          fields below are open for you.
        </p>
      )}

      {request.documents.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-amber-900">Documents</p>
          <ul className="mt-2 space-y-2">
            {request.documents.map((label) => {
              const done = supplied.has(label.toLowerCase());
              return (
                <li
                  key={label}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2"
                >
                  <span className="text-sm text-gray-900">{label}</span>
                  {done ? (
                    <span className="text-sm font-medium text-green-700">Received</span>
                  ) : (
                    <>
                      <input
                        ref={(el) => {
                          inputs.current[label] = el;
                        }}
                        type="file"
                        accept={ACCEPTED}
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void upload(label, file);
                          e.target.value = "";
                        }}
                      />
                      <button
                        onClick={() => inputs.current[label]?.click()}
                        disabled={uploading !== null}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 disabled:opacity-50"
                      >
                        {uploading === label ? "Uploading…" : "Upload"}
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <button
        onClick={onAnswer}
        disabled={busy}
        className="mt-4 rounded-lg px-5 py-2.5 font-semibold text-white disabled:opacity-50"
        style={{ background: "#c7894e" }}
      >
        {busy ? "Sending…" : "I've supplied everything"}
      </button>
      <p className="mt-3 text-xs leading-relaxed text-amber-900/80">
        This opens only the items above. The rest of the referral stays as you submitted it, and
        re-locks once you send this back.
      </p>
    </div>
  );
}
