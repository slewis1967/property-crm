import { EMPTY_PAY_RECORD, introducerPayLine, type PayRecord, type StageKind } from "../../../../utils/partner-pay";

/**
 * NOVA-011, Springboard-branded. Rendered ONLY when introducerPayTimingEnabled()
 * is true, which needs YLA's written clause-7 approval of this wording and
 * Sean's sign-off (INTRODUCER_PAY_WORDING_APPROVAL in utils/partner-pay.ts).
 * No amounts: introducer fees are free text on the application and are shown
 * in their agreement, not here.
 */
export default function PayTiming({ stage, record }: { stage: string | null; record: PayRecord | null }) {
  const kind: StageKind = stage === "settled" ? "settled" : stage === "not_proceeding" ? "closed" : "open";
  const r = record ?? EMPTY_PAY_RECORD;
  const pl = introducerPayLine(kind, r);
  return (
    <section className="mt-5 rounded-xl border border-gray-200 bg-white p-5 text-sm" aria-labelledby="pay-timing">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="pay-timing" className="font-semibold" style={{ color: "#020e40" }}>When you get paid</h2>
        <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium">{pl.label}</span>
      </div>
      <p className="mt-2 text-gray-700">{pl.line}</p>
    </section>
  );
}
