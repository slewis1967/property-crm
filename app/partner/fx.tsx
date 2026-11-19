"use client";

/**
 * Small client-side pieces shared by the dashboard, AI Studio and plans page:
 * count-up numbers, the Elite trial button, and the AI insights panel.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Insight } from "../../utils/partner-insights";
import { TRIAL_CTA } from "../../utils/partner-plans";
import { BRAND_INK, Icon, PoweredByClaude, Skeleton, brandTint } from "./ui";

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Counts up from 0 to `value` once it scrolls into view. */
export function CountUp({ value, duration = 1200, prefix = "", suffix = "" }: { value: number; duration?: number; prefix?: string; suffix?: string }) {
  const [shown, setShown] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no animation: show the final value
      setShown(value);
      return;
    }
    let raf = 0;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        setShown(Math.round(value * eased));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, duration]);
  return (
    <span ref={ref} className="tabular-nums">
      {prefix}
      {shown.toLocaleString("en-AU")}
      {suffix}
    </span>
  );
}

/**
 * Records Elite trial interest (one partner_events row) — no payment, no plan
 * change. Shows a thank-you in place once recorded.
 */
export function EliteTrialButton({
  source,
  billing = "monthly",
  className = "",
  label = TRIAL_CTA,
  variant = "solid",
}: {
  source: "dashboard" | "studio" | "plans" | "week";
  billing?: "monthly" | "annual";
  className?: string;
  label?: string;
  variant?: "solid" | "light";
}) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  async function go() {
    setState("busy");
    try {
      const res = await fetch("/api/partner/elite-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source, billing }),
      });
      setState(res.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  }
  if (state === "done") {
    return (
      <div className={`inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${variant === "light" ? "pp-glass text-white" : "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"} ${className}`} role="status">
        <Icon name="check" className="h-4 w-4" strokeWidth={2.6} />
        You&apos;re on the list. Your partner manager will switch on your trial and call you.
      </div>
    );
  }
  const solid = "text-white pp-pulse";
  const light = "";
  return (
    <div className={className}>
      <button
        onClick={go}
        disabled={state === "busy"}
        className={`inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-bold shadow-lg transition hover:-translate-y-0.5 hover:shadow-xl disabled:opacity-60 sm:w-auto ${variant === "light" ? light : solid}`}
        // Inline, not utility classes: the dark theme re-points bg-white/slate-900 inside the portal.
        style={variant === "solid" ? { background: "linear-gradient(90deg, color-mix(in srgb, var(--accent) 92%, black), #9333ea)" } : { background: "#ffffff", color: "#0f172a" }}
      >
        <Icon name="bolt" className="h-4 w-4" />
        {state === "busy" ? "Recording…" : label}
      </button>
      {state === "error" && <p className="mt-2 text-xs text-red-700">That didn&apos;t go through. Please try again, or call Glenn on 0477 201 245.</p>}
    </div>
  );
}

/**
 * Insights: renders the deterministic insights at once, then asks the API for
 * Claude's rewrite and swaps it in. If the API fails, the first set stays.
 */
export function InsightsPanel({ initial }: { initial: Insight[] }) {
  const [insights, setInsights] = useState(initial);
  const [state, setState] = useState<"loading" | "ai" | "template">("loading");
  useEffect(() => {
    let cancelled = false;
    fetch("/api/partner/insights")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ok: boolean; insights: Insight[]; writer: "ai" | "template" } | null) => {
        if (cancelled) return;
        if (j?.ok && Array.isArray(j.insights) && j.insights.length) {
          setInsights(j.insights);
          setState(j.writer);
        } else setState("template");
      })
      .catch(() => !cancelled && setState("template"));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.12)] sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full opacity-40 blur-3xl" style={{ background: "linear-gradient(135deg, var(--accent), #a855f7)" }} aria-hidden="true" />
      <div className="relative mb-4 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl text-white" style={{ background: "linear-gradient(135deg, var(--accent), #a855f7)" }}>
            <Icon name="sparkle" className="h-4 w-4" />
          </span>
          AI insights
          {state === "loading" && <span className="pp-ai-shimmer text-sm font-semibold">analysing your book…</span>}
        </h2>
        <PoweredByClaude />
      </div>
      {insights.length === 0 ? (
        <div className="space-y-3">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : (
        <ul className="pp-stagger relative space-y-2.5">
          {insights.map((i) => {
            const body = (
              <>
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: brandTint(10), color: BRAND_INK }}>
                  <Icon name={i.icon} className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-900">{i.title}</span>
                  <span className="block text-xs leading-relaxed text-slate-500">{i.detail}</span>
                </span>
                {i.href && <Icon name="arrow-right" className="mt-2 h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-slate-700" />}
              </>
            );
            return (
              <li key={i.id}>
                {i.href ? (
                  <Link href={i.href} className="group flex items-start gap-3 rounded-2xl p-2.5 transition hover:bg-slate-50">
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-start gap-3 rounded-2xl p-2.5">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
