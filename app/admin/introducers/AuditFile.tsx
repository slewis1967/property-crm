"use client";

/**
 * The audit file for one introducer — "show us what you have on this person".
 *
 * Deliberately shows the WHOLE event trail rather than a tidy summary. An audit
 * asks what happened and in what order; a curated view is the auditor's job to
 * distrust, not ours to pre-empt. The summary sections above it exist so a human
 * can find something quickly, not so the trail can be skipped.
 *
 * Nothing here is stored as a separate "vault" record. It is assembled from the
 * live rows every time it is opened, because a copy would drift from the
 * originals and the copy is what someone would then rely on.
 */
import { useEffect, useState } from "react";

type FileResponse = {
  application: Record<string, string | null>;
  identity: {
    provider: string | null;
    result: string | null;
    checked_at: string | null;
    checked_by: string | null;
    files: { side: string; original_name: string | null; uploaded_at: string; purged_at: string | null; url: string | null }[];
  };
  exam: {
    attempts: { at: string; score: number; total: number; passed: boolean; red_line_modules?: string[] }[];
    passed_at: string | null;
  };
  certificate: { accreditation_no: string | null; url: string | null };
  agreements: { label: string; status: string; signed_at: string | null; signer_name: string | null; url: string | null }[];
  /** Optional so an audit file produced before the library shipped still renders. */
  resources?: {
    title: string;
    version: string;
    requires_ack: boolean;
    acknowledged_at: string | null;
    acknowledged_by: string | null;
    acknowledged_version: string | null;
  }[];
  events: { at: string; action: string; actor_type: string; actor: string | null; detail: Record<string, unknown> }[];
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }) : "—";

export default function AuditFile({ applicationId, onClose }: { applicationId: string; onClose: () => void }) {
  const [data, setData] = useState<FileResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/admin/introducers/applications/${applicationId}/file`).catch(() => null);
      if (cancelled) return;
      if (!res) return setError("Could not reach the server.");
      const json = await res.json();
      if (cancelled) return;
      if (!res.ok) setError(json.error ?? "Could not load the file.");
      else setData(json);
    })();
    return () => { cancelled = true; };
  }, [applicationId]);

  return (
    <div className="mt-3 rounded-lg border border-gray-300 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-gray-900">Audit file</h3>
          <p className="text-sm text-gray-600">
            Everything held against this introducer. Opening it is recorded.
          </p>
        </div>
        <button onClick={onClose} className="rounded-lg border border-gray-300 px-3 py-1 text-sm text-gray-700">
          Close
        </button>
      </div>

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {!data && !error && <p className="mt-3 text-sm text-gray-500">Loading…</p>}

      {data && (
        <div className="mt-4 space-y-5 text-sm">
          <Section title="Identity">
            <Row k="Check" v={`${data.identity.result ?? "not recorded"}${data.identity.provider ? ` · ${data.identity.provider}` : ""}`} />
            <Row k="Checked" v={`${when(data.identity.checked_at)}${data.identity.checked_by ? ` by ${data.identity.checked_by}` : ""}`} />
            {data.identity.files.map((f) => (
              <Row
                key={f.side + f.uploaded_at}
                k={f.side}
                v={
                  f.purged_at ? (
                    <span className="text-gray-500">
                      Destroyed {when(f.purged_at)} — held {when(f.uploaded_at)} to then
                    </span>
                  ) : f.url ? (
                    <a href={f.url} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                      Open ({when(f.uploaded_at)})
                    </a>
                  ) : (
                    <span className="text-gray-500">Unavailable</span>
                  )
                }
              />
            ))}
            {!data.identity.files.length && <p className="text-gray-500">No documents held.</p>}
          </Section>

          <Section title={`Exam — ${data.exam.attempts.length} attempt${data.exam.attempts.length === 1 ? "" : "s"}`}>
            {data.exam.attempts.map((a, i) => (
              <Row
                key={i}
                k={`Attempt ${i + 1}`}
                v={
                  <>
                    {a.score}/{a.total} · {a.passed ? "passed" : "failed"} · {when(a.at)}
                    {a.red_line_modules?.length ? (
                      <span className="text-amber-700"> · red line: {a.red_line_modules.join(", ")}</span>
                    ) : null}
                  </>
                }
              />
            ))}
            {!data.exam.attempts.length && <p className="text-gray-500">No attempts recorded.</p>}
          </Section>

          <Section title="Certificate">
            <Row k="Number" v={data.certificate.accreditation_no ?? "not issued"} />
            <Row
              k="Document"
              v={
                data.certificate.url ? (
                  <a href={data.certificate.url} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                    Open certificate
                  </a>
                ) : (
                  <span className="text-gray-500">Not generated</span>
                )
              }
            />
          </Section>

          <Section title="Agreements">
            {data.agreements.map((a) => (
              <Row
                key={a.label}
                k={a.label}
                v={
                  <>
                    {a.status}
                    {a.signed_at ? ` · signed ${when(a.signed_at)}` : ""}
                    {a.signer_name ? ` by ${a.signer_name}` : ""}
                    {a.url ? (
                      <>
                        {" · "}
                        <a href={a.url} target="_blank" rel="noreferrer" className="text-blue-700 underline">
                          Open
                        </a>
                      </>
                    ) : null}
                  </>
                }
              />
            ))}
            {!data.agreements.length && <p className="text-gray-500">None issued.</p>}
          </Section>

          {/* Driven from the published shelf, not from what they confirmed — a
              manual they have never opened has to be visible, since that is the
              row an auditor is looking for. */}
          <Section title="Manuals confirmed">
            {(data.resources ?? []).map((r) => {
              const current = r.acknowledged_version === r.version;
              const stale = Boolean(r.acknowledged_at) && !current;
              return (
                <Row
                  key={r.title}
                  k={`${r.title} (v${r.version})`}
                  v={
                    current ? (
                      <>
                        confirmed {when(r.acknowledged_at)}
                        {r.acknowledged_by ? ` by ${r.acknowledged_by}` : ""}
                      </>
                    ) : stale ? (
                      <span className="text-amber-800">
                        confirmed v{r.acknowledged_version} on {when(r.acknowledged_at)} — not the
                        current version
                      </span>
                    ) : r.requires_ack ? (
                      <span className="text-red-700">not confirmed</span>
                    ) : (
                      <span className="text-gray-500">no confirmation required</span>
                    )
                  }
                />
              );
            })}
            {!(data.resources ?? []).length && (
              <p className="text-gray-500">No manuals published.</p>
            )}
          </Section>

          <Section title={`Event trail — ${data.events.length} entries`}>
            <div className="max-h-72 overflow-y-auto rounded border border-gray-200">
              <table className="w-full text-xs">
                <tbody>
                  {data.events.map((e, i) => (
                    <tr key={i} className="border-b border-gray-100 last:border-0">
                      <td className="whitespace-nowrap px-2 py-1 align-top text-gray-500 tabular-nums">{when(e.at)}</td>
                      <td className="px-2 py-1 align-top font-medium text-gray-800">{e.action.replace(/_/g, " ")}</td>
                      <td className="px-2 py-1 align-top text-gray-500">{e.actor ?? e.actor_type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</h4>
      <div className="mt-1 space-y-0.5">{children}</div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="w-32 shrink-0 capitalize text-gray-500">{k}</span>
      <span className="min-w-0 text-gray-900">{v}</span>
    </div>
  );
}
