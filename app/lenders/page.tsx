import LendersClient from "./LendersClient";

export const dynamic = "force-dynamic";

/** Lender Policy — the searchable library of published AU lending policy. */
export default function LendersPage() {
  return <LendersClient />;
}
