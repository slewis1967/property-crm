/**
 * An AI agent's card in the Studio: an animated mock of what it makes (CSS
 * only, stops under reduced motion), what it produces, how it reaches the
 * world, and its promises. Server-safe.
 *
 * The mock uses a real masked lot from the partner's own book where one is
 * given, so the preview is theirs, not a stock image.
 */
import { formatAud } from "../../../utils/partner";
import type { AgentDef } from "../../../utils/partner-plans";
import type { DraftLot } from "../../../utils/partner-week";
import { Chip, Icon, LotCover } from "../ui";

function Mock({ agent, lot }: { agent: AgentDef; lot: DraftLot | null }) {
  const place = lot ? [lot.suburb, lot.state].filter(Boolean).join(" ") : "Your suburb";
  const seed = lot?.ref ?? agent.id;
  const type = lot?.propertyType ?? "House";
  switch (agent.id) {
    case "facebook":
      return (
        <div className="pp-float pp-keep-light w-[78%] rounded-xl bg-white p-2.5 shadow-xl" style={{ background: "#fff" }}>
          <div className="mb-2 flex items-center gap-1.5">
            <span className="h-5 w-5 rounded-full" style={{ background: "var(--brand)" }} />
            <span className="h-2 w-16 rounded bg-slate-200" />
          </div>
          <div className="mb-1.5 text-[10px] font-semibold text-slate-800">Just listed in {place}</div>
          <LotCover propertyType={type} seed={seed} className="h-16 rounded-lg" />
          <div className="mt-2 flex items-center gap-2 text-[10px] text-slate-500">
            <Icon name="heart" className="h-3 w-3 text-rose-500" /> 24 <span className="ml-auto">6 comments</span>
          </div>
        </div>
      );
    case "instagram":
      return (
        <div className="pp-float grid w-[78%] grid-cols-3 gap-1 rounded-xl p-1 shadow-xl" style={{ background: "linear-gradient(45deg,#f58529,#dd2a7b,#8134af)" }}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <LotCover key={i} propertyType={["House", "Townhouse", "Apartment"][i % 3]} seed={`${seed}${i}`} className="aspect-square rounded-md" />
          ))}
        </div>
      );
    case "seo":
      return (
        <div className="pp-float pp-keep-light w-[82%] overflow-hidden rounded-xl bg-white shadow-xl" style={{ background: "#fff" }}>
          <div className="flex gap-1 bg-slate-100 px-2 py-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </div>
          <div className="space-y-1.5 p-2.5">
            <div className="pp-typing text-[10px] font-bold text-slate-900">Buying new in {place}</div>
            <div className="h-1.5 w-full rounded bg-slate-200" />
            <div className="h-1.5 w-11/12 rounded bg-slate-200" />
            <div className="h-1.5 w-4/5 rounded bg-slate-200" />
            <div className="flex items-center gap-1 pt-1 text-[9px] font-semibold text-emerald-700">
              <Icon name="search" className="h-3 w-3" /> Optimised for &ldquo;new homes {lot?.suburb ?? "near me"}&rdquo;
            </div>
          </div>
        </div>
      );
    case "wechat":
      return (
        <div className="pp-float pp-keep-light w-[64%] rounded-2xl border-4 border-slate-800 bg-slate-100 p-2 shadow-xl" style={{ background: "#eef2f6" }}>
          <div className="mb-1.5 text-center text-[9px] font-semibold text-slate-500">Content pack · ready to post</div>
          <div className="rounded-lg bg-white p-1.5 text-[10px] leading-snug text-slate-800" lang="zh-Hans" style={{ background: "#fff" }}>
            【新房推荐】{place}
            <LotCover propertyType={type} seed={seed} className="mt-1 h-10 rounded" />
          </div>
          <div className="mt-1.5 flex justify-center">
            <span className="rounded-full px-2 py-0.5 text-[9px] font-bold text-white" style={{ background: "#07c160" }}>One tap to share</span>
          </div>
        </div>
      );
    case "reengage":
      return (
        <div className="w-[82%] space-y-1.5">
          <div className="pp-keep-light pp-stagger space-y-1.5">
            <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white px-2.5 py-1.5 text-[10px] text-slate-700 shadow" style={{ background: "#fff" }}>
              Hi Sam, a new {lot?.bedrooms ? `${lot.bedrooms}-bed ` : ""}home just came up in {place}{lot?.price ? ` at ${formatAud(lot.price)}` : ""}.
            </div>
            <div className="ml-auto max-w-[70%] rounded-2xl rounded-br-sm px-2.5 py-1.5 text-[10px] text-white shadow" style={{ background: "#7c3aed" }}>
              Yes please, send it through!
            </div>
            <div className="max-w-[60%] rounded-2xl rounded-bl-sm bg-white px-2.5 py-1.5 text-[10px] text-slate-400 shadow" style={{ background: "#fff" }}>
              <span className="pp-caret">Drafting reply</span>
            </div>
          </div>
        </div>
      );
  }
}

export default function AgentCard({ agent, lot }: { agent: AgentDef; lot: DraftLot | null }) {
  return (
    <article className="pp-lift group flex flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.15)]">
      <div className="relative flex h-44 items-center justify-center overflow-hidden" style={{ background: `linear-gradient(135deg, ${agent.hue[0]}, ${agent.hue[1]})` }}>
        <div className="pp-grid-overlay absolute inset-0" aria-hidden="true" />
        <div className="absolute -bottom-10 -right-10 h-32 w-32 rounded-full bg-white/20 blur-2xl" aria-hidden="true" />
        <Mock agent={agent} lot={lot} />
      </div>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900">{agent.name}</h3>
          <Chip tone="ai">Elite</Chip>
        </div>
        <p className="mt-1 text-sm text-slate-600">{agent.tagline}</p>
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex items-start gap-2 text-slate-700">
            <Icon name="wand" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            {agent.produces}
          </div>
          <div className="flex items-start gap-2 text-slate-700">
            <Icon name="send" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <span>
              {agent.delivery}
              {agent.deliveryComingSoon && <Chip tone="slate" className="ml-1.5 !py-0 align-middle !text-[10px]">Coming soon</Chip>}
            </span>
          </div>
          {agent.promises.map((p) => (
            <div key={p} className="flex items-start gap-2 text-slate-700">
              <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" strokeWidth={2.4} />
              {p}
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}
