"use client";

/**
 * New referral.
 *
 * Two ways out: save a draft (private to the introducer, editable, nothing
 * happens) or submit (locked, reviewed by us). The distinction is stated in
 * plain words next to the buttons, because "submit" here is a one-way door and
 * a form that doesn't say so is a form people press by accident.
 *
 * The consent tick is required to submit but not to save a draft — the
 * confirmation belongs to the moment the details are actually handed over.
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReferralFields, { type FieldValues } from "../../ReferralFields";

export default function NewReferralForm({
  editable,
  consentStatement,
}: {
  editable: string[];
  consentStatement: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<FieldValues>({});
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState<null | "draft" | "submit">(null);
  const [error, setError] = useState<string | null>(null);

  function set(key: string, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function save(mode: "draft" | "submit") {
    setBusy(mode);
    setError(null);
    try {
      const created = await fetch("/api/introducer/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const createdJson = await created.json();
      if (!created.ok) {
        setError(createdJson.error ?? "Could not save. Please try again.");
        return;
      }
      const id = createdJson.client.id as string;

      if (mode === "draft") {
        router.push(`/introducer/clients/${id}`);
        router.refresh();
        return;
      }

      const submitted = await fetch(`/api/introducer/clients/${id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true }),
      });
      const submittedJson = await submitted.json();
      if (!submitted.ok) {
        // The draft exists — send them to it so nothing they typed is lost, and
        // let the detail page show what's still missing.
        setError(`${submittedJson.error ?? "Could not submit."} Your draft has been saved.`);
        router.push(`/introducer/clients/${id}`);
        return;
      }
      router.push(`/introducer/clients/${id}?submitted=1`);
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <Link href="/introducer/clients" className="text-sm text-gray-600 hover:text-gray-900">
        ← Back to your referrals
      </Link>

      <h1 className="mt-3 text-2xl font-semibold text-gray-900">New referral</h1>
      <p className="mt-1 text-sm text-gray-600">
        Tell us about your client. Fields marked <span className="text-red-600">*</span> are needed
        before you can submit.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
        <ReferralFields values={values} editable={editable} onChange={set} />
      </div>

      <div className="mt-5 rounded-xl border border-gray-200 bg-white p-5">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            className="mt-1 h-4 w-4"
          />
          <span className="text-sm leading-relaxed text-gray-700">{consentStatement}</span>
        </label>

        {/* Said here rather than only at the point of refusal. The upload lives
            on the referral, which does not exist until this form is saved — so
            the honest thing is to warn now and take them straight to it. */}
        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          You will be asked to attach the signed Referral Consent and Privacy Form on the next screen.
          The referral cannot be submitted until it is attached.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            onClick={() => save("submit")}
            disabled={busy !== null || !consent}
            className="rounded-lg px-5 py-2.5 font-semibold text-white disabled:opacity-50"
            style={{ background: "#c7894e" }}
          >
            {busy === "submit" ? "Submitting…" : "Submit referral"}
          </button>
          <button
            onClick={() => save("draft")}
            disabled={busy !== null}
            className="rounded-lg border border-gray-300 px-5 py-2.5 font-medium text-gray-700 disabled:opacity-50"
          >
            {busy === "draft" ? "Saving…" : "Save as draft"}
          </button>
        </div>

        <p className="mt-4 text-xs leading-relaxed text-gray-500">
          A draft stays private to you and can be changed freely. Once you submit, the details are
          locked and can only be changed if Springboard authorises it — so the record we assess is
          exactly what you sent.
        </p>
      </div>
    </div>
  );
}
