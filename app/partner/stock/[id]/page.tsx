import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Frame from "../../Frame";
import { has, requirePartnerPage } from "../../session";
import { loadPartnerLot } from "../../../../utils/partner-stock";
import { DEAL_STAGE_LABELS, formatAud, isDealStage } from "../../../../utils/partner";
import { listOwnClients, listOwnDeals, toClientView } from "../../../api/partner/_shared";
import { AvailabilityBadge } from "../StockBrowser";
import { BRAND, Card, CardTitle, Icon, LotCover, StagePill, brandTint, buttonPrimary, inputClass } from "../../ui";
import RequestHold from "./RequestHold";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lot — Partner Portal" };

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "" || value === false) return null;
  return (
    <div className="flex justify-between gap-4 border-b border-dashed border-slate-200 py-2.5 text-sm last:border-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="text-right font-semibold text-slate-900">{value}</dd>
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
  const place = [lot.suburb, lot.state].filter(Boolean).join(", ") || "Location on request";

  const glance = [
    { icon: "bed" as const, label: "Bedrooms", value: lot.bedrooms },
    { icon: "bath" as const, label: "Bathrooms", value: lot.bathrooms },
    { icon: "car" as const, label: "Car spaces", value: lot.carSpaces },
    { icon: "land" as const, label: "Land", value: lot.landSizeSqm ? `${Math.round(lot.landSizeSqm)} m²` : null },
    { icon: "home" as const, label: "Home", value: lot.houseSizeSqm ? `${Math.round(lot.houseSizeSqm)} m²` : null },
    { icon: "study" as const, label: "Study", value: lot.study ? "Yes" : null },
  ].filter((f) => f.value);

  return (
    <Frame identity={identity}>
      <Link href="/partner/stock" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 transition hover:text-slate-900">
        <Icon name="arrow-left" /> All stock
      </Link>

      <div className="overflow-hidden rounded-3xl shadow-[0_18px_40px_-20px_rgba(15,23,42,0.45)]">
        <LotCover propertyType={lot.propertyType} seed={lot.ref} className="h-60 sm:h-64">
          <div className="flex h-full flex-col justify-between p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
                {lot.ref}
                {lot.propertyType ? ` · ${lot.propertyType}` : ""}
              </span>
              <AvailabilityBadge availability={lot.availability} onDark />
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-sm font-medium text-white/75">
                <Icon name="pin" /> New build
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-white drop-shadow-sm sm:text-4xl">{place}</h1>
              <div className="mt-3 inline-flex items-baseline gap-2 rounded-xl bg-white/95 px-3.5 py-2 shadow-lg">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Package</span>
                <span className="text-xl font-bold tracking-tight text-slate-900">{lot.price ? formatAud(lot.price) : "Price on request"}</span>
              </div>
            </div>
          </div>
        </LotCover>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="space-y-6 lg:col-span-2">
          {glance.length > 0 && (
            <Card>
              <CardTitle icon="home">At a glance</CardTitle>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {glance.map((f) => (
                  <div key={f.label} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3.5 py-3 ring-1 ring-inset ring-slate-100">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-slate-500 shadow-sm">
                      <Icon name={f.icon} className="h-5 w-5" />
                    </span>
                    <div>
                      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{f.label}</div>
                      <div className="font-semibold text-slate-900">{f.value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <CardTitle icon="doc">Price and timing</CardTitle>
            <dl>
              <Row label="Package price" value={lot.price && formatAud(lot.price)} />
              <Row label="Land price" value={lot.landPrice && formatAud(lot.landPrice)} />
              <Row label="Build price" value={lot.buildPrice && formatAud(lot.buildPrice)} />
              <Row label="Frontage" value={lot.frontageM && `${lot.frontageM} m`} />
              <Row label="Contract" value={lot.contract} />
              <Row label="Titled" value={lot.titled === null ? null : lot.titled ? "Yes" : "Not yet"} />
              <Row label="Land registration" value={lot.landRegistration} />
              <Row label="Completion" value={lot.completion} />
              <Row label="Rent estimate (developer's)" value={lot.rentWeekly && `${formatAud(lot.rentWeekly)} / week`} />
            </dl>
            {has(identity, "suburb_reports") && lot.suburb && (
              <Link
                href={`/partner/suburbs/report?suburb=${encodeURIComponent(lot.suburb)}&state=${encodeURIComponent(lot.state ?? "")}`}
                className="mt-5 flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition hover:brightness-95"
                style={{ background: brandTint(7), color: BRAND }}
              >
                <span className="flex items-center gap-2">
                  <Icon name="chart" /> Suburb research: {lot.suburb}
                </span>
                <Icon name="arrow-right" />
              </Link>
            )}
            <p className="mt-4 flex gap-2 text-xs leading-relaxed text-slate-500">
              <Icon name="lock" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                Builder, estate, lot number and address are released once a hold is in place for your client. A rent
                estimate is the developer&apos;s figure, not a guarantee of rent.
              </span>
            </p>
          </Card>
        </section>

        <aside className="space-y-5">
          {showFees && (
            <div
              className="relative overflow-hidden rounded-2xl p-5 text-white shadow-[0_12px_28px_-14px_rgba(15,23,42,0.5)]"
              style={{ background: `linear-gradient(135deg, ${BRAND}, color-mix(in srgb, var(--brand) 72%, white))` }}
            >
              <Icon name="sparkle" className="absolute -right-3 -top-3 h-20 w-20 text-white/10" />
              <div className="text-xs font-semibold uppercase tracking-wide text-white/70">Your referral fee</div>
              <div className="mt-1 text-3xl font-bold tracking-tight">{lot.referralFee ? formatAud(lot.referralFee) : "Ask us"}</div>
              <p className="mt-2 text-xs text-white/70">Indicative. Payable on the terms of your partner agreement.</p>
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
            <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-5 text-sm text-amber-900">
              <Icon name="clock" className="mt-0.5 h-5 w-5 shrink-0" />
              {lot.availability === "on_hold" ? "This lot is on hold. Ask us about similar stock." : "This lot is no longer available."}
            </div>
          )}

          {has(identity, "lot_sheets") ? (
            <Card className="text-sm">
              <CardTitle icon="printer">Client lot sheet</CardTitle>
              <p className="text-slate-600">A one-page summary to print or save as PDF for your client. No fee, builder or address on it.</p>
              <form action={`/partner/stock/${lot.id}/sheet`} className="mt-4 space-y-2.5">
                {clients.length > 0 && (
                  <select name="client" className={inputClass} defaultValue="">
                    <option value="">Not for a particular client</option>
                    {clients
                      .filter((c) => c.status === "active")
                      .map(toClientView)
                      .map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                  </select>
                )}
                <button type="submit" className={`${buttonPrimary} w-full`}>
                  <Icon name="printer" /> Open lot sheet
                </button>
              </form>
            </Card>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-5 text-sm text-slate-600">
              Client-ready lot sheets come with the Professional plan.{" "}
              <Link className="font-semibold underline" href="/partner/account">See plans</Link>
            </div>
          )}

          {myDealsHere.length > 0 && (
            <Card className="text-sm">
              <CardTitle icon="handshake">Your requests on this lot</CardTitle>
              <ul className="space-y-2">
                {myDealsHere.map((d) => (
                  <li key={d.id}>
                    <Link
                      className="flex items-center justify-between rounded-xl px-3 py-2 ring-1 ring-inset ring-slate-200 transition hover:bg-slate-50"
                      href={`/partner/deals/${d.id}`}
                    >
                      <StagePill stage={d.stage} label={isDealStage(d.stage) ? DEAL_STAGE_LABELS[d.stage] : d.stage} />
                      <Icon name="arrow-right" className="h-4 w-4 text-slate-400" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </aside>
      </div>
    </Frame>
  );
}
