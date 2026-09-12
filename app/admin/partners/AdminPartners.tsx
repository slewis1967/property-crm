"use client";

/**
 * Channel-partner management: the deal queue, and the register of partner firms.
 *
 * The queue is first because it has a clock on it — a hold request is a buyer
 * waiting while someone rings the builder. Every row shows the SUPPLIER behind
 * the lot, which the partner cannot see; releasing it to them is the separate
 * "Release lot details" action, never a side effect of granting a hold.
 *
 * Owner-only controls (onboarding, tier, white-label, logins) are hidden rather
 * than shown-and-403'd for staff; the API enforces them regardless.
 */
import { useCallback, useEffect, useState } from "react";
import {
  formatAud,
  isDealStage,
  PARTNER_FEATURES,
  PARTNER_TIERS,
  REVEAL_FIELDS,
  STAFF_TRANSITIONS,
  TIER_DEFINITIONS,
  type DealStage,
  type FeeRule,
  type PartnerFeature,
} from "../../../utils/partner";

type Supplier = {
  builder_name: string | null;
  estate_name: string | null;
  lot_number: string | null;
  street_address: string | null;
  status: string | null;
  pipeline_status: string | null;
} | null;

type Deal = {
  id: string;
  partner_id: string;
  property_id: string;
  stage: string;
  partner_note: string | null;
  message_to_partner: string | null;
  staff_notes: string | null;
  lot_summary: { ref?: string; suburb?: string; state?: string; propertyType?: string; bedrooms?: number };
  price_snapshot: number | null;
  referral_fee_snapshot: number | null;
  revealed: Record<string, string>;
  revealed_at: string | null;
  hold_expires_at: string | null;
  /** Computed server-side, so render stays pure. */
  hold_expired: boolean;
  decision_reason: string | null;
  opportunity_id: string | null;
  created_at: string;
  updated_at: string;
  partners?: { firm_name?: string } | { firm_name?: string }[];
  partner_clients?: { first_name?: string; last_name?: string | null; email?: string | null; phone?: string | null } | unknown[];
  partner_users?: { email?: string; full_name?: string | null } | unknown[];
  supplier: Supplier;
};

type PartnerUser = { id: string; email: string; full_name: string | null; status: string; is_primary: boolean; last_login_at: string | null };

type Firm = {
  id: string;
  firm_name: string;
  abn: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  status: string;
  agreement_ref: string | null;
  agreement_signed_at: string | null;
  tier: string;
  feature_grants: string[];
  branding: Record<string, string>;
  notes: string | null;
  users: PartnerUser[];
  counts: { clients: number; open: number; settled: number };
};

/** The partner-facing labels speak to the partner ("on hold for your client"); staff need the plain stage. */
const STAFF_STAGE_LABELS: Record<DealStage, string> = {
  requested: "Hold requested",
  hold: "On hold",
  eoi: "EOI signed",
  unconditional: "Unconditional",
  settled: "Settled",
  declined: "Declined",
  released: "Released",
  withdrawn: "Withdrawn by partner",
};

type Prospect = { id: string; company: string; contact_name: string | null; email: string | null; phone: string | null };

function one<T>(raw: unknown): T | undefined {
  return (Array.isArray(raw) ? raw[0] : raw) as T | undefined;
}

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok && json.ok !== false, json };
}

async function fetchAll(scope: string) {
  try {
    const [d, f] = await Promise.all([
      fetch(`/api/admin/partners/deals?stage=${scope}`).then((r) => r.json()),
      fetch("/api/admin/partners").then((r) => r.json()),
    ]);
    return {
      deals: d.ok ? (d.deals as Deal[]) : undefined,
      firms: f.ok ? (f.partners as Firm[]) : undefined,
      error: d.ok ? (f.ok ? null : f.error) : (d.error ?? "Could not load the queue."),
    };
  } catch {
    return { error: "Could not reach the server." };
  }
}

const btn = "rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50";
const btnPrimary = "rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50";
const input = "w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm";

