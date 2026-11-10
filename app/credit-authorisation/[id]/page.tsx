import CreditAuthorisationForm from "./CreditAuthorisationForm";

export const dynamic = "force-dynamic";

/** Credit File Authorisation — the form for a single authorisation. */
export default async function CreditAuthorisationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CreditAuthorisationForm id={id} />;
}
