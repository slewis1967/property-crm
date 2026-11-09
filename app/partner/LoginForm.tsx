"use client";

/**
 * Partner sign-in: email, then the 6-digit code (or click the emailed link,
 * which lands on /api/partner/verify and skips step two).
 *
 * The "we've sent it" step is shown whether or not the address is known — the
 * server answers identically, and the UI must not undo that.
 *
 * NextKey-branded because nobody is signed in yet, so there is no firm to brand
 * it as. White-label applies from the first page after sign-in.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { NEXTKEY_BRANDING } from "../../utils/partner";

const { primaryColor: NAVY, accentColor: AMBER, logoUrl } = NEXTKEY_BRANDING;

export default function LoginForm({ initialError }: { initialError: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [notice, setNotice] = useState<string | null>(null);

  async function post(url: string, body: unknown) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { res, json: await res.json().catch(() => ({})) };
  }

  async function requestCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { res, json } = await post("/api/partner/request-code", { email });
      if (!res.ok) return setError(json.error ?? "Something went wrong. Please try again.");
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
      const { res, json } = await post("/api/partner/verify", { email, code });
      if (!res.ok) return setError(json.error ?? "That code isn't right.");
      router.push(json.redirect ?? "/partner/stock");
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const input =
    "mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-gray-400 focus:outline-none";

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
        <div className="rounded-xl border border-gray-200 bg-white p-7 shadow-sm">
          <div className="mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logoUrl && <img src={logoUrl} alt="NextKey" className="h-9 w-auto" />}
            <div className="mt-2 text-sm font-medium" style={{ color: AMBER }}>
              Partner Portal
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>
          )}

          {step === "email" ? (
            <form onSubmit={requestCode}>
              <h1 className="text-xl font-semibold" style={{ color: NAVY }}>Sign in</h1>
              <p className="mt-2 text-sm text-gray-600">
                Enter the email address your access was set up with. We&apos;ll send a one-time sign-in link and code —
                there&apos;s no password.
              </p>
              <label className="mt-5 block text-sm font-medium text-gray-700" htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={input}
                placeholder="you@yourfirm.com.au"
              />
              <button
                type="submit"
                disabled={busy || !email}
                className="mt-5 w-full rounded-lg px-4 py-2.5 font-semibold text-white disabled:opacity-50"
                style={{ background: AMBER }}
              >
                {busy ? "Sending…" : "Email me a sign-in code"}
              </button>
            </form>
          ) : (
            <form onSubmit={submitCode}>
              <h1 className="text-xl font-semibold" style={{ color: NAVY }}>Check your email</h1>
              {notice && <p className="mt-2 text-sm text-gray-600">{notice}</p>}
              <p className="mt-2 text-sm text-gray-600">Click the link in the email, or enter the 6-digit code below.</p>
              <label className="mt-5 block text-sm font-medium text-gray-700" htmlFor="code">Sign-in code</label>
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className={`${input} text-center text-2xl tracking-[0.4em]`}
                placeholder="000000"
              />
              <button
                type="submit"
                disabled={busy || code.length !== 6}
                className="mt-5 w-full rounded-lg px-4 py-2.5 font-semibold text-white disabled:opacity-50"
                style={{ background: AMBER }}
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
          Access is by invitation. If you don&apos;t have a login, contact your NextKey partner manager.
        </p>
      </div>
    </div>
  );
}
