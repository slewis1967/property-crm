"use client";

/**
 * HelpPanel — what the "How do I do this?" button opens.
 *
 * Loaded on demand by HelpButton, never imported directly: this file pulls in
 * every staff guide, and a direct import would put them in the bundle that
 * public pages load too.
 *
 * It works out which section of the CRM the person is in from the URL and
 * offers the tasks for that section. Each task opens a short video with the
 * same steps written underneath, so it still helps with the sound off or
 * before a video has been recorded. A search box reaches every other guide.
 *
 * The guides themselves live in utils/help/.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  HELP_SECTIONS,
  searchGuides,
  sectionForPath,
  videoFor,
  type HelpGuide,
  type HelpSection,
} from "../../utils/help";

type Picked = { section: HelpSection; guide: HelpGuide };

function formatLength(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m} min ${s.toString().padStart(2, "0")} sec` : `${s} sec`;
}

function GuideRow({ picked, onPick }: { picked: Picked; onPick: (p: Picked) => void }) {
  const video = videoFor(picked.guide.id);
  return (
    <button
      type="button"
      onClick={() => onPick(picked)}
      className="w-full text-left px-3 py-2.5 rounded-lg border border-gray-200 hover:border-[#0F4C5C] hover:bg-[#0F4C5C]/5 transition flex items-start gap-3"
    >
      <span aria-hidden className="mt-0.5 text-[#0F4C5C]">{video ? "▶" : "☰"}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-gray-900">{picked.guide.title}</span>
        <span className="block text-xs text-gray-500 mt-0.5">{picked.guide.summary}</span>
      </span>
      <span className="text-[11px] text-gray-400 whitespace-nowrap mt-0.5">
        {video ? formatLength(video.seconds) : `${picked.guide.steps.length} steps`}
      </span>
    </button>
  );
}

export default function HelpPanel({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [query, setQuery] = useState("");
  const [browseAll, setBrowseAll] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  const section = useMemo(() => sectionForPath(HELP_SECTIONS, pathname), [pathname]);

  const results = useMemo<Picked[]>(() => {
    return searchGuides(HELP_SECTIONS, query).flatMap(({ section: s, guideId }) => {
      const guide = s.guides.find((g) => g.id === guideId);
      return guide ? [{ section: s, guide }] : [];
    });
  }, [query]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const video = picked ? videoFor(picked.guide.id) : null;
  const searching = query.trim().length > 0;

  return (
    <div data-appshell-chrome className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6">
      <button type="button" aria-label="Close help" onClick={onClose} className="absolute inset-0 bg-black/50" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="How do I do this?"
        className="relative w-full max-w-3xl max-h-full bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden"
      >
        <div className="flex items-center gap-3 px-5 py-3 bg-[#0F4C5C] text-white flex-shrink-0">
          {picked && (
            <button
              type="button"
              onClick={() => setPicked(null)}
              className="text-sm px-2 py-1 rounded hover:bg-white/15"
            >
              ← Back
            </button>
          )}
          <div className="flex-1 min-w-0">
            <div className="font-bold truncate">{picked ? picked.guide.title : "How do I do this?"}</div>
            <div className="text-xs text-white/70 truncate">
              {picked ? picked.section.label : section ? `Help for ${section.label}` : "Help for the CRM"}
            </div>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close help"
            className="w-8 h-8 flex items-center justify-center rounded hover:bg-white/15 text-xl"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto p-5">
          {picked ? (
            <div>
              {video ? (
                <video
                  key={video.src}
                  src={video.src}
                  poster={video.poster}
                  controls
                  playsInline
                  preload="metadata"
                  className="w-full rounded-lg border border-gray-200 bg-black aspect-video"
                />
              ) : (
                <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 px-4 py-3 text-sm text-gray-600">
                  The video for this task has not been recorded yet. The steps below cover the same ground.
                </div>
              )}
              <p className="text-sm text-gray-600 mt-4">{picked.guide.summary}</p>
              <ol className="mt-4 space-y-3">
                {picked.guide.steps.map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[#0F4C5C] text-white text-sm font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <span className="min-w-0 pt-0.5">
                      <span className="block text-sm font-semibold text-gray-900">{step.title}</span>
                      {step.detail && <span className="block text-sm text-gray-600 mt-0.5">{step.detail}</span>}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <div>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search all help, e.g. add a contact"
                aria-label="Search all help"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F4C5C]"
              />

              {searching ? (
                <div className="mt-4 space-y-2">
                  {results.length === 0 && (
                    <p className="text-sm text-gray-500">
                      Nothing matches that. Try fewer words, or use Feedback &amp; issues in the menu to ask for a guide.
                    </p>
                  )}
                  {results.map((r) => (
                    <div key={r.guide.id}>
                      <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">{r.section.label}</div>
                      <GuideRow picked={r} onPick={setPicked} />
                    </div>
                  ))}
                </div>
              ) : browseAll || !section ? (
                <div className="mt-4 space-y-5">
                  {HELP_SECTIONS.map((s) => (
                    <div key={s.label}>
                      <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">{s.label}</div>
                      <div className="space-y-2">
                        {s.guides.map((g) => (
                          <GuideRow key={g.id} picked={{ section: s, guide: g }} onPick={setPicked} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-4">
                  <p className="text-sm text-gray-600 mb-3">{section.about}</p>
                  <div className="space-y-2">
                    {section.guides.map((g) => (
                      <GuideRow key={g.id} picked={{ section, guide: g }} onPick={setPicked} />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setBrowseAll(true)}
                    className="mt-4 text-sm font-medium text-[#0F4C5C] hover:underline"
                  >
                    Looking for something else? See every guide
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
