"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { NEXTKEY_BRANDING } from "../../../utils/partner";

const { primaryColor: NAVY, accentColor: AMBER } = NEXTKEY_BRANDING;

/** One button. Pressing it is the sign-in; opening the page is not. */
export default function ConfirmSignIn({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(token ? null : "This sign-in link is incomplete. Request a new one.");

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/partner/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return setError(json.error ?? "That sign-in link is not valid. Please request a new one.");
      router.replace(json.redirect ?? "/partner/stock");
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
        <div className="rounded-xl border border-gray-200 bg-white p-7 shadow-sm">
          <div className="text-sm font-medium" style={{ color: AMBER }}>Partner Portal</div>
          <h1 className="mt-1 text-xl font-semibold" style={{ color: NAVY }}>Sign in</h1>
          {error ? (
            <>
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
              <Link href="/partner" className="mt-4 inline-block text-sm underline">Request a new sign-in code</Link>
            </>
          ) : (
            <>
              <p className="mt-2 text-sm text-gray-600">Press the button to finish signing in on this device.</p>
              <button
                onClick={signIn}
                disabled={busy}
                className="mt-5 w-full rounded-lg px-4 py-2.5 font-semibold text-white disabled:opacity-50"
                style={{ background: AMBER }}
              >
                {busy ? "Signing in…" : "Sign in"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
