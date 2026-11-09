import Frame from "../Frame";
import { requirePartnerPage } from "../session";
import { PARTNER_FEATURES, PARTNER_TIERS, TIER_DEFINITIONS, type PartnerFeature } from "../../../utils/partner";

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
      <h1 className="text-2xl font-semibold text-gray-900">Your plan</h1>
      <p className="mt-1 text-sm text-gray-600">
        {identity.firmName} is on <strong>{TIER_DEFINITIONS[identity.tier].label}</strong>. To change plan or add your
        own branding, contact your NextKey partner manager.
      </p>

      <div className="mt-5 overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-2">Feature</th>
              {PARTNER_TIERS.map((t) => (
                <th key={t} className="px-4 py-2 text-center" style={t === identity.tier ? { color: identity.branding.primaryColor } : undefined}>
                  {TIER_DEFINITIONS[t].label}{t === identity.tier ? " (you)" : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {features.map((f) => (
              <tr key={f} className="border-t border-gray-100">
                <td className="px-4 py-2">
                  {PARTNER_FEATURES[f].label}
                  {!PARTNER_FEATURES[f].built && <span className="ml-2 text-xs text-gray-500">coming soon</span>}
                  {mine.has(f) && !TIER_DEFINITIONS[identity.tier].features.includes(f) && (
                    <span className="ml-2 text-xs text-green-700">added for you</span>
                  )}
                </td>
                {PARTNER_TIERS.map((t) => (
                  <td key={t} className="px-4 py-2 text-center">{TIER_DEFINITIONS[t].features.includes(f) ? "✓" : ""}</td>
                ))}
              </tr>
            ))}
            <tr className="border-t border-gray-100">
              <td className="px-4 py-2">Team logins</td>
              {PARTNER_TIERS.map((t) => (
                <td key={t} className="px-4 py-2 text-center">{TIER_DEFINITIONS[t].maxUsers ?? "Unlimited"}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </Frame>
  );
}
