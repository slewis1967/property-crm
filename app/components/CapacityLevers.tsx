/**
 * CapacityLevers — presentational "ways to increase borrowing capacity" list.
 *
 * Renders the quantified suggestions from `capacityLevers()` plus the required
 * disclaimer. Pure display: all the maths lives in
 * `utils/finance/capacityLevers.ts` and is unit-tested there. Shared by both
 * borrowing-calculator surfaces (War Room + opportunity scenarios).
 */

import type { CapacityLever } from "../../utils/finance/capacityLevers";

export default function CapacityLevers({
  levers,
  disclaimer,
}: {
  levers: CapacityLever[];
  disclaimer: string;
}) {
  if (levers.length === 0) return null;

  return (
    <div className="mt-4 pt-3 border-t border-gray-100">
      <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">
        Ways to increase borrowing capacity
      </div>
      <ul className="space-y-2">
        {levers.map((lever, i) => (
          <li key={i} className="text-xs text-gray-700 leading-relaxed">
            <span className="font-semibold text-gray-900">{lever.title}. </span>
            <span>{lever.impact}</span>
            {lever.note && (
              <span className="block text-[11px] text-gray-500 mt-0.5">{lever.note}</span>
            )}
          </li>
        ))}
      </ul>
      <p className="text-[11px] text-gray-400 mt-3 leading-relaxed">
        <em>{disclaimer}</em>
      </p>
    </div>
  );
}
