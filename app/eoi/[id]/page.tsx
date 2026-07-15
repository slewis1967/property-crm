import EoiForm from "./EoiForm";

export const dynamic = "force-dynamic";

export default async function EoiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EoiForm id={id} />;
}
