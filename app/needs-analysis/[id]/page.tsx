import NeedsAnalysisForm from "./NeedsAnalysisForm";

export const dynamic = "force-dynamic";

/** NCCP Client Needs Analysis — the form for a single analysis. */
export default async function NeedsAnalysisDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <NeedsAnalysisForm id={id} />;
}
