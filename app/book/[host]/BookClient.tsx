"use client";

/**
 * Public self-book UI. Fetches the host's open slots from /api/book/<slug>,
 * lets a lead pick a time and enter their details, then books it. Slots are
 * generated in AEST (see utils/booking.ts) but shown in the visitor's own time
 * zone, labelled — Springboard leads come from every state, and most of them
 * are on daylight saving from October. No CRM chrome (AppShell standalone).
 */
import { useEffect, useMemo, useState } from "react";

type Slot = { startISO: string; endISO: string; label: string };
type Day = { date: string; label: string; slots: Slot[] };

// Brand theme. Springboard is navy #020e40 / amber #c7894e, and its page must
// carry nothing NextKey-branded (brand firewall — this link goes to leads).
const THEMES = {
  nextkey: { accent: "#0F4C5C", title: (host: string) => `Book a meeting with ${host}`, org: "NextKey Property Strategists" },
  springboard: { accent: "#020e40", title: () => "Book a time with Springboard Homes", org: "Springboard Homes" },
} as const;

const SPRINGBOARD_PRIVACY_URL = "https://springboardhomes.com.au/privacy-policy/";

/** Viewer's zone abbreviation for an instant ("AEDT", "AWST"); "your time" if the runtime won't say. */
function zoneLabel(iso: string): string {
  const part = new Intl.DateTimeFormat("en-AU", { timeZoneName: "short" })
    .formatToParts(new Date(iso))
    .find((p) => p.type === "timeZoneName");
  return part?.value ?? "your time";
}

const timeFmt = new Intl.DateTimeFormat("en-AU", { hour: "numeric", minute: "2-digit" });

