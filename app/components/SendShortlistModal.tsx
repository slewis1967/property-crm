"use client";

/**
 * "Send to client" — turn the properties ticked in the Aggregator Feed into a
 * private client link (/shortlist/<token>) with comparison, cashflow, duty and
 * suburb reports.
 *
 * The consultant picks the client, can add an expected rent and a "why we
 * picked it" note per property (only 43 of 827 active lots carried a rent on
 * 2026-09-14, and yield/cashflow need one), sets the report assumptions, and
 * chooses who the "Book a call" button books with. A confirm step exists
 * because this emails a real client.
 *
 * Opening /properties?send_to=<contactId> preselects that contact — the link the
 * contact page's shortlist panel uses.
 *
 * Calls POST /api/property-shortlists (authed).
 */
import { useEffect, useMemo, useState } from "react";
import { errMessage } from "../../utils/errors";
import { hostsForBrand } from "../../utils/scheduling-hosts";
import {
  DEFAULT_ASSUMPTIONS,
  MESSAGE_MAX,
  SHORTLIST_DEFAULT_TTL_DAYS,
  SHORTLIST_MAX_ITEMS,
  STAFF_NOTE_MAX,
  type ShortlistAssumptions,
} from "../../utils/property-shortlist";

export type ShortlistPick = {
  id: string;
  label: string;
  price: number | null;
  rentWeekly: number | null;
};

type ContactOption = { id: string; name: string | null; full_name: string | null; email: string | null };

type Result = { link: string; emailed: boolean; emailError: string | null; unavailable: string[] };

const input = "w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400";
const money = (n: number | null) => (n ? `$${Math.round(n).toLocaleString("en-AU")}` : "—");

