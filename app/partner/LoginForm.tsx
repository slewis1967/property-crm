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
import { Icon, LotCover, buttonPrimary, buttonSecondary, inputClass } from "./ui";

const { primaryColor: NAVY, accentColor: AMBER, logoUrl } = NEXTKEY_BRANDING;

const POINTS: { icon: "grid" | "handshake" | "chart"; title: string; text: string }[] = [
  { icon: "grid", title: "Current stock", text: "New-build stock from builders and developers across Australia, updated as it changes." },
  { icon: "handshake", title: "Holds and deals", text: "Keep your client list, request a hold for a buyer and follow every deal to settlement." },
  { icon: "chart", title: "Research for clients", text: "Suburb reports and printable lot sheets, on plans that include them." },
];

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

  return (
    <div
      className="grid min-h-screen bg-slate-50 text-slate-900 antialiased lg:grid-cols-[1.05fr_1fr]"
      style={{ ["--brand" as string]: NAVY, ["--accent" as string]: AMBER }}
    >
      <aside className="relative hidden overflow-hidden lg:block">
        <div className="absolute inset-0"><LotCover propertyType="House" seed="partner-portal-login" className="h-full" /></div>
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/25" aria-hidden="true" />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="text-sm font-semibold uppercase tracking-[0.18em] text-white/70">Partner Portal</div>
          <div className="max-w-md">
            <h2 className="text-4xl font-semibold leading-tight tracking-tight">Stock, clients and deals in one place.</h2>
            <ul className="mt-8 space-y-5">
              {POINTS.map((p) => (
                <li key={p.title} className="flex gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/12 ring-1 ring-inset ring-white/20 backdrop-blur-sm">
                    <Icon name={p.icon} className="h-5 w-5" />
                  </span>
                  <span>
                    <span className="block font-semibold">{p.title}</span>
                    <span className="block text-sm text-white/70">{p.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="text-xs text-white/50">Access is by invitation.</div>
        </div>
      </aside>

      <main className="flex min-h-screen flex-col justify-center px-5 py-12 sm:px-10">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {logoUrl && <img src={logoUrl} alt="NextKey" className="h-10 w-auto" />}
            <div className="mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold" style={{ background: "color-mix(in srgb, var(--accent) 16%, white)", color: "color-mix(in srgb, var(--accent) 70%, black)" }}>
              <Icon name="lock" className="h-3.5 w-3.5" /> Partner Portal
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200/80 bg-white p-7 shadow-[0_24px_48px_-24px_rgba(15,23,42,0.25)] sm:p-9">
            {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">{error}</div>}

            {step === "email" ? (
              <form onSubmit={requestCode}>
                <h1 className="text-2xl font-semibold tracking-tight" style={{ color: NAVY }}>Sign in</h1>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  Enter the email address your access was set up with. We&apos;ll send a one-time sign-in link and code.
                  There&apos;s no password.
                </p>
                <label className="mt-6 block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="email">Email address</label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={`${inputClass} mt-1.5`}
                  placeholder="you@yourfirm.com.au"
                />
                <button type="submit" disabled={busy || !email} className={`${buttonPrimary} mt-6 w-full py-3`}>
                  {busy ? "Sending…" : "Email me a sign-in code"}
                  {!busy && <Icon name="arrow-right" />}
                </button>
              </form>
            ) : (
              <form onSubmit={submitCode}>
                <h1 className="text-2xl font-semibold tracking-tight" style={{ color: NAVY }}>Check your email</h1>
                {notice && <p className="mt-2 text-sm text-slate-600">{notice}</p>}
                <p className="mt-2 text-sm text-slate-600">Click the link in the email, or enter the 6-digit code below.</p>
                <label className="mt-6 block text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="code">Sign-in code</label>
                <input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className={`${inputClass} mt-1.5 py-3 text-center font-mono text-2xl tracking-[0.5em]`}
                  placeholder="000000"
                />
                <button type="submit" disabled={busy || code.length !== 6} className={`${buttonPrimary} mt-6 w-full py-3`}>
                  {busy ? "Checking…" : "Sign in"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStep("email");
                    setCode("");
                    setNotice(null);
                  }}
                  className={`${buttonSecondary} mt-3 w-full`}
                >
                  Use a different email
                </button>
              </form>
            )}
          </div>
          <p className="mt-6 px-2 text-center text-xs leading-relaxed text-slate-500">
            Access is by invitation. If you don&apos;t have a login, contact your NextKey partner manager.
          </p>
        </div>
      </main>
    </div>
  );
}
