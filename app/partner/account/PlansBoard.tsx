"use client";

/**
 * The pricing columns with the monthly/annual toggle and the annual website
 * bonus. Every figure comes from utils/partner-plans.ts. No "Most popular"
 * badge, no fee figures, no fee-based ROI: value is shown as activity only.
 */
import { useState } from "react";
import type { PartnerTier } from "../../../utils/partner";
import {
  AI_USAGE_LINE,
  ANNUAL_WEBSITE_BONUS,
  ELITE_TERMS,
  annualEffectiveMonthly,
  capAlertsLabel,
  foundingPlacesLeft,
  planCards,
  type PlanCard,
  type PlanId,
} from "../../../utils/partner-plans";
import { PUBLIC_CONTACT } from "../../../utils/partner-ai-guard";
import { EliteTrialButton } from "../fx";
import { Chip, Icon } from "../ui";

const ICONS: Record<PlanId, Parameters<typeof Icon>[0]["name"]> = { basic: "grid", professional: "chart", enterprise: "layers", elite: "sparkle" };

function Tbc() {
  return <span className="ml-1.5 rounded bg-slate-100 px-1 py-px align-middle text-[9px] font-bold uppercase tracking-wide text-slate-500">TBC</span>;
}

function Price({ plan, annual }: { plan: PlanCard; annual: boolean }) {
  const p = plan.price;
  if (p.monthly === 0) {
    return (
      <div>
        <div className="flex items-baseline gap-1">
          <span className="text-4xl font-bold tracking-tight text-slate-900">Free</span>
          {!p.confirmed && <Tbc />}
        </div>
        <div className="mt-1 h-4 text-xs text-slate-500">{p.laterMonthly ? `Rising to $${p.laterMonthly}/mo later` : "No monthly fee"}</div>
      </div>
    );
  }
  const shown = annual ? annualEffectiveMonthly(p.monthly) : p.monthly;
  return (
    <div>
      <div className="flex items-baseline gap-1">
        <span className="text-4xl font-bold tracking-tight text-slate-900">${shown.toLocaleString("en-AU")}</span>
        <span className="text-sm text-slate-500">/mo</span>
        {!p.confirmed && <Tbc />}
      </div>
      <div className="mt-1 h-4 text-xs text-slate-500">
        {annual ? `$${(p.monthly * ELITE_TERMS.annualMonthsPaid).toLocaleString("en-AU")} billed yearly: 12 months for ${ELITE_TERMS.annualMonthsPaid}` : "+ GST, billed monthly"}
      </div>
    </div>
  );
}

