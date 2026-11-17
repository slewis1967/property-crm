import Link from "next/link";
import { redirect } from "next/navigation";
import Frame from "../Frame";
import { has, requirePartnerPage } from "../session";
import { CLOSED_STAGES, formatAud, isDealStage } from "../../../utils/partner";
import { listOwnDeals, loadOwnPayRecords, toDealView, toPayView } from "../../api/partner/_shared";
import { formatPayDate, PARTNER_RESPONSE_STANDARD } from "../../../utils/partner-pay";
import { EmptyState, Icon, PageHeader, StagePill, StatTile, buttonPrimary, buttonSecondary, tableWrap, td, th, tr } from "../ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Deals — Partner Portal" };

export default async function PartnerDealsPage() {
  const identity = await requirePartnerPage();
  if (!has(identity, "deals")) redirect("/partner/account");

  const showFees = has(identity, "referral_fee");
  const rows = await listOwnDeals(identity);
  const payRecords = await loadOwnPayRecords(identity, rows.map((r) => r.id));
  const deals = rows.map((d) => ({
    ...toDealView(d, { showFees }),
    pay: toPayView(d.stage, payRecords.get(d.id), { showFees }),
  }));
  const open = deals.filter((d) => !(isDealStage(d.stage) && CLOSED_STAGES.has(d.stage)));
  const closed = deals.filter((d) => isDealStage(d.stage) && CLOSED_STAGES.has(d.stage));
  const settled = deals.filter((d) => d.stage === "settled");
  const settledFees = settled.filter((d) => d.referralFee).reduce((sum, d) => sum + (d.referralFee ?? 0), 0);

  const table = (rows: typeof deals) => (
    <div className={tableWrap}>
      <table className="w-full text-sm">
        <thead className="bg-slate-50/80">
          <tr>
            <th className={th}>Lot</th>
            <th className={th}>Client</th>
            <th className={th}>Stage</th>
            <th className={`${th} text-right`}>Price</th>
            {showFees && <th className={`${th} text-right`}>Your fee</th>}
            <th className={th}>Payment</th>
            <th className={th}>Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id} className={tr}>
              <td className={td}>
                <Link className="group flex items-center gap-3" href={`/partner/deals/${d.id}`}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 group-hover:bg-white group-hover:shadow-sm">
                    <Icon name="home" />
                  </span>
                  <span>
                    <span className="block font-semibold text-slate-900 group-hover:underline">
                      {[d.lot.suburb, d.lot.state].filter(Boolean).join(", ") || "Lot"}
                    </span>
                    <span className="block text-xs text-slate-500">{d.lotRef}</span>
                  </span>
                </Link>
              </td>
              <td className={`${td} text-slate-700`}>{d.clientName}</td>
              <td className={td}><StagePill stage={d.stage} label={d.stageLabel} /></td>
              <td className={`${td} text-right font-medium text-slate-900`}>{d.price ? formatAud(d.price) : "—"}</td>
              {showFees && <td className={`${td} text-right font-semibold`}>{d.referralFee ? formatAud(d.referralFee) : "—"}</td>}
              <td className={`${td} text-slate-700`}>
                {d.pay.label}
                {d.pay.status === "invoiced" && d.pay.expectedOn && (
                  <span className="block text-xs text-slate-500">by {formatPayDate(d.pay.expectedOn)}</span>
                )}
                {d.pay.status === "paid" && d.pay.paidOn && (
                  <span className="block text-xs text-slate-500">{formatPayDate(d.pay.paidOn)}</span>
                )}
              </td>
              <td className={`${td} text-slate-500`}>
                {new Date(d.updatedAt).toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane", day: "numeric", month: "short", year: "numeric" })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <Frame identity={identity}>
      <PageHeader
        eyebrow="Pipeline"
        title="Deals"
        icon="handshake"
        subtitle="Every hold you've requested for a client, from request to settlement."
        actions={
          <>
            <Link href="/partner/deals/statement" className={buttonSecondary}>
              Fee statement
            </Link>
            <Link href="/partner/stock" className={buttonPrimary}>
              <Icon name="grid" /> Browse stock
            </Link>
          </>
        }
      />
      {!identity.branding.whiteLabel && <p className="mb-6 text-sm text-slate-600">{PARTNER_RESPONSE_STANDARD}</p>}
      {deals.length === 0 ? (
        <EmptyState icon="handshake" title="No deals yet">
          Open a lot in <Link className="font-semibold underline" href="/partner/stock">Stock</Link> and request a hold for a client.
        </EmptyState>
      ) : (
        <>
          <div className="mb-8 grid gap-4 sm:grid-cols-3">
            <StatTile icon="clock" label="In progress" value={open.length} />
            <StatTile icon="check" label="Settled" value={settled.length} />
            {showFees ? (
              <StatTile icon="sparkle" label="Fees from settled deals" value={settledFees > 0 ? formatAud(settledFees) : "—"} tone="accent" />
            ) : (
              <StatTile icon="layers" label="Closed" value={closed.length} />
            )}
          </div>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">In progress</h2>
          {open.length ? table(open) : <p className="text-sm text-slate-600">Nothing in progress.</p>}
          {closed.length > 0 && (
            <>
              <h2 className="mb-3 mt-8 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Closed</h2>
              {table(closed)}
            </>
          )}
        </>
      )}
    </Frame>
  );
}