export default function BookClient({
  slug,
  hostName,
  hostLabel,
  brand,
}: {
  slug: string;
  hostName: string;
  hostLabel: string;
  brand: string;
}) {
  const [days, setDays] = useState<Day[] | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [website, setWebsite] = useState(""); // honeypot

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ videoLink: string | null } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/book/${slug}`, { cache: "no-store" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
        const d = (data.days as Day[]) ?? [];
        setDays(d);
        setSelectedDate(d[0]?.date ?? null);
      } catch (e) {
        setLoadErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [slug]);

  const theme = brand === "springboard" ? THEMES.springboard : THEMES.nextkey;
  const accent = theme.accent;
  // Highlight classes spelled out whole so Tailwind keeps them.
  const tint = brand === "springboard"
    ? { day: "bg-amber-50 text-amber-900", slot: "hover:border-amber-400 hover:bg-amber-50", link: "text-amber-800", ring: "focus:ring-amber-500" }
    : { day: "bg-teal-50 text-teal-800", slot: "hover:border-teal-400 hover:bg-teal-50", link: "text-teal-700", ring: "focus:ring-teal-500" };

  const activeDay = useMemo(
    () => days?.find((d) => d.date === selectedDate) ?? null,
    [days, selectedDate],
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!slot) {
      setError("Please choose a time.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/book/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: slot.startISO,
          name,
          email,
          phone: phone || undefined,
          notes: notes || undefined,
          website, // honeypot
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Failed (${res.status})`);
      setDone({ videoLink: data.video_link ?? null });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const slotWhenLabel = slot
    ? new Intl.DateTimeFormat("en-AU", {
        weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit",
      }).format(new Date(slot.startISO))
    : "";
  const slotZone = slot ? zoneLabel(slot.startISO) : "";
  const listZone = activeDay?.slots[0] ? zoneLabel(activeDay.slots[0].startISO) : "";

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center px-4 py-8 sm:py-14">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-6">
          {brand === "springboard" ? (
            // Served from /api/portal/ because /public sits behind Cloudflare Access.
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/api/portal/logo" alt="Springboard Homes" className="h-12 w-auto mx-auto mb-3" />
          ) : (
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl text-white text-xl font-bold mb-3" style={{ background: accent }}>
              {hostLabel.charAt(0)}
            </div>
          )}
          <h1 className="text-2xl font-bold text-gray-900">{theme.title(hostName)}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {brand === "springboard" ? "" : `${theme.org} · `}30 minutes · online video
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          {done ? (
            <div className="p-8 text-center">
              <div className="w-14 h-14 rounded-full bg-green-100 text-green-600 text-3xl flex items-center justify-center mx-auto mb-4">✓</div>
              <h2 className="text-xl font-bold text-gray-900">You&rsquo;re booked in</h2>
              <p className="text-gray-600 mt-2">{slotWhenLabel} ({slotZone})</p>
              <p className="text-sm text-gray-500 mt-3">
                We&rsquo;ve emailed a confirmation to <strong>{email}</strong> with a calendar invite.
              </p>
              {done.videoLink && (
                <a href={done.videoLink} target="_blank" rel="noreferrer"
                  className="inline-block mt-5 text-white font-semibold px-5 py-2.5 rounded-lg" style={{ background: accent }}>
                  📹 Join the video meeting
                </a>
              )}
            </div>
          ) : loadErr ? (
            <div className="p-8 text-center text-sm text-red-600">{loadErr}</div>
          ) : !days ? (
            <div className="p-8 text-center text-sm text-gray-400">Loading availability…</div>
          ) : days.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">
              No times are currently available. Please check back soon or reach out directly.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr]">
              {/* Day picker */}
              <div className="border-b sm:border-b-0 sm:border-r border-gray-100 max-h-[420px] overflow-y-auto">
                {days.map((d) => (
                  <button
                    key={d.date}
                    onClick={() => { setSelectedDate(d.date); setSlot(null); }}
                    className={`w-full text-left px-4 py-3 text-sm border-b border-gray-50 transition ${
                      selectedDate === d.date ? `${tint.day} font-semibold` : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {d.label}
                    <span className="block text-xs text-gray-400 font-normal">{d.slots.length} times</span>
                  </button>
                ))}
              </div>

              {/* Slots + form */}
              <div className="p-4">
                {!slot ? (
                  <>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
                      {activeDay?.label} · times in {listZone}
                    </p>
                    <div className="grid grid-cols-3 gap-2 max-h-[360px] overflow-y-auto">
                      {activeDay?.slots.map((s) => (
                        <button
                          key={s.startISO}
                          onClick={() => setSlot(s)}
                          className={`px-2 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 ${tint.slot} transition`}
                        >
                          {timeFmt.format(new Date(s.startISO))}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <form onSubmit={submit} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-gray-900">{slotWhenLabel} ({slotZone})</p>
                      <button type="button" onClick={() => setSlot(null)} className={`text-xs ${tint.link} hover:underline`}>
                        Change
                      </button>
                    </div>
                    <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name"
                      className={`w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 ${tint.ring}`} />
                    <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email address"
                      className={`w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 ${tint.ring}`} />
                    <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)"
                      className={`w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 ${tint.ring}`} />
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Anything you'd like to cover? (optional)"
                      className={`w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 ${tint.ring}`} />
                    {/* Honeypot — hidden from humans; bots fill it and get silently dropped. */}
                    <input
                      type="text" tabIndex={-1} autoComplete="off" value={website}
                      onChange={(e) => setWebsite(e.target.value)}
                      className="hidden" aria-hidden="true"
                    />
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    <button type="submit" disabled={submitting}
                      className="w-full text-white font-semibold py-2.5 rounded-lg disabled:opacity-60 transition" style={{ background: accent }}>
                      {submitting ? "Booking…" : "Confirm booking"}
                    </button>
                    {brand === "springboard" && (
                      <p className="text-xs text-gray-500">
                        Springboard Homes collects these details to arrange your appointment. See our{" "}
                        <a href={SPRINGBOARD_PRIVACY_URL} target="_blank" rel="noreferrer" className="underline">Privacy Policy</a>.
                      </p>
                    )}
                  </form>
                )}
              </div>
            </div>
          )}
        </div>

        {brand === "springboard" ? (
          <p className="text-center text-xs text-gray-400 mt-4">
            Springboard Homes ·{" "}
            <a href={SPRINGBOARD_PRIVACY_URL} target="_blank" rel="noreferrer" className="underline">Privacy Policy</a>
          </p>
        ) : (
          <p className="text-center text-xs text-gray-400 mt-4">Powered by NextKey</p>
        )}
      </div>
    </div>
  );
}
