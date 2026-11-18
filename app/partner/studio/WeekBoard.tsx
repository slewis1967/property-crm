"use client";

/**
 * "Your week, drafted": every draft real and readable, every action locked
 * behind "Approve & publish with Elite" (a link to the plans page, never a
 * dead button). The template week renders at once; "Draft my week with AI"
 * asks /api/partner/week for Claude's rewrite (screened server-side).
 *
 * Artwork is the illustrated LotCover (no photos: stock is masked) and carries
 * the "Artist's impression" label the platform research requires on any image
 * of a home.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatAud } from "../../../utils/partner";
import { agentDef, ARTIST_IMPRESSION } from "../../../utils/partner-plans";
import {
  personalise,
  type BlogDraft,
  type DraftLot,
  type MatchPackDraft,
  type MessageDraft,
  type SocialDraft,
  type WeekDraft,
} from "../../../utils/partner-week";
import { ApproveWithElite, BRAND_INK, Chip, Icon, LotCover, PoweredByClaude, brandTint, initials } from "../ui";

type Tab = "all" | "social" | "blog" | "messages" | "match";

const STEPS = [
  "Reading this week's stock…",
  "Matching your clients to new homes…",
  "Writing your posts and blog…",
  "Personalising follow-ups…",
  "Checking every draft against the rules…",
];

function where(l: Pick<DraftLot, "suburb" | "state">) {
  return [l.suburb, l.state].filter(Boolean).join(" ");
}

function hours(minutes: number): string {
  const h = Math.round((minutes / 60) * 2) / 2;
  return `${h % 1 === 0 ? h.toFixed(0) : h.toFixed(1)} hours`;
}

/* ------------------------------------------------------------- pieces */

function ChannelGlyph({ channel }: { channel: SocialDraft["channel"] | "email" | "sms" }) {
  const map = {
    facebook: { bg: "#1877f2", t: "f" },
    instagram: { bg: "linear-gradient(45deg,#f58529,#dd2a7b,#8134af)", t: "◎" },
    wechat: { bg: "linear-gradient(135deg,#07c160,#ff2442)", t: "微" },
    email: { bg: "#475569", t: "@" },
    sms: { bg: "#0ea5e9", t: "✉" },
  } as const;
  const g = map[channel];
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[12px] font-black text-white" style={{ background: g.bg }} aria-hidden="true">
      {g.t}
    </span>
  );
}

