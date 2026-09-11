import ConfirmSignIn from "./ConfirmSignIn";

// PUBLIC. Where the emailed sign-in link lands. It does NOT sign anyone in by
// being opened — see app/api/partner/verify for why (mail scanners open links).
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign in — Partner Portal",
  // The token is in this page's URL; don't hand it to anything this page loads.
  referrer: "no-referrer" as const,
  robots: { index: false, follow: false },
};

export default async function PartnerVerifyPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return <ConfirmSignIn token={typeof t === "string" ? t : ""} />;
}
