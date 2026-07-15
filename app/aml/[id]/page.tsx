import CaseForm from "./CaseForm";

export const dynamic = "force-dynamic";

export default async function AmlCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CaseForm id={id} />;
}
