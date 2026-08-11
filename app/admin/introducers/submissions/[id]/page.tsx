import SubmissionReview from "./SubmissionReview";

// STAFF page — behind Cloudflare Access. The super-admin-only controls are
// resolved from the API response (`viewer_is_super_admin`) rather than from a
// prop, so the thing that renders the buttons and the thing that authorises them
// read the same source.
export const dynamic = "force-dynamic";

export const metadata = { title: "Referral review — NextKey CRM" };

export default async function SubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SubmissionReview id={id} />;
}