export default function SendShortlistModal({ picks, onClose }: { picks: ShortlistPick[]; onClose: () => void }) {
  const hosts = useMemo(() => hostsForBrand("nextkey"), []);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [contactQuery, setContactQuery] = useState("");
  const [contactId, setContactId] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [rents, setRents] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [assumptions, setAssumptions] = useState<ShortlistAssumptions>(DEFAULT_ASSUMPTIONS);
  const [bookingSlug, setBookingSlug] = useState(hosts[0]?.slug ?? "");
  const [ttlDays, setTtlDays] = useState(SHORTLIST_DEFAULT_TTL_DAYS);
  const [sendEmail, setSendEmail] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/contacts/search");
        const json = await res.json().catch(() => ({}));
        if (cancelled || !res.ok) return;
        const list = (json.contacts ?? []) as ContactOption[];
        setContacts(list);
        const preselect = new URLSearchParams(window.location.search).get("send_to");
        const match = preselect ? list.find((c) => c.id === preselect) : undefined;
        if (match) {
          setContactId(match.id);
          setClientName(match.full_name || match.name || "");
          setClientEmail(match.email || "");
        }
      } catch {
        /* the consultant can still type the client's details */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const matches = useMemo(() => {
    const q = contactQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    return contacts
      .filter((c) => [c.full_name, c.name, c.email].some((v) => v?.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [contacts, contactQuery]);

  const tooMany = picks.length > SHORTLIST_MAX_ITEMS;
  const canSubmit = !tooMany && picks.length > 0 && clientName.trim() && (!sendEmail || clientEmail.trim());

  async function submit() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/property-shortlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: clientName.trim(),
          client_email: clientEmail.trim() || null,
          contact_id: contactId,
          title: title.trim() || null,
          message: message.trim() || null,
          assumptions,
          booking_slug: bookingSlug || null,
          ttl_days: ttlDays,
          send_email: sendEmail,
          items: picks.map((p) => ({
            propertyId: p.id,
            rentWeekly: rents[p.id] ? Number(rents[p.id]) : null,
            staffNote: notes[p.id]?.trim() || null,
          })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) throw new Error(json.error || `Request failed (${res.status})`);
      setResult({ link: json.link, emailed: json.emailed, emailError: json.emailError, unavailable: json.unavailable ?? [] });
    } catch (e) {
      setError(errMessage(e));
      setConfirming(false);
    } finally {
      setSending(false);
    }
  }

  const setA = <K extends keyof ShortlistAssumptions>(k: K, v: ShortlistAssumptions[K]) =>
    setAssumptions((a) => ({ ...a, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto" role="dialog" aria-modal="true">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl my-8">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">📨 Send properties to a client</h2>
            <p className="text-xs text-gray-500">
              {picks.length} selected · the client sees suburb, price, specs, photos and reports — never the builder,
              estate, lot or street address.
            </p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded hover:bg-gray-100 text-xl text-gray-500" aria-label="Close">
            ×
          </button>
        </div>

        {result ? (
          <div className="p-5 space-y-4">
            <p className="text-sm font-semibold text-emerald-700">
              ✅ Shortlist created{result.emailed ? ` and emailed to ${clientEmail}` : ""}.
            </p>
            {result.emailError && (
              <p className="text-sm text-amber-700">
                The email didn&apos;t send ({result.emailError}). Copy the link below and send it another way.
              </p>
            )}
            {result.unavailable.length > 0 && (
              <p className="text-sm text-amber-700">
                Heads up: {result.unavailable.join(", ")} {result.unavailable.length === 1 ? "is" : "are"} showing as no longer
                available.
              </p>
            )}
            <div>
              <p className="text-xs text-gray-500 mb-1">
                Client link — shown once. It isn&apos;t stored, so if it&apos;s lost, send a new shortlist.
              </p>
              <div className="flex gap-2">
                <input readOnly value={result.link} className={`${input} font-mono text-xs`} onFocus={(e) => e.target.select()} />
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(result.link).catch(() => undefined);
                    setCopied(true);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold bg-gray-900 text-white rounded-lg whitespace-nowrap"
                >
                  {copied ? "Copied" : "Copy link"}
                </button>
              </div>
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg">
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-5">
            {tooMany && (
              <p className="text-sm text-red-600">
                A shortlist can hold up to {SHORTLIST_MAX_ITEMS} properties — untick {picks.length - SHORTLIST_MAX_ITEMS}.
              </p>
            )}

            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Client</h3>
              <div className="relative mb-2">
                <input
                  value={contactQuery}
                  onChange={(e) => setContactQuery(e.target.value)}
                  placeholder="Search contacts by name or email…"
                  className={input}
                />
                {matches.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                    {matches.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setContactId(c.id);
                            setClientName(c.full_name || c.name || "");
                            setClientEmail(c.email || "");
                            setContactQuery("");
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                        >
                          <span className="font-medium">{c.full_name || c.name || "(no name)"}</span>
                          <span className="text-gray-400"> · {c.email || "no email"}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="Client name *" className={input} />
                <input value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="Client email" type="email" className={input} />
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {contactId ? "Linked to the contact — responses will show on their page." : "Not linked to a contact yet — pick one above to track responses on their page."}
              </p>
            </section>

            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Message</h3>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, 120))}
                placeholder="Heading (optional) — e.g. Three options under $700k"
                className={`${input} mb-2`}
              />
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value.slice(0, MESSAGE_MAX))}
                rows={3}
                placeholder="A short note to the client (optional). Don't name builders or estates — the portal hides them."
                className={input}
              />
            </section>

            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Properties</h3>
              <div className="space-y-2">
                {picks.map((p) => (
                  <div key={p.id} className="border border-gray-200 rounded-lg p-3">
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="font-medium text-gray-900">{p.label}</span>
                      <span className="text-gray-500 whitespace-nowrap">{money(p.price)}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2">
                      <input
                        type="number"
                        min={0}
                        value={rents[p.id] ?? ""}
                        onChange={(e) => setRents((r) => ({ ...r, [p.id]: e.target.value }))}
                        placeholder={p.rentWeekly ? `Rent $/wk (listing: ${p.rentWeekly})` : "Expected rent $/wk"}
                        className={input}
                      />
                      <input
                        value={notes[p.id] ?? ""}
                        onChange={(e) => setNotes((n) => ({ ...n, [p.id]: e.target.value.slice(0, STAFF_NOTE_MAX) }))}
                        placeholder="Why we picked it (shown to the client)"
                        className={`${input} sm:col-span-2`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Report assumptions <span className="normal-case font-normal text-gray-400">(the client can change these on the page)</span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
                <label className="block">
                  <span className="text-xs text-gray-500">Deposit %</span>
                  <input type="number" min={0} max={100} value={assumptions.depositPct} onChange={(e) => setA("depositPct", Number(e.target.value))} className={input} />
                </label>
                <label className="block">
                  <span className="text-xs text-gray-500">Rate %</span>
                  <input type="number" min={0} max={20} step={0.05} value={assumptions.interestRatePct} onChange={(e) => setA("interestRatePct", Number(e.target.value))} className={input} />
                </label>
                <label className="block">
                  <span className="text-xs text-gray-500">Term (yrs)</span>
                  <input type="number" min={1} max={40} value={assumptions.loanTermYears} onChange={(e) => setA("loanTermYears", Number(e.target.value))} className={input} />
                </label>
                <label className="block">
                  <span className="text-xs text-gray-500">Repayments</span>
                  <select value={assumptions.repayment} onChange={(e) => setA("repayment", e.target.value === "io" ? "io" : "pi")} className={`${input} bg-white`}>
                    <option value="pi">P&amp;I</option>
                    <option value="io">Interest only</option>
                  </select>
                </label>
                <label className="flex items-end gap-2 pb-2">
                  <input type="checkbox" checked={assumptions.firstHomeBuyer} onChange={(e) => setA("firstHomeBuyer", e.target.checked)} />
                  <span className="text-xs text-gray-600">First home buyer</span>
                </label>
              </div>
            </section>

            <section className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
              <label className="block">
                <span className="text-xs text-gray-500">&ldquo;Book a call&rdquo; with</span>
                <select value={bookingSlug} onChange={(e) => setBookingSlug(e.target.value)} className={`${input} bg-white`}>
                  {hosts.map((h) => (
                    <option key={h.slug} value={h.slug}>
                      {h.displayName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs text-gray-500">Link works for (days)</span>
                <input type="number" min={1} max={90} value={ttlDays} onChange={(e) => setTtlDays(Number(e.target.value))} className={input} />
              </label>
              <label className="flex items-end gap-2 pb-2">
                <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
                <span className="text-xs text-gray-600">Email the link to the client</span>
              </label>
            </section>

            {error && <p className="text-sm text-red-600">{error}</p>}

            {confirming ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-amber-900">
                  {sendEmail
                    ? `This emails ${clientName.trim()} at ${clientEmail.trim()} a link to ${picks.length} ${picks.length === 1 ? "property" : "properties"}.`
                    : `This creates a link to ${picks.length} ${picks.length === 1 ? "property" : "properties"} for ${clientName.trim()} (no email sent).`}
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setConfirming(false)} disabled={sending} className="px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded-lg">
                    Back
                  </button>
                  <button type="button" onClick={submit} disabled={sending} className="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg disabled:opacity-50">
                    {sending ? "Sending…" : sendEmail ? "Yes, send it" : "Create link"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end gap-2">
                <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-semibold bg-white border border-gray-200 rounded-lg">
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  disabled={!canSubmit}
                  className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg disabled:opacity-50"
                >
                  {sendEmail ? "Review & send" : "Review & create link"}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
