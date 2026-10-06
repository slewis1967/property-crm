"use client";

import { useEffect, useState } from "react";
import { formatDateTime } from "../../utils/datetime";
import { isLivePa, type PaListRow } from "../../utils/preliminary-assessments";
import PaResendButton from "./PaResendButton";

const TEAL = "#0F4C5C";

/**
 * The Preliminary Assessment YLA has returned for this contact, on the contact
 * detail page: where it is up to, who will be asked to sign it, and the button
 * that starts the call it is presented on.
 *
 * Renders nothing — not even a heading — when the contact has no PA, and on a
 * load error, so it stays out of the way for the majority of contacts who are
 * not at that stage (same rule as ContactVideoCalls).
 */
export default function ContactPreliminaryAssessment({ contactId }: { contactId: string }) {
  const [rows, setRows] = useState<PaListRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/preliminary-assessments?contact_id=${encodeURIComponent(contactId)}`);
        const data = await res.json();
        if (!cancelled && res.ok && data.ok) setRows(data.assessments ?? []);
      } catch {
        // Invisible on failure; the full list at /preliminary-assessments reports errors.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  if (!rows) return null;
  // The API returns newest first. The live PA is the one to present; if every
  // PA is finished, show the newest signed one so the outcome stays visible.
  const pa = rows.find((r) => isLivePa(r.status)) ?? rows.find((r) => r.status === "Signed");
  if (!pa) return null;

  const live = isLivePa(pa.status);
  const sent = Boolean(pa.signing_sent_at) || pa.status === "Sent for signing" || pa.status === "Signed";
  const steps: { label: string; done: boolean; at?: string | null }[] = [
    { label: "Received", done: true, at: pa.received_at },
    { label: "Presented", done: Boolean(pa.presented_at) || pa.status !== "Received", at: pa.presented_at },
    { label: "Video watched", done: Boolean(pa.video_confirmed_at), at: pa.video_confirmed_at },
    { label: "Sent for signing", done: sent, at: pa.signing_sent_at },
    { label: "Signed", done: pa.status === "Signed" },
  ];
  const signers = pa.applicants.filter((a) => a.name || a.email);

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-700">
            📄 Preliminary Assessment
            <span className="text-xs font-normal text-gray-400">YLA ref {pa.yla_ref}</span>
          </h3>
          <div className="mt-0.5 text-xs text-gray-500">
            Received {formatDateTime(pa.received_at)}
            {pa.property && ` · ${pa.property}`}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={`/api/preliminary-assessments/${pa.id}/pdf`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50"
          >
            View PDF
          </a>
          {pa.status === "Sent for signing" && (
            <PaResendButton
              paId={pa.id}
              className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
            />
          )}
          {live && (
            <a
              href={`/video/contact-${encodeURIComponent(contactId)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-md px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90"
              style={{ backgroundColor: TEAL }}
            >
              🎥 Start presentation call
            </a>
          )}
        </div>
      </div>

      <ol className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {steps.map((s) => (
          <li
            key={s.label}
            className={s.done ? "font-medium text-emerald-700" : "text-gray-400"}
            title={s.done && s.at ? formatDateTime(s.at) : undefined}
          >
            <span aria-hidden="true">{s.done ? "✓ " : "○ "}</span>
            {s.label}
            <span className="sr-only">{s.done ? " (done)" : " (not yet)"}</span>
          </li>
        ))}
      </ol>

      <div className="text-xs text-gray-600">
        <span className="font-semibold text-gray-700">
          {pa.status === "Signed" ? "Signed by: " : sent ? "Sent for signing to: " : "Will be sent for signing to: "}
        </span>
        {signers.length === 0
          ? "applicants could not be read from the PDF — check it before sending."
          : signers.map((a) => (a.email ? `${a.name || "Applicant"} (${a.email})` : `${a.name} (no email on the PA)`)).join(", ")}
      </div>

      {pa.signing_error && (
        <div className="mt-2 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
          The signing email did not send: {pa.signing_error}
        </div>
      )}
    </div>
  );
}
