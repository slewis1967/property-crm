import Link from "next/link";
import Frame from "../Frame";
import { has, requirePartnerPage } from "../session";
import { firstNameOf, loadPartnerWorld } from "../world";
import { buildInsights, dashboardStats, freshLots, isNewThisWeek } from "../../../utils/partner-insights";
import { buildWeekDraft } from "../../../utils/partner-week";
import { ELITE_TERMS, hasElite } from "../../../utils/partner-plans";
import { CountUp, EliteTrialButton, InsightsPanel } from "../fx";
import { Icon, MeshHero } from "../ui";
import StockCard from "../stock/StockCard";
import WeekBoard from "../studio/WeekBoard";
import Founders from "../Founders";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home — Partner Portal" };

function greeting(now: Date): string {
  const h = Number(new Intl.DateTimeFormat("en-AU", { hour: "numeric", hour12: false, timeZone: "Australia/Brisbane" }).format(now));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

/**
 * The partner's command centre: live numbers from the masked stock book and
 * their own clients and deals, AI insights, and (below Elite) the "Your week,
 * drafted" preview as the hero.
 */
export default async function PartnerHomePage() {
  const identity = await requirePartnerPage();
  const world = await loadPartnerWorld(identity);
  const now = new Date();
  const stats = dashboardStats(world.lots, world.clients, world.deals, now);
  const insights = buildInsights(world.lots, world.clients, world.deals, now);
  const name = firstNameOf(identity);
  const week = buildWeekDraft({ lots: world.lots, clients: world.clients, firmName: identity.firmName, senderName: name, now });
  const fresh = freshLots(world.lots, 6);
  const elite = hasElite(identity.tier);
  const today = now.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "Australia/Brisbane" });

  const tiles: { label: string; value: number; icon: Parameters<typeof Icon>[0]["name"]; href: string }[] = [
    { label: "Available lots", value: stats.available, icon: "grid", href: "/partner/stock?available=1" },
    { label: "New this week", value: stats.newThisWeek, icon: "sparkle", href: "/partner/stock" },
    { label: "Suburbs", value: stats.suburbs, icon: "pin", href: "/partner/map" },
    { label: "Your clients", value: stats.clients, icon: "users", href: "/partner/clients" },
    { label: "Active holds", value: stats.activeHolds, icon: "handshake", href: "/partner/deals" },
  ];

  return (
    <Frame identity={identity}>
      <MeshHero className="mb-8">
        <div className="px-5 py-7 sm:px-8 sm:py-9">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/70">{today}</div>
              <h1 className="mt-1.5 text-3xl font-bold tracking-tight sm:text-4xl">
                {greeting(now)}, {name}.
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/80 sm:text-base">
                {stats.newThisWeek > 0 ? (
                  <>
                    <strong className="text-white">{stats.newThisWeek} new {stats.newThisWeek === 1 ? "lot" : "lots"}</strong> landed this week across{" "}
                    {stats.states} {stats.states === 1 ? "state" : "states"}. Here&apos;s what matters for {identity.firmName}.
                  </>
                ) : (
                  <>Here&apos;s your stock book and pipeline at a glance.</>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {has(identity, "stock") && (
                <Link href="/partner/stock" className="pp-glass inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-white/20">
                  <Icon name="search" className="h-4 w-4" /> Find a lot
                </Link>
              )}
              {has(identity, "clients") && (
                <Link href="/partner/clients/new" className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:brightness-105" style={{ background: "var(--accent)" }}>
                  <Icon name="users" className="h-4 w-4" /> Add a client
                </Link>
              )}
            </div>
          </div>

          <div className="pp-stagger mt-7 grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
            {tiles.map((t, i) => (
              <Link
                key={t.label}
                href={t.href}
                className={`pp-glass group rounded-2xl p-3.5 transition hover:bg-white/20 sm:p-4 ${i === tiles.length - 1 ? "col-span-2 sm:col-span-1" : ""}`}
              >
                <div className="flex items-center justify-between text-white/70">
                  <span className="text-[11px] font-semibold uppercase tracking-wide">{t.label}</span>
                  <Icon name={t.icon} className="h-4 w-4 transition group-hover:scale-110" />
                </div>
                <div className="mt-1.5 text-3xl font-bold tracking-tight text-white">
                  <CountUp value={t.value} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </MeshHero>

      {!elite && (
        <div className="mb-10">
          <WeekBoard initial={week} firmName={identity.firmName} clientCount={stats.clients} compact />
          <div className="mt-5 flex flex-col items-center gap-2 text-center">
            <EliteTrialButton source="dashboard" />
            <p className="text-xs text-slate-500">No card needed. After {ELITE_TERMS.trialDays} days, keep Elite or carry on free. Nothing posts or sends until you approve it.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <InsightsPanel initial={insights} />
        </div>
        <div className="lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
              <Icon name="sparkle" className="h-4 w-4" />
              Fresh stock
            </h2>
            <Link href="/partner/stock" className="text-sm font-semibold text-slate-500 transition hover:text-slate-900">
              View all
            </Link>
          </div>
          {fresh.length ? (
            <div className="pp-stagger grid grid-cols-1 gap-4 sm:grid-cols-2">
              {fresh.slice(0, 4).map((lot) => (
                <StockCard key={lot.id} lot={lot} showFees={false} isNew={isNewThisWeek(lot, now)} compact />
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">New stock appears here as it lands.</p>
          )}
        </div>
      </div>

      <Founders className="mt-10" />
    </Frame>
  );
}
