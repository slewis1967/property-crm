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
 * The guides themselves live in utils/help/. Staff can also ask for a guide
 * that is missing; once a super admin approves it (see /help-requests) it is
 * listed here with the built-in ones.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  HELP_SECTIONS,
  guidesOf,
  searchGuides,
  sectionForPath,
  videoFor,
  type HelpGuide,
  type HelpSection,
} from "../../utils/help";
import type { HelpDraft, HelpRequestStatus } from "../../utils/help/requests";

type Picked = { section: HelpSection; guide: HelpGuide };

type MyRequest = { id: string; question: string; status: HelpRequestStatus; decline_reason: string | null };
type Remote = {
  published: { id: string; section_label: string | null; draft: HelpDraft | null }[];
  mine: MyRequest[];
  isAdmin: boolean;
  waiting: number;
};

/** Where approved requests go when they do not belong to a section. */
const ON_REQUEST: HelpSection = { label: "Added on request", paths: [], about: "", guides: [] };

const MY_STATUS: Record<HelpRequestStatus, string> = {
  new: "Being reviewed",
  drafted: "Being reviewed",
  refer: "Being reviewed",
  blocked: "Being reviewed",
  published: "Added",
  declined: "Not added",
};

/** What the person is told straight after asking. */
function askedMessage(status: HelpRequestStatus): string {
  if (status === "blocked") {
    return "Sent for review. The checks flagged this one, so it may not be added. You will see the outcome here.";
  }
  return "Sent for review. Once it is approved the guide appears in this list.";
}

function formatLength(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return m > 0 ? `${m} min ${s.toString().padStart(2, "0")} sec` : `${s} sec`;
}

