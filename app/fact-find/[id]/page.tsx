import FactFindForm from "./FactFindForm";

export const dynamic = "force-dynamic";

/** Borrower Fact Find — the form for a single fact find. */
export default async function FactFindDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FactFindForm id={id} />;
}
