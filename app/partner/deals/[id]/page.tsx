import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Frame from "../../Frame";
import { has, requirePartnerPage } from "../../session";
import { formatAud, partnerMayWithdraw } from "../../../../utils/partner";
import { loadOwnDeal, toDealView } from "../../../api/partner/_shared";
import WithdrawButton from "./WithdrawButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Deal — Partner Portal" };

const STEPS = [
  { key: "requested", label: "Requested" },
  { key: "hold", label: "On hold" },
  { key: "eoi", label: "EOI signed" },
  { key: "unconditional", label: "Unconditional" },
  { key: "settled", label: "Settled" },
];

export default async function PartnerDealPage({ params }: { params: Promise<{ id: string }> }) {
  const identity = await requirePartnerPage();
  if (!has(identity, "deals")) redirect("/partner/account");

  const { id } = await params;
  const row = await loadOwnDeal(identity, id);
  if (!row) notFound();
  const deal = toDealView(row, { showFees: has(identity, "referral_fee") });
  const reached = STEPS.findIndex((s) => s.key === deal.stage);
  const lot = deal.lot as { suburb?: string; state?: string; propertyType?: string; bedrooms?: number };

  return (
    <Frame identity={identity}>
      <Link href="/partner/deals" className="text-sm text-gray-600 hover:text-gray-900">← Deals</Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            {deal.lotRef} · {[lot.suburb, lot.state].filter(Boolean).join(", ")}
          </h1>
          <p className="text-sm text-gray-600">
            For <Link className="underline" href={`/partner/clients/${deal.clientId}`}>{deal.clientName}</Link>
            {" · "}
            <Link className="underline" href={`/partner/stock/${deal.propertyId}`}>view lot</Link>
          </p>
        </div>
        {partnerMayWithdraw(deal.stage) && <WithdrawButton dealId={deal.id} />}
      </div>

      {reached >= 0 ? (
        <ol className="mt-5 grid grid-cols-5 gap-1 text-center text-xs">
          {STEPS.map((s, i) => (
            <li
              key={s.key}
              className={`rounded-lg px-1 py-2 font-medium ${i <= reached ? "text-white" : "bg-gray-100 text-gray-500"}`}
              style={i <= reached ? { background: identity.branding.primaryColor } : undefined}
            >
              {s.label}
            </li>
          ))}
        </ol>
      ) : (
        <div className="mt-5 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">{deal.stageLabel}</div>
      )}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-5 text-sm">
          <h2 className="font-semibold text-gray-900">Lot details</h2>
          {deal.lotDetails.length > 0 ? (
            <dl className="mt-2">
              {deal.lotDetails.map((d) => (
                <div key={d.label} className="flex justify-between gap-4 border-b border-gray-100 py-2 last:border-0">
                  <dt className="text-gray-500">{d.label}</dt>
                  <dd className="text-right font-medium text-gray-900">{d.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-2 text-gray-600">Builder, estate and lot details will appear here once they&apos;re released to you.</p>
          )}
          <div className="mt-3 flex justify-between border-t border-gray-100 pt-3">
            <span className="text-gray-500">Price</span>
            <span className="font-medium">{deal.price ? formatAud(deal.price) : "—"}</span>
          </div>
          {deal.referralFee !== null && (
            <div className="mt-1 flex justify-between">
              <span className="text-gray-500">Your referral fee</span>
              <span className="font-semibold" style={{ color: identity.branding.accentColor }}>{formatAud(deal.referralFee)}</span>
            </div>
          )}
          {deal.holdExpiresAt && deal.stage === "hold" && (
            <p className="mt-3 text-xs text-gray-500">
              Hold until {new Date(deal.holdExpiresAt).toLocaleString("en-AU", { timeZone: "Australia/Brisbane", dateStyle: "medium", timeStyle: "short" })} (Brisbane time).
            </p>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-5 text-sm">
          <h2 className="font-semibold text-gray-900">Messages</h2>
          {deal.messageFromNextKey ? (
            <blockquote className="mt-2 border-l-4 bg-gray-50 px-3 py-2 text-gray-800" style={{ borderColor: identity.branding.accentColor }}>
              {deal.messageFromNextKey}
            </blockquote>
          ) : (
            <p className="mt-2 text-gray-600">No message yet.</p>
          )}
          {deal.partnerNote && (
            <p className="mt-3 text-gray-600"><span className="font-medium text-gray-700">Your note:</span> {deal.partnerNote}</p>
          )}
        </section>
      </div>
    </Frame>
  );
}