function GuideRow({ picked, onPick }: { picked: Picked; onPick: (p: Picked) => void }) {
  const video = videoFor(picked.guide.id);
  const isOverview = picked.section.overview === picked.guide;
  return (
    <button
      type="button"
      onClick={() => onPick(picked)}
      className={`w-full text-left px-3 py-2.5 rounded-lg border transition flex items-start gap-3 hover:border-[#0F4C5C] ${
        isOverview ? "border-[#FFB627] bg-[#FFB627]/10 hover:bg-[#FFB627]/20" : "border-gray-200 hover:bg-[#0F4C5C]/5"
      }`}
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
  const [remote, setRemote] = useState<Remote | null>(null);
  const [asking, setAsking] = useState(false);
  const [question, setQuestion] = useState("");
  const [askBusy, setAskBusy] = useState(false);
  const [askNote, setAskNote] = useState<{ ok: boolean; text: string } | null>(null);

  // Bumped after a request is sent, to fetch the list again.
  const [remoteVersion, setRemoteVersion] = useState(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const json = await (await fetch("/api/help/requests", { cache: "no-store" })).json();
        if (!cancelled && json.ok) setRemote(json as Remote);
      } catch {
        // The built-in guides still work without this.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [remoteVersion]);

  /** Approved requests, as guides, grouped under the section they were asked from. */
  const added = useMemo(() => {
    const bySection = new Map<string, HelpGuide[]>();
    for (const r of remote?.published ?? []) {
      if (!r.draft) continue;
      const known = HELP_SECTIONS.some((s) => s.label === r.section_label);
      const key = known && r.section_label ? r.section_label : ON_REQUEST.label;
      bySection.set(key, [...(bySection.get(key) ?? []), { id: `request-${r.id}`, ...r.draft }]);
    }
    return bySection;
  }, [remote]);
  const allOf = (s: HelpSection) => [...guidesOf(s), ...(added.get(s.label) ?? [])];

  const ask = async () => {
    setAskBusy(true);
    setAskNote(null);
    try {
      const res = await fetch("/api/help/requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, page_path: pathname }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Could not send your request");
      setAskNote({ ok: true, text: askedMessage(json.status as HelpRequestStatus) });
      setQuestion("");
      setRemoteVersion((v) => v + 1);
    } catch (e) {
      setAskNote({ ok: false, text: e instanceof Error ? e.message : "Could not send your request" });
    } finally {
      setAskBusy(false);
    }
  };

  const section = useMemo(() => sectionForPath(HELP_SECTIONS, pathname), [pathname]);

  const results = useMemo<Picked[]>(() => {
    const builtIn = searchGuides(HELP_SECTIONS, query).flatMap(({ section: s, guideId }) => {
      const guide = guidesOf(s).find((g) => g.id === guideId);
      return guide ? [{ section: s, guide }] : [];
    });
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const extra: Picked[] = [];
    if (words.length > 0) {
      for (const [label, guides] of added) {
        const s = HELP_SECTIONS.find((x) => x.label === label) ?? ON_REQUEST;
        for (const g of guides) {
          const hay = [label, g.title, g.summary, ...g.steps.map((st) => st.title)].join(" ").toLowerCase();
          if (words.every((w) => hay.includes(w))) extra.push({ section: s, guide: g });
        }
      }
    }
    return [...builtIn, ...extra];
  }, [query, added]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const video = picked ? videoFor(picked.guide.id) : null;
  const pickedOverview = picked ? picked.section.overview === picked.guide : false;
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
                  The video for this {pickedOverview ? "overview" : "task"} has not been recorded yet. The{" "}
                  {pickedOverview ? "notes" : "steps"} below cover the same ground.
                </div>
              )}
              <p className="text-sm text-gray-600 mt-4">{picked.guide.summary}</p>
              <ol className="mt-4 space-y-3">
                {picked.guide.steps.map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="flex-shrink-0 w-7 h-7 rounded-full bg-[#0F4C5C] text-white text-sm font-bold flex items-center justify-center">
                      {pickedOverview ? "•" : i + 1}
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
                  {[...HELP_SECTIONS, ON_REQUEST].filter((s) => allOf(s).length > 0).map((s) => (
                    <div key={s.label}>
                      <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">{s.label}</div>
                      <div className="space-y-2">
                        {allOf(s).map((g) => (
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
                    {allOf(section).map((g) => (
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

              <div className="mt-6 pt-4 border-t border-gray-200">
                {!asking ? (
                  <button
                    type="button"
                    onClick={() => setAsking(true)}
                    className="text-sm font-semibold text-[#0F4C5C] hover:underline"
                  >
                    Can&rsquo;t find it? Ask for a guide
                  </button>
                ) : (
                  <div>
                    <label htmlFor="help-ask" className="block text-sm font-semibold text-gray-900">
                      What are you trying to do?
                    </label>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Describe the task, not the client: no names, emails or numbers. Your request is checked and
                      reviewed before a guide is added.
                    </p>
                    <textarea
                      id="help-ask"
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      rows={3}
                      maxLength={400}
                      placeholder="e.g. How do I move a contact from one buyer type to another?"
                      className="mt-2 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F4C5C]"
                    />
                    <button
                      type="button"
                      onClick={ask}
                      disabled={askBusy || question.trim().length < 8}
                      className="mt-2 px-3 py-1.5 rounded-lg bg-[#0F4C5C] text-white text-sm font-semibold hover:bg-[#0c3d4a] disabled:opacity-50"
                    >
                      {askBusy ? "Sending…" : "Send request"}
                    </button>
                  </div>
                )}
                {askNote && (
                  <p className={`mt-2 text-sm ${askNote.ok ? "text-emerald-700" : "text-red-700"}`}>{askNote.text}</p>
                )}

                {remote && remote.mine.length > 0 && (
                  <div className="mt-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5">Your requests</div>
                    <ul className="space-y-1.5">
                      {remote.mine.map((m) => (
                        <li key={m.id} className="text-sm text-gray-700 flex gap-2">
                          <span className="flex-1 min-w-0">
                            {m.question}
                            {m.status === "declined" && m.decline_reason && (
                              <span className="block text-xs text-gray-500">{m.decline_reason}</span>
                            )}
                          </span>
                          <span className="text-xs text-gray-500 whitespace-nowrap">{MY_STATUS[m.status]}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {remote?.isAdmin && (
                  <a href="/help-requests" className="mt-4 inline-block text-sm font-medium text-[#0F4C5C] hover:underline">
                    Review help requests ({remote.waiting} waiting)
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
