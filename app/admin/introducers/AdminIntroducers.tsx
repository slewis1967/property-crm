"use client";

/**
 * Introducer management: the review queue, and the register of introducer firms.
 *
 * The queue is first because it's the thing with a clock on it — a referral
 * sitting unreviewed is a client waiting on a phone call. The register is the
 * slower, administrative half.
 *
 * Controls reserved to the owner are hidden rather than shown-and-403'd for
 * staff, so nobody is invited to press something they can't do; the API enforces
 * it regardless of what this renders.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Accreditations from "./Accreditations";

type Submission = {
  id: string;
  client_ref: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  state: string | null;
  suburb: string | null;
  purchase_intent: string | null;
  timeframe: string | null;
  income_band: string | null;
  deposit_band: string | null;
  status: string;
  stage: string | null;
  submitted_at: string | null;
  firm_name: string;
  awaiting_introducer: boolean;
};

type IntroducerUser = {
  id: string;
  email: string;
  full_name: string | null;
  status: string;
  is_primary: boolean;
  last_login_at: string | null;
};

type Firm = {
  id: string;
  firm_name: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  agreement_ref: string | null;
  abn: string | null;
  status: string;
  notes: string | null;
  users: IntroducerUser[];
  referrals: { total: number; open: number };
};

/** Pure fetch — no state. Used by the mount effect and by every refresh. */
async function fetchAll(scope: "queue" | "all"): Promise<{
  submissions?: Submission[];
  firms?: Firm[];
  error: string | null;
}> {
  try {
    const [subs, list] = await Promise.all([
      fetch(`/api/admin/introducers/submissions?status=${scope}`).then((r) => r.json()),
      fetch("/api/admin/introducers").then((r) => r.json()),
    ]);
    return {
      submissions: subs.ok ? (subs.submissions as Submission[]) : undefined,
      firms: list.ok ? (list.introducers as Firm[]) : undefined,
      error: subs.ok ? null : (subs.error ?? "Could not load the queue."),
    };
  } catch {
    return { error: "Could not reach the server." };
  }
}

export default function AdminIntroducers({
  viewerIsSuperAdmin,
  viewerCanOverrideCourse,
}: {
  viewerIsSuperAdmin: boolean;
  viewerCanOverrideCourse: boolean;
}) {
  const [tab, setTab] = useState<"queue" | "accreditations" | "firms">("queue");
  const [scope, setScope] = useState<"queue" | "all">("queue");
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [firms, setFirms] = useState<Firm[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchAll(scope);
    setError(result.error);
    if (result.submissions) setSubmissions(result.submissions);
    if (result.firms) setFirms(result.firms);
    setLoading(false);
  }, [scope]);

  // Awaits the fetch before touching state (the cascading-render rule), and
  // drops a late response if the scope changed or the page unmounted.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchAll(scope);
      if (cancelled) return;
      setError(result.error);
      if (result.submissions) setSubmissions(result.submissions);
      if (result.firms) setFirms(result.firms);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [scope]);

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-4 lg:p-6">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-semibold text-gray-900">Introducers</h1>
        <p className="mt-1 text-sm text-gray-600">
          Third-party firms referring clients to the YLA product. Referrals stay here until they&apos;re
          accepted — nothing reaches the pipeline before that.
        </p>

        <div className="mt-5 flex gap-1 border-b border-gray-200">
          {(["queue", "accreditations", "firms"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium transition ${
                tab === t
                  ? "border-b-2 border-gray-900 text-gray-900"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t === "queue"
                ? `Review queue${submissions.length ? ` (${submissions.length})` : ""}`
                : t === "accreditations"
                  ? "Accreditations"
                  : "Introducer firms"}
            </button>
          ))}
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        )}

        {tab === "queue" ? (
          <Queue
            submissions={submissions}
            loading={loading}
            scope={scope}
            onScope={setScope}
          />
        ) : tab === "accreditations" ? (
          <Accreditations
            viewerIsSuperAdmin={viewerIsSuperAdmin}
            viewerCanOverrideCourse={viewerCanOverrideCourse}
          />
        ) : (
          <Firms
            firms={firms}
            loading={loading}
            viewerIsSuperAdmin={viewerIsSuperAdmin}
            onChanged={load}
          />
        )}
      </div>
    </div>
  );
}

function Queue({
  submissions,
  loading,
  scope,
  onScope,
}: {
  submissions: Submission[];
  loading: boolean;
  scope: "queue" | "all";
  onScope: (s: "queue" | "all") => void;
}) {
  const withUs = submissions.filter((s) => !s.awaiting_introducer);
  const withThem = submissions.filter((s) => s.awaiting_introducer);

  return (
    <div className="mt-5">
      <div className="flex items-center gap-2">
        <button
          onClick={() => onScope("queue")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${scope === "queue" ? "bg-gray-900 text-white" : "border border-gray-300 text-gray-700"}`}
        >
          Awaiting review
        </button>
        <button
          onClick={() => onScope("all")}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium ${scope === "all" ? "bg-gray-900 text-white" : "border border-gray-300 text-gray-700"}`}
        >
          All referrals
        </button>
      </div>

      {loading ? (
        <p className="mt-6 text-gray-500">Loading…</p>
      ) : submissions.length === 0 ? (
        <p className="mt-6 rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-gray-600">
          Nothing here.
        </p>
      ) : (
        <>
          <Section title="With us" rows={withUs} />
          <Section title="Waiting on the introducer" rows={withThem} />
        </>
      )}
    </div>
  );
}

