import BuildersClient from "./BuildersClient";
import ProspectBuildersClient from "./ProspectBuildersClient";

export const dynamic = "force-dynamic";

export default function BuildersPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Builders</h1>
        <p className="text-sm text-gray-500 mt-1">
          Prospects we&apos;re signing marketing agreements with, then the builders we receive stock from.
        </p>
      </div>
      <ProspectBuildersClient />
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-800">Stock builders</h2>
        <p className="text-sm text-gray-500 mt-1">
          Auto-detected from inbound emails or onboarded from prospects. Review drafts, set canonical names + aliases,
          mark active/inactive. Extracted properties group by canonical name.
        </p>
      </div>
      <BuildersClient />
    </div>
  );
}
