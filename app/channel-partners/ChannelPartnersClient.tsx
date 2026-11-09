"use client";

/**
 * Channel Partners — recruit firms that sell new-build stock to take NextKey's
 * sourced stock (and, where it fits, to refer to Springboard).
 *
 * Two tabs:
 *   Partners   — the target list, contact freshness, and a drawer per firm with
 *                the contact check, pipeline fields, and a tailored pitch
 *                (email or phone script).
 *   Pitch deck — the visual brochure, tailorable per partner, printable to PDF.
 *
 * Contact details must be current before anything is sent: a pitch can't go
 * out until the partner's details were verified within 90 days — by a website
 * check or by someone confirming them another way.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import PitchDeck from "./PitchDeck";
import {
  NO_PITCH_STATUSES,
  PARTNER_STATUSES,
  PRIORITIES,
  STREAMS,
  STREAM_ORDER,
  needsEnrichment,
  parseStreams,
  summarisePartners,
  type ChannelPartner,
  type PitchEmail,
  type StockStats,
  type StreamKey,
} from "../../utils/channel-partners";
import { contactFreshness, type ContactCheck, type FieldProposal } from "../../utils/channel-partner-contacts";
import { errMessage } from "../../utils/errors";

const TEAL = "#0F4C5C";

type Loaded = {
  partners: ChannelPartner[];
  stats: StockStats | null;
  springboardRef: string | null;
  migrationNeeded: boolean;
  hint?: string;
};

type Violation = { law: string; severity: "high" | "medium" | "low"; snippet: string; reason: string; fix: string };

function brisbaneToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Brisbane" }).format(new Date());
}

function ago(iso: string | null | undefined): string {
  if (!iso) return "never";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

export default function ChannelPartnersClient() {
  const [data, setData] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [flash, setFlash] = useState("");
  const [tab, setTab] = useState<"partners" | "deck">("partners");
  const [q, setQ] = useState("");
  const [priority, setPriority] = useState<string>("all");
  const [stream, setStream] = useState<StreamKey | "all">("all");
  const [status, setStatus] = useState<string>("all");
  const [attention, setAttention] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [bulk, setBulk] = useState<{ done: number; total: number; current: string } | null>(null);
  const [deckPartnerId, setDeckPartnerId] = useState<string>("");
  const [deckDraftSb, setDeckDraftSb] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/channel-partners");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setData(json);
    } catch (e) {
      setError(errMessage(e, "Load failed"));
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => load());
  }, [load]);

  const replacePartner = (p: ChannelPartner) =>
    setData((d) => (d ? { ...d, partners: d.partners.map((x) => (x.id === p.id ? p : x)) } : d));

  const partners = useMemo(() => data?.partners ?? [], [data]);
  const summary = useMemo(() => summarisePartners(partners), [partners]);
  const verifiedCount = partners.filter((p) => contactFreshness(p.contact_verified_at).state === "fresh").length;
  const reviewCount = partners.filter((p) => p.contact_check?.needs_review).length;
  const pitchedCount = partners.filter((p) => p.pitch_sent_at).length;

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return partners.filter((p) => {
      if (priority !== "all" && (p.suggested_priority ?? "") !== priority) return false;
      if (stream !== "all" && !parseStreams(p.nextkey_stream_fit).includes(stream)) return false;
      if (status !== "all" && p.status !== status) return false;
      if (attention) {
        const f = contactFreshness(p.contact_verified_at).state;
        if (!(f !== "fresh" || p.contact_check?.needs_review || needsEnrichment(p))) return false;
      }
      if (!needle) return true;
      return [p.company, p.contact_name, p.location, p.channel_type, p.email]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle));
    });
  }, [partners, q, priority, stream, status, attention]);

  const open = partners.find((p) => p.id === openId) ?? null;

  /** Check contact details for every stale partner with a website, one at a time (~20s each). */
  const checkAllStale = async () => {
    const due = partners.filter(
      (p) => p.website && contactFreshness(p.contact_verified_at).state !== "fresh" && !NO_PITCH_STATUSES.includes(p.status as never),
    );
    if (due.length === 0) {
      setFlash("Every partner with a website has current contact details.");
      return;
    }
    let done = 0;
    for (const p of due) {
      setBulk({ done, total: due.length, current: p.company });
      try {
        const res = await fetch(`/api/channel-partners/${p.id}/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "check" }),
        });
        const json = await res.json();
        if (json.ok) replacePartner(json.partner);
      } catch {
        /* one slow site must not stop the rest */
      }
      done += 1;
    }
    setBulk(null);
    setFlash(`Checked ${done} partner${done === 1 ? "" : "s"}. Anything that changed is flagged “Review”.`);
  };

  if (error && !data) return <div className="p-6 text-red-600">⚠ {error}</div>;
  if (!data) return <div className="p-6 text-gray-500">Loading channel partners…</div>;

  return (
    <div className="max-w-[1250px] mx-auto px-4 sm:px-5 py-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: TEAL }}>
            Channel Partners
          </h1>
          <p className="text-sm text-gray-500 mt-1 max-w-[75ch]">
            Firms we&apos;re recruiting to take NextKey-sourced stock — property marketers, building brokers, investor
            clubs, SMSF, SDA and multi-tenancy specialists. Each gets a pitch tailored to what they sell, and nothing goes
            out on contact details older than 90 days.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={checkAllStale}
            disabled={!!bulk}
            className="px-3 py-2 rounded-lg border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {bulk ? `Checking ${bulk.done + 1}/${bulk.total}: ${bulk.current}…` : "Check all stale contacts"}
          </button>
          <button onClick={() => setAdding((v) => !v)} className="px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ background: TEAL }}>
            + Add target
          </button>
        </div>
      </div>

      {data.migrationNeeded && (
        <div className="mt-4 p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">{data.hint}</div>
      )}
      {error && (
        <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 flex justify-between gap-3">
          <span>{error}</span>
          <button onClick={() => setError("")} className="text-red-500 hover:text-red-700">✕</button>
        </div>
      )}
      {flash && (
        <div className="mt-4 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-900 flex justify-between gap-3">
          <span>{flash}</span>
          <button onClick={() => setFlash("")} className="text-emerald-600 hover:text-emerald-800">✕</button>
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 md:grid-cols-5 gap-3">
        <Tile label="Targets" value={summary.total} sub={`${summary.byPriority.A ?? 0} priority A`} />
        <Tile label="Contact verified" value={`${verifiedCount}/${summary.total}`} sub="within 90 days" tone={verifiedCount < summary.total ? "amber" : "green"} />
        <Tile label="Checks to review" value={reviewCount} sub="details changed or missing" tone={reviewCount ? "amber" : undefined} />
        <Tile label="Need contact research" value={summary.enrich} sub={`${summary.reachable} have an email`} />
        <Tile label="Pitched" value={pitchedCount} sub={`${summary.byStatus["In conversation"] ?? 0} in conversation`} />
      </div>

      {adding && <AddTarget onDone={(p) => { setAdding(false); if (p) { setData((d) => (d ? { ...d, partners: [...d.partners, p] } : d)); setOpenId(p.id); } }} />}

      <div className="mt-6 flex gap-1 border-b border-gray-200">
        {(["partners", "deck"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${tab === t ? "border-[#0F4C5C] text-[#0F4C5C]" : "border-transparent text-gray-500 hover:text-gray-800"}`}
          >
            {t === "partners" ? `Partners (${partners.length})` : "Pitch deck"}
          </button>
        ))}
      </div>

      {tab === "partners" && (
        <>
          <div className="mt-4 flex flex-wrap gap-2 items-center">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search company, contact, location…"
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-full sm:w-64"
            />
            <Chips value={priority} onChange={setPriority} options={[["all", "All priorities"], ...PRIORITIES.map((p) => [p, `Priority ${p}`] as [string, string])]} />
            <select value={stream} onChange={(e) => setStream(e.target.value as StreamKey | "all")} className="px-2 py-2 border border-gray-300 rounded-lg text-sm bg-white">
              <option value="all">All streams</option>
              {STREAM_ORDER.map((s) => (
                <option key={s} value={s}>{STREAMS[s].label} ({summary.byStream[s]})</option>
              ))}
            </select>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="px-2 py-2 border border-gray-300 rounded-lg text-sm bg-white">
              <option value="all">All statuses</option>
              {PARTNER_STATUSES.map((s) => (
                <option key={s} value={s}>{s}{summary.byStatus[s] ? ` (${summary.byStatus[s]})` : ""}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm text-gray-700 px-2">
              <input type="checkbox" checked={attention} onChange={(e) => setAttention(e.target.checked)} />
              Needs attention
            </label>
          </div>

          <div className="mt-3 overflow-x-auto border border-gray-200 rounded-lg bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Pri</th>
                  <th className="px-3 py-2">Company</th>
                  <th className="px-3 py-2">Streams</th>
                  <th className="px-3 py-2">Contact</th>
                  <th className="px-3 py-2">Details</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Next action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} onClick={() => setOpenId(p.id)} className={`border-t border-gray-100 cursor-pointer hover:bg-gray-50 ${openId === p.id ? "bg-teal-50/50" : ""}`}>
                    <td className="px-3 py-2"><PriorityBadge p={p.suggested_priority} /></td>
                    <td className="px-3 py-2">
                      <div className="font-semibold text-gray-900">{p.company}</div>
                      <div className="text-xs text-gray-500">{[p.channel_type, p.location].filter(Boolean).join(" · ")}</div>
                    </td>
                    <td className="px-3 py-2"><StreamBadges fit={p.nextkey_stream_fit} /></td>
                    <td className="px-3 py-2">
                      <div className="text-gray-800">{p.contact_name ?? <span className="text-gray-400">—</span>}</div>
                      <div className="text-xs text-gray-500 flex gap-2">
                        {p.email ? <span title={p.email}>✉ email</span> : <span className="text-gray-300">no email</span>}
                        {p.phone ? <span title={p.phone}>☎ phone</span> : <span className="text-gray-300">no phone</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2"><FreshnessBadge p={p} /></td>
                    <td className="px-3 py-2"><StatusPill s={p.status} /></td>
                    <td className="px-3 py-2 text-gray-600 text-xs max-w-[220px]">{p.next_action}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-500">No partners match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "deck" && (
        <div className="mt-4">
          <div className="flex flex-wrap gap-3 items-center text-sm">
            <label className="flex items-center gap-2">
              Tailor for
              <select value={deckPartnerId} onChange={(e) => setDeckPartnerId(e.target.value)} className="px-2 py-1.5 border border-gray-300 rounded-lg bg-white">
                <option value="">General (no partner)</option>
                {partners.map((p) => <option key={p.id} value={p.id}>{p.company}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2 text-gray-700">
              <input type="checkbox" checked={deckDraftSb} onChange={(e) => setDeckDraftSb(e.target.checked)} />
              Preview the Springboard page {data.springboardRef ? "" : "(draft — not approved)"}
            </label>
            <a
              href={`/channel-partners/brochure?${new URLSearchParams({ ...(deckPartnerId ? { partner: deckPartnerId } : {}), ...(deckDraftSb ? { springboard: "draft" } : {}) }).toString()}`}
              target="_blank"
              rel="noreferrer"
              className="ml-auto px-3 py-2 rounded-lg text-white font-medium"
              style={{ background: "#1b1f44" }}
            >
              Open printable brochure ↗
            </a>
          </div>
          <p className="text-xs text-gray-500 mt-2 max-w-[90ch]">
            This is what partners see. The Springboard page only goes into a partner&apos;s brochure when their fit includes
            home buyers, they aren&apos;t an SMSF firm, and a clause 7 approval reference is recorded
            {data.springboardRef ? ` (current: ${data.springboardRef})` : " — none is recorded yet"}.
          </p>
          <div className="mt-4 overflow-x-auto bg-[#e9e8e4] rounded-lg py-6">
            <PitchDeck
              partner={partners.find((p) => p.id === deckPartnerId) ?? null}
              stats={data.stats}
              springboardRef={data.springboardRef}
              showSpringboard={deckDraftSb}
            />
          </div>
        </div>
      )}

      {open && (
        <PartnerDrawer
          key={open.id}
          partner={open}
          springboardRef={data.springboardRef}
          onClose={() => setOpenId(null)}
          onChange={replacePartner}
          onFlash={setFlash}
        />
      )}
    </div>
  );
}

// ── Drawer ──────────────────────────────────────────────────────────────────

function PartnerDrawer({
  partner: p,
  springboardRef,
  onClose,
  onChange,
  onFlash,
}: {
  partner: ChannelPartner;
  springboardRef: string | null;
  onClose: () => void;
  onChange: (p: ChannelPartner) => void;
  onFlash: (s: string) => void;
}) {
  const [form, setForm] = useState({
    contact_name: p.contact_name ?? "",
    contact_role: p.contact_role ?? "",
    email: p.email ?? "",
    phone: p.phone ?? "",
    website: p.website ?? "",
    location: p.location ?? "",
    status: p.status,
    next_action: p.next_action ?? "",
    last_contacted: p.last_contacted ?? "",
    notes: p.notes ?? "",
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const contactDirty =
    form.contact_name !== (p.contact_name ?? "") || form.contact_role !== (p.contact_role ?? "") ||
    form.email !== (p.email ?? "") || form.phone !== (p.phone ?? "") || form.website !== (p.website ?? "");

  const patch = async (body: Record<string, unknown>, okMsg: string) => {
    setBusy("save");
    setErr("");
    try {
      const res = await fetch(`/api/channel-partners/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      onChange(json.partner);
      onFlash(okMsg);
    } catch (e) {
      setErr(errMessage(e, "Save failed"));
    } finally {
      setBusy(null);
    }
  };

  const verify = async (body: Record<string, unknown>) => {
    setBusy(String(body.action));
    setErr("");
    try {
      const res = await fetch(`/api/channel-partners/${p.id}/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      onChange(json.partner);
      const np = json.partner as ChannelPartner;
      setForm((f) => ({ ...f, contact_name: np.contact_name ?? "", contact_role: np.contact_role ?? "", email: np.email ?? "", phone: np.phone ?? "", website: np.website ?? "" }));
      if (body.action === "check") {
        onFlash(
          contactFreshness(np.contact_verified_at).state === "fresh" && !np.contact_check?.needs_review
            ? `${p.company}: every detail we hold is still on their website — verified.`
            : `${p.company}: check complete — review what it found below.`,
        );
      } else onFlash(`${p.company}: contact details marked verified.`);
    } catch (e) {
      setErr(errMessage(e, "Contact check failed"));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-[760px] h-full overflow-y-auto bg-white shadow-xl">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-start justify-between gap-3 z-10">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <PriorityBadge p={p.suggested_priority} />
              <h2 className="text-lg font-bold text-gray-900">{p.company}</h2>
              <StatusPill s={p.status} />
            </div>
            <div className="text-xs text-gray-500 mt-1">
              {[p.channel_type, p.location].filter(Boolean).join(" · ")}
              {p.website && (
                <> · <a href={p.website} target="_blank" rel="noreferrer" className="text-teal-700 underline">website</a></>
              )}
              {p.source_url && p.source_url !== p.website && (
                <> · <a href={p.source_url} target="_blank" rel="noreferrer" className="text-teal-700 underline">research source</a></>
              )}
            </div>
            <div className="mt-2"><StreamBadges fit={p.nextkey_stream_fit} /></div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none" aria-label="Close">✕</button>
        </div>

        <div className="px-5 py-4 space-y-6">
          {err && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{err}</div>}

          {(p.priority_reason || p.stock_focus || p.supply_model) && (
            <div className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3 space-y-1">
              {p.priority_reason && <div><span className="text-gray-500">Why:</span> {p.priority_reason}</div>}
              {p.stock_focus && <div><span className="text-gray-500">Sells:</span> {p.stock_focus}</div>}
              {p.supply_model && <div><span className="text-gray-500">Supply model:</span> {p.supply_model}</div>}
            </div>
          )}

          {/* Contact details + freshness */}
          <section>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h3 className="font-semibold text-gray-800">Contact details</h3>
              <FreshnessBadge p={p} long />
            </div>
            {p.verification_notes && <p className="text-xs text-amber-800 mt-1">Research note: {p.verification_notes}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
              <Field label="Contact name" value={form.contact_name} onChange={(v) => setForm({ ...form, contact_name: v })} />
              <Field label="Role" value={form.contact_role} onChange={(v) => setForm({ ...form, contact_role: v })} />
              <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
              <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
              <Field label="Website" value={form.website} onChange={(v) => setForm({ ...form, website: v })} />
              <Field label="Location" value={form.location} onChange={(v) => setForm({ ...form, location: v })} />
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                onClick={() => verify({ action: "check" })}
                disabled={!!busy || !p.website}
                title={p.website ? "Reads their website and runs a web lookup — about 20 seconds" : "Add a website first"}
                className="px-3 py-1.5 rounded-md text-white text-sm disabled:opacity-50"
                style={{ background: TEAL }}
              >
                {busy === "check" ? "Checking their website and the web… (up to 25s)" : "Check contact details"}
              </button>
              <ManualVerify disabled={!!busy} onVerify={(note) => verify({ action: "manual", note })} />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Editing a detail by hand saves it but doesn&apos;t count as verification — confirm it with a check or by
              recording how you confirmed it.
            </p>
            {p.contact_check && <CheckResult check={p.contact_check} busy={busy === "apply"} onApply={(fields) => verify({ action: "apply", fields })} />}
          </section>

          {/* Pipeline */}
          <section>
            <h3 className="font-semibold text-gray-800">Pipeline</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
              <label className="text-sm">
                <span className="block text-xs text-gray-500 mb-1">Status</span>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full px-2 py-1.5 border border-gray-300 rounded-md bg-white">
                  {PARTNER_STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </label>
              <label className="text-sm">
                <span className="block text-xs text-gray-500 mb-1">Last contacted</span>
                <input type="date" value={form.last_contacted} onChange={(e) => setForm({ ...form, last_contacted: e.target.value })} className="w-full px-2 py-1.5 border border-gray-300 rounded-md" />
              </label>
              <Field label="Next action" value={form.next_action} onChange={(v) => setForm({ ...form, next_action: v })} />
            </div>
            <label className="text-sm block mt-3">
              <span className="block text-xs text-gray-500 mb-1">Notes</span>
              <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full px-2 py-1.5 border border-gray-300 rounded-md" />
            </label>
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                onClick={() => patch(form, `${p.company} saved.`)}
                disabled={!!busy}
                className="px-3 py-1.5 rounded-md text-white text-sm disabled:opacity-50"
                style={{ background: TEAL }}
              >
                {busy === "save" ? "Saving…" : "Save changes"}
              </button>
              <button
                onClick={() => {
                  const today = brisbaneToday();
                  const next = { ...form, last_contacted: today, status: form.status === "Not contacted" || form.status === "Researching" ? "Contacted" : form.status };
                  setForm(next);
                  patch(next, `Logged contact with ${p.company} today.`);
                }}
                disabled={!!busy}
                className="px-3 py-1.5 rounded-md border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Log contact today
              </button>
              {contactDirty && <span className="text-xs text-amber-700 self-center">Unsaved contact edits</span>}
            </div>
          </section>

          <PitchPanel partner={p} springboardRef={springboardRef} onPitched={onChange} onFlash={onFlash} />
        </div>
      </div>
    </div>
  );
}

function CheckResult({ check, busy, onApply }: { check: ContactCheck; busy: boolean; onApply: (fields: Record<string, string | null>) => void }) {
  const actionable = check.proposals.filter((x) => x.status === "confirmed" || x.status === "unconfirmed");
  const [picked, setPicked] = useState<Record<string, boolean>>(() => Object.fromEntries(actionable.map((x) => [x.field, x.recommended])));
  const pagesRead = check.pages.filter((pg) => pg.status && pg.status < 400).length;
  return (
    <div className={`mt-4 rounded-lg border p-3 text-sm ${check.needs_review ? "border-amber-300 bg-amber-50/60" : "border-gray-200 bg-gray-50"}`}>
      <div className="flex justify-between gap-2 flex-wrap">
        <div className="font-medium text-gray-800">Last check: {ago(check.checked_at)}</div>
        <div className="text-xs text-gray-500">
          {check.reachable ? `${pagesRead} page${pagesRead === 1 ? "" : "s"} read on their site` : "their site didn't answer"}
          {check.ai_used ? " · web lookup used" : check.ai_error ? ` · web lookup failed (${check.ai_error})` : ""}
        </div>
      </div>
      {check.notes.length > 0 && (
        <ul className="mt-2 list-disc pl-5 text-gray-700 space-y-0.5">{check.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
      )}
      <div className="mt-2 space-y-1.5">
        {check.proposals.map((x) => (
          <ProposalRow
            key={x.field}
            x={x}
            checked={!!picked[x.field]}
            onToggle={actionable.includes(x) ? (v) => setPicked({ ...picked, [x.field]: v }) : undefined}
          />
        ))}
        {check.proposals.length === 0 && <div className="text-gray-600">Nothing new found.</div>}
      </div>
      {(check.emails_found.length > 0 || check.phones_found.length > 0) && (
        <div className="mt-2 text-xs text-gray-500">
          On their site: {[...check.emails_found, ...check.phones_found].slice(0, 8).join(" · ")}
        </div>
      )}
      {actionable.length > 0 && (
        <button
          onClick={() => onApply(Object.fromEntries(actionable.filter((x) => picked[x.field]).map((x) => [x.field, x.proposed])))}
          disabled={busy}
          className="mt-3 px-3 py-1.5 rounded-md text-white text-sm disabled:opacity-50"
          style={{ background: TEAL }}
        >
          {busy ? "Applying…" : "Apply ticked changes and mark verified"}
        </button>
      )}
    </div>
  );
}

function ProposalRow({ x, checked, onToggle }: { x: FieldProposal; checked: boolean; onToggle?: (v: boolean) => void }) {
  const label: Record<FieldProposal["field"], string> = { email: "Email", phone: "Phone", contact_name: "Contact", contact_role: "Role", website: "Website" };
  const pill: Record<FieldProposal["status"], [string, string]> = {
    same: ["✓ still on their site", "bg-emerald-100 text-emerald-800"],
    confirmed: ["on their site", "bg-teal-100 text-teal-800"],
    unconfirmed: ["unconfirmed", "bg-gray-200 text-gray-700"],
    gone: ["no longer on their site", "bg-red-100 text-red-800"],
  };
  return (
    <div className="flex items-start gap-2">
      {onToggle ? <input type="checkbox" className="mt-1" checked={checked} onChange={(e) => onToggle(e.target.checked)} /> : <span className="w-[13px]" />}
      <div className="flex-1">
        <span className="font-medium text-gray-800">{label[x.field]}:</span>{" "}
        {x.status === "same" ? (
          <span className="text-gray-700">{x.current}</span>
        ) : (
          <>
            {x.current ? <span className="text-gray-400 line-through">{x.current}</span> : <span className="text-gray-400 italic">blank</span>}
            {x.proposed && <> → <span className="text-gray-900">{x.proposed}</span></>}
          </>
        )}{" "}
        <span className={`text-[11px] px-1.5 py-0.5 rounded ${pill[x.status][1]}`}>{pill[x.status][0]}</span>
        <div className="text-xs text-gray-500">{x.evidence}</div>
      </div>
    </div>
  );
}

function ManualVerify({ disabled, onVerify }: { disabled: boolean; onVerify: (note: string) => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} disabled={disabled} className="px-3 py-1.5 rounded-md border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
        Confirmed another way…
      </button>
    );
  }
  return (
    <div className="flex gap-2 items-center flex-wrap w-full">
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="How? e.g. Phoned Tim, details correct" className="flex-1 min-w-[220px] px-2 py-1.5 border border-gray-300 rounded-md text-sm" />
      <button onClick={() => note.trim() && onVerify(note.trim())} disabled={disabled || !note.trim()} className="px-3 py-1.5 rounded-md text-white text-sm disabled:opacity-50" style={{ background: TEAL }}>
        Mark verified
      </button>
      <button onClick={() => setOpen(false)} className="text-sm text-gray-500">Cancel</button>
    </div>
  );
}

// ── Pitch (email + phone script) ───────────────────────────────────────────

function PitchPanel({
  partner: p,
  springboardRef,
  onPitched,
  onFlash,
}: {
  partner: ChannelPartner;
  springboardRef: string | null;
  onPitched: (p: ChannelPartner) => void;
  onFlash: (s: string) => void;
}) {
  const [built, setBuilt] = useState<{ email: PitchEmail; callScript: string[]; unsubscribed: boolean } | null>(null);
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("");
  const [review, setReview] = useState<{ html: string; violations: Violation[]; reviewed: boolean; reviewError?: string; forText: string } | null>(null);
  const [override, setOverride] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const fresh = contactFreshness(p.contact_verified_at).state === "fresh";
  const blockedStatus = NO_PITCH_STATUSES.includes(p.status as never);

  const call = async (body: Record<string, unknown>) => {
    const res = await fetch(`/api/channel-partners/${p.id}/pitch`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json();
    if (!json.ok) throw new Error(json.error);
    return json;
  };

  const build = async () => {
    setBusy("build");
    setErr("");
    try {
      const json = await call({ action: "build" });
      setBuilt(json);
      setSubject(json.email.subject);
      setText(json.email.text);
      setReview(null);
    } catch (e) {
      setErr(errMessage(e, "Could not build the pitch"));
    } finally {
      setBusy(null);
    }
  };

  const runReview = async () => {
    setBusy("review");
    setErr("");
    try {
      const json = await call({ action: "review", subject, text });
      setReview({ ...json, forText: subject + "\n" + text });
      setOverride(false);
    } catch (e) {
      setErr(errMessage(e, "Review failed"));
    } finally {
      setBusy(null);
    }
  };

  const reviewCurrent = review && review.forText === subject + "\n" + text;
  const highs = review?.violations.filter((v) => v.severity === "high").length ?? 0;
  const needsOverride = !!review && (review.violations.length > 0 || !review.reviewed);

  let blocker = "";
  if (!p.email) blocker = "No email on file — use the phone script, or find their email with a contact check.";
  else if (blockedStatus) blocker = `Status is “${p.status}”, so no pitch goes out.`;
  else if (built?.unsubscribed) blocker = `${p.email} is on the unsubscribe list.`;
  else if (!fresh) blocker = "Contact details aren't verified within 90 days. Run a contact check or record how you confirmed them, above.";
  else if (!reviewCurrent) blocker = "Run the compliance check on this exact text first.";
  else if (needsOverride && !override) blocker = highs ? "The reviewer flagged high-severity issues — fix them, or tick the override." : "Tick the box to send despite the reviewer's notes.";

  const send = async () => {
    if (!review || !p.email) return;
    setBusy("send");
    setErr("");
    try {
      const res = await fetch("/api/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: p.email, to_name: p.contact_name ?? undefined, subject, body_html: review.html, body_text: text, tags: ["channel-partner"] }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Send failed");
      const m = await fetch(`/api/channel-partners/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "pitched" }) });
      const mj = await m.json();
      if (mj.ok) onPitched(mj.partner);
      onFlash(`Pitch sent to ${p.email}. It's in the Inbox → Sent view, tagged channel-partner.`);
      setConfirming(false);
    } catch (e) {
      setErr(errMessage(e, "Send failed"));
    } finally {
      setBusy(null);
    }
  };

  const copy = async (s: string, what: string) => {
    try {
      await navigator.clipboard.writeText(s);
      onFlash(`${what} copied.`);
    } catch {
      setErr("Couldn't copy — select the text and copy it by hand.");
    }
  };

  return (
    <section>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-semibold text-gray-800">Pitch</h3>
        <div className="flex gap-2">
          <a href={`/channel-partners/brochure?partner=${p.id}`} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-md border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50">
            Tailored brochure (PDF) ↗
          </a>
          <button onClick={build} disabled={!!busy} className="px-3 py-1.5 rounded-md text-white text-sm disabled:opacity-50" style={{ background: "#1b1f44" }}>
            {busy === "build" ? "Preparing…" : built ? "Rebuild pitch" : "Prepare pitch"}
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-1">
        Tailored to their streams{p.pitch_sent_at ? ` · last pitch sent ${ago(p.pitch_sent_at)}` : ""}.
        {parseStreams(p.nextkey_stream_fit).includes("springboard") && !springboardRef && " Springboard content is held back until a clause 7 reference is recorded."}
      </p>
      {err && <div className="mt-2 p-2 rounded bg-red-50 border border-red-200 text-sm text-red-800">{err}</div>}

      {built && (
        <div className="mt-3 space-y-4">
          {built.email.notes.length > 0 && (
            <ul className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2 list-disc pl-6">
              {built.email.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          )}

          <div>
            <div className="text-sm font-medium text-gray-700">Email</div>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm font-medium" />
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={16} className="mt-2 w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm leading-relaxed" />
            <div className="text-xs text-gray-500">Your email signature is added automatically when it sends.</div>
            <div className="flex flex-wrap gap-2 mt-2">
              <button onClick={runReview} disabled={!!busy} className="px-3 py-1.5 rounded-md border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                {busy === "review" ? "Reviewing…" : "Check compliance"}
              </button>
              <button onClick={() => copy(`${subject}\n\n${text}`, "Email")} className="px-3 py-1.5 rounded-md border border-gray-300 bg-white text-sm text-gray-700 hover:bg-gray-50">
                Copy email
              </button>
            </div>

            {review && (
              <div className={`mt-3 rounded-lg border p-3 text-sm ${review.violations.length || !review.reviewed ? "border-amber-300 bg-amber-50/60" : "border-emerald-200 bg-emerald-50"}`}>
                {!review.reviewed ? (
                  <div className="text-amber-900">The compliance reviewer is unavailable ({review.reviewError}). You can still send, knowingly.</div>
                ) : review.violations.length === 0 ? (
                  <div className="text-emerald-900">No compliance issues found.{!reviewCurrent && " (The text has changed since — check again.)"}</div>
                ) : (
                  <ul className="space-y-2">
                    {review.violations.map((v, i) => (
                      <li key={i}>
                        <span className={`text-[11px] font-bold uppercase mr-1 ${v.severity === "high" ? "text-red-700" : v.severity === "medium" ? "text-amber-700" : "text-gray-600"}`}>{v.severity}</span>
                        <span className="font-medium">{v.law}</span> — “{v.snippet}”
                        <div className="text-xs text-gray-600">{v.reason} <span className="text-gray-800">Fix: {v.fix}</span></div>
                      </li>
                    ))}
                  </ul>
                )}
                {needsOverride && reviewCurrent && (
                  <label className="flex items-center gap-2 mt-2 text-sm text-gray-800">
                    <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} />
                    I&apos;ve read this and want to send anyway
                  </label>
                )}
              </div>
            )}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {!confirming ? (
                <button
                  onClick={() => setConfirming(true)}
                  disabled={!!blocker || !!busy}
                  className="px-4 py-2 rounded-md text-white text-sm font-medium disabled:opacity-40"
                  style={{ background: TEAL }}
                >
                  Send to {p.email ?? "—"}
                </button>
              ) : (
                <>
                  <button onClick={send} disabled={!!busy || !!blocker} className="px-4 py-2 rounded-md bg-red-700 text-white text-sm font-medium disabled:opacity-50">
                    {busy === "send" ? "Sending…" : `Yes, send to ${p.email}`}
                  </button>
                  <button onClick={() => setConfirming(false)} className="text-sm text-gray-500">Cancel</button>
                </>
              )}
              {blocker && <span className="text-xs text-gray-600">{blocker}</span>}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-gray-700">Phone script{!p.email && " — the way in for this partner"}</div>
              <button onClick={() => copy(built.callScript.join("\n\n"), "Phone script")} className="text-xs text-teal-700 underline">Copy</button>
            </div>
            <ol className="mt-2 space-y-2 text-sm text-gray-800 list-decimal pl-5">
              {built.callScript.map((l, i) => <li key={i}>{l}</li>)}
            </ol>
          </div>
        </div>
      )}
    </section>
  );
}

// ── Small pieces ────────────────────────────────────────────────────────────

function Tile({ label, value, sub, tone }: { label: string; value: number | string; sub?: string; tone?: "amber" | "green" }) {
  const ring = tone === "amber" ? "border-amber-200 bg-amber-50/50" : tone === "green" ? "border-emerald-200 bg-emerald-50/50" : "border-gray-200 bg-white";
  return (
    <div className={`rounded-lg border p-3 ${ring}`}>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-2xl font-bold text-gray-900 mt-0.5">{value}</div>
      {sub && <div className="text-xs text-gray-500">{sub}</div>}
    </div>
  );
}

function Chips({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`px-2.5 py-1.5 rounded-full text-xs border ${value === v ? "bg-[#0F4C5C] text-white border-[#0F4C5C]" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function PriorityBadge({ p }: { p: string | null }) {
  const c = p === "A" ? "bg-[#1b1f44] text-white" : p === "B" ? "bg-[#da9845] text-[#1b1f44]" : "bg-gray-200 text-gray-700";
  return <span className={`inline-grid place-items-center w-6 h-6 rounded-full text-xs font-bold ${c}`}>{p ?? "–"}</span>;
}

function StreamBadges({ fit }: { fit: string | null }) {
  const s = parseStreams(fit);
  if (!s.length) return <span className="text-gray-400 text-xs">—</span>;
  return (
    <div className="flex gap-1 flex-wrap">
      {s.map((k) => (
        <span key={k} className="text-[11px] px-1.5 py-0.5 rounded text-white" style={{ background: STREAMS[k].colour }}>
          {STREAMS[k].short}
        </span>
      ))}
    </div>
  );
}

function StatusPill({ s }: { s: string }) {
  const c =
    s === "Signed" ? "bg-emerald-100 text-emerald-800" :
    s === "In conversation" || s === "Agreement sent" ? "bg-teal-100 text-teal-800" :
    s === "Contacted" ? "bg-blue-100 text-blue-800" :
    s === "Not a fit" || s === "Do not contact" ? "bg-gray-200 text-gray-600" :
    "bg-gray-100 text-gray-700";
  return <span className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${c}`}>{s}</span>;
}

function FreshnessBadge({ p, long }: { p: ChannelPartner; long?: boolean }) {
  const f = contactFreshness(p.contact_verified_at);
  if (p.contact_check?.needs_review) {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 whitespace-nowrap">⚠ Review check</span>;
  }
  if (f.state === "fresh") {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 whitespace-nowrap" title={p.contact_verified_method ?? undefined}>
        ✓ Verified {f.days === 0 ? "today" : `${f.days}d ago`}{long && p.contact_verified_method ? ` · ${p.contact_verified_method}` : ""}
      </span>
    );
  }
  if (needsEnrichment(p) && !p.email && !p.phone) {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-700 whitespace-nowrap">No contact yet</span>;
  }
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 whitespace-nowrap">
      {f.state === "stale" ? `Stale · ${f.days}d` : "Unverified"}
    </span>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="text-sm block">
      <span className="block text-xs text-gray-500 mb-1">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-2 py-1.5 border border-gray-300 rounded-md" />
    </label>
  );
}

function AddTarget({ onDone }: { onDone: (p: ChannelPartner | null) => void }) {
  const [f, setF] = useState({ company: "", channel_type: "", nextkey_stream_fit: "", website: "", email: "", phone: "", suggested_priority: "B" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async () => {
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/channel-partners", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, status: "Not contacted" }) });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      onDone(json.partner);
    } catch (e) {
      setErr(errMessage(e, "Save failed"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-5 p-4 rounded-lg border border-gray-200 bg-white">
      <h3 className="font-semibold text-gray-800">New channel partner target</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
        <Field label="Company *" value={f.company} onChange={(v) => setF({ ...f, company: v })} />
        <Field label="Type (e.g. Property marketer)" value={f.channel_type} onChange={(v) => setF({ ...f, channel_type: v })} />
        <Field label="Stream fit (e.g. Core investor / SDA)" value={f.nextkey_stream_fit} onChange={(v) => setF({ ...f, nextkey_stream_fit: v })} />
        <Field label="Website" value={f.website} onChange={(v) => setF({ ...f, website: v })} />
        <Field label="Email" value={f.email} onChange={(v) => setF({ ...f, email: v })} />
        <Field label="Phone" value={f.phone} onChange={(v) => setF({ ...f, phone: v })} />
      </div>
      {err && <div className="text-sm text-red-700 mt-2">{err}</div>}
      <div className="flex gap-2 mt-3">
        <button onClick={save} disabled={busy || !f.company.trim()} className="px-3 py-1.5 rounded-md text-white text-sm disabled:opacity-50" style={{ background: TEAL }}>
          {busy ? "Saving…" : "Add target"}
        </button>
        <button onClick={() => onDone(null)} className="text-sm text-gray-500">Cancel</button>
      </div>
    </div>
  );
}
