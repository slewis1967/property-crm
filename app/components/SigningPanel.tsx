"use client";

/**
 * Signing status panel for the three compliance-document forms. Shows each
 * signer's request status (Sent / Viewed / Signed / Declined) with timestamps, a
 * "Send for signature" modal (prefilled from the applicant data, editable), and a
 * "Download signed PDF" link once a signer has completed.
 *
 * Screen-only (`no-print`). Reuses the teal form chrome. Talks to the authed
 * /api/sign/requests endpoints; the actual signing happens on the public
 * /sign/[token] page the signer is emailed.
 */

import { useCallback, useEffect, useState } from "react";
import { SIGN_STATUS_LABEL, type SignStatus } from "../../utils/signatures";

const TEAL = "#0F4C5C";

type ProposedSigner = { name: string; email: string };

type RequestRow = {
  id: string;
  signer_index: number;
  signer_name: string | null;
  signer_email: string;
  status: string;
  sent_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  signed_pdf_path: string | null;
};

function fmt(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("en-AU", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function statusColor(status: string): string {
  if (status === "signed") return "#047857";
  if (status === "declined" || status === "expired") return "#b91c1c";
  if (status === "viewed") return "#b45309";
  return "#6b7280";
}

export default function SigningPanel({
  docType,
  docId,
  proposedSigners,
}: {
  docType: "fact_find" | "needs_analysis" | "credit_authorisation";
  docId: string;
  proposedSigners: ProposedSigner[];
}) {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/sign/requests?doc_type=${docType}&doc_id=${encodeURIComponent(docId)}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Could not load signing status");
      setRows((json.requests ?? []) as RequestRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load signing status");
    } finally {
      setLoading(false);
    }
  }, [docType, docId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sign/requests?doc_type=${docType}&doc_id=${encodeURIComponent(docId)}`);
        const json = await res.json();
        if (cancelled) return;
        if (json.ok) setRows((json.requests ?? []) as RequestRow[]);
        else setError(json.error || "Could not load signing status");
      } catch {
        if (!cancelled) setError("Could not load signing status");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [docType, docId]);

  return (
    <div className="no-print mx-4 my-4 rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold" style={{ color: TEAL }}>
          🖋️ Electronic signature
        </h3>
        <button
          onClick={() => setModalOpen(true)}
          className="px-3 py-1.5 text-xs font-semibold text-white rounded-md"
          style={{ backgroundColor: TEAL }}
        >
          Send for signature
        </button>
      </div>

      <div className="px-4 py-3">
        {loading && <p className="text-sm text-gray-500">Loading…</p>}
        {error && <p className="text-sm text-red-700">{error}</p>}
        {!loading && !error && rows.length === 0 && (
          <p className="text-sm text-gray-500">
            Not sent for signature yet. Use “Send for signature” to email each signer a secure signing link.
          </p>
        )}
        {!loading && !error && rows.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {rows.map((r) => {
              const label = SIGN_STATUS_LABEL[r.status as SignStatus] ?? r.status;
              const when = r.signed_at || r.viewed_at || r.sent_at;
              return (
                <li key={r.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium text-gray-800">{r.signer_name || r.signer_email}</span>
                    <span className="text-gray-400"> · {r.signer_email}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {r.status === "signed" && r.signed_pdf_path && (
                      <a
                        href={`/api/sign/requests/${r.id}/download`}
                        className="text-xs font-semibold hover:underline"
                        style={{ color: TEAL }}
                      >
                        Download
                      </a>
                    )}
                    <span className="text-xs font-semibold" style={{ color: statusColor(r.status) }}>
                      {label}
                    </span>
                    <span className="text-xs text-gray-400 tabular-nums w-20 text-right">{fmt(when)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {modalOpen && (
        <SendModal
          docType={docType}
          docId={docId}
          proposedSigners={proposedSigners}
          onClose={() => setModalOpen(false)}
          onSent={() => {
            setModalOpen(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

function SendModal({
  docType,
  docId,
  proposedSigners,
  onClose,
  onSent,
}: {
  docType: string;
  docId: string;
  proposedSigners: ProposedSigner[];
  onClose: () => void;
  onSent: () => void;
}) {
  const initial =
    proposedSigners.length > 0
      ? proposedSigners.slice(0, 2).map((s) => ({ name: s.name, email: s.email }))
      : [{ name: "", email: "" }];
  const [signers, setSigners] = useState<ProposedSigner[]>(initial);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const setSigner = (i: number, field: "name" | "email", value: string) => {
    setSigners((prev) => prev.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)));
  };

  const send = useCallback(async () => {
    const cleaned = signers.map((s) => ({ name: s.name.trim(), email: s.email.trim() })).filter((s) => s.email);
    if (cleaned.length === 0) {
      setError("Add at least one signer email.");
      return;
    }
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/sign/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doc_type: docType, doc_id: docId, signers: cleaned, message: message.trim() || undefined }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(typeof json.error === "string" ? json.error : "Could not send.");
        return;
      }
      onSent();
    } catch {
      setError("Could not send. Please try again.");
    } finally {
      setSending(false);
    }
  }, [signers, message, docType, docId, onSent]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold" style={{ color: TEAL }}>
            Send for signature
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-lg" aria-label="Close">
            ×
          </button>
        </div>

        <div className="space-y-3">
          {signers.map((s, i) => (
            <div key={i} className="grid grid-cols-2 gap-2">
              <input
                value={s.name}
                onChange={(e) => setSigner(i, "name", e.target.value)}
                placeholder={`Signer ${i + 1} name`}
                className="px-3 py-2 text-sm border border-gray-300 rounded-md"
              />
              <input
                value={s.email}
                onChange={(e) => setSigner(i, "email", e.target.value)}
                placeholder="Email"
                type="email"
                className="px-3 py-2 text-sm border border-gray-300 rounded-md"
              />
            </div>
          ))}
          {signers.length < 2 && (
            <button
              onClick={() => setSigners((p) => [...p, { name: "", email: "" }])}
              className="text-xs font-semibold hover:underline"
              style={{ color: TEAL }}
            >
              + Add second signer
            </button>
          )}
        </div>

        <label className="block">
          <span className="block text-xs text-gray-500 mb-1">Message (optional)</span>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
            placeholder="A short note included in the email"
          />
        </label>

        {error && <p className="text-sm text-red-700">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-md border border-gray-300 text-gray-700">
            Cancel
          </button>
          <button
            onClick={() => void send()}
            disabled={sending}
            className="px-4 py-2 text-sm font-semibold text-white rounded-md disabled:opacity-60"
            style={{ backgroundColor: TEAL }}
          >
            {sending ? "Sending…" : "Send links"}
          </button>
        </div>
      </div>
    </div>
  );
}
