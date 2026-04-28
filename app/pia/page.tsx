import PiaClient from "./PiaClient";

export const dynamic = "force-static";

export default function PiaPage() {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h1 className="text-3xl font-bold">Property Investment Analysis</h1>
        <span className="text-xs text-gray-400">Phase A · single-property model</span>
      </div>
      <p className="text-gray-500 text-sm mb-6">
        Multi-year cashflow + capital growth + tax + equity model. Adjust inputs on the left to see live results.
        Phase B (multi-property portfolio comparison) and Phase C (AI-augmented commentary on each scenario) are
        on the roadmap.
      </p>
      <PiaClient />
    </div>
  );
}
