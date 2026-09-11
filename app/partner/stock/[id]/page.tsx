import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Frame from "../../Frame";
import { has, requirePartnerPage } from "../../session";
import { loadPartnerLot } from "../../../../utils/partner-stock";
import { DEAL_STAGE_LABELS, formatAud, isDealStage } from "../../../../utils/partner";
import { listOwnClients, listOwnDeals, toClientView } from "../../../api/partner/_shared";
import { AvailabilityBadge } from "../StockBrowser";
import RequestHold from "./RequestHold";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lot — Partner Portal" };

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "" || value === false) return null;
  return (
    <div className="flex justify-between gap-4 border-b border-gray-100 py-2 text-sm last:border-0">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-right font-medium text-gray-900">{value}</dd>
    </div>
  );
}

export default async function PartnerLotPage({ params }: { params: Promise<{ id: string }> }) {
  const identity = await requirePartnerPage();
  if (!has(identity, "stock")) redirect("/partner/account");

  const { id } = await params;
  const showFees = has(identity, "referral_fee");
  const lot = await loadPartnerLot(id, { showFees });
  if (!lot) notFound();

  const canDeal = has(identity, "deals") && has(identity, "clients");
  const [clients, deals] = canDeal
    ? await Promise.all([listOwnClients(identity), listOwnDeals(identity)])
    : [[], []];
  const myDealsHere = deals.filter((d) => d.property_id === lot.id);

  return (
    <Frame identity={identity}>
      <Link href="/partner/stock" className="text-sm text-gray-600 hover:text-gray-900">← All stock</Link>
      <div className="mt-3 grid gap-5 lg:grid-cols-3">
        <section className="rounded-xl border border-gray-200 bg-white p-5 lg:col-span-2">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">
                {[lot.suburb, lot.state].filter(Boolean).join(", ") || "Location on request"}
              </h1>
              <p className="text-sm text-gray-500">{lot.ref}{lot.propertyType ? ` · ${lot.propertyType}` : ""}</p>
            </div>
            <AvailabilityBadge availability={lot.availability} />
          </div>
          <div className="mt-4 text-3xl font-semibold text-gray-900">{lot.price ? formatAud(lot.price) : "Price on request"}</div>

          <dl className="mt-5">
            <Row label="Bedrooms" value={lot.bedrooms} />
            <Row label="Bathrooms" value={lot.bathrooms} />
            <Row label="Car spaces" value={lot.carSpaces} />
            <Row label="Study" value={lot.study ? "Yes" : null} />
            <Row label="Land" value={lot.landSizeSqm && `${Math.round(lot.landSizeSqm)} m²`} />
            <Row label="Frontage" value={lot.frontageM && `${lot.frontageM} m`} />
            <Row label="Home" value={lot.houseSizeSqm && `${Math.round(lot.houseSizeSqm)} m²`} />
            <Row label="Land price" value={lot.landPrice && formatAud(lot.landPrice)} />
            <Row label="Build price" value={lot.buildPrice && formatAud(lot.buildPrice)} />
            <Row label="Contract" value={lot.contract} />
            <Row label="Titled" value={lot.titled === null ? null : lot.titled ? "Yes" : "Not yet"} />
            <Row label="Land registration" value={lot.landRegistration} />
            <Row label="Completion" value={lot.completion} />
            <Row
              label="Rent estimate (developer's)"
              value={lot.rentWeekly && `${formatAud(lot.rentWeekly)} / week`}
            />
          </dl>
          <p className="mt-4 text-xs text-gray-500">
            Builder, estate, lot number and address are released once a hold is in place for your client.
            A rent estimate is the developer&apos;s figure, not a guarantee of rent.
          </p>
        </section>

        <aside className="space-y-4">
          {showFees && (
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="text-xs uppercase tracking-wide text-gray-500">Your referral fee</div>
              <div className="mt-1 text-2xl font-semibold" style={{ color: identity.branding.accentColor }}>
                {lot.referralFee ? formatAud(lot.referralFee) : "Ask us"}
              </div>
              <p className="mt-2 text-xs text-gray-500">Indicative. Payable on the terms of your partner agreement.</p>
            </div>
          )}

          {myDealsHere.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm">
              <div className="font-semibold text-gray-900">Your requests on this lot</div>
              <ul className="mt-2 space-y-1">
                {myDealsHere.map((d) => (
                  <li key={d.id}>
                    <Link className="underline" href={`/partner/deals/${d.id}`}>
                      {isDealStage(d.stage) ? DEAL_STAGE_LABELS[d.stage] : d.stage}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {canDeal && lot.availability === "available" && (
            <RequestHold
              propertyId={lot.id}
              clients={clients.filter((c) => c.status === "active").map(toClientView).map((c) => ({ id: c.id, name: c.name }))}
              accent={identity.branding.accentColor}
            />
          )}
          {lot.availability !== "available" && (
            <div className="rounded-xl border border-gray-200 bg-white p-5 text-sm text-gray-600">
              {lot.availability === "on_hold"
                ? "This lot is on hold. Ask us about similar stock."
                : "This lot is no longer available."}
            </div>
          )}
        </aside>
      </div>
    </Frame>
  );
}
