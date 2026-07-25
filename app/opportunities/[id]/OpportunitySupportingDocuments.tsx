"use client";

/**
 * Supporting Documents panel on the opportunity detail page — the files the
 * client supplied for their Preliminary Assessment (payslips, photo ID, ATO
 * income statements, super statements), grouped by applicant.
 *
 * Two things the advisor needs here that the portal alone can't give them:
 *
 * PREVIEW. Most of the time the question is "is this the right document?", not
 * "I want a copy" — so each row opens inline in a tab as well as downloading.
 *
 * UPLOAD ON THE CLIENT'S BEHALF. Plenty of clients email or post their
 * paperwork in rather than using the portal, and until now there was no way to
 * get those into the application at all — those clients simply stalled. The
 * upload runs the SAME three steps the portal does (normalise on this device →
 * PUT straight to storage → confirm), so a document that arrived by email is
 * indistinguishable to the verification gate and the Drive export from one the
 * client uploaded, except for a note recording who put it there.
 *
 * Bytes are never embedded or proxied: rows link to the authed,
 * opportunity-scoped route which mints a short-lived signed URL on click, and
 * uploads go direct to storage with a signed token.
 */

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "../../../utils/supabase-browser";
import { normaliseToPdf } from "../../portal/[token]/normalise";

export interface SupportingDoc {
  id: string;
  /** The applicant who uploaded it (co-applicants share one opportunity). */
  applicant: string;
  /** Stable slug, e.g. "payslip". */
  docType: string;
  /** Human label, e.g. "Recent payslips". */
  docLabel: string;
  /** What the file was called on upload — the advisor's best content cue. */
  filename: string;
  sizeBytes: number | null;
  /** e.g. "accepted" / "flagged". */
  status: string | null;
  uploadedAt: string | null;
  checkNotes: string | null;
}

/** One applicant's document slots, so the advisor can fill the empty ones. */
export interface UploadTarget {
  requestId: string;
  applicant: string;
  slots: { docKey: string; label: string; slot: number; filled: boolean }[];
}

