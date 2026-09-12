import Link from "next/link";
import { redirect } from "next/navigation";
import Frame from "../Frame";
import { has, requirePartnerPage } from "../session";
import { CLOSED_STAGES, formatAud, isDealStage } from "../../../utils/partner";
import { listOwnDeals, toDealView } from "../../api/partner/_shared";

export const dynamic = "force-dynamic";
export const metadata = { title: "Deals — Partner Portal" };

export default async function PartnerDealsPage() {
  const identity = await requirePartnerPage();
  if (!has(identity, "deals")) redirect("/partner/account");

  const showFees = has(identity, "referral_fee");
  const deals = (await listOwnDeals(identity)).map((d) => toDealView(d, { showFees }));
  const open = deals.filter((d) => !(isDealStage(d.stage) && CLOSED_STAGES.has(d.stage)));
  const closed = deals.filter((d) => isDealStage(d.stage) && CLOSED_STAGES.has(d.stage));
  const settledFees = deals
    .filter((d) => d.stage === "settled" && d.referralFee)
    .reduce((sum, d) => sum + (d.referralFee ?? 0), 0);

  const table = (rows: typeof deals) => (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-2">Lot</th>
            <th className="px-4 py-2">Client</th>
            <th className="px-4 py-2">Stage</th>
            <th className="px-4 py-2">Price</th>
            {showFees && <th className="px-4 py-2">Your fee</th>}
            <th className="px-4 py-2">Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.id} className="border-t border-gray-100">
              <td className="px-4 py-2 font-medium">
                <Link className="hover:underline" href={`/partner/deals/${d.id}`}>
                  {d.lotRef} · {[d.lot.suburb, d.lot.state].filter(Boolean).join(", ")}
                </Link>
              </td>
              <td className="px-4 py-2">{d.clientName}</td>
              <td className="px-4 py-2">{d.stageLabel}</td>
              <td className="px-4 py-2">{d.price ? formatAud(d.price) : "—"}</td>
              {showFees && <td className="px-4 py-2">{d.referralFee ? formatAud(d.referralFee) : "—"}</td>}
              <td className="px-4 py-2 text-gray-500">
                {new Date(d.updatedAt).toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane" })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <Frame identity={identity}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-semibold text-gray-900">Deals</h1>
        {showFees && settledFees > 0 && (
          <div className="text-sm text-gray-600">Settled referral fees: <strong>{formatAud(settledFees)}</strong></div>
        )}
      </div>
      {deals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600">
          No deals yet. Open a lot in <Link className="underline" href="/partner/stock">Stock</Link> and request a hold for a client.
        </div>
      ) : (
        <>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-gray-500">In progress</h2>
          {open.length ? table(open) : <p className="text-sm text-gray-600">Nothing in progress.</p>}
          {closed.length > 0 && (
            <>
              <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-gray-500">Closed</h2>
              {table(closed)}
            </>
          )}
        </>
      )}
    </Frame>
  );
}
