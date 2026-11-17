import Link from "next/link";
import { redirect } from "next/navigation";
import Frame from "../../Frame";
import { has, requirePartnerPage } from "../../session";
import { assertNoForbiddenKeys, formatAud } from "../../../../utils/partner";
import { buildStatement, EMPTY_PAY_RECORD, formatPayDate, PAY_STATUS_LABELS } from "../../../../utils/partner-pay";
import { listOwnDeals, loadOwnPayRecords, settledOnOf, toDealView } from "../../../api/partner/_shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Fee statement — Partner Portal" };

/**
 * The partner's own referral fees by month (NOVA-011). Settled deals only:
 * nothing is payable before settlement (clause 5.1). Amounts are the partner's
 * own fee, never the gross or NextKey's share, and are hidden entirely on a
 * plan without the referral_fee feature.
 */
export default async function PartnerStatementPage() {
  const identity = await requirePartnerPage();
  if (!has(identity, "deals")) redirect("/partner/account");
  const showFees = has(identity, "referral_fee");

  const settled = (await listOwnDeals(identity)).filter((d) => d.stage === "settled");
  const pay = await loadOwnPayRecords(identity, settled.map((d) => d.id));
  const { months, totals } = assertNoForbiddenKeys(
    buildStatement(
      settled.map((row) => {
        const v = toDealView(row, { showFees });
        return {
          id: v.id,
          lotRef: v.lotRef,
          clientName: v.clientName,
          settledOn: settledOnOf(row),
          indicativeFee: v.referralFee,
          pay: pay.get(row.id) ?? EMPTY_PAY_RECORD,
        };
      }),
    ),
  );
  const money = (n: number | null) => (showFees ? (n !== null ? formatAud(n) : "Ask us") : "—");

  return (
    <Frame identity={identity}>
      <Link href="/partner/deals" className="text-sm text-gray-600 hover:text-gray-900">← Deals</Link>
      <h1 className="mt-3 text-2xl font-semibold text-gray-900">Fee statement</h1>
      <p className="mt-1 max-w-3xl text-sm text-gray-600">
        Your referral fees by month: settled, awaiting the developer&apos;s fee, invoiced and paid. Figures are your fee
        only, excluding GST; unpaid figures are indicative (clause 5.3). A paid fee appears in the month it was paid;
        an unpaid one in the month the sale settled.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(["awaiting_funds", "awaiting_invoice", "invoiced", "paid"] as const).map((k) => (
          <div key={k} className="rounded-xl border border-gray-200 bg-white p-3 text-sm">
            <div className="text-xs uppercase tracking-wide text-gray-500">{PAY_STATUS_LABELS[k]}</div>
            <div className="mt-1 text-lg font-semibold text-gray-900">{totals[k].count}</div>
            {showFees && <div className="text-gray-600">{formatAud(totals[k].amount)}</div>}
          </div>
        ))}
      </div>

      {months.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600">
          No settled deals yet. Fees appear here once a sale settles.
        </div>
      ) : (
        months.map((m) => (
          <section key={m.month} className="mt-6">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{m.label}</h2>
              {showFees && (
                <span className="text-sm text-gray-600">
                  Paid {formatAud(m.paidTotal)} · Not yet paid {formatAud(m.unpaidTotal)}
                </span>
              )}
            </div>
            <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-4 py-2">Lot</th>
                    <th className="px-4 py-2">Client</th>
                    <th className="px-4 py-2">Settled</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Date</th>
                    {showFees && <th className="px-4 py-2">Your fee</th>}
                  </tr>
                </thead>
                <tbody>
                  {m.rows.map((r) => (
                    <tr key={r.id} className="border-t border-gray-100">
                      <td className="px-4 py-2 font-medium">
                        <Link className="hover:underline" href={`/partner/deals/${r.id}`}>{r.lotRef ?? "—"}</Link>
                      </td>
                      <td className="px-4 py-2">{r.clientName}</td>
                      <td className="px-4 py-2">{formatPayDate(r.settledOn)}</td>
                      <td className="px-4 py-2">{r.label}</td>
                      <td className="px-4 py-2 text-gray-600">
                        {r.status === "paid" && r.pay.paidOn
                          ? `Paid ${formatPayDate(r.pay.paidOn)}`
                          : r.status === "invoiced" && r.expectedOn
                            ? `Expected by ${formatPayDate(r.expectedOn)}`
                            : "—"}
                      </td>
                      {showFees && (
                        <td className="px-4 py-2">
                          {money(r.amount)}
                          {!r.amountIsPaid && r.amount !== null && <span className="ml-1 text-xs text-gray-500">indicative</span>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </Frame>
  );
}