export default function AdminPartners({
  viewerIsSuperAdmin,
  feeRule,
  prospects,
}: {
  viewerIsSuperAdmin: boolean;
  feeRule: FeeRule;
  prospects: Prospect[];
}) {
  const [tab, setTab] = useState<"deals" | "firms">("deals");
  const [scope, setScope] = useState("open");
  const [deals, setDeals] = useState<Deal[]>([]);
  const [firms, setFirms] = useState<Firm[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const r = await fetchAll(scope);
    setError(r.error ?? null);
    if (r.deals) setDeals(r.deals);
    if (r.firms) setFirms(r.firms);
    setLoading(false);
  }, [scope]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await fetchAll(scope);
      if (cancelled) return;
      setError(r.error ?? null);
      if (r.deals) setDeals(r.deals);
      if (r.firms) setFirms(r.firms);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [scope]);

  const act = async (url: string, method: string, body: unknown, ok: string) => {
    const r = await api(url, method, body);
    if (!r.ok) setError(r.json.error ?? "That didn't work.");
    else {
      setError(null);
      // A hold that stood but whose opportunity didn't is a half-success: say
      // so in amber, not in the same green as a clean one.
      setFlash(
        r.json.opportunity_error
          ? { tone: "warn", text: `${ok} But no NEXUS opportunity was created: ${r.json.opportunity_error}` }
          : { tone: "ok", text: ok },
      );
      await reload();
    }
    return r.ok;
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-4 lg:p-6">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-semibold text-gray-900">Partners</h1>
        <p className="mt-1 text-sm text-gray-600">
          Channel partners sell our stock through the <a className="underline" href="/partner" target="_blank" rel="noreferrer">Partner Portal</a>.
          They see every lot without its builder, estate, lot number or address, and their own clients and deals only.
          Referral fee shown to them: gross developer fee minus the greater of {formatAud(feeRule.floor)} or {feeRule.percent}% (NextKey&apos;s share).
        </p>

        <div className="mt-5 flex gap-1 border-b border-gray-200">
          {(["deals", "firms"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium ${tab === t ? "border-b-2 border-gray-900 text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
            >
              {t === "deals" ? "Hold requests & deals" : `Partner firms (${firms.length})`}
            </button>
          ))}
        </div>

        {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
        {flash && !error && (
          <div
            className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
              flash.tone === "warn" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-green-200 bg-green-50 text-green-800"
            }`}
          >
            {flash.text}
          </div>
        )}

        {tab === "deals" ? (
          <section className="mt-4">
            <div className="mb-3 flex items-center gap-2 text-sm">
              <label htmlFor="scope" className="text-gray-600">Show</label>
              <select id="scope" value={scope} onChange={(e) => setScope(e.target.value)} className="rounded-lg border border-gray-300 bg-white px-2 py-1">
                <option value="open">Open</option>
                <option value="requested">Requests only</option>
                <option value="settled">Settled</option>
                <option value="all">All</option>
              </select>
              {loading && <span className="text-gray-500">Loading…</span>}
            </div>
            {deals.length === 0 && !loading ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600">Nothing here.</div>
            ) : (
              <div className="space-y-3">
                {deals.map((d) => <DealCard key={d.id} deal={d} act={act} />)}
              </div>
            )}
          </section>
        ) : (
          <section className="mt-4 space-y-3">
            {viewerIsSuperAdmin && <OnboardForm prospects={prospects} act={act} />}
            {firms.map((f) => <FirmCard key={f.id} firm={f} canEdit={viewerIsSuperAdmin} act={act} />)}
            {firms.length === 0 && !loading && (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-600">No partner firms yet.</div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

type Act = (url: string, method: string, body: unknown, ok: string) => Promise<boolean>;

function DealCard({ deal, act }: { deal: Deal; act: Act }) {
  const [mode, setMode] = useState<null | "grant" | "decline" | "release" | "reveal" | "message" | "notes">(null);
  const [text, setText] = useState("");
  const [reason, setReason] = useState("");
  const [holdUntil, setHoldUntil] = useState(() => new Date(Date.now() + 72 * 3_600_000).toISOString().slice(0, 10));
  const [reveal, setReveal] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const firm = one<{ firm_name?: string }>(deal.partners)?.firm_name ?? "—";
  const client = one<{ first_name?: string; last_name?: string | null; email?: string | null; phone?: string | null }>(deal.partner_clients);
  const who = one<{ email?: string; full_name?: string | null }>(deal.partner_users);
  const lot = deal.lot_summary ?? {};
  const s = deal.supplier;
  const next = isDealStage(deal.stage) ? STAFF_TRANSITIONS[deal.stage] : [];
  const url = `/api/admin/partners/deals/${deal.id}`;
  const expired = deal.hold_expired;

  const run = async (body: unknown, ok: string) => {
    setBusy(true);
    const done = await act(url, "POST", body, ok);
    setBusy(false);
    if (done) {
      setMode(null);
      setText("");
      setReason("");
    }
  };

  const openReveal = () => {
    setReveal({
      builder_name: deal.revealed?.builder_name ?? s?.builder_name ?? "",
      estate_name: deal.revealed?.estate_name ?? s?.estate_name ?? "",
      lot_number: deal.revealed?.lot_number ?? s?.lot_number ?? "",
      street_address: deal.revealed?.street_address ?? s?.street_address ?? "",
    });
    setMode("reveal");
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-gray-900">
            {lot.ref ?? "—"} · {[lot.bedrooms && `${lot.bedrooms} bed`, lot.propertyType, lot.suburb, lot.state].filter(Boolean).join(" · ")}
          </div>
          <div className="text-gray-600">
            <a className="underline" href={`/properties/${deal.property_id}`}>Stock record</a>
            {" · "}Supplier: {[s?.builder_name, s?.estate_name, s?.lot_number && `Lot ${s.lot_number}`].filter(Boolean).join(" · ") || "unknown"}
            {s && s.pipeline_status !== "active" && <span className="ml-1 text-red-700">(stock is {s.pipeline_status})</span>}
          </div>
        </div>
        <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs font-medium">
          {isDealStage(deal.stage) ? STAFF_STAGE_LABELS[deal.stage] : deal.stage}
          {expired && <span className="ml-1 text-red-700">· hold expired</span>}
        </span>
      </div>

      <div className="mt-2 grid gap-1 text-gray-700 sm:grid-cols-2">
        <div><span className="text-gray-500">Partner:</span> {firm} ({who?.full_name ?? who?.email ?? "—"})</div>
        <div><span className="text-gray-500">Client:</span> {[client?.first_name, client?.last_name].filter(Boolean).join(" ")} · {client?.email ?? client?.phone ?? "no contact"}</div>
        <div><span className="text-gray-500">Price:</span> {formatAud(deal.price_snapshot)} · <span className="text-gray-500">Partner fee:</span> {formatAud(deal.referral_fee_snapshot)}</div>
        <div>
          <span className="text-gray-500">NEXUS:</span> {deal.opportunity_id ?? "no opportunity"}
          {!deal.opportunity_id && ["hold", "eoi", "unconditional", "settled"].includes(deal.stage) && (
            <button className={`${btn} ml-2`} disabled={busy} onClick={() => run({ action: "create_opportunity" }, "Opportunity created.")}>Create</button>
          )}
        </div>
        {deal.hold_expires_at && <div><span className="text-gray-500">Hold until:</span> {new Date(deal.hold_expires_at).toLocaleString("en-AU", { timeZone: "Australia/Brisbane" })}</div>}
        <div><span className="text-gray-500">Details released:</span> {deal.revealed_at ? new Date(deal.revealed_at).toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane" }) : "not yet"}</div>
      </div>
      {deal.partner_note && <p className="mt-2 rounded bg-gray-50 px-3 py-2 text-gray-700"><span className="font-medium">Partner note:</span> {deal.partner_note}</p>}
      {deal.message_to_partner && <p className="mt-2 text-gray-600"><span className="font-medium">Last message to partner:</span> {deal.message_to_partner}</p>}
      {deal.decision_reason && <p className="mt-1 text-gray-600"><span className="font-medium">Reason:</span> {deal.decision_reason}</p>}
      {deal.staff_notes && <p className="mt-1 text-gray-600"><span className="font-medium">Internal notes:</span> {deal.staff_notes}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {next.includes("hold") && <button className={btnPrimary} onClick={() => setMode("grant")}>Grant hold</button>}
        {next.includes("declined") && <button className={btn} onClick={() => setMode("decline")}>Decline</button>}
        {next.filter((n) => ["eoi", "unconditional", "settled"].includes(n)).map((n) => (
          <button key={n} className={btnPrimary} disabled={busy} onClick={() => run({ action: "advance", to: n }, `Moved to ${STAFF_STAGE_LABELS[n]}.`)}>
            Mark: {STAFF_STAGE_LABELS[n]}
          </button>
        ))}
        {next.includes("released") && <button className={btn} onClick={() => setMode("release")}>Release hold</button>}
        {["hold", "eoi", "unconditional", "settled"].includes(deal.stage) && (
          <button className={btn} onClick={openReveal}>{deal.revealed_at ? "Edit released details" : "Release lot details"}</button>
        )}
        <button className={btn} onClick={() => { setText(""); setMode("message"); }}>Message partner</button>
        <button className={btn} onClick={() => { setText(deal.staff_notes ?? ""); setMode("notes"); }}>Internal notes</button>
      </div>

      {mode && (
        <div className="mt-3 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
          {mode === "grant" && (
            <>
              <label className="block text-xs font-medium text-gray-600">Hold until (confirm with the builder first)</label>
              <input type="date" className={input} value={holdUntil} onChange={(e) => setHoldUntil(e.target.value)} />
            </>
          )}
          {(mode === "decline" || mode === "release") && (
            <>
              <label className="block text-xs font-medium text-gray-600">Reason (internal record)</label>
              <input className={input} value={reason} onChange={(e) => setReason(e.target.value)} />
            </>
          )}
          {mode === "reveal" && (
            <div className="grid gap-2 sm:grid-cols-2">
              {REVEAL_FIELDS.map((f) => (
                <label key={f.key} className="text-xs font-medium text-gray-600">
                  {f.label}
                  <input className={input} value={reveal[f.key] ?? ""} onChange={(e) => setReveal((r) => ({ ...r, [f.key]: e.target.value }))} />
                </label>
              ))}
              <p className="text-xs text-amber-800 sm:col-span-2">This shows the supplier to {firm}. Only release once the hold is confirmed and the partner agreement is signed.</p>
            </div>
          )}
          {mode !== "reveal" && (
            <>
              <label className="block text-xs font-medium text-gray-600">
                {mode === "notes" ? "Internal notes (never shown to the partner)" : mode === "message" ? "Message to partner" : "Message to partner (optional — a standard one is sent otherwise)"}
              </label>
              <textarea className={input} rows={2} value={text} onChange={(e) => setText(e.target.value)} />
            </>
          )}
          <div className="flex gap-2">
            <button
              className={btnPrimary}
              disabled={busy || ((mode === "decline" || mode === "release") && !reason) || (mode === "message" && !text.trim())}
              onClick={() => {
                if (mode === "grant") void run({ action: "grant_hold", hold_until: `${holdUntil}T17:00:00+10:00`, message: text }, "Hold granted.");
                if (mode === "decline") void run({ action: "decline", reason, message: text }, "Request declined.");
                if (mode === "release") void run({ action: "release", reason, message: text }, "Hold released.");
                if (mode === "reveal") void run({ action: "reveal", revealed: reveal }, "Lot details released to the partner.");
                if (mode === "message") void run({ action: "message", message: text }, "Message sent.");
                if (mode === "notes") void run({ action: "notes", staff_notes: text }, "Notes saved.");
              }}
            >
              {busy ? "Working…" : "Confirm"}
            </button>
            <button className={btn} onClick={() => setMode(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

function OnboardForm({ prospects, act }: { prospects: Prospect[]; act: Act }) {
  const empty = { firm_name: "", contact_name: "", contact_email: "", contact_phone: "", abn: "", tier: "basic", agreement_ref: "", channel_partner_id: "", send_invite: true };
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);

  const pick = (id: string) => {
    const p = prospects.find((x) => x.id === id);
    setForm((f) => ({
      ...f,
      channel_partner_id: id,
      firm_name: p?.company ?? f.firm_name,
      contact_name: p?.contact_name ?? f.contact_name,
      contact_email: p?.email ?? f.contact_email,
      contact_phone: p?.phone ?? f.contact_phone,
    }));
  };

  if (!open) return <button className={btnPrimary} onClick={() => setOpen(true)}>Onboard a partner</button>;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
      <div className="mb-3 font-semibold text-gray-900">Onboard a partner firm</div>
      <div className="grid gap-2 sm:grid-cols-2">
        {prospects.length > 0 && (
          <label className="text-xs font-medium text-gray-600 sm:col-span-2">
            From the recruitment list (optional)
            <select className={input} value={form.channel_partner_id} onChange={(e) => pick(e.target.value)}>
              <option value="">—</option>
              {prospects.map((p) => <option key={p.id} value={p.id}>{p.company}</option>)}
            </select>
          </label>
        )}
        {([
          ["firm_name", "Firm name"], ["abn", "ABN"], ["contact_name", "Contact name"],
          ["contact_email", "Contact email (their login)"], ["contact_phone", "Contact phone"], ["agreement_ref", "Agreement reference"],
        ] as const).map(([k, label]) => (
          <label key={k} className="text-xs font-medium text-gray-600">
            {label}
            <input className={input} value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
          </label>
        ))}
        <label className="text-xs font-medium text-gray-600">
          Tier
          <select className={input} value={form.tier} onChange={(e) => setForm((f) => ({ ...f, tier: e.target.value }))}>
            {PARTNER_TIERS.map((t) => <option key={t} value={t}>{TIER_DEFINITIONS[t].label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
          <input type="checkbox" checked={form.send_invite} onChange={(e) => setForm((f) => ({ ...f, send_invite: e.target.checked }))} />
          Email them their portal invitation now
        </label>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          className={btnPrimary}
          disabled={busy || !form.firm_name || !form.contact_email}
          onClick={async () => {
            setBusy(true);
            const ok = await act("/api/admin/partners", "POST", form, form.send_invite ? "Partner onboarded and invited." : "Partner onboarded (no invitation sent).");
            setBusy(false);
            if (ok) {
              setForm(empty);
              setOpen(false);
            }
          }}
        >
          {busy ? "Saving…" : "Onboard"}
        </button>
        <button className={btn} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </div>
  );
}

function FirmCard({ firm, canEdit, act }: { firm: Firm; canEdit: boolean; act: Act }) {
  const [editing, setEditing] = useState(false);
  const [tier, setTier] = useState(firm.tier);
  const [grants, setGrants] = useState<string[]>(firm.feature_grants ?? []);
  const [branding, setBranding] = useState<Record<string, string>>(firm.branding ?? {});
  const [newUser, setNewUser] = useState({ email: "", full_name: "" });
  const [busy, setBusy] = useState(false);
  const base = `/api/admin/partners/${firm.id}`;
  const tierDef = TIER_DEFINITIONS[(PARTNER_TIERS as readonly string[]).includes(firm.tier) ? (firm.tier as keyof typeof TIER_DEFINITIONS) : "basic"];
  const whiteLabel = tierDef.features.includes("white_label") || grants.includes("white_label");

  const wrap = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    await fn();
    setBusy(false);
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="font-semibold text-gray-900">
            {firm.firm_name}
            {firm.status !== "active" && <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-700">{firm.status}</span>}
          </div>
          <div className="text-gray-600">
            {tierDef.label}
            {(firm.feature_grants ?? []).length > 0 && ` + ${firm.feature_grants.map((g) => PARTNER_FEATURES[g as PartnerFeature]?.label ?? g).join(", ")}`}
            {" · "}{firm.counts.clients} clients · {firm.counts.open} open deals · {firm.counts.settled} settled
          </div>
          <div className="text-xs text-gray-500">
            {firm.contact_name ?? "—"} · {firm.contact_email ?? "—"} · Agreement {firm.agreement_ref ?? "not recorded"}
          </div>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            <button className={btn} onClick={() => setEditing((e) => !e)}>{editing ? "Close" : "Plan & branding"}</button>
            <button
              className={btn}
              disabled={busy}
              onClick={() => wrap(() => act(base, "PATCH", { status: firm.status === "active" ? "suspended" : "active" }, firm.status === "active" ? "Firm suspended; all sessions ended." : "Firm reactivated."))}
            >
              {firm.status === "active" ? "Suspend firm" : "Reactivate"}
            </button>
          </div>
        )}
      </div>

      <ul className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-100">
        {firm.users.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <span>
              {u.full_name ?? u.email} <span className="text-gray-500">{u.email}</span>
              {u.is_primary && <span className="ml-1 text-xs text-gray-500">(primary)</span>}
              {u.status !== "active" && <span className="ml-1 text-xs text-red-700">suspended</span>}
            </span>
            <span className="flex items-center gap-2 text-xs text-gray-500">
              {u.last_login_at ? `last in ${new Date(u.last_login_at).toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane" })}` : "never signed in"}
              {canEdit && (
                <>
                  <button className={btn} disabled={busy} onClick={() => wrap(() => act(`/api/admin/partners/users/${u.id}`, "PATCH", { action: "resend_invite" }, "Invitation re-sent."))}>Resend invite</button>
                  <button className={btn} disabled={busy} onClick={() => wrap(() => act(`/api/admin/partners/users/${u.id}`, "PATCH", { status: u.status === "active" ? "suspended" : "active" }, u.status === "active" ? "Login suspended." : "Login reactivated."))}>
                    {u.status === "active" ? "Suspend" : "Reactivate"}
                  </button>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>

      {canEdit && editing && (
        <div className="mt-3 space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs font-medium text-gray-600">
              Tier
              <select className={input} value={tier} onChange={(e) => setTier(e.target.value)}>
                {PARTNER_TIERS.map((t) => (
                  <option key={t} value={t}>{TIER_DEFINITIONS[t].label} — {TIER_DEFINITIONS[t].maxUsers ?? "unlimited"} logins</option>
                ))}
              </select>
            </label>
            <fieldset className="text-xs font-medium text-gray-600">
              Extras sold on request
              {(Object.keys(PARTNER_FEATURES) as PartnerFeature[]).map((f) => (
                <label key={f} className="mt-1 flex items-center gap-2 font-normal">
                  <input type="checkbox" checked={grants.includes(f)} onChange={(e) => setGrants((g) => (e.target.checked ? [...g, f] : g.filter((x) => x !== f)))} />
                  {PARTNER_FEATURES[f].label}{!PARTNER_FEATURES[f].built && " (not built yet)"}
                </label>
              ))}
            </fieldset>
          </div>
          <div>
            <div className="text-xs font-semibold text-gray-700">White-label branding {whiteLabel ? "" : "(saved, but only applied once they have White-label)"}</div>
            <div className="mt-1 grid gap-2 sm:grid-cols-4">
              {([["display_name", "Display name"], ["logo_url", "Logo URL (https)"], ["primary_color", "Primary #hex"], ["accent_color", "Accent #hex"]] as const).map(([k, label]) => (
                <label key={k} className="text-xs font-medium text-gray-600">
                  {label}
                  <input className={input} value={branding[k] ?? ""} onChange={(e) => setBranding((b) => ({ ...b, [k]: e.target.value }))} />
                </label>
              ))}
            </div>
          </div>
          <button
            className={btnPrimary}
            disabled={busy}
            onClick={() => wrap(() => act(base, "PATCH", { tier, feature_grants: grants, branding }, "Plan and branding saved — applies on the partner's next click."))}
          >
            Save plan & branding
          </button>
          <div className="border-t border-gray-200 pt-3">
            <div className="text-xs font-semibold text-gray-700">Add a login ({firm.users.filter((u) => u.status === "active").length}/{tierDef.maxUsers ?? "∞"} used)</div>
            <div className="mt-1 flex flex-wrap gap-2">
              <input className={`${input} max-w-xs`} placeholder="email" value={newUser.email} onChange={(e) => setNewUser((u) => ({ ...u, email: e.target.value }))} />
              <input className={`${input} max-w-xs`} placeholder="full name" value={newUser.full_name} onChange={(e) => setNewUser((u) => ({ ...u, full_name: e.target.value }))} />
              <button
                className={btnPrimary}
                disabled={busy || !newUser.email}
                onClick={() => wrap(async () => {
                  if (await act(`${base}/users`, "POST", newUser, "Login added and invited.")) setNewUser({ email: "", full_name: "" });
                })}
              >
                Add & invite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
