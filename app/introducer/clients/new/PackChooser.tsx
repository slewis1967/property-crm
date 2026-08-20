/**
 * Which of the two things am I sending?
 *
 * A Tier 1 firm sees one card and a short line saying the other exists —
 * NOT a hidden option and not a greyed-out button that does nothing when
 * pressed. Hiding it means an introducer who has been told about Tier 2 in
 * training goes looking for a screen that appears not to exist; a dead button
 * reads as a bug. Naming it and saying what it needs is the only version that
 * answers the question the introducer actually has.
 *
 * The tier comes from the session, server-side (see requireIntroducerPage), so
 * this is presentation. The create route refuses a full pack from a Tier 1 firm
 * regardless of what the browser sends, and a database trigger refuses it again.
 */
import Link from "next/link";

const AMBER = "#c7894e";

export default function PackChooser({ canSendFullPack }: { canSendFullPack: boolean }) {
  return (
    <div>
      <Link href="/introducer/clients" className="text-sm text-gray-600 hover:text-gray-900">
        ← Back to your referrals
      </Link>

      <h1 className="mt-3 text-2xl font-semibold text-gray-900">New referral</h1>
      <p className="mt-1 text-sm text-gray-600">
        {canSendFullPack
          ? "Two ways to send us a client. Pick the one that matches what you've done with them."
          : "Tell us about your client and we'll take it from there."}
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card
          href="/introducer/clients/new?pack=referral"
          title="Referral"
          lead="Their details, and what they're trying to do."
          minutes="About 5 minutes"
          available
          points={[
            "Name, contact details and rough circumstances",
            "The signed Referral Consent and Privacy Form",
            "We contact your client and take it from there",
          ]}
        />

        <Card
          href="/introducer/clients/new?pack=full"
          title="Full submission pack"
          lead="The complete Needs Analysis, ready to assess."
          minutes="Allow 30–45 minutes with your client"
          available={canSendFullPack}
          requirement="Tier 2 accreditation"
          points={[
            "Everything in a referral, plus the full Client Needs Analysis",
            "Income, employment, assets, liabilities and living expenses",
            "Your client signs it, and is emailed their document upload link",
          ]}
        />
      </div>

      {canSendFullPack && (
        <p className="mt-6 text-xs leading-relaxed text-gray-500">
          A full pack goes straight through to assessment — there&apos;s no review step where we can
          hand it back for a correction, and it locks the moment you submit it. If you haven&apos;t
          sat down with the client and their numbers yet, send a referral instead.
        </p>
      )}
    </div>
  );
}

function Card({
  href,
  title,
  lead,
  minutes,
  points,
  available,
  requirement,
}: {
  href: string;
  title: string;
  lead: string;
  minutes: string;
  points: string[];
  available: boolean;
  requirement?: string;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
        {!available && requirement && (
          <span className="shrink-0 rounded-full bg-gray-100 px-2.5 py-1 text-[11px] font-medium text-gray-600">
            {requirement}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-gray-600">{lead}</p>
      <p className="mt-1 text-xs text-gray-500">{minutes}</p>

      <ul className="mt-4 space-y-1.5 text-sm text-gray-700">
        {points.map((p) => (
          <li key={p} className="flex gap-2">
            <span aria-hidden className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-gray-400" />
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </>
  );

  if (!available) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-5">
        {body}
        <p className="mt-4 text-sm text-gray-600">
          Your firm is accredited at Tier 1, which covers referrals. Contact Springboard if
          you&apos;d like to be assessed at Tier 2.
        </p>
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 transition hover:border-gray-400 hover:shadow-sm"
    >
      {body}
      <span className="mt-5 inline-block self-start rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: AMBER }}>
        Start
      </span>
    </Link>
  );
}
