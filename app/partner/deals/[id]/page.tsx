import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Frame from "../../Frame";
import { has, requirePartnerPage } from "../../session";
import { formatAud, partnerMayWithdraw } from "../../../../utils/partner";
import { loadOwnDeal, loadOwnPayRecords, toDealView, toPayView } from "../../../api/partner/_shared";
import { formatPayDate } from "../../../../utils/partner-pay";
import { ACCENT, BRAND, Card, CardTitle, Icon, PageHeader, StagePill, accentTint } from "../../ui";
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
  const showFees = has(identity, "referral_fee");
  const deal = toDealView(row, { showFees });
  const pay = toPayView(row.stage, (await loadOwnPayRecords(identity, [row.id])).get(row.id), { showFees });
  const reached = STEPS.findIndex((s) => s.key === deal.stage);
  const lot = deal.lot as { suburb?: string; state?: string; propertyType?: string; bedrooms?: number };
  const place = [lot.suburb, lot.state].filter(Boolean).join(", ");

  return (
    <Frame identity={identity}>
      <PageHeader
        back={{ href: "/partner/deals", label: "Deals" }}
        eyebrow={deal.lotRef}
        title={place || "Lot"}
        icon="handshake"
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <StagePill stage={deal.stage} label={deal.stageLabel} />
            <span>
              For{" "}
              <Link className="font-semibold text-slate-900 underline-offset-2 hover:underline" href={`/partner/clients/${deal.clientId}`}>
                {deal.clientName}
              </Link>
            </span>
            <Link className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline" style={{ color: BRAND }} href={`/partner/stock/${deal.propertyId}`}>
              View lot <Icon name="arrow-right" className="h-3.5 w-3.5" />
            </Link>
          </span>
        }
        actions={partnerMayWithdraw(deal.stage) ? <WithdrawButton dealId={deal.id} /> : undefined}
      />

      {reached >= 0 ? (
        <Card className="mb-6">
          <ol className="flex items-start">
            {STEPS.map((s, i) => {
              const done = i < reached;
              const current = i === reached;
              return (
                <li key={s.key} className="relative flex flex-1 flex-col items-center text-center">
                  {i > 0 && (
                    <span
                      className="absolute right-1/2 top-4 h-0.5 w-full -translate-y-1/2"
                      style={{ background: i <= reached ? BRAND : "#e2e8f0" }}
                      aria-hidden="true"
                    />
                  )}
                  <span
                    className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                      done || current ? "text-white" : "bg-white text-slate-400 ring-2 ring-inset ring-slate-200"
                    } ${current ? "ring-4 ring-[color-mix(in_srgb,var(--accent)_30%,transparent)]" : ""}`}
                    style={done ? { background: BRAND } : current ? { background: ACCENT } : undefined}
                  >
                    {done ? <Icon name="check" className="h-4 w-4" strokeWidth={2.6} /> : i + 1}
                  </span>
                  <span className={`mt-2 px-1 text-xs font-semibold sm:text-sm ${current ? "text-slate-900" : done ? "text-slate-700" : "text-slate-400"}`}>
                    {s.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </Card>
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="text-sm">
          <CardTitle icon="home">Lot details</CardTitle>
          {deal.lotDetails.length > 0 ? (
            <dl>
              {deal.lotDetails.map((d) => (
                <div key={d.label} className="flex justify-between gap-4 border-b border-dashed border-slate-200 py-2.5 last:border-0">
                  <dt className="text-slate-500">{d.label}</dt>
                  <dd className="text-right font-semibold text-slate-900">{d.value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="flex gap-2 rounded-xl bg-slate-50 px-3.5 py-3 text-slate-600 ring-1 ring-inset ring-slate-100">
              <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
              Builder, estate and lot details will appear here once they&apos;re released to you.
            </p>
          )}
          <div className="mt-4 flex justify-between border-t border-slate-100 pt-4">
            <span className="text-slate-500">Price</span>
            <span className="text-base font-bold text-slate-900">{deal.price ? formatAud(deal.price) : "—"}</span>
          </div>
          {deal.referralFee !== null && (
            <div className="mt-3 flex items-center justify-between rounded-xl px-3.5 py-2.5" style={{ background: accentTint(14) }}>
              <span className="font-medium text-slate-700">Your referral fee</span>
              <span className="text-base font-bold text-slate-900">{formatAud(deal.referralFee)}</span>
            </div>
          )}
          {deal.holdExpiresAt && deal.stage === "hold" && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
              <Icon name="clock" className="h-3.5 w-3.5" />
              Hold until{" "}
              {new Date(deal.holdExpiresAt).toLocaleString("en-AU", { timeZone: "Australia/Brisbane", dateStyle: "medium", timeStyle: "short" })}{" "}
              (Brisbane time).
            </p>
          )}
        </Card>

        <Card className="text-sm md:col-span-2">
          <CardTitle
            icon="sparkle"
            aside={<span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-700">{pay.label}</span>}
          >
            When you get paid
          </CardTitle>
          <p className="text-slate-700">{pay.line}</p>
          {(pay.fundsReceivedOn || pay.invoiceReceivedOn || pay.paidOn) && (
            <dl className="mt-3 grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {pay.fundsReceivedOn && (<><dt className="text-slate-500">Developer&apos;s fee received</dt><dd className="font-medium">{formatPayDate(pay.fundsReceivedOn)}</dd></>)}
              {pay.invoiceReceivedOn && (<><dt className="text-slate-500">Your tax invoice received</dt><dd className="font-medium">{formatPayDate(pay.invoiceReceivedOn)}</dd></>)}
              {pay.expectedOn && pay.status === "invoiced" && (<><dt className="text-slate-500">Expected payment by</dt><dd className="font-medium">{formatPayDate(pay.expectedOn)}</dd></>)}
              {pay.paidOn && (<><dt className="text-slate-500">Paid</dt><dd className="font-medium">{formatPayDate(pay.paidOn)}{pay.paidAmount !== null && ` · ${formatAud(pay.paidAmount)} ex GST`}</dd></>)}
            </dl>
          )}
          <p className="mt-3 text-xs text-slate-500">
            <Link className="underline" href="/partner/deals/statement">Fee statement</Link>
            {" · "}
            <Link className="underline" href="/partner/agreement">Your agreement, clause 5</Link>
          </p>
        </Card>

        <Card className="text-sm">
          <CardTitle icon="message">Messages</CardTitle>
          {deal.messageFromNextKey ? (
            <blockquote className="rounded-xl rounded-tl-sm border-l-4 bg-slate-50 px-4 py-3 text-slate-800" style={{ borderColor: ACCENT }}>
              {deal.messageFromNextKey}
            </blockquote>
          ) : (
            <p className="text-slate-500">No message from us yet. We&apos;ll post updates here as the deal moves.</p>
          )}
          {deal.partnerNote && (
            <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-inset ring-slate-100">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Your note</div>
              <p className="mt-1 text-slate-700">{deal.partnerNote}</p>
            </div>
          )}
        </Card>
      </div>
    </Frame>
  );
}
