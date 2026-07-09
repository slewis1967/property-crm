import ProspectingClient from "./ProspectingClient";

export const dynamic = "force-dynamic";

/** Region Prospecting — comb a region for parcels with subdivision headroom,
 * then hand a selected candidate to the Planning Feasibility tool. */
export default function ProspectingPage() {
  return <ProspectingClient />;
}
