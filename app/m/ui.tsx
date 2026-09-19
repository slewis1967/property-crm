import Link from "next/link";
import { telHref, smsHref } from "../../utils/phone-links";

/** Small building blocks shared by the phone-view screens. */

/** Sticky page header: optional back link, title, and a link to the full desktop page. */
export function Header({
  title,
  back,
  fullHref,
}: {
  title: string;
  back?: string;
  fullHref?: string;
}) {
  return (
    <header className="sticky top-0 z-20 flex items-center gap-2 bg-[#0F4C5C] px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] text-white">
      {back && (
        <Link href={back} className="-ml-1 px-1 text-2xl leading-none" aria-label="Back">
          ‹
        </Link>
      )}
      <h1 className="min-w-0 flex-1 truncate text-lg font-semibold">{title}</h1>
      {fullHref && (
        <Link href={fullHref} className="shrink-0 rounded-md bg-white/15 px-2.5 py-1 text-xs">
          Full page
        </Link>
      )}
    </header>
  );
}

export function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="px-4 pt-5">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** A white card list; each child is a row. */
export function List({ children }: { children: React.ReactNode }) {
  return <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl bg-white shadow-sm">{children}</ul>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-white px-4 py-6 text-center text-sm text-gray-500 shadow-sm">{children}</p>;
}

export function LoadError({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{children}</p>;
}

/** Call / SMS / Email buttons. Missing channels are shown disabled rather than hidden, so the row doesn't jump. */
export function ContactButtons({ phone, email }: { phone: string | null | undefined; email: string | null | undefined }) {
  const tel = telHref(phone);
  const sms = smsHref(phone);
  const mail = email ? `mailto:${email}` : null;
  const btn = "flex flex-1 flex-col items-center gap-1 rounded-xl py-3 text-xs font-medium";
  const on = `${btn} bg-[#0F4C5C] text-white active:bg-[#0B3D4A]`;
  const off = `${btn} bg-gray-100 text-gray-400`;
  return (
    <div className="flex gap-2">
      {tel ? <a href={tel} className={on}><span className="text-lg">📞</span>Call</a> : <span className={off}><span className="text-lg">📞</span>Call</span>}
      {sms ? <a href={sms} className={on}><span className="text-lg">💬</span>SMS</a> : <span className={off}><span className="text-lg">💬</span>SMS</span>}
      {mail ? <a href={mail} className={on}><span className="text-lg">✉️</span>Email</a> : <span className={off}><span className="text-lg">✉️</span>Email</span>}
    </div>
  );
}

/** Label/value rows; empty values are skipped. */
export function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  const shown = rows.filter(([, v]) => v !== null && v !== undefined && v !== "");
  if (shown.length === 0) return null;
  return (
    <dl className="divide-y divide-gray-100 overflow-hidden rounded-xl bg-white text-sm shadow-sm">
      {shown.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 px-4 py-2.5">
          <dt className="shrink-0 text-gray-500">{k}</dt>
          <dd className="min-w-0 break-words text-right font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function money(n: number | string | null | undefined): string | null {
  const v = typeof n === "string" ? Number(n.replace(/[^0-9.]/g, "")) : n;
  if (v === null || v === undefined || !Number.isFinite(v) || v <= 0) return null;
  return v.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
}

/** A search box that submits as a plain GET (?q=), so results are server-rendered and the back button works. */
export function SearchBox({
  action,
  defaultValue,
  placeholder,
  keep,
}: {
  action: string;
  defaultValue?: string;
  placeholder: string;
  /** Other query params to carry through the search (e.g. the selected pipeline). */
  keep?: Record<string, string>;
}) {
  return (
    <form action={action} className="px-4 pt-4" role="search">
      {Object.entries(keep ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder={placeholder}
        enterKeyHint="search"
        autoComplete="off"
        className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-[#0F4C5C]"
      />
    </form>
  );
}