const TYPE_ICON: Record<string, string> = {
  payslip: "💷",
  photo_id: "🪪",
  ato_income: "🧾",
  super_statement: "🏦",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function fmtSize(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function statusClass(status: string | null): string {
  const v = (status || "").toLowerCase();
  if (["accepted", "verified", "passed"].includes(v)) return "bg-green-100 text-green-700";
  if (["flagged", "rejected", "failed"].includes(v)) return "bg-red-100 text-red-700";
  return "bg-gray-100 text-gray-600";
}

/** "Photo ID — front", "Payslip 2", "Super statement". */
function slotLabel(s: { docKey: string; label: string; slot: number }): string {
  if (s.docKey === "photo_id") return `${s.label} — ${s.slot === 1 ? "front" : "back"}`;
  if (s.docKey === "payslip" || s.slot > 1) return `${s.label} ${s.slot}`;
  return s.label;
}

export default function OpportunitySupportingDocuments({
  opportunityId,
  documents,
  uploadTargets = [],
}: {
  opportunityId: string;
  documents: SupportingDoc[];
  uploadTargets?: UploadTarget[];
}) {
  const router = useRouter();
  const [showUpload, setShowUpload] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  // Group by applicant, preserving upload order within each group.
  const groups = new Map<string, SupportingDoc[]>();
  for (const d of documents) {
    (groups.get(d.applicant) ?? groups.set(d.applicant, []).get(d.applicant)!).push(d);
  }

  async function uploadFor(
    target: UploadTarget,
    slot: { docKey: string; label: string; slot: number },
    file: File,
  ) {
    const key = `${target.requestId}:${slot.docKey}:${slot.slot}`;
    setBusy(key);
    setMsg(null);

    // 1. Normalise here, exactly as the client's device would — a forwarded
    //    phone photo is otherwise the wrong format, too big and sideways.
    const norm = await normaliseToPdf(file);
    if (!norm.ok) {
      setBusy(null);
      setMsg({ text: norm.error, error: true });
      return;
    }

    // 2. Signed slot. The server names the file the way YLA require.
    let signed: { token: string; path: string; bucket: string; document_id: string };
    try {
      const res = await fetch(`/api/opportunities/${opportunityId}/documents/upload-url`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          request_id: target.requestId,
          doc_key: slot.docKey,
          slot: slot.slot,
          size: norm.blob.size,
          mime_type: "application/pdf",
          original_name: file.name,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setBusy(null);
        setMsg({ text: json.error || "Could not start the upload.", error: true });
        return;
      }
      signed = json;
    } catch {
      setBusy(null);
      setMsg({ text: "Could not reach the server. Please try again.", error: true });
      return;
    }

    // 3. Straight to storage — the bytes never pass through our server.
    let uploadOk = true;
    try {
      const { error } = await supabaseBrowser.storage
        .from(signed.bucket)
        .uploadToSignedUrl(signed.path, signed.token, norm.blob, { contentType: "application/pdf" });
      if (error) uploadOk = false;
    } catch {
      uploadOk = false;
    }

    // 4. Confirm, so a failed PUT doesn't leave a row that looks delivered.
    try {
      await fetch(`/api/opportunities/${opportunityId}/documents/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ request_id: target.requestId, document_id: signed.document_id, ok: uploadOk }),
      });
    } catch {
      /* the row stays 'uploaded'; it's still visible */
    }

    setBusy(null);
    setMsg(
      uploadOk
        ? { text: `${slotLabel(slot)} uploaded for ${target.applicant}.` }
        : { text: "The upload didn't finish. Please try again.", error: true },
    );
    // Re-render the server component so the new file appears in the list.
    router.refresh();
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-700">Supporting Documents</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">{documents.length} on file</span>
          {uploadTargets.length > 0 && (
            <button
              type="button"
              onClick={() => setShowUpload((v) => !v)}
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              {showUpload ? "Done" : "Upload for client"}
            </button>
          )}
        </div>
      </div>

      {msg && (
        <p
          className={`mb-3 rounded-md p-2 text-sm ${msg.error ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}
        >
          {msg.text}
        </p>
      )}

      {documents.length === 0 ? (
        <p className="text-sm text-gray-400">
          The client hasn&apos;t uploaded any documents through their portal yet.
          {uploadTargets.length > 0 && " If they emailed or posted them in, use “Upload for client”."}
        </p>
      ) : (
        <div className="space-y-4">
          {Array.from(groups.entries()).map(([applicant, docs]) => (
            <div key={applicant}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {applicant}
              </p>
              <div className="space-y-2">
                {docs.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        <span className="mr-1.5">{TYPE_ICON[d.docType] ?? "📎"}</span>
                        {d.docLabel}
                        <span className="text-gray-400 font-normal"> · {d.filename}</span>
                      </p>
                      <p className="text-xs text-gray-400">
                        {[fmtDate(d.uploadedAt), fmtSize(d.sizeBytes)].filter(Boolean).join(" · ")}
                        {d.checkNotes ? ` · ${d.checkNotes}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {d.status && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${statusClass(d.status)}`}
                        >
                          {d.status}
                        </span>
                      )}
                      <a
                        href={`/api/opportunities/${opportunityId}/documents/${d.id}?preview=1`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md bg-white px-2.5 py-1 text-xs font-semibold text-blue-600 shadow-sm ring-1 ring-gray-300 hover:bg-blue-50"
                      >
                        Preview
                      </a>
                      <a
                        href={`/api/opportunities/${opportunityId}/documents/${d.id}`}
                        className="text-xs font-semibold text-gray-500 hover:underline"
                      >
                        Download
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showUpload && (
        <div className="mt-5 border-t border-gray-200 pt-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Upload on the client&apos;s behalf
          </p>
          <p className="mt-1 text-xs text-gray-500">
            For clients who email or post their documents in. Files are converted to YLA&apos;s
            format — PDF, under 1MB, upright — automatically, exactly as the portal does, and
            recorded as uploaded by you.
          </p>
          <div className="mt-3 space-y-4">
            {uploadTargets.map((t) => (
              <div key={t.requestId}>
                <p className="text-xs font-semibold text-gray-600">{t.applicant}</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {t.slots.map((s) => {
                    const key = `${t.requestId}:${s.docKey}:${s.slot}`;
                    return (
                      <div
                        key={key}
                        className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-3 py-2"
                      >
                        <span
                          className={`truncate text-xs ${s.filled ? "text-gray-400" : "text-gray-700"}`}
                        >
                          {s.filled ? "✓ " : ""}
                          {slotLabel(s)}
                        </span>
                        <input
                          ref={(el) => {
                            inputs.current[key] = el;
                          }}
                          type="file"
                          accept="application/pdf,image/*"
                          className="hidden"
                          onChange={(ev) => {
                            const f = ev.target.files?.[0];
                            ev.target.value = "";
                            if (f) void uploadFor(t, s, f);
                          }}
                        />
                        <button
                          type="button"
                          disabled={busy === key}
                          onClick={() => inputs.current[key]?.click()}
                          className="flex-shrink-0 rounded-md bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                        >
                          {busy === key ? "Uploading…" : s.filled ? "Replace" : "Upload"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
