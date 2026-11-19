/**
 * "Who's behind NextKey": approved by Sean 18 Nov 2026. The two bios are
 * verbatim and make no other claims. Sean's "finance" wording is an approved
 * one-off exception to the portal's no-finance rule for this bio line only.
 * Glenn is the only contact; Sean's phone and email never appear.
 * Initials avatars only, no photos. Server-safe.
 */
import { Icon } from "./ui";

export const FOUNDERS = [
  { name: "Sean Lewis", initials: "SL", bio: "40 years in the software industry and 30 years in the finance and property industries." },
  { name: "Glenn Mayes", initials: "GM", bio: "Over 40 years in real estate sales and marketing." },
] as const;

export const FOUNDERS_CONTACT = { name: "Glenn Mayes", phone: "0477 201 245", email: "glenn.m@nextkey.com.au" } as const;

export default function Founders({ className = "" }: { className?: string }) {
  return (
    <section className={`relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-6 sm:p-8 ${className}`}>
      <div className="pointer-events-none absolute -left-20 -top-20 h-56 w-56 rounded-full opacity-25 blur-3xl" style={{ background: "var(--brand)" }} aria-hidden="true" />
      <div className="relative grid gap-6 lg:grid-cols-5 lg:items-center">
        <div className="lg:col-span-2">
          <div className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--accent)" }}>Who&apos;s behind NextKey</div>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Software built by people who&apos;ve sold property</h2>
          <div className="mt-4 space-y-1.5 text-sm text-slate-600">
            <div className="font-semibold text-slate-900">Talk to {FOUNDERS_CONTACT.name}</div>
            <a href={`tel:${FOUNDERS_CONTACT.phone.replace(/\s/g, "")}`} className="flex items-center gap-2 hover:text-slate-900">
              <Icon name="phone" className="h-4 w-4 text-slate-400" /> {FOUNDERS_CONTACT.phone}
            </a>
            <a href={`mailto:${FOUNDERS_CONTACT.email}`} className="flex items-center gap-2 hover:text-slate-900">
              <Icon name="mail" className="h-4 w-4 text-slate-400" /> {FOUNDERS_CONTACT.email}
            </a>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-3">
          {FOUNDERS.map((f) => (
            <div key={f.name} className="flex items-start gap-4 rounded-2xl bg-slate-50 p-4">
              <span
                className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-lg font-bold text-white shadow-md"
                style={{ background: "linear-gradient(135deg, var(--brand), color-mix(in srgb, var(--brand) 55%, var(--accent)))" }}
                aria-hidden="true"
              >
                {f.initials}
              </span>
              <div>
                <div className="font-semibold text-slate-900">{f.name}</div>
                <p className="mt-0.5 text-sm leading-relaxed text-slate-600">{f.bio}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
