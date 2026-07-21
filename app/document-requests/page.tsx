import DocumentRequestsClient from "./DocumentRequestsClient";

// AUTHED page (behind Cloudflare Access) — the rep side of the client document
// portal. Reps create a document request for a borrower, copy or email the
// upload link, and watch completeness before submitting to YLA.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Client documents — NextKey",
};

export default function DocumentRequestsPage() {
  return <DocumentRequestsClient />;
}