function Column({ plan, current, annual }: { plan: PlanCard; current: boolean; annual: boolean }) {
  const elite = plan.id === "elite";
  const anchor = plan.id === "enterprise";
  const left = foundingPlacesLeft();
  const inner = (
    <div className={`relative flex h-full flex-col rounded-3xl bg-white p-6 ${elite ? "" : "border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.12)]"} ${current ? "ring-2 ring-[var(--brand)]" : ""}`}>
      {current && (
        <span className="absolute -top-3 left-6 rounded-full px-3 py-0.5 text-xs font-bold text-white shadow-sm" style={{ background: "var(--brand)" }}>
          Your plan
        </span>
      )}
      <div className="flex items-center gap-3">
        <span
          className="flex h-10 w-10 items-center justify-center rounded-xl text-white"
          style={{ background: elite ? "linear-gradient(135deg, var(--accent), #9333ea)" : anchor ? "var(--brand)" : "color-mix(in srgb, var(--brand) 55%, #94a3b8)" }}
        >
          <Icon name={ICONS[plan.id]} className="h-5 w-5" />
        </span>
        <div>
          <div className="text-lg font-semibold text-slate-900">{plan.label}</div>
          <div className="text-xs text-slate-500">{plan.maxUsers ? `Up to ${plan.maxUsers} team logins` : "Unlimited team logins"}</div>
        </div>
      </div>
      <p className="mt-3 min-h-[2.5rem] text-sm text-slate-600">{plan.blurb}</p>
      <div className="mt-4">
        <Price plan={plan} annual={annual} />
      </div>
      {plan.price.setup ? (
        <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <strong className="text-slate-800">${plan.price.setup.toLocaleString("en-AU")} setup.</strong>{" "}
          {plan.price.setupWaiver}
        </div>
      ) : null}
      {elite && (
        <div className="mt-3 space-y-2">
          <div className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-900" style={{ background: "color-mix(in srgb, var(--accent) 16%, var(--pp-tint-base))" }}>
            Founding places: {left} of {ELITE_TERMS.foundingPlaces} left · ${ELITE_TERMS.foundingMonthly}/mo locked for {ELITE_TERMS.foundingLockMonths} months
          </div>
          <ul className="space-y-1.5 text-xs text-slate-600">
            <li className="flex gap-2"><Icon name="bolt" className="h-3.5 w-3.5 shrink-0" />Includes ${plan.price.aiIncluded} of AI usage every month</li>
            <li className="flex gap-2"><Icon name="chart" className="h-3.5 w-3.5 shrink-0" />Beyond that, AI usage at cost ×{ELITE_TERMS.overageMultiplier}, billed monthly</li>
            <li className="flex gap-2"><Icon name="lock" className="h-3.5 w-3.5 shrink-0" />You set a hard monthly cap. Alerts at {capAlertsLabel()}</li>
            <li className="flex gap-2"><Icon name="check" className="h-3.5 w-3.5 shrink-0" strokeWidth={2.4} />Cancel online anytime</li>
          </ul>
        </div>
      )}
      <div className="mt-5 border-t border-slate-100 pt-4">
        {plan.includesFrom && (
          <div className="mb-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Everything in {plan.includesFrom === "basic" ? "Basic" : plan.includesFrom === "professional" ? "Professional" : "Enterprise"}, plus
          </div>
        )}
        <ul className="space-y-2.5 text-sm">
          {plan.highlights.map((h) => (
            <li key={h} className="flex items-start gap-2.5 text-slate-800">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white" style={{ background: elite ? "linear-gradient(135deg, var(--accent), #9333ea)" : "var(--brand)" }}>
                <Icon name="check" className="h-3 w-3" strokeWidth={3} />
              </span>
              {h}
            </li>
          ))}
        </ul>
      </div>
      <div className="mt-auto pt-6">
        {current ? (
          <div className="rounded-xl bg-slate-100 px-4 py-2.5 text-center text-sm font-semibold text-slate-600">You&apos;re on {plan.label}</div>
        ) : elite ? (
          <>
            <EliteTrialButton source="plans" billing={annual ? "annual" : "monthly"} className="[&>button]:w-full" />
            <p className="mt-2 text-center text-[11px] text-slate-500">
              No card. After {ELITE_TERMS.trialDays} days you drop to Professional unless you continue.
              {!ELITE_TERMS.trialConfirmed && <Tbc />}
            </p>
          </>
        ) : (
          <a
            href={`tel:${PUBLIC_CONTACT.phone.replace(/\s/g, "")}`}
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
          >
            <Icon name="phone" className="h-4 w-4" /> Talk to {PUBLIC_CONTACT.name}
          </a>
        )}
      </div>
    </div>
  );
  return elite ? (
    <div id="elite" className="pp-glow-border order-first h-full scroll-mt-28 rounded-3xl md:order-none shadow-[0_24px_60px_-24px_rgba(147,51,234,0.55)]">
      {inner}
    </div>
  ) : (
    <div className="h-full">{inner}</div>
  );
}

export default function PlansBoard({ tier }: { tier: PartnerTier }) {
  const [annual, setAnnual] = useState(false);
  const cards = planCards();
  return (
    <div>
      <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-5 lg:items-stretch">
        <div className="flex flex-col justify-center gap-3 lg:col-span-2">
          <div className="inline-flex w-full rounded-2xl border border-slate-200 bg-white p-1 shadow-sm sm:w-auto" role="group" aria-label="Billing period">
            {[false, true].map((a) => (
              <button
                key={String(a)}
                onClick={() => setAnnual(a)}
                aria-pressed={annual === a}
                className={`flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition sm:flex-none ${annual === a ? "text-white shadow" : "text-slate-600 hover:text-slate-900"}`}
                style={annual === a ? { background: "var(--brand)" } : undefined}
              >
                {a ? (
                  <>
                    Annual <span className={`ml-1 rounded-full px-1.5 py-px text-[10px] font-bold ${annual ? "bg-white/20" : "bg-emerald-50 text-emerald-700"}`}>2 months free</span>
                  </>
                ) : (
                  "Monthly"
                )}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">Prices in AUD, excluding GST. {AI_USAGE_LINE} on Elite.</p>
        </div>
        <button
          onClick={() => setAnnual(true)}
          className={`group relative overflow-hidden rounded-3xl p-5 text-left text-white transition lg:col-span-3 ${annual ? "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--pp-bg)]" : "hover:-translate-y-0.5"}`}
          style={{ background: "linear-gradient(120deg, #0f766e, #0ea5e9 55%, #6366f1)" }}
          aria-label="Choose annual billing to get a new website"
        >
          <div className="pp-grid-overlay absolute inset-0" aria-hidden="true" />
          <div className="relative flex items-center gap-5">
            <div className="pp-float pp-keep-light hidden w-32 shrink-0 overflow-hidden rounded-lg bg-white shadow-xl sm:block" style={{ background: "#fff" }} aria-hidden="true">
              <div className="flex gap-1 bg-slate-100 px-2 py-1">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-400" /><span className="h-1.5 w-1.5 rounded-full bg-amber-400" /><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </div>
              <div className="space-y-1 p-2">
                <div className="h-6 rounded" style={{ background: "linear-gradient(90deg, var(--brand), var(--accent))" }} />
                <div className="grid grid-cols-3 gap-1">
                  <div className="h-5 rounded bg-slate-200" /><div className="h-5 rounded bg-slate-200" /><div className="h-5 rounded bg-slate-200" />
                </div>
                <div className="h-3 w-2/3 rounded" style={{ background: "var(--accent)" }} />
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="pp-glass rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider">Annual bonus · Enterprise &amp; Elite</span>
              </div>
              <div className="mt-1.5 text-xl font-bold leading-snug sm:text-2xl">
                Pay annually <Icon name="arrow-right" className="mx-1 inline-block h-5 w-5 align-[-3px]" /> get a new website
              </div>
              <ul className="mt-2 grid gap-x-4 gap-y-1 text-sm text-white/90 sm:grid-cols-2">
                {ANNUAL_WEBSITE_BONUS.points.map((p) => (
                  <li key={p} className="flex items-start gap-1.5">
                    <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.6} />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((c) => (
          <Column key={c.id} plan={c} current={c.id === tier} annual={annual && (c.id === "enterprise" || c.id === "elite")} />
        ))}
      </div>
      {annual && (
        <p className="mt-4 text-center text-xs text-slate-500">
          <Chip tone="green">Website included</Chip> on annual Enterprise and Elite.
        </p>
      )}
    </div>
  );
}
