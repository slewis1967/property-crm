import { Suspense } from "react";
import MatchClient from "./MatchClient";

export const dynamic = "force-dynamic";

/** Lender Match — client scenario in, ranked lender shortlist out. */
export default function LenderMatchPage() {
  return (
    <Suspense fallback={<div className="px-4 py-10 text-center text-sm text-gray-500">Loading…</div>}>
      <MatchClient />
    </Suspense>
  );
}
