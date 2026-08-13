"use client";

/**
 * Introducer sign-in.
 *
 * Two steps, one screen: enter an email, then enter the 6-digit code that
 * arrives (or just click the link in the same email, which lands on
 * /api/introducer/verify and skips step two entirely).
 *
 * The "we've sent it" message is shown whether or not the address is known —
 * the server answers identically either way, and the UI must not undo that by
 * behaving differently. See the note in /api/introducer/request-code.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginForm({ initialError }: { initialError: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [notice, setNotice] = useState<string | null>(null);

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/introducer/request-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Something went wrong. Please try again.");
        return;
      }
      setNotice(json.message);
      setStep("code");
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/introducer/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "That code isn't right.");
        return;
      }
      router.push(json.redirect ?? "/introducer/clients");
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
          <div className="mb-6">
            {/* Served from /api/portal/* — that prefix already has the CF Access
                bypass, so the image loads for a signed-out visitor. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/api/portal/logo" alt="Springboard Homes" className="h-9 w-auto" />
            <div className="mt-2 text-sm font-medium" style={{ color: "#c7894e" }}>
              Introducer Portal
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </div>
          )}

          {step === "email" ? (
            <form onSubmit={requestCode}>
              <h1 className="text-xl font-semibold text-gray-900">Sign in</h1>
              <p className="mt-2 text-sm text-gray-600">
                Enter the email address your access was set up with. We&apos;ll send you a one-time
                sign-in link and code — there&apos;s no password to remember.
              </p>
              <label className="mt-5 block text-sm font-medium text-gray-700" htmlFor="email">
                Email address
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-gray-400 focus:outline-none"
                placeholder="you@yourfirm.com.au"
              />
              <button
                type="submit"
                disabled={busy || !email}
                className="mt-5 w-full rounded-lg px-4 py-2.5 font-semibold text-white disabled:opacity-50"
                style={{ background: "#c7894e" }}
              >
                {busy ? "Sending…" : "Email me a sign-in code"}
              </button>
            </form>
          ) : (
            <form onSubmit={submitCode}>
              <h1 className="text-xl font-semibold text-gray-900">Check your email</h1>
              {notice && <p className="mt-2 text-sm text-gray-600">{notice}</p>}
              <p className="mt-2 text-sm text-gray-600">
                Click the link in the email, or enter the 6-digit code below.
              </p>
              <label className="mt-5 block text-sm font-medium text-gray-700" htmlFor="code">
                Sign-in code
              </label>
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-center text-2xl tracking-[0.4em] text-gray-900 focus:border-gray-400 focus:outline-none"
                placeholder="000000"
              />
              <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="mt-5 w-full rounded-lg px-4 py-2.5 font-semibold text-white disabled:opacity-50"
                style={{ background: "#c7894e" }}
              >
                {busy ? "Checking…" : "Sign in"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setNotice(null);
                }}
                className="mt-3 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
              >
                Use a different email
              </button>
            </form>
          )}
        </div>

        <p className="mt-6 px-2 text-center text-xs leading-relaxed text-gray-500">
          Only submit a client&apos;s details where you have their consent to pass them to Springboard
          Homes. If you don&apos;t have portal access, contact your Springboard manager.
        </p>
      </div>
    </div>
  );
}
