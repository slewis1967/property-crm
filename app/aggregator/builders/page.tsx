import BuildersClient from "./BuildersClient";

export const dynamic = "force-dynamic";

export default function BuildersPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Builders</h1>
        <p className="text-sm text-gray-500 mt-1">
          Auto-detected from inbound emails. Review drafts, set canonical names + aliases,
          mark active/inactive. Extracted properties group by canonical name.
        </p>
      </div>
      <BuildersClient />
    </div>
  );
}
