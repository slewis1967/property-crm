import LenderDetailClient from "./LenderDetailClient";

export const dynamic = "force-dynamic";

export default async function LenderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LenderDetailClient lenderId={id} />;
}