function Section({ title, rows }: { title: string; rows: Submission[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="mt-6">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
        {title} ({rows.length})
      </h2>
      <ul className="mt-2 space-y-2">
        {rows.map((s) => (
          <li key={s.id}>
            <Link
              href={`/admin/introducers/submissions/${s.id}`}
              className="block rounded-xl border border-gray-200 bg-white px-4 py-3 transition hover:border-gray-300"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-900">
                      {`${s.first_name} ${s.last_name}`.trim() || "Unnamed"}
                    </span>
                    {s.client_ref && <span className="text-xs text-gray-500">{s.client_ref}</span>}
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                      {s.firm_name}
                    </span>
                  </div>
                  <div className="mt-0.5 text-sm text-gray-600">
                    {[s.purchase_intent, s.timeframe, s.income_band, s.suburb || s.state]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <div className="text-right text-sm text-gray-500">
                  {s.submitted_at
                    ? new Date(s.submitted_at).toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane" })
                    : "—"}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Firms({
  firms,
  loading,
  viewerIsSuperAdmin,
  onChanged,
}: {
  firms: Firm[];
  loading: boolean;
  viewerIsSuperAdmin: boolean;
  onChanged: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    firm_name: "",
    contact_name: "",
    contact_email: "",
    contact_phone: "",
    agreement_ref: "",
    abn: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  /**
   * Starting an accreditation is now how an introducer is onboarded. Creating
   * the firm outright — which grants portal access immediately — is the
   * exception, kept for a firm accredited before this pipeline existed.
   * `starting` drives the primary form, `adding` the old direct one.
   */
  const [starting, setStarting] = useState(false);
  const [startForm, setStartForm] = useState({
    legal_name: "",
    email: "",
    firm_name: "",
    phone: "",
    tier: "t1",
    agreement_variant: "standard",
    notes: "",
  });

  async function startOnboarding() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/introducers/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(startForm),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not start the accreditation.");
        return;
      }
      setNotice(
        json.invite_sent
          ? `Accreditation started — ${startForm.legal_name} has been emailed their first step.`
          : `Accreditation started, but the email did not send (${json.invite_error ?? "unknown error"}). Reissue their link from the application.`,
      );
      setStartForm({ legal_name: "", email: "", firm_name: "", phone: "", tier: "t1", agreement_variant: "standard", notes: "" });
      setStarting(false);
      await onChanged();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/introducers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not add the introducer.");
        return;
      }
      setNotice(
        json.invite_sent
          ? "Introducer added and the invitation email has gone out."
          : `Introducer added, but the invitation email failed (${json.invite_error ?? "unknown"}). They can still sign in at /introducer.`,
      );
      setForm({ firm_name: "", contact_name: "", contact_email: "", contact_phone: "", agreement_ref: "", abn: "", notes: "" });
      setAdding(false);
      await onChanged();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function setFirmStatus(id: string, status: string) {
    setError(null);
    const res = await fetch(`/api/admin/introducers/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const json = await res.json();
      setError(json.error ?? "Could not update.");
      return;
    }
    await onChanged();
  }

  async function setUserStatus(firmId: string, userId: string, status: string) {
    setError(null);
    const res = await fetch(`/api/admin/introducers/${firmId}/users`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, status }),
    });
    if (!res.ok) {
      const json = await res.json();
      setError(json.error ?? "Could not update.");
      return;
    }
    await onChanged();
  }

  return (
    <div className="mt-5">
      {viewerIsSuperAdmin && (
        <div className="mb-5">
          {starting ? (
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="font-semibold text-gray-900">Start an accreditation</h2>
              <p className="mt-1 text-sm text-gray-600">
                Emails them the programme and their first step. Everything after that is self-service:
                NDA, identity check, the course and exam, certificate, then the agreement. Portal access
                opens on its own once they have signed.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block text-sm sm:col-span-2">
                  <span className="font-medium text-gray-700">Full legal name *</span>
                  <input
                    value={startForm.legal_name}
                    onChange={(e) => setStartForm({ ...startForm, legal_name: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  />
                  <span className="mt-1 block text-xs text-gray-500">
                    This is what their certificate prints and what the agreement is executed in. They
                    cannot change it — that is the point.
                  </span>
                </label>
                {(
                  [
                    ["email", "Email *"],
                    ["firm_name", "Trading entity"],
                    ["phone", "Phone"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="block text-sm">
                    <span className="font-medium text-gray-700">{label}</span>
                    <input
                      value={startForm[key]}
                      onChange={(e) => setStartForm({ ...startForm, [key]: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                    />
                  </label>
                ))}
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">Tier</span>
                  <select
                    value={startForm.tier}
                    onChange={(e) => setStartForm({ ...startForm, tier: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  >
                    <option value="t1">Tier 1 — introduces clients</option>
                    <option value="t2">Tier 2 — also completes the fact find and needs analysis</option>
                  </select>
                  <span className="mt-1 block text-xs text-gray-500">
                    Tier 2 collects a fact find and an NCCP needs analysis, so it sits closer to the
                    licence. Use Tier 1 unless there is a reason not to.
                  </span>
                </label>
                <label className="block text-sm">
                  <span className="font-medium text-gray-700">Commercial terms</span>
                  <select
                    value={startForm.agreement_variant}
                    onChange={(e) => setStartForm({ ...startForm, agreement_variant: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  >
                    <option value="standard">Standard — Springboard pays no referral fee</option>
                    <option value="paid">Paid — referral fee per settled referral</option>
                  </select>
                  <span className="mt-1 block text-xs text-gray-500">
                    The paid arrangement is invitation only, and the agreement they sign says the
                    opposite of the standard one about whether money changes hands. Get this right up
                    front — it decides which documents are issued.
                  </span>
                </label>
                <label className="block text-sm sm:col-span-2">
                  <span className="font-medium text-gray-700">Internal notes</span>
                  <textarea
                    rows={2}
                    value={startForm.notes}
                    onChange={(e) => setStartForm({ ...startForm, notes: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  />
                </label>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={startOnboarding}
                  disabled={busy || !startForm.legal_name || !startForm.email}
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "Sending…" : "Send and start"}
                </button>
                <button
                  onClick={() => setStarting(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : !adding ? (
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setStarting(true)}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
              >
                Start an accreditation
              </button>
              <button
                onClick={() => setAdding(true)}
                className="text-sm text-gray-500 underline underline-offset-2 hover:text-gray-700"
              >
                Add an already-accredited firm directly
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="font-semibold text-gray-900">Add an already-accredited firm</h2>
              <p className="mt-1 text-sm text-gray-600">
                Creates the firm and its first portal login immediately, skipping accreditation
                entirely. Only for a firm accredited before this pipeline existed — for anyone new, use{" "}
                <button
                  onClick={() => {
                    setAdding(false);
                    setStarting(true);
                  }}
                  className="underline underline-offset-2"
                >
                  Start an accreditation
                </button>
                .
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {(
                  [
                    ["firm_name", "Firm name *"],
                    ["contact_name", "Main contact"],
                    ["contact_email", "Contact email * (this becomes their login)"],
                    ["contact_phone", "Phone"],
                    ["agreement_ref", "Agreement reference"],
                    ["abn", "ABN"],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="block text-sm">
                    <span className="font-medium text-gray-700">{label}</span>
                    <input
                      value={form[key]}
                      onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                    />
                  </label>
                ))}
                <label className="block text-sm sm:col-span-2">
                  <span className="font-medium text-gray-700">Internal notes</span>
                  <textarea
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  />
                </label>
              </div>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={create}
                  disabled={busy || !form.firm_name || !form.contact_email}
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy ? "Adding…" : "Add introducer"}
                </button>
                <button
                  onClick={() => setAdding(false)}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {notice && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
          {notice}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : firms.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-gray-600">
          No introducers yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {firms.map((f) => (
            <li key={f.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900">{f.firm_name}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        f.status === "active" ? "bg-green-50 text-green-800" : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {f.status}
                    </span>
                  </div>
                  <div className="mt-0.5 text-sm text-gray-600">
                    {[f.contact_name, f.contact_email, f.agreement_ref].filter(Boolean).join(" · ")}
                  </div>
                  <div className="mt-1 text-sm text-gray-500">
                    {f.referrals.total} referral{f.referrals.total === 1 ? "" : "s"}
                    {f.referrals.open > 0 && ` · ${f.referrals.open} open`}
                  </div>
                </div>
                {viewerIsSuperAdmin && (
                  <div className="flex gap-2">
                    {f.status === "active" ? (
                      <button
                        onClick={() => setFirmStatus(f.id, "suspended")}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700"
                      >
                        Suspend
                      </button>
                    ) : (
                      <button
                        onClick={() => setFirmStatus(f.id, "active")}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700"
                      >
                        Reactivate
                      </button>
                    )}
                  </div>
                )}
              </div>

              {f.users.length > 0 && (
                <ul className="mt-3 space-y-1.5 border-t border-gray-100 pt-3">
                  {f.users.map((u) => (
                    <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span className="text-gray-700">
                        {u.full_name ? `${u.full_name} — ` : ""}
                        {u.email}
                        {u.status !== "active" && (
                          <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                            {u.status}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="text-xs text-gray-500">
                          {u.last_login_at
                            ? `last in ${new Date(u.last_login_at).toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane" })}`
                            : "never signed in"}
                        </span>
                        {viewerIsSuperAdmin && (
                          <button
                            onClick={() => setUserStatus(f.id, u.id, u.status === "active" ? "suspended" : "active")}
                            className="text-xs font-medium text-gray-600 underline"
                          >
                            {u.status === "active" ? "Suspend" : "Reactivate"}
                          </button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
