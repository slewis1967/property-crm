"use client";

/**
 * One button, and pressing it is the sign-in — opening the page is not.
 *
 * Springboard-branded like the rest of app/introducer/*: an introducer only
 * ever hears the name Springboard.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

const NAVY = "#020e40";
const AMBER = "#c7894e";

export default function ConfirmSignIn({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    token ? null : "This sign-in link is incomplete. Please request a new one.",
  );

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/introducer/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return setError(json.error ?? "That sign-in link is not valid. Please request a new one.");
      router.replace(json.redirect ?? "/introducer/clients");
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
          {/* Served from /api/portal/* — that prefix already has the CF Access
              bypass, so the image loads for a signed-out visitor. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/api/portal/logo" alt="Springboard Homes" className="h-9 w-auto" />
          <div className="mt-2 text-sm font-medium" style={{ color: AMBER }}>
            Introducer Portal
          </div>
          <h1 className="mt-3 text-xl font-semibold" style={{ color: NAVY }}>Sign in</h1>
          {error ? (
            <>
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
              <Link href="/introducer" className="mt-4 inline-block text-sm underline">
                Request a new sign-in code
              </Link>
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
