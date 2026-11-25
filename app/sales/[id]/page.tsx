import SaleDetail from "./SaleDetail";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sale" };

export default async function SalePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SaleDetail id={id} />;
}
