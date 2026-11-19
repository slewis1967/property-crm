import Link from "next/link";
import Frame from "../Frame";
import { requirePartnerPage } from "../session";
import { firstNameOf, loadPartnerWorld } from "../world";
import { buildWeekDraft } from "../../../utils/partner-week";
import { AI_AGENTS, AI_USAGE_LINE, ELITE_TERMS, LATER_CHANNELS, PLAN_PRICING, hasElite, priceLabel } from "../../../utils/partner-plans";
import { EliteTrialButton } from "../fx";
import { BRAND_INK, Chip, Icon, MeshHero, PoweredByClaude } from "../ui";
import AgentCard from "./AgentCard";
import WeekBoard from "./WeekBoard";

export const dynamic = "force-dynamic";
export const metadata = { title: "AI Studio — Partner Portal" };

/**
 * AI Studio: visible on every tier. Below Elite everything here is a live
 * preview built from the firm's own clients and our masked stock, and every
 * action leads to the plans page. Nothing is posted or sent from this page.
 */
export default async function PartnerStudioPage() {
  const identity = await requirePartnerPage();
  const world = await loadPartnerWorld(identity);
  const now = new Date();
  const week = buildWeekDraft({ lots: world.lots, clients: world.clients, firmName: identity.firmName, senderName: firstNameOf(identity), now });
  const elite = hasElite(identity.tier);
  const lotFor = (i: number) => week.social[i]?.lot ?? week.messages[i]?.lot ?? null;
  const elitePrice = PLAN_PRICING.elite;

  return (
    <Frame identity={identity}>
      <MeshHero className="mb-8">
        <div className="grid grid-cols-1 gap-6 px-5 py-8 sm:px-8 sm:py-10 lg:grid-cols-5 lg:items-center">
          <div className="lg:col-span-3">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Chip tone="glass"><Icon name="sparkle" className="h-3 w-3" /> AI Studio</Chip>
              <PoweredByClaude onDark />
            </div>
            <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-[2.6rem]">
              Your AI marketing team,
              <br />
              <span style={{ color: "var(--accent)" }}>working while you sell.</span>
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/80 sm:text-base">
              Five agents draft your social posts, suburb guides, Chinese-language content packs and follow-ups from this week&apos;s stock and your own clients. You approve. They do the rest.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/85">
              <span className="inline-flex items-center gap-1.5"><Icon name="eye" className="h-4 w-4" /> Nothing posts until you approve</span>
              <span className="inline-flex items-center gap-1.5"><Icon name="lock" className="h-4 w-4" /> Masked stock only</span>
              <span className="inline-flex items-center gap-1.5"><Icon name="chart" className="h-4 w-4" /> {AI_USAGE_LINE}</span>
            </div>
          </div>
          <div className="lg:col-span-2">
            <div className="pp-glass rounded-2xl p-5">
              {elite ? (
                <p className="text-sm text-white/90">Elite is active for your firm.</p>
              ) : (
                <>
                  <div className="text-xs font-semibold uppercase tracking-wider text-white/70">Elite</div>
                  <div className="mt-1 flex items-baseline gap-1.5">
                    <span className="text-4xl font-bold">{priceLabel(elitePrice)}</span>
                    <span className="text-sm text-white/70">/month + GST</span>
                  </div>
                  <div className="mt-1 text-xs text-white/75">
                    Includes ${elitePrice.aiIncluded} of AI usage. Founding firms: ${ELITE_TERMS.foundingMonthly}/mo locked for {ELITE_TERMS.foundingLockMonths} months.
                  </div>
                  <EliteTrialButton source="studio" variant="light" className="mt-4" />
                  <Link href="/partner/account#elite" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-white/85 hover:text-white">
                    Compare plans <Icon name="arrow-right" className="h-3.5 w-3.5" />
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </MeshHero>

      <div className="mb-12">
        <WeekBoard initial={week} firmName={identity.firmName} clientCount={world.clients.filter((c) => c.status !== "archived").length} />
      </div>

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--accent)" }}>Meet the team</div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">Five agents, one approval queue</h2>
        </div>
        <p className="max-w-md text-sm text-slate-600">Each one writes from masked stock and your own clients. Facebook and Instagram publishing is coming soon; everything else is ready the day you start.</p>
      </div>
      <div className="pp-stagger mb-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {AI_AGENTS.map((a, i) => (
          <AgentCard key={a.id} agent={a} lot={lotFor(i % 3)} />
        ))}
        <article className="flex flex-col justify-between rounded-3xl border border-dashed border-slate-300 bg-white/60 p-5">
          <div>
            <h3 className="text-base font-semibold text-slate-900">More channels later</h3>
            <p className="mt-1 text-sm text-slate-600">Optional add-ons on the roadmap.</p>
          </div>
          <ul className="mt-4 space-y-2.5">
            {LATER_CHANNELS.map((c) => (
              <li key={c.id} className="flex items-center gap-3 rounded-2xl bg-slate-100/70 p-3">
                <Icon name="globe" className="h-5 w-5 text-slate-400" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-800">{c.name}</span>
                  <span className="block text-xs text-slate-500">{c.tagline}</span>
                </span>
                <Chip tone="slate">Later</Chip>
              </li>
            ))}
          </ul>
        </article>
      </div>

      {!elite && (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-3xl border border-slate-200/80 bg-white p-6 text-center sm:p-8">
          <h2 className="text-xl font-semibold text-slate-900">Ready to approve your first week?</h2>
          <p className="max-w-lg text-sm text-slate-600">
            Start free, no card. If you don&apos;t continue after {ELITE_TERMS.trialDays} days, you move to Professional and keep everything you had.
          </p>
          <EliteTrialButton source="studio" />
          <Link href="/partner/account" className="text-sm font-semibold" style={{ color: BRAND_INK }}>
            See every plan side by side
          </Link>
        </div>
      )}
    </Frame>
  );
}
