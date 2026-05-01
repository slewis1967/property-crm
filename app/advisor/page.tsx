import AdvisorClient from "./AdvisorClient";

export const dynamic = "force-dynamic";

export default function AdvisorPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <span>🎩</span> Veteran Advisor
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Weekly recommendations from a 30-year property-marketing veteran + senior AI engineer.
          Focus: AI/CRM improvement based on observed signals from your pipeline.
        </p>
      </div>
      <AdvisorClient />
    </div>
  );
}
