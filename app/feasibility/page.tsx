import FeasibilityClient from "./FeasibilityClient";

export const dynamic = "force-dynamic";

/** Planning Feasibility — AI-led, Australia-wide development feasibility tool.
 * Thin server wrapper; deep-links accept ?address= to prefill from a property. */
export default async function FeasibilityPage({
  searchParams,
}: {
  searchParams: Promise<{ address?: string }>;
}) {
  const sp = await searchParams;
  return <FeasibilityClient initialAddress={sp.address ?? ""} />;
}
