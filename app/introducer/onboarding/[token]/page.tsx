import type { Metadata } from "next";
import { findByToken } from "@/utils/introducer-onboarding-db";
import { roadmapFor, roadmapProgress, onboardingTablesMissing } from "@/utils/introducer-onboarding";
import Roadmap from "./Roadmap";

/**
 * PUBLIC page — the applicant's view of their own onboarding.
 *
 * Reached with the raw onboarding token in the path. `/introducer/*` already has
 * a Cloudflare Access bypass (isPublicIntroducerRoute in proxy.ts), so this
 * needs no new Access app — but it also means the path is fetchable by anyone,
 * which is why the token is the only credential and nothing here is rendered
 * without resolving it first.
 *
 * Deliberately shows no navigation into the portal proper: an applicant is not
 * an introducer yet, and the portal will refuse them anyway. Giving them a link
 * to a door that won't open is just a support call.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your accreditation — Springboard Homes",
  robots: { index: false, follow: false },
};

export default async function OnboardingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let result: Awaited<ReturnType<typeof findByToken>>;
  try {
    result = await findByToken(decodeURIComponent(token));
  } catch (err) {
    if (onboardingTablesMissing(err)) {
      return (
        <Shell>
          <h1 className="text-xl font-semibold" style={{ color: "#020e40" }}>
            Not quite ready
          </h1>
          <p className="mt-3 text-sm text-gray-600">
            Accreditation is not switched on yet. Nothing is wrong with your link — please try again
            shortly.
          </p>
        </Shell>
      );
    }
    throw err;
  }

  if (!result.ok) {
    // One page for both failures, worded for the likelier cause. We do not
    // distinguish "no such token" from "that person was withdrawn": an unknown
    // caller holding a link should not learn anything about who else exists.
    const expired = result.reason === "expired";
    return (
      <Shell>
        <h1 className="text-xl font-semibold" style={{ color: "#020e40" }}>
          {expired ? "This link has expired" : "We can’t open this link"}
        </h1>
        <p className="mt-3 text-sm text-gray-600">
          {expired
            ? "Accreditation links are time-limited. Ask Springboard to send you a fresh one and you’ll pick up exactly where you left off — nothing you’ve already completed is lost."
            : "Check you’ve copied the whole link from the email, including everything after the last slash. If it still doesn’t open, ask Springboard to reissue it."}
        </p>
      </Shell>
    );
  }

  const app = result.application;
  const steps = roadmapFor(app.state);
  const progress = roadmapProgress(app.state);

  return (
    <Shell>
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-500">
        Introducer accreditation
      </p>
      <h1 className="mt-1 text-2xl font-semibold" style={{ color: "#020e40" }}>
        {app.legal_name}
      </h1>
      {app.firm_name ? <p className="text-sm text-gray-600">{app.firm_name}</p> : null}

      {app.state === "withdrawn" ? (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">This application has been stopped.</p>
          <p className="mt-1">
            Nothing further happens on it. If you think that’s a mistake, contact Springboard.
          </p>
        </div>
      ) : (
        <div className="mt-6">
          <div className="flex items-baseline justify-between">
            <p className="text-sm text-gray-600">
              {progress === 100
                ? "You’re accredited — everything below is complete."
                : "Here’s where you are. We’ll email you each time a step opens."}
            </p>
            <span className="text-xs tabular-nums text-gray-500">{progress}%</span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${progress}%`, backgroundColor: "#c7894e" }}
            />
          </div>
        </div>
      )}

      <Roadmap steps={steps} accreditationNo={app.accreditation_no} />

      <p className="mt-8 border-t border-gray-200 pt-4 text-xs text-gray-500">
        This link is personal to you. Please don’t forward it — anyone holding it can see your
        progress.
      </p>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/api/portal/logo" alt="Springboard Homes" className="h-7 w-auto" />
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-10">{children}</main>
    </div>
  );
}
