import Frame from "../Frame";
import { requirePartnerPage } from "../session";
import { firstNameOf, loadPartnerWorld } from "../world";
import { PARTNER_FEATURES, TIER_DEFINITIONS, type PartnerFeature } from "../../../utils/partner";
import { AI_AGENTS, ELITE_TERMS, PLAN_ORDER, type PlanId } from "../../../utils/partner-plans";
import { buildWeekDraft, MINUTES_BY_HAND } from "../../../utils/partner-week";
import { Icon, PageHeader } from "../ui";
import PlansBoard from "./PlansBoard";
import Founders from "../Founders";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plans — Partner Portal" };

const LABEL: Record<PlanId, string> = { basic: "Basic", professional: "Professional", enterprise: "Enterprise", elite: "Elite" };

/** Feature rows for the comparison table: the built portal features, then the AI rows. */
function rows(): { label: string; plans: Set<PlanId>; soon?: boolean }[] {
  const feats = (Object.keys(PARTNER_FEATURES) as PartnerFeature[]).filter((f) => PARTNER_FEATURES[f].built);
  const portal = feats.map((f) => ({
    label: PARTNER_FEATURES[f].label,
    plans: new Set<PlanId>([...(["basic", "professional", "enterprise"] as const).filter((t) => TIER_DEFINITIONS[t].features.includes(f)), "elite"]),
  }));
  const all = new Set<PlanId>(PLAN_ORDER);
  const eliteOnly = new Set<PlanId>(["elite"]);
  return [
    ...portal,
    { label: "AI insights on your dashboard", plans: all },
    { label: "Your week, drafted", plans: eliteOnly },
    ...AI_AGENTS.map((a) => ({ label: a.name, plans: eliteOnly, soon: a.deliveryComingSoon })),
    { label: "Approval queue: nothing goes out until you approve", plans: eliteOnly },
  ];
}

const FAQ: { q: string; a: string }[] = [
  {
    q: "What is AI usage?",
    a: "The cost of the AI work your agents do: drafting posts, articles, packs and follow-ups. Elite includes an allowance every month. Anything beyond it is billed monthly, and you set a hard cap so it can never run away.",
  },
  {
    q: "Does anything post or send without me?",
    a: "No. Every draft waits in your approval queue. Facebook and Instagram publish in one tap once you approve (coming soon). WeChat and RedNote content comes as a pack you post from your own phone. Follow-ups go from your own email and number, in your name.",
  },
  {
    q: "What happens at the end of the trial?",
    a: `Nothing is charged without your say-so. If you don't continue after ${ELITE_TERMS.trialDays} days, you move to Professional and keep your clients, deals and history.`,
  },
  {
    q: "Is my stock data safe to use in marketing?",
    a: "Yes. The agents only ever see masked stock: suburb, state and the home's facts. Builder, estate, lot and address details are never used in drafts.",
  },
  { q: "Can I cancel?", a: "Yes, online, anytime." },
];

export default async function PartnerAccountPage() {
  const identity = await requirePartnerPage();
  const world = await loadPartnerWorld(identity);
  const week = buildWeekDraft({ lots: world.lots, clients: world.clients, firmName: identity.firmName, senderName: firstNameOf(identity), now: new Date() });
  const hours = Math.round((week.effort.minutesSaved / 60) * 2) / 2;
  const table = rows();

  return (
    <Frame identity={identity}>
      <PageHeader
        eyebrow="Plans"
        title="From free stock book to your own AI marketing team"
        icon="star"
        subtitle={
          <>
            {identity.firmName} is on <strong className="text-slate-900">{TIER_DEFINITIONS[identity.tier].label}</strong>. Every plan keeps your clients, deals and history.
          </>
        }
      />

      <PlansBoard tier={identity.tier} />

      {/* Activity-based value only: drafts and hours. No fee maths. */}
      <section className="mt-12 overflow-hidden rounded-3xl border border-slate-200/80 bg-white">
        <div className="grid grid-cols-1 gap-6 p-6 sm:p-8 lg:grid-cols-5 lg:items-center">
          <div className="lg:col-span-2">
            <div className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--accent)" }}>What Elite does in a week</div>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
              {week.effort.drafts} drafts. About {hours} hours you get back.
            </h2>
            <p className="mt-2 text-sm text-slate-600">Worked out from this week&apos;s stock and your own client list, using conservative times for doing each by hand.</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-3">
            {[
              { n: week.social.length, l: "social posts", m: MINUTES_BY_HAND.social, i: "heart" as const },
              { n: week.blog ? 1 : 0, l: "suburb blog", m: MINUTES_BY_HAND.blog, i: "doc" as const },
              { n: week.messages.length, l: "follow-ups", m: MINUTES_BY_HAND.message, i: "send" as const },
              { n: week.match ? 1 : 0, l: "match pack", m: MINUTES_BY_HAND.match, i: "users" as const },
            ].map((x) => (
              <div key={x.l} className="rounded-2xl bg-slate-50 p-4 text-center">
                <Icon name={x.i} className="mx-auto h-5 w-5 text-slate-400" />
                <div className="mt-1 text-3xl font-bold text-slate-900">{x.n}</div>
                <div className="text-xs font-medium text-slate-500">{x.l}</div>
                <div className="mt-1 text-[10px] text-slate-400">~{x.m} min each by hand</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="mb-4 text-xl font-semibold text-slate-900">Compare every plan</h2>
        <div className="overflow-x-auto rounded-3xl border border-slate-200/80 bg-white">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Feature</th>
                {PLAN_ORDER.map((p) => (
                  <th key={p} className={`px-3 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.08em] ${p === "elite" ? "text-white" : "text-slate-500"}`} style={p === "elite" ? { background: "linear-gradient(135deg, color-mix(in srgb, var(--accent) 92%, black), #9333ea)" } : undefined}>
                    {LABEL[p]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.map((r) => (
                <tr key={r.label} className="border-t border-slate-100">
                  <td className="px-5 py-3 text-slate-700">
                    {r.label}
                    {r.soon && <span className="ml-1.5 text-[10px] font-semibold uppercase text-slate-400">publishing soon</span>}
                  </td>
                  {PLAN_ORDER.map((p) => (
                    <td key={p} className="px-3 py-3 text-center" style={p === "elite" ? { background: "color-mix(in srgb, #9333ea 5%, transparent)" } : undefined}>
                      {r.plans.has(p) ? (
                        <Icon name="check" className="mx-auto h-4 w-4" strokeWidth={2.8} />
                      ) : (
                        <span className="mx-auto block h-0.5 w-3 rounded bg-slate-200" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Founders className="mt-12" />

      <section className="mt-12 grid gap-3 md:grid-cols-2">
        {FAQ.map((f) => (
          <details key={f.q} className="group rounded-2xl border border-slate-200/80 bg-white p-5 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-slate-900">
              {f.q}
              <Icon name="arrow-right" className="h-4 w-4 shrink-0 text-slate-400 transition group-open:rotate-90" />
            </summary>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.a}</p>
          </details>
        ))}
      </section>
    </Frame>
  );
}
