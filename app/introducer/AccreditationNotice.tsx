/**
 * Tells an introducer their accreditation is running out — before it stops them.
 *
 * The submit route refuses an expired accreditation, which is the enforcement.
 * This is the part that means nobody meets that refusal as a surprise: it warns
 * for the last 30 days, and after that it says plainly what has happened and
 * what to do about it.
 *
 * SILENT WHEN THERE IS NO DATE. Every firm activated before expiries were
 * recorded has none, and "your accreditation status is unknown" is a sentence
 * that generates a support call and answers nothing.
 *
 * The SMSF competency is reported separately and never as a blocker. It lapsing
 * narrows what an introducer may discuss — it does not stop a referral, and a
 * red banner saying otherwise would have people stop working when they need not.
 */
import { daysUntil, isExpiredOn } from "../../utils/introducer-onboarding";

const WARN_WITHIN_DAYS = 30;

/** "2027-08-14" → "14 August 2027". A calendar day, printed as one. */
function fmtDay(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export default function AccreditationNotice({
  accreditationExpiresAt,
  smsfCompetencyExpiresAt,
  today,
}: {
  accreditationExpiresAt: string | null;
  smsfCompetencyExpiresAt: string | null;
  /** Passed in rather than read here, so the server decides what day it is. */
  today: string;
}) {
  const expired = isExpiredOn(accreditationExpiresAt, today);
  const left = accreditationExpiresAt ? daysUntil(accreditationExpiresAt, today) : null;
  const smsfExpired = isExpiredOn(smsfCompetencyExpiresAt, today);

  const showAccreditation = expired || (left !== null && left <= WARN_WITHIN_DAYS);
  if (!showAccreditation && !smsfExpired) return null;

  return (
    <div className="mx-auto max-w-4xl px-4 pt-4">
      {showAccreditation && (
        <div
          className={`rounded-xl border p-4 ${
            expired ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50"
          }`}
        >
          <p className={`font-semibold ${expired ? "text-red-900" : "text-amber-900"}`}>
            {expired
              ? `Your accreditation expired on ${fmtDay(accreditationExpiresAt!)}`
              : `Your accreditation expires on ${fmtDay(accreditationExpiresAt!)}`}
          </p>
          <p className={`mt-1 text-sm ${expired ? "text-red-900" : "text-amber-900"}`}>
            {expired
              ? "New referrals cannot be submitted until it is renewed. Anything already submitted is unaffected, and your drafts are saved. Please contact Springboard to renew."
              : `That is ${left} day${left === 1 ? "" : "s"} away. Contact Springboard to arrange your renewal — once it lapses, referrals cannot be submitted until it is back in place.`}
          </p>
        </div>
      )}

      {smsfExpired && (
        <div className={`rounded-xl border border-amber-300 bg-amber-50 p-4 ${showAccreditation ? "mt-3" : ""}`}>
          <p className="font-semibold text-amber-900">
            Your SMSF competency lapsed on {fmtDay(smsfCompetencyExpiresAt!)}
          </p>
          <p className="mt-1 text-sm text-amber-900">
            You can still refer clients. Until it is renewed, do not discuss self-managed super funds —
            refer any question about them straight to Springboard.
          </p>
        </div>
      )}
    </div>
  );
}
