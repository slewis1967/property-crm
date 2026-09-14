import ConfirmSignIn from "./ConfirmSignIn";

// PUBLIC. Where the emailed sign-in link lands. Opening it does NOT sign anyone
// in — see app/api/introducer/verify for why (mail scanners open links).
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign in — Springboard Homes",
  // The token is in this page's URL; don't hand it to anything the page loads.
  referrer: "no-referrer" as const,
  robots: { index: false, follow: false },
};

export default async function IntroducerVerifyPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const { t } = await searchParams;
  return <ConfirmSignIn token={typeof t === "string" ? t : ""} />;
}
