import Frame from "../Frame";
import { requirePartnerPage } from "../session";
import { PARTNER_FEATURES, PARTNER_TIERS, TIER_DEFINITIONS, type PartnerFeature } from "../../../utils/partner";
import { ACCENT, BRAND, Icon, PageHeader, brandTint } from "../ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Plan — Partner Portal" };

/**
 * What the firm's plan includes and what the other tiers add. Prices are not
 * shown: they are set per agreement, and upgrades (and white-label) are
 * arranged with NextKey rather than bought here.
 */
export default async function PartnerAccountPage() {
  const identity = await requirePartnerPage();
  const mine = new Set(identity.features);
  const features = Object.keys(PARTNER_FEATURES) as PartnerFeature[];

  return (
    <Frame identity={identity}>
      <PageHeader
        eyebrow="Your plan"
        title={`${TIER_DEFINITIONS[identity.tier].label} plan`}
        icon="star"
        subtitle={
          <>
            {identity.firmName} is on <strong className="text-slate-900">{TIER_DEFINITIONS[identity.tier].label}</strong>. To change
            plan or add your own branding, contact your NextKey partner manager.
          </>
        }
      />

      <div className="grid gap-5 md:grid-cols-3">
        {PARTNER_TIERS.map((t) => {
          const def = TIER_DEFINITIONS[t];
          const current = t === identity.tier;
          return (
            <div
              key={t}
              className={`relative flex flex-col rounded-2xl border bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-8px_rgba(15,23,42,0.08)] ${
                current ? "border-transparent ring-2 ring-[var(--brand)]" : "border-slate-200/80"
              }`}
            >
              {current && (
                <span className="absolute -top-3 left-6 rounded-full px-3 py-0.5 text-xs font-bold text-white shadow-sm" style={{ background: ACCENT }}>
                  Your plan
                </span>
              )}
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: current ? BRAND : brandTint(9), color: current ? "white" : BRAND }}>
                  <Icon name={t === "basic" ? "grid" : t === "professional" ? "chart" : "star"} className="h-5 w-5" />
                </span>
                <div>
                  <div className="text-lg font-semibold text-slate-900">{def.label}</div>
                  <div className="text-xs text-slate-500">
                    {def.maxUsers ? `Up to ${def.maxUsers} team logins` : "Unlimited team logins"}
                  </div>
                </div>
              </div>
              <ul className="mt-5 space-y-2.5 text-sm">
                {features.map((f) => {
                  const included = def.features.includes(f);
                  return (
                    <li key={f} className={`flex items-start gap-2.5 ${included ? "text-slate-800" : "text-slate-400"}`}>
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${included ? "text-white" : "bg-slate-100 text-slate-300"}`}
                        style={included ? { background: BRAND } : undefined}
                      >
                        {included ? <Icon name="check" className="h-3 w-3" strokeWidth={3} /> : <span className="h-0.5 w-2 rounded bg-slate-300" />}
                      </span>
                      <span>
                        {PARTNER_FEATURES[f].label}
                        {!PARTNER_FEATURES[f].built && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-slate-500">Soon</span>}
                        {current && mine.has(f) && !included && (
                          <span className="ml-1.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-700">Added for you</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </Frame>
  );
}
