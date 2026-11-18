"use client";

/**
 * The signed-in portal frame: header in the firm's branding (NextKey's unless
 * they hold white_label), navigation limited to the features their plan
 * includes, a light/dark toggle, and sign-out.
 *
 * Branding arrives already resolved and validated from the session
 * (resolveBranding) — colours are 6-digit hex and the logo is https — so it can
 * go straight into style attributes. They're published as --brand / --accent so
 * everything below (app/partner/ui.tsx, partner-theme.css) picks them up
 * without prop-drilling.
 *
 * Theme: follows the OS until the viewer picks one; the pick is kept in
 * localStorage (a per-viewer convenience, so a failed read just means "system").
 *
 * Sign-out POSTs so the server revokes the session too; clearing the cookie in
 * the browser alone would leave a valid token behind.
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { PartnerBranding } from "../../utils/partner";
import { Icon, initials } from "./ui";
import { PARTNER_RESPONSE_STANDARD } from "../../utils/partner-pay";
import "./partner-theme.css";

export type NavItem = { href: string; label: string; icon: Parameters<typeof Icon>[0]["name"]; badge?: string };

type Theme = "system" | "light" | "dark";
const THEME_KEY = "nk-partner-theme";

function readSavedTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    const saved = readSavedTheme();
    // Reading a per-viewer preference after hydration; the server can't know it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (saved !== "system") setTheme(saved);
  }, []);
  const cycle = () => {
    const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const effectiveDark = theme === "dark" || (theme === "system" && prefersDark);
    const next: Theme = effectiveDark ? "light" : "dark";
    setTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* storage blocked: the choice lasts for this page only */
    }
  };
  return [theme, cycle];
}

export default function PortalShell({
  branding,
  firmName,
  userName,
  nav,
  children,
}: {
  branding: PartnerBranding;
  firmName: string;
  userName: string | null;
  nav: NavItem[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const [theme, cycleTheme] = useTheme();

  async function signOut() {
    setBusy(true);
    try {
      await fetch("/api/partner/logout", { method: "POST" });
    } finally {
      router.push("/partner");
      router.refresh();
    }
  }

  return (
    <div
      className="pp-root relative min-h-screen overflow-x-clip bg-slate-50 text-slate-900 antialiased"
      data-theme={theme === "system" ? undefined : theme}
      style={{ ["--brand" as string]: branding.primaryColor, ["--accent" as string]: branding.accentColor }}
    >
      <header
        className="sticky top-0 z-[1100] shadow-[0_8px_24px_-12px_rgba(15,23,42,0.45)]"
        style={{ background: `linear-gradient(100deg, color-mix(in srgb, var(--brand) 90%, black) 0%, var(--brand) 50%, color-mix(in srgb, var(--brand) 85%, white) 100%)` }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pt-3 sm:px-6">
          <Link href="/partner/home" className="flex min-w-0 items-center gap-3">
            {branding.logoUrl ? (
              <span className="flex h-10 items-center rounded-xl px-3 shadow-sm" style={{ background: "#fff" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={branding.logoUrl} alt={branding.displayName} className="h-7 w-auto" />
              </span>
            ) : (
              <span className="text-lg font-semibold text-white">{branding.displayName}</span>
            )}
            <span className="hidden min-w-0 border-l border-white/20 pl-3 sm:block">
              <span className="block text-sm font-semibold text-white">Partner Portal</span>
              {!branding.whiteLabel && <span className="block truncate text-xs text-white/60">{firmName}</span>}
            </span>
          </Link>
          <div className="flex items-center gap-2">
            {userName && (
              <span className="hidden items-center gap-2 rounded-full bg-white/10 py-1 pl-1 pr-3 text-sm text-white/90 md:flex">
                <span className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: "var(--accent)" }}>
                  {initials(userName)}
                </span>
                {userName}
              </span>
            )}
            <button
              onClick={cycleTheme}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/25 text-white/90 transition hover:bg-white/10 hover:text-white"
              aria-label="Switch between light and dark mode"
              title="Light / dark"
            >
              <Icon name="sun" className="pp-theme-sun h-4 w-4" />
              <Icon name="moon" className="pp-theme-moon h-4 w-4" />
            </button>
            <button
              onClick={signOut}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/25 px-3 py-1.5 text-sm font-medium text-white/90 transition hover:bg-white/10 hover:text-white disabled:opacity-50"
            >
              <Icon name="logout" className="h-4 w-4" />
              <span className="hidden sm:inline">Sign out</span>
            </button>
          </div>
        </div>
        <nav className="mx-auto mt-2 flex max-w-6xl gap-1 overflow-x-auto px-4 [scrollbar-width:none] sm:px-6 [&::-webkit-scrollbar]:hidden" aria-label="Portal">
          {nav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex shrink-0 items-center gap-2 rounded-t-xl px-3.5 pb-3 pt-2 text-sm font-medium transition ${
                  active ? "bg-slate-50 text-slate-900" : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon name={item.icon} className="h-4 w-4" />
                {item.label}
                {item.badge && (
                  <span
                    className="rounded-full px-1.5 py-px text-[9px] font-bold uppercase tracking-wider text-white"
                    style={{ background: "linear-gradient(90deg, var(--accent), #a855f7)" }}
                  >
                    {item.badge}
                  </span>
                )}
                {active && <span className="absolute inset-x-3 top-0 h-0.5 rounded-full" style={{ background: "var(--accent)" }} />}
              </Link>
            );
          })}
        </nav>
      </header>

      <div
        className="pointer-events-none absolute inset-x-0 top-[104px] h-64"
        style={{ background: "linear-gradient(180deg, color-mix(in srgb, var(--brand) 6%, var(--pp-bg)) 0%, var(--pp-bg) 100%)" }}
        aria-hidden="true"
      />
      <main key={pathname} className="pp-page relative mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {children}
      </main>
      <footer className="relative mx-auto max-w-6xl px-4 pb-12 sm:px-6">
        <div className="flex gap-3 rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 text-xs leading-relaxed text-slate-500">
          <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <p>
            Prices, availability and rent estimates are supplied by developers, are indicative only and can change
            without notice. Confirm with us before quoting a client. Builder, estate and lot details are released once a
            hold is in place.
            {/* NextKey's own promise: not shown under a partner's white-label brand. */}
            {!branding.whiteLabel && <> {PARTNER_RESPONSE_STANDARD}</>}
          </p>
        </div>
      </footer>
    </div>
  );
}
