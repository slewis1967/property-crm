"use client";

/**
 * The client portal's non-upload sections: their documents, help, booking, and
 * what happens next.
 *
 * Kept out of PortalClient so the upload flow — the part that must never break —
 * stays untouched. These are presentational; the only data they fetch is what
 * the portal endpoint already returns.
 *
 * COMPLIANCE BOUNDARY: nothing here explains the product, who qualifies, or the
 * investment side. Springboard is Program Manager. Copy lives in
 * utils/portal-help.ts, where it's unit-tested against that boundary.
 */
import { useState } from "react";
import { HELP_ENTRIES, HELP_FAQ, JOURNEY, MYGOV_VIDEO } from "../../../utils/portal-help";

export type PortalDoc = {
  id: string;
  label: string;
  filename: string;
  status: string | null;
};

export type SignedDoc = { kind: string; label: string };

const CARD = "rounded-xl border border-gray-200 bg-white p-5";

/** What they've sent us, so they can check the right file landed. */
export function MyDocumentsSection({
  token,
  documents,
  signedDocuments,
}: {
  token: string;
  documents: PortalDoc[];
  signedDocuments: SignedDoc[];
}) {
  return (
    <div className="space-y-4">
      <div className={CARD}>
        <h2 className="text-base font-semibold text-gray-900">Documents you&apos;ve sent us</h2>
        {documents.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">
            Nothing yet. Anything you upload will appear here so you can check it.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {documents.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-800">{d.label}</p>
                  <p className="truncate text-xs text-gray-500">{d.filename}</p>
                </div>
                <a
                  href={`/api/portal/${token}/documents/${d.id}?preview=1`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-[#020e40] shadow-sm ring-1 ring-gray-300 hover:bg-gray-50"
                >
                  View
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      {signedDocuments.length > 0 && (
        <div className={CARD}>
          <h2 className="text-base font-semibold text-gray-900">Documents you&apos;ve signed</h2>
          <p className="mt-1 text-sm text-gray-600">Your copies, exactly as you signed them.</p>
          <ul className="mt-3 space-y-2">
            {signedDocuments.map((s) => (
              <li
                key={s.kind}
                className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-2.5"
              >
                <span className="text-sm font-medium text-gray-800">{s.label}</span>
                <a
                  href={`/api/portal/${token}/compliance/${s.kind}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-shrink-0 rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-[#020e40] shadow-sm ring-1 ring-gray-300 hover:bg-gray-50"
                >
                  Open PDF
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** What each document is, how to get it, and what gets a set rejected. */
export function HelpSection({ onOpenWalkthrough }: { onOpenWalkthrough: () => void }) {
  const [open, setOpen] = useState<string | null>("ato_income");
  return (
    <div className="space-y-4">
      <div className={CARD}>
        <h2 className="text-base font-semibold text-gray-900">Getting your ATO income statement</h2>
        <p className="mt-1 text-sm text-gray-600">
          This is the one most people get stuck on. The video walks through it, or use the
          step-by-step guide on your phone.
        </p>
        {/* Self-hosted, same origin — no third-party player, no third-party
            branding, no cookie set on a page that also handles identity documents. */}
        <div className="mt-3 overflow-hidden rounded-lg bg-black" style={{ aspectRatio: "16 / 9" }}>
          <video
            src={MYGOV_VIDEO.src}
            title={MYGOV_VIDEO.title}
            controls
            playsInline
            preload="metadata"
            className="h-full w-full"
          >
            {MYGOV_VIDEO.caption}
          </video>
        </div>
        <button
          type="button"
          onClick={onOpenWalkthrough}
          className="mt-3 rounded-lg bg-[#020e40] px-4 py-2.5 text-sm font-semibold text-white"
        >
          Step-by-step on my phone
        </button>
      </div>

      {HELP_ENTRIES.map((e) => {
        const isOpen = open === e.docKey;
        return (
          <div key={e.docKey} className={CARD}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : e.docKey)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <span className="text-base font-semibold text-gray-900">{e.title}</span>
              <span className="text-gray-400">{isOpen ? "−" : "+"}</span>
            </button>
            {isOpen && (
              <div className="mt-3 space-y-3 text-sm text-gray-700">
                <div>
                  <p className="font-medium text-gray-900">What it is</p>
                  {e.what.map((t, i) => (
                    <p key={i} className="mt-1">{t}</p>
                  ))}
                </div>
                <div>
                  <p className="font-medium text-gray-900">How to get it</p>
                  <ol className="mt-1 list-decimal space-y-1 pl-5">
                    {e.how.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ol>
                </div>
                <div>
                  <p className="font-medium text-gray-900">What to avoid</p>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-gray-600">
                    {e.avoid.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className={CARD}>
        <h2 className="text-base font-semibold text-gray-900">Common questions</h2>
        <dl className="mt-3 space-y-3">
          {HELP_FAQ.map((f, i) => (
            <div key={i}>
              <dt className="text-sm font-medium text-gray-900">{f.q}</dt>
              <dd className="mt-1 text-sm text-gray-600">{f.a}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

/** Straight into the existing self-booking page. */
export function BookSection({ bookingUrl }: { bookingUrl: string }) {
  return (
    <div className={CARD}>
      <h2 className="text-base font-semibold text-gray-900">Talk to someone</h2>
      <p className="mt-2 text-sm text-gray-600">
        If anything here is unclear, book a time that suits you and we&apos;ll walk through it
        together. Most questions take about ten minutes.
      </p>
      <a
        href={bookingUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-4 inline-block rounded-lg bg-[#020e40] px-5 py-3 text-sm font-semibold text-white"
      >
        Book a time
      </a>
      <p className="mt-3 text-sm text-gray-500">
        Or just reply to any email from us — we read every one.
      </p>
    </div>
  );
}

/**
 * The steps ahead. PROCESS ONLY, deliberately: the sequence and who does what.
 * The product itself, and whether it suits you, is the licensed adviser's to
 * explain in their written advice — not ours.
 */
export function JourneySection() {
  return (
    <div className={CARD}>
      <h2 className="text-base font-semibold text-gray-900">What happens next</h2>
      <p className="mt-1 text-sm text-gray-600">
        The steps from here. Your consultant will tell you where you are at any point.
      </p>
      <ol className="mt-4 space-y-4">
        {JOURNEY.map((s) => (
          <li key={s.n} className="flex gap-3">
            <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#020e40] text-xs font-semibold text-white">
              {s.n}
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900">{s.title}</p>
              <p className="text-sm text-gray-600">{s.detail}</p>
              <p className="mt-0.5 text-xs uppercase tracking-wide text-gray-400">{s.who}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-5 border-t border-gray-100 pt-4 text-xs leading-relaxed text-gray-500">
        This is a general outline of the process only. It is not financial or credit advice, and it
        doesn&apos;t describe the product or whether it is suitable for you — the licensed adviser
        you meet with covers that in their written advice.
      </p>
    </div>
  );
}
