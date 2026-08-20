"use client";

/**
 * New referral, and new full pack — the same first page.
 *
 * Both start with who the client is, because both need it and because a Tier 2
 * introducer should not have to work out which form they are on before they can
 * type a name. What differs is what happens at the bottom:
 *
 *   referral  Two ways out: save a draft (private to the introducer, editable,
 *             nothing happens) or submit (locked, reviewed by us). The
 *             distinction is stated in plain words next to the buttons, because
 *             "submit" here is a one-way door and a form that doesn't say so is
 *             a form people press by accident.
 *
 *   full      One way out: continue to the Needs Analysis. There is deliberately
 *             no submit button here — a pack cannot be submitted until that
 *             document is finished, and offering a button that can only fail is
 *             a lie about how far along they are.
 *
 * The consent tick is required to submit but not to save a draft or to continue
 * — the confirmation belongs to the moment the details are actually handed over,
 * which for a pack is several screens away.
 */
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ReferralFields, { type FieldValues } from "../../ReferralFields";
import type { IntroducerPackType } from "../../../../utils/introducer";

export default function NewReferralForm({
  packType = "referral",
  editable,
  consentStatement,
}: {
  packType?: IntroducerPackType;
  editable: string[];
  consentStatement: string;
}) {
  const router = useRouter();
  const isPack = packType === "full";
  const [values, setValues] = useState<FieldValues>({});
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState<null | "draft" | "submit" | "continue">(null);
  const [error, setError] = useState<string | null>(null);

  function set(key: string, value: string) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  /** Create the row. Returns its id, or null having already shown the error. */
  async function createDraft(): Promise<string | null> {
    const created = await fetch("/api/introducer/clients", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...values, pack_type: packType }),
    });
    const json = await created.json();
    if (!created.ok) {
      setError(json.error ?? "Could not save. Please try again.");
      return null;
    }
    return json.client.id as string;
  }

  async function save(mode: "draft" | "submit" | "continue") {
    setBusy(mode);
    setError(null);
    try {
      const id = await createDraft();
      if (!id) return;

      // A pack's next screen is the Needs Analysis, not the referral detail —
      // the whole point of choosing it was that there is more to do.
      if (mode === "continue") {
        router.push(`/introducer/clients/${id}/needs-analysis`);
        router.refresh();
        return;
      }

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
      <Link
        href={isPack ? "/introducer/clients/new" : "/introducer/clients"}
        className="text-sm text-gray-600 hover:text-gray-900"
      >
        ← {isPack ? "Back to the options" : "Back to your referrals"}
      </Link>

      <h1 className="mt-3 text-2xl font-semibold text-gray-900">
        {isPack ? "New submission pack" : "New referral"}
      </h1>
      <p className="mt-1 text-sm text-gray-600">
        {isPack
          ? "Just enough to get started — who your client is and how to reach them. Their situation, income and finances are all captured on the Needs Analysis next, and you can stop and come back to it any time before you submit."
          : "Tell us about your client."}{" "}
        Fields marked <span className="text-red-600">*</span> are needed before you can submit.
      </p>

      {isPack && (
        <ol className="mt-5 flex flex-wrap gap-x-2 gap-y-1 text-xs text-gray-500">
          <PackStep n={1} label="Client details" current />
          <PackStep n={2} label="Needs Analysis" />
          <PackStep n={3} label="Consent and submit" last />
        </ol>
      )}

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
        <ReferralFields values={values} editable={editable} onChange={set} packType={packType} />
      </div>

      {isPack ? (
        <div className="mt-5 rounded-xl border border-gray-200 bg-white p-5">
          <p className="text-sm leading-relaxed text-gray-700">
            Next you&apos;ll complete the Client Needs Analysis with your client — their
            situation, income, assets, liabilities and living expenses. It saves as you go, and it
            is the document they sign.
          </p>
          <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Nothing reaches Springboard or your client yet. That happens when you submit the
            finished pack — and at that point it goes straight through to assessment and locks.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={() => save("continue")}
              disabled={busy !== null}
              className="rounded-lg px-5 py-2.5 font-semibold text-white disabled:opacity-50"
              style={{ background: "#c7894e" }}
            >
              {busy === "continue" ? "Saving…" : "Continue to the Needs Analysis"}
            </button>
            <button
              onClick={() => save("draft")}
              disabled={busy !== null}
              className="rounded-lg border border-gray-300 px-5 py-2.5 font-medium text-gray-700 disabled:opacity-50"
            >
              {busy === "draft" ? "Saving…" : "Save and finish later"}
            </button>
          </div>
        </div>
      ) : (
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
      )}
    </div>
  );
}

/** The three-step rail across the top of a pack. Cosmetic; the server decides. */
export function PackStep({
  n,
  label,
  current = false,
  done = false,
  last = false,
}: {
  n: number;
  label: string;
  current?: boolean;
  done?: boolean;
  last?: boolean;
}) {
  return (
    <li className={`flex items-center gap-1.5 ${current ? "font-semibold text-gray-900" : ""}`}>
      <span
        className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
          current ? "bg-gray-900 text-white" : done ? "bg-green-600 text-white" : "bg-gray-200 text-gray-600"
        }`}
      >
        {done ? "✓" : n}
      </span>
      {label}
      {!last && (
        <span aria-hidden className="ml-1 text-gray-300">
          →
        </span>
      )}
    </li>
  );
}