function PostArt({ lot, aspect = "aspect-[4/3]" }: { lot: DraftLot; aspect?: string }) {
  return (
    <LotCover propertyType={lot.propertyType} seed={lot.ref} className={aspect}>
      <div className="flex h-full flex-col justify-between p-3">
        <div className="flex justify-between gap-2">
          <span className="rounded-full bg-black/35 px-2.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">{lot.bedrooms ? `${lot.bedrooms} bed ` : ""}{lot.propertyType ?? "New home"}</span>
          {lot.price && <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-bold text-slate-900 shadow" style={{ color: "#0f172a", background: "#fff" }}>{formatAud(lot.price)}</span>}
        </div>
        <div>
          <div className="text-lg font-bold leading-tight text-white drop-shadow">{where(lot)}</div>
          <div className="mt-1 text-[9px] font-medium uppercase tracking-wide text-white/70">{ARTIST_IMPRESSION}</div>
        </div>
      </div>
    </LotCover>
  );
}

function DraftShell({
  kicker,
  glyph,
  title,
  footerNote,
  comingSoon,
  children,
}: {
  kicker: string;
  glyph: React.ComponentProps<typeof ChannelGlyph>["channel"] | null;
  title?: string;
  footerNote: string;
  comingSoon?: boolean;
  children: React.ReactNode;
}) {
  return (
    <article className="pp-lift flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_6px_20px_-10px_rgba(15,23,42,0.15)]">
      <header className="flex items-center gap-2 border-b border-slate-100 px-4 py-2.5">
        {glyph ? <ChannelGlyph channel={glyph} /> : <Icon name="doc" className="h-5 w-5 text-slate-400" />}
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{kicker}</span>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 ring-1 ring-inset ring-amber-200">
          Draft
        </span>
      </header>
      {title && <h3 className="px-4 pt-3 text-[15px] font-semibold leading-snug text-slate-900">{title}</h3>}
      <div className="flex-1">{children}</div>
      <footer className="mt-auto space-y-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
          <Icon name="eye" className="h-3.5 w-3.5" />
          {footerNote}
          {comingSoon && <Chip tone="slate" className="!py-0 !text-[10px]">Coming soon</Chip>}
        </div>
        <ApproveWithElite className="w-full" />
      </footer>
    </article>
  );
}

function SocialCard({ d, firmName }: { d: SocialDraft; firmName: string }) {
  const agent = agentDef(d.channel);
  if (d.channel === "wechat") {
    return (
      <DraftShell kicker="WeChat & RedNote pack" glyph="wechat" footerNote="Content pack: you post it from your phone in one tap">
        <div className="space-y-3 p-4">
          <PostArt lot={d.lot} aspect="aspect-[16/10]" />
          <p className="whitespace-pre-line text-[15px] leading-relaxed text-slate-900" lang="zh-Hans">{d.bodyZh}</p>
          <p className="whitespace-pre-line text-xs leading-relaxed text-slate-500">{d.body}</p>
          <div className="flex flex-wrap gap-1 text-xs font-medium" style={{ color: BRAND_INK }}>{d.hashtags.join(" ")}</div>
        </div>
      </DraftShell>
    );
  }
  return (
    <DraftShell kicker={agent.name} glyph={d.channel} footerNote={agent.delivery} comingSoon={agent.deliveryComingSoon}>
      <div className="flex items-center gap-2.5 px-4 pt-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: "var(--brand)" }}>
          {initials(firmName)}
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-slate-900">{firmName}</div>
          <div className="text-[11px] text-slate-500">Scheduled · after your approval</div>
        </div>
      </div>
      <p className="whitespace-pre-line px-4 pt-3 text-sm leading-relaxed text-slate-800">
        <span className="font-semibold">{d.headline}</span>
        {"\n"}
        {d.body}
      </p>
      <div className="px-4 pt-2 text-xs font-medium" style={{ color: BRAND_INK }}>{d.hashtags.join(" ")}</div>
      <div className="p-4 pt-3">
        <PostArt lot={d.lot} aspect={d.channel === "instagram" ? "aspect-square" : "aspect-[16/10]"} />
      </div>
    </DraftShell>
  );
}

function BlogCard({ d, expanded, onToggle }: { d: BlogDraft; expanded: boolean; onToggle: () => void }) {
  return (
    <DraftShell kicker="Organic & SEO blog" glyph={null} title={d.title} footerNote="You review every article before it goes on your site">
      <div className="relative px-4 pb-3 pt-2">
        <div className="mb-2 flex flex-wrap gap-1.5">
          <Chip tone="brand">Suburb guide</Chip>
          <Chip tone="slate">{where(d)}</Chip>
          <Chip tone="slate">~{Math.max(1, Math.round((d.intro.length + d.sections.reduce((n, s) => n + s.body.length, 0)) / 1000))} min read</Chip>
        </div>
        <div className={`relative space-y-3 overflow-hidden text-sm leading-relaxed text-slate-700 ${expanded ? "" : "max-h-56"}`}>
          <p>{d.intro}</p>
          {d.sections.map((s) => (
            <div key={s.heading}>
              <h4 className="font-semibold text-slate-900">{s.heading}</h4>
              <p className="whitespace-pre-line">{s.body}</p>
            </div>
          ))}
          {!expanded && <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white to-transparent" aria-hidden="true" style={{ backgroundImage: "linear-gradient(to top, var(--pp-surface), transparent)" }} />}
        </div>
        <button onClick={onToggle} className="mt-2 text-sm font-semibold" style={{ color: BRAND_INK }}>
          {expanded ? "Show less" : "Read the full draft"}
        </button>
      </div>
    </DraftShell>
  );
}

function MessageCard({ m }: { m: MessageDraft }) {
  const body = personalise(m.body, m.clientName);
  return (
    <DraftShell
      kicker={m.channel === "email" ? "Re-engage · email" : "Re-engage · SMS"}
      glyph={m.channel}
      footerNote={m.channel === "email" ? "From your own email, in your name · unsubscribe handled" : "From your own number, in your name · opt-out handled"}
    >
      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{initials(m.clientName)}</span>
          <span className="font-semibold text-slate-900">{m.clientName}</span>
          <Chip tone={m.warmth === "cold" ? "slate" : "accent"}>{m.warmth === "cold" ? "Cold lead" : "Warm lead"}</Chip>
          {m.sample && <Chip tone="slate">Sample</Chip>}
          {m.lastActive && <span className="text-xs text-slate-400">last active {m.lastActive}</span>}
        </div>
        {m.channel === "email" ? (
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="mb-2 border-b border-slate-100 pb-2 text-xs text-slate-500">
              Subject: <span className="font-semibold text-slate-800">{m.subject}</span>
            </div>
            <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{body}</p>
          </div>
        ) : (
          <div className="flex justify-end">
            <p className="max-w-[90%] rounded-2xl rounded-br-md px-3.5 py-2.5 text-sm leading-relaxed text-white shadow-sm" style={{ background: "linear-gradient(135deg, var(--brand), color-mix(in srgb, var(--brand) 70%, #7c3aed))" }}>
              {body}
            </p>
          </div>
        )}
        <div className="flex items-center gap-2 rounded-xl px-3 py-2 text-xs" style={{ background: brandTint(6) }}>
          <Icon name="home" className="h-4 w-4 shrink-0" />
          <span className="text-slate-600">
            Matched to <strong className="text-slate-900">{m.lot.ref}</strong> · {where(m.lot)}
            {m.lot.price ? ` · ${formatAud(m.lot.price)}` : ""}
          </span>
        </div>
      </div>
    </DraftShell>
  );
}

function MatchCard({ d }: { d: MatchPackDraft }) {
  return (
    <DraftShell kicker="Client match pack" glyph={null} title={`Shortlist for ${d.clientName}`} footerNote="A client-ready pack you send from your own email">
      <div className="space-y-3 p-4 pt-2">
        <div className="flex flex-wrap gap-1.5">
          <Chip tone="brand">Brief: {d.brief}</Chip>
          {d.sample && <Chip tone="slate">Sample brief</Chip>}
        </div>
        <p className="text-sm text-slate-600">{d.intro}</p>
        <ul className="space-y-2">
          {d.picks.map((p, i) => (
            <li key={p.lot.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-2">
              <LotCover propertyType={p.lot.propertyType} seed={p.lot.ref} className="h-14 w-20 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: "var(--accent)" }}>{i + 1}</span>
                  <span className="truncate">{where(p.lot)}</span>
                </div>
                <div className="truncate text-xs text-slate-500">{p.why}</div>
              </div>
              <div className="shrink-0 text-right text-sm font-bold text-slate-900">{p.lot.price ? formatAud(p.lot.price) : ""}</div>
            </li>
          ))}
        </ul>
      </div>
    </DraftShell>
  );
}

/* --------------------------------------------------------------- board */

export default function WeekBoard({
  initial,
  firmName,
  clientCount,
  compact = false,
}: {
  initial: WeekDraft;
  firmName: string;
  clientCount: number;
  compact?: boolean;
}) {
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [blogOpen, setBlogOpen] = useState(false);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setStep((s) => (s + 1) % STEPS.length), 1600);
    return () => clearInterval(t);
  }, [busy]);

  async function generate() {
    setBusy(true);
    setStep(0);
    setError(null);
    try {
      const res = await fetch("/api/partner/week", { method: "POST" });
      const json = (await res.json()) as { ok: boolean; draft?: WeekDraft; error?: string };
      if (!res.ok || !json.ok || !json.draft) setError(json.error ?? "We couldn't draft your week right now.");
      else {
        setDraft(json.draft);
        if (json.draft.writer !== "ai") setError("The AI writer is busy, so these are our standard drafts. Try again shortly.");
      }
    } catch {
      setError("We couldn't reach the server. Check your connection.");
    } finally {
      setBusy(false);
    }
  }

  const counts = {
    social: draft.social.length,
    blog: draft.blog ? 1 : 0,
    messages: draft.messages.length,
    match: draft.match ? 1 : 0,
  };
  const tabs: { id: Tab; label: string; n: number }[] = [
    { id: "all", label: "All drafts", n: draft.effort.drafts },
    { id: "social", label: "Social posts", n: counts.social },
    { id: "blog", label: "Blog", n: counts.blog },
    { id: "messages", label: "Re-engage", n: counts.messages },
    { id: "match", label: "Match pack", n: counts.match },
  ];
  const show = (t: Exclude<Tab, "all">) => tab === "all" || tab === t;

  return (
    <section className="relative">
      {/* Header strip */}
      <div className="pp-glow-border mb-5 rounded-3xl">
        <div className="relative overflow-hidden rounded-3xl bg-white p-5 sm:p-6">
          <div className="pointer-events-none absolute -right-10 -top-24 h-56 w-56 rounded-full opacity-30 blur-3xl" style={{ background: "linear-gradient(135deg, var(--accent), #a855f7)" }} aria-hidden="true" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <Chip tone="ai"><Icon name="sparkle" className="h-3 w-3" /> Elite preview</Chip>
                <PoweredByClaude />
              </div>
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-[1.7rem]">Your week, drafted</h2>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">
                Built from {clientCount > 0 ? <strong className="text-slate-900">your {clientCount} {clientCount === 1 ? "client" : "clients"}</strong> : "your client register"} and this week&apos;s stock:{" "}
                {counts.social} social posts, {counts.blog} suburb blog, {counts.messages} follow-ups and {counts.match} match pack. Every draft is real. Nothing goes out until you approve.
              </p>
            </div>
            <div className="flex shrink-0 gap-3">
              <div className="rounded-2xl px-4 py-2.5 text-center" style={{ background: brandTint(7) }}>
                <div className="text-2xl font-bold text-slate-900">{draft.effort.drafts}</div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">drafts</div>
              </div>
              <div className="rounded-2xl px-4 py-2.5 text-center" style={{ background: brandTint(7) }}>
                <div className="text-2xl font-bold text-slate-900">~{hours(draft.effort.minutesSaved)}</div>
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">saved by hand</div>
              </div>
            </div>
          </div>
          <div className="relative mt-4 flex flex-wrap items-center gap-3">
            <button
              onClick={generate}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-sm ring-1 ring-white/10 transition hover:brightness-110 disabled:opacity-70"
              style={{ background: "linear-gradient(135deg, var(--brand), color-mix(in srgb, var(--brand) 55%, #6366f1))" }}
            >
              <Icon name="wand" className="h-4 w-4" />
              {busy ? "Writing…" : draft.writer === "ai" ? "Redraft with AI" : "Draft my week with AI"}
            </button>
            {busy ? (
              <span className="pp-ai-shimmer text-sm font-semibold" aria-live="polite">{STEPS[step]}</span>
            ) : draft.writer === "ai" ? (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700"><Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.6} /> Written by AI and checked against the portal rules</span>
            ) : (
              <span className="text-xs text-slate-500">Showing our standard drafts. Let AI write them in your voice.</span>
            )}
          </div>
          {error && <p className="relative mt-2 text-xs text-amber-800">{error}</p>}
        </div>
      </div>

      {!compact && (
        <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${tab === t.id ? "text-white shadow" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:text-slate-900"}`}
              style={tab === t.id ? { background: "var(--brand)" } : undefined}
            >
              {t.label} <span className="opacity-60">{t.n}</span>
            </button>
          ))}
        </div>
      )}

      <div className={`relative ${busy ? "opacity-60 transition-opacity" : ""}`}>
        {compact ? (
          <div className="pp-stagger grid grid-cols-1 gap-5 md:grid-cols-3">
            {draft.social[1] && <SocialCard d={draft.social[1]} firmName={firmName} />}
            {draft.messages[0] && <MessageCard m={draft.messages[0]} />}
            {draft.match ? <MatchCard d={draft.match} /> : draft.social[0] && <SocialCard d={draft.social[0]} firmName={firmName} />}
          </div>
        ) : (
          <div className="pp-stagger grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {show("social") && draft.social.map((d) => <SocialCard key={d.key} d={d} firmName={firmName} />)}
            {show("blog") && draft.blog && (
              <div className={tab === "all" ? "xl:col-span-2" : ""}>
                <BlogCard d={draft.blog} expanded={blogOpen} onToggle={() => setBlogOpen((o) => !o)} />
              </div>
            )}
            {show("messages") && draft.messages.map((m) => <MessageCard key={m.key} m={m} />)}
            {show("match") && draft.match && (
              <div className={tab === "all" ? "xl:col-span-2" : ""}>
                <MatchCard d={draft.match} />
              </div>
            )}
          </div>
        )}
      </div>

      {compact && (
        <div className="mt-4 text-center">
          <Link href="/partner/studio" className="inline-flex items-center gap-1.5 text-sm font-semibold" style={{ color: BRAND_INK }}>
            See all {draft.effort.drafts} drafts in AI Studio <Icon name="arrow-right" className="h-4 w-4" />
          </Link>
        </div>
      )}
    </section>
  );
}
