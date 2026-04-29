"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import NewOpportunityModal from "../../opportunities/NewOpportunityModal";
import { stripHtml, splitGhlNoteBundle, fmtDateTime, truncate } from "../../archive/_lib";

type Contact = {
  id: string;
  created_at: string | null;
  updated_at: string | null;
  name: string | null;
  full_name: string | null;
  first_name: string | null;
  email: string | null;
  phone: string | null;
  buyer_type: string | null;
  state: string | null;
  preferred_state: string | null;
  budget: number | null;
  budget_min: number | null;
  budget_max: number | null;
  finance_status: string | null;
  timeframe: string | null;
  lead_score: number | null;
  temperature: string | null;
  status: string | null;
  source: string | null;
  ghl_contact_id: string | null;
  tags: string[] | null;
  notes: string | null;
};

type Lead = {
  lead_id: string;
  full_name: string | null;
  email: string | null;
  buyer_type: string | null;
  state: string | null;
  budget: string | null;
  score: number | null;
  temperature: string | null;
  ghl_stage: string | null;
  match_status: string | null;
  top_match_name: string | null;
  top_match_price: string | null;
  created_at: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const displayName = (c: Contact) => c.full_name || c.name || "Unknown";

const fmt = (n: number | null | undefined) =>
  n ? `$${Number(n).toLocaleString()}` : null;

const avatarColors = ["bg-violet-600","bg-blue-600","bg-emerald-600","bg-rose-600","bg-amber-600","bg-cyan-600","bg-pink-600","bg-indigo-600"];
const avatarBg = (name: string) => avatarColors[name.charCodeAt(0) % avatarColors.length];

const tempConfig: Record<string, { label: string; badge: string; bg: string; icon: string }> = {
  hot:  { label: "Hot",  badge: "bg-red-100 text-red-700 border border-red-200",    bg: "bg-red-500",    icon: "🔥" },
  warm: { label: "Warm", badge: "bg-amber-100 text-amber-700 border border-amber-200", bg: "bg-amber-400", icon: "⚡" },
  cold: { label: "Cold", badge: "bg-blue-100 text-blue-700 border border-blue-200",  bg: "bg-blue-400",   icon: "❄️" },
};

const statusConfig: Record<string, { label: string; style: string }> = {
  new:       { label: "New",       style: "bg-gray-100 text-gray-600" },
  matched:   { label: "Matched",   style: "bg-green-100 text-green-700" },
  contacted: { label: "Contacted", style: "bg-sky-100 text-sky-700" },
};

const tagColor = (tag: string) => {
  if (tag.startsWith("source:")) return "bg-gray-100 text-gray-500 border border-gray-200";
  if (tag === "elvis-triaged") return "bg-purple-100 text-purple-600 border border-purple-200";
  if (tag === "hot") return "bg-red-100 text-red-600 border border-red-200";
  if (tag === "warm") return "bg-amber-100 text-amber-600 border border-amber-200";
  if (tag === "cold") return "bg-blue-100 text-blue-600 border border-blue-200";
  if (["fhb", "investor", "downsizer", "sda"].includes(tag)) return "bg-indigo-100 text-indigo-600 border border-indigo-200";
  return "bg-gray-100 text-gray-600 border border-gray-200";
};

const TABS = ["Overview", "Activity", "Notes", "Matched Properties"] as const;
type Tab = typeof TABS[number];

// ── Main ─────────────────────────────────────────────────────────────────────

const CONTACT_TYPES = [
  { key: "Investor",         label: "Investor",         icon: "📈" },
  { key: "First Home Buyer", label: "First Home Buyer", icon: "🏠" },
  { key: "Home Buyer",       label: "Home Buyer",       icon: "🏡" },
  { key: "SMSF Buyer",       label: "SMSF Buyer",       icon: "🏦" },
  { key: "Downsizer",        label: "Downsizer",        icon: "📦" },
  { key: "NDIS",             label: "NDIS",             icon: "♿" },
  { key: "Other",            label: "Other",            icon: "👤" },
  { key: "Business Contact", label: "Business Contact", icon: "💼" },
];

type GhlArchive = {
  notes: Array<{ id: string; body: string | null; user_id: string | null; pinned: boolean | null; date_added: string | null }>;
  conversations: Array<{ id: string; type: string | null; unread_count: number | null; last_message_body: string | null; last_message_type: string | null; last_message_date: string | null }>;
  tasks: Array<{ id: string; title: string | null; body: string | null; due_date: string | null; completed: boolean | null; date_added: string | null }>;
  appointments: Array<{ id: string; title: string | null; appointment_status: string | null; start_time: string | null }>;
  opportunities: Array<{ id: string; name: string | null; pipeline_id: string | null; pipeline_stage_id: string | null; status: string | null; monetary_value: number | null; date_added: string | null }>;
};

export default function ContactDetail({
  contact,
  leads,
  ghlArchive = { notes: [], conversations: [], tasks: [], appointments: [], opportunities: [] },
  ghlContactId = null,
}: {
  contact: Contact;
  leads: Lead[];
  ghlArchive?: GhlArchive;
  ghlContactId?: string | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("Overview");
  const [noteText, setNoteText] = useState(contact.notes || "");
  const [noteSaved, setNoteSaved] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [showOpportunityModal, setShowOpportunityModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [buyerType, setBuyerType] = useState(contact.buyer_type || "");
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const noteRef = useRef(contact.notes || "");

  const handleAssignType = async (type: string) => {
    setShowTypeMenu(false);
    setBuyerType(type);
    await fetch(`/api/contacts/${contact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buyer_type: type }),
    });
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await fetch(`/api/contacts/${contact.id}`, { method: "DELETE" });
      router.push("/contacts");
    } finally {
      setDeleting(false);
    }
  };

  const name = displayName(contact);
  const temp = contact.temperature ? tempConfig[contact.temperature] : null;
  const status = contact.status ? statusConfig[contact.status] : null;
  const budget = fmt(contact.budget_max || contact.budget);

  const saveNote = async () => {
    if (noteText === noteRef.current) return;
    setSavingNote(true);
    try {
      await fetch(`/api/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: noteText }),
      });
      noteRef.current = noteText;
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 2000);
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <div className="flex flex-col h-full -mx-8 -my-8 bg-gray-50">

      {/* Confirm delete */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 p-6">
            <div className="text-3xl mb-3 text-center">🗑️</div>
            <h3 className="text-base font-bold text-gray-900 text-center mb-1">Delete {name}?</h3>
            <p className="text-sm text-gray-500 text-center mb-6">This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition">
                Cancel
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-red-600 rounded-xl hover:bg-red-700 disabled:opacity-60 transition">
                {deleting ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Top bar ── */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 text-sm">
          <button onClick={() => router.push("/contacts")} className="text-gray-400 hover:text-gray-700 transition">
            ← Contacts
          </button>
          <span className="text-gray-300">/</span>
          <span className="text-gray-700 font-medium">{name}</span>
        </div>
        <div className="flex items-center gap-2">
          {contact.email && (
            <a href={`mailto:${contact.email}`}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 transition">
              ✉️ Send Email
            </a>
          )}
          {contact.phone && (
            <a href={`tel:${contact.phone}`}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 transition">
              📱 Call
            </a>
          )}
          <button
            onClick={() => setShowOpportunityModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
            ＋ New Opportunity
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition">
            🗑️ Delete
          </button>
          {contact.ghl_contact_id && (
            <a href={`https://app.gohighlevel.com/contacts/${contact.ghl_contact_id}`}
              target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition">
              Open in GHL →
            </a>
          )}
        </div>
      </div>

      {showOpportunityModal && (
        <NewOpportunityModal
          onClose={() => setShowOpportunityModal(false)}
          onCreated={() => setShowOpportunityModal(false)}
          prefillContact={{
            id: contact.id,
            name: contact.name,
            full_name: contact.full_name,
            email: contact.email,
            phone: contact.phone,
            buyer_type: contact.buyer_type,
            preferred_state: contact.preferred_state || contact.state,
            budget_max: contact.budget_max || contact.budget,
          }}
        />
      )}

      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT SIDEBAR ── */}
        <aside className="w-80 bg-white border-r border-gray-200 flex flex-col overflow-y-auto flex-shrink-0">

          {/* Avatar + name */}
          <div className="px-6 py-6 border-b border-gray-100 text-center">
            <div className={`w-20 h-20 rounded-full ${avatarBg(name)} text-white flex items-center justify-center text-3xl font-bold mx-auto mb-4`}>
              {name[0]?.toUpperCase() || "?"}
            </div>
            <h1 className="text-xl font-bold text-gray-900">{name}</h1>
            {contact.email && <p className="text-sm text-gray-400 mt-0.5 break-all">{contact.email}</p>}
            {contact.phone && <p className="text-sm text-gray-500 mt-0.5">{contact.phone}</p>}

            {/* Status + temp badges */}
            <div className="flex justify-center gap-2 mt-3 flex-wrap">
              {temp && (
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${temp.badge}`}>
                  {temp.icon} {temp.label}
                </span>
              )}
              {status && (
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${status.style}`}>
                  {status.label}
                </span>
              )}
              <div className="relative">
                <button
                  onClick={() => setShowTypeMenu(v => !v)}
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold transition hover:ring-2 hover:ring-indigo-300 ${buyerType ? "bg-indigo-100 text-indigo-700" : "bg-gray-100 text-gray-400 border border-dashed border-gray-300"}`}
                >
                  {buyerType || "＋ Set Type"}
                </button>
                {showTypeMenu && (
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 w-48 bg-white border border-gray-200 rounded-xl shadow-xl z-50 py-1 overflow-hidden">
                    {CONTACT_TYPES.map(ct => (
                      <button key={ct.key}
                        onClick={() => handleAssignType(ct.key)}
                        className={`w-full flex items-center gap-2 px-4 py-2 text-sm transition hover:bg-indigo-50 hover:text-indigo-700 ${buyerType === ct.key ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-gray-700"}`}
                      >
                        <span>{ct.icon}</span> {ct.label}
                      </button>
                    ))}
                    {buyerType && (
                      <button
                        onClick={() => handleAssignType("")}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-400 hover:bg-red-50 hover:text-red-600 transition border-t border-gray-100"
                      >
                        ✕ Remove type
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Lead score */}
          {contact.lead_score != null && (
            <div className="px-6 py-4 border-b border-gray-100">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Lead Score</span>
                <span className="text-lg font-bold text-gray-900">{contact.lead_score}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${contact.lead_score >= 70 ? "bg-green-500" : contact.lead_score >= 40 ? "bg-amber-400" : "bg-red-400"}`}
                  style={{ width: `${Math.min(contact.lead_score, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-gray-300 mt-1">
                <span>0</span><span>50</span><span>100</span>
              </div>
            </div>
          )}

          {/* Contact details */}
          <div className="px-6 py-4 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Contact Details</p>
            <dl className="space-y-3">
              {[
                ["Source", contact.source?.replace(/_/g, " ")],
                ["State", contact.preferred_state || contact.state],
                ["Timeframe", contact.timeframe],
                ["Finance", contact.finance_status],
              ].filter(([, v]) => v).map(([k, v]) => (
                <div key={k as string} className="flex justify-between gap-2">
                  <dt className="text-xs text-gray-400 flex-shrink-0">{k}</dt>
                  <dd className="text-xs font-medium text-gray-800 text-right capitalize">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Budget */}
          {(budget || contact.budget_min) && (
            <div className="px-6 py-4 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Budget</p>
              {contact.budget_min && contact.budget_max && contact.budget_min !== contact.budget_max ? (
                <p className="text-sm font-semibold text-gray-900">
                  {fmt(contact.budget_min)} – {fmt(contact.budget_max)}
                </p>
              ) : (
                <p className="text-sm font-semibold text-gray-900">{budget}</p>
              )}
            </div>
          )}

          {/* Tags */}
          {contact.tags && contact.tags.length > 0 && (
            <div className="px-6 py-4 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {contact.tags.map((tag, i) => (
                  <span key={i} className={`px-2 py-0.5 rounded text-xs font-medium ${tagColor(tag)}`}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* GHL ID */}
          {contact.ghl_contact_id && (
            <div className="px-6 py-4 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">GHL Contact ID</p>
              <p className="text-xs font-mono text-gray-500 break-all">{contact.ghl_contact_id}</p>
            </div>
          )}

          {/* Timestamps */}
          <div className="px-6 py-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Timeline</p>
            <dl className="space-y-2">
              {contact.created_at && (
                <div className="flex justify-between gap-2">
                  <dt className="text-xs text-gray-400">Created</dt>
                  <dd className="text-xs font-medium text-gray-600">
                    {new Date(contact.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                  </dd>
                </div>
              )}
              {contact.updated_at && (
                <div className="flex justify-between gap-2">
                  <dt className="text-xs text-gray-400">Last updated</dt>
                  <dd className="text-xs font-medium text-gray-600">
                    {new Date(contact.updated_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </aside>

        {/* ── MAIN CONTENT ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Tab bar */}
          <div className="bg-white border-b border-gray-200 px-6 flex-shrink-0">
            <div className="flex gap-0">
              {TABS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-5 py-4 text-sm font-medium border-b-2 transition-colors -mb-px ${
                    tab === t
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {t}
                  {t === "Matched Properties" && leads.length > 0 && (
                    <span className="ml-1.5 text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-semibold">
                      {leads.length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-6">

            {/* ── OVERVIEW ── */}
            {tab === "Overview" && (
              <div className="space-y-4 max-w-3xl">
                {/* Summary card */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h2 className="text-sm font-semibold text-gray-700 mb-4">Contact Summary</h2>
                  <div className="grid grid-cols-2 gap-4">
                    {[
                      { label: "Full Name",    value: name },
                      { label: "Email",        value: contact.email },
                      { label: "Phone",        value: contact.phone },
                      { label: "Buyer Type",   value: contact.buyer_type },
                      { label: "State",        value: contact.preferred_state || contact.state },
                      { label: "Budget",       value: fmt(contact.budget_max || contact.budget) },
                      { label: "Timeframe",    value: contact.timeframe },
                      { label: "Finance",      value: contact.finance_status },
                      { label: "Temperature",  value: contact.temperature },
                      { label: "Status",       value: contact.status },
                      { label: "Source",       value: contact.source?.replace(/_/g, " ") },
                      { label: "Lead Score",   value: contact.lead_score?.toString() },
                    ].filter((r) => r.value).map((row) => (
                      <div key={row.label} className="flex flex-col gap-0.5">
                        <span className="text-xs text-gray-400 font-medium">{row.label}</span>
                        <span className="text-sm text-gray-900 font-semibold capitalize">{row.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Elvis notes */}
                {contact.notes && (
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h2 className="text-sm font-semibold text-gray-700 mb-3">Elvis AI Notes</h2>
                    <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{contact.notes}</p>
                  </div>
                )}

                {/* Quick lead activity */}
                {leads.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 p-6">
                    <h2 className="text-sm font-semibold text-gray-700 mb-4">Recent Lead Activity</h2>
                    <div className="space-y-3">
                      {leads.slice(0, 3).map((l) => (
                        <div key={l.lead_id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                          <div>
                            <p className="text-sm font-medium capitalize">{l.buyer_type || "Lead"} — {l.state || "Unknown state"}</p>
                            <p className="text-xs text-gray-400">
                              Budget: {l.budget || "—"} · Score: {l.score ?? "—"}
                            </p>
                          </div>
                          <div className="text-right">
                            {l.match_status === "matched" && l.top_match_name && (
                              <p className="text-xs text-green-600 font-medium">✓ {l.top_match_name}</p>
                            )}
                            <p className="text-xs text-gray-400 mt-0.5">
                              {l.created_at ? new Date(l.created_at).toLocaleDateString("en-AU") : "—"}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── ACTIVITY ── */}
            {tab === "Activity" && (
              <div className="max-w-2xl space-y-0">
                {leads.length === 0 ? (
                  <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
                    <p className="text-4xl mb-3">📭</p>
                    <p className="font-medium">No activity yet</p>
                    <p className="text-sm mt-1">Activity appears when Elvis AI processes this contact</p>
                  </div>
                ) : (
                  <div className="relative">
                    {/* Timeline line */}
                    <div className="absolute left-5 top-0 bottom-0 w-px bg-gray-200" />
                    <div className="space-y-0">
                      {leads.map((l, i) => (
                        <div key={l.lead_id} className="flex gap-4 pb-6">
                          {/* Dot */}
                          <div className={`relative z-10 w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-sm border-2 border-white shadow-sm ${
                            l.match_status === "matched" ? "bg-green-500" : "bg-blue-400"
                          }`}>
                            {l.match_status === "matched" ? "✓" : "→"}
                          </div>
                          {/* Content */}
                          <div className="flex-1 bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <p className="text-sm font-semibold text-gray-900">
                                  {l.match_status === "matched" ? "Matched to properties" : "Lead submitted"}
                                </p>
                                <p className="text-xs text-gray-400 mt-0.5 capitalize">
                                  {l.buyer_type} · {l.state} · Budget {l.budget || "—"} · Score {l.score ?? "—"}
                                </p>
                              </div>
                              <span className="text-xs text-gray-400 whitespace-nowrap ml-4">
                                {l.created_at ? new Date(l.created_at).toLocaleString("en-AU", { dateStyle: "short", timeStyle: "short" }) : "—"}
                              </span>
                            </div>
                            {l.top_match_name && (
                              <div className="flex items-center gap-2 mt-2 p-2 bg-green-50 rounded-lg">
                                <span className="text-green-500">🏘</span>
                                <div>
                                  <p className="text-xs font-semibold text-green-800">{l.top_match_name}</p>
                                  {l.top_match_price && <p className="text-xs text-green-600">{l.top_match_price}</p>}
                                </div>
                              </div>
                            )}
                            {l.ghl_stage && (
                              <div className="mt-2">
                                <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">{l.ghl_stage}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}

                      {/* Created event */}
                      {contact.created_at && (
                        <div className="flex gap-4">
                          <div className="relative z-10 w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-sm bg-gray-400 border-2 border-white shadow-sm text-white">
                            ★
                          </div>
                          <div className="flex-1 bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                            <p className="text-sm font-semibold text-gray-900">Contact created</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {new Date(contact.created_at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}
                              {contact.source && ` via ${contact.source.replace(/_/g, " ")}`}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* GHL Archive activity panels */}
                {(ghlArchive.conversations.length > 0 || ghlArchive.tasks.length > 0 ||
                  ghlArchive.appointments.length > 0 || ghlArchive.opportunities.length > 0) && (
                  <div className="mt-8 space-y-4">
                    <div className="flex items-center gap-2 pt-4 border-t border-gray-200">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">📦 Historical from GHL</span>
                    </div>

                    {ghlArchive.conversations.length > 0 && (
                      <GhlSectionCard title={`Conversations (${ghlArchive.conversations.length})`}>
                        <div className="space-y-1.5">
                          {ghlArchive.conversations.slice(0, 8).map((c) => (
                            <div key={c.id} className="flex items-start gap-2 py-1.5 text-xs border-b border-gray-50 last:border-0">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${
                                (c.last_message_type || "").toLowerCase().includes("email") ? "bg-blue-100 text-blue-700"
                                : (c.last_message_type || "").toLowerCase().includes("sms") ? "bg-green-100 text-green-700"
                                : "bg-gray-100 text-gray-600"
                              }`}>{c.last_message_type || c.type || "msg"}</span>
                              <span className="flex-1 text-gray-700">{truncate(stripHtml(c.last_message_body), 100)}</span>
                              <span className="text-gray-400 whitespace-nowrap">{fmtDateTime(c.last_message_date)}</span>
                            </div>
                          ))}
                          {ghlArchive.conversations.length > 8 && (
                            <p className="text-xs text-gray-400 italic mt-2">
                              + {ghlArchive.conversations.length - 8} more — see full list at <a href={`/archive/contacts/${ghlContactId}`} className="text-blue-600 hover:underline">archive view</a>
                            </p>
                          )}
                        </div>
                      </GhlSectionCard>
                    )}

                    {ghlArchive.opportunities.length > 0 && (
                      <GhlSectionCard title={`Historical opportunities (${ghlArchive.opportunities.length})`}>
                        <div className="space-y-1.5 text-xs">
                          {ghlArchive.opportunities.map((o) => (
                            <div key={o.id} className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
                              <div>
                                <p className="font-medium text-gray-800">{o.name || "(untitled)"}</p>
                                <p className="text-gray-400">{o.status || "—"}</p>
                              </div>
                              <span className="text-gray-500 font-mono">
                                {o.monetary_value ? `$${Number(o.monetary_value).toLocaleString()}` : "—"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </GhlSectionCard>
                    )}

                    {ghlArchive.appointments.length > 0 && (
                      <GhlSectionCard title={`Appointments (${ghlArchive.appointments.length})`}>
                        <div className="space-y-1.5 text-xs">
                          {ghlArchive.appointments.map((a) => (
                            <div key={a.id} className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
                              <div>
                                <p className="font-medium text-gray-800">{a.title || "(untitled)"}</p>
                                <p className="text-gray-400">{a.appointment_status || "—"}</p>
                              </div>
                              <span className="text-gray-500">{fmtDateTime(a.start_time)}</span>
                            </div>
                          ))}
                        </div>
                      </GhlSectionCard>
                    )}

                    {ghlArchive.tasks.length > 0 && (
                      <GhlSectionCard title={`Tasks (${ghlArchive.tasks.length})`}>
                        <div className="space-y-1.5 text-xs">
                          {ghlArchive.tasks.map((t) => (
                            <div key={t.id} className="flex items-start justify-between gap-2 py-1 border-b border-gray-50 last:border-0">
                              <div className="flex-1">
                                <p className="font-medium text-gray-800">{t.title || "(untitled)"}</p>
                                {t.body && <p className="text-gray-500 mt-0.5">{truncate(stripHtml(t.body), 80)}</p>}
                              </div>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${
                                t.completed ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"
                              }`}>{t.completed ? "done" : "open"}</span>
                            </div>
                          ))}
                        </div>
                      </GhlSectionCard>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ── NOTES ── */}
            {tab === "Notes" && (
              <div className="max-w-2xl space-y-5">
                {/* Live editable notes */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
                    <h2 className="text-sm font-semibold text-gray-700">Notes</h2>
                    {noteText !== noteRef.current && (
                      <button
                        onClick={saveNote}
                        disabled={savingNote}
                        className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition"
                      >
                        {savingNote ? "Saving…" : "Save"}
                      </button>
                    )}
                    {noteSaved && (
                      <span className="text-xs text-green-600 font-medium">✓ Saved</span>
                    )}
                  </div>
                  <textarea
                    className="w-full p-5 text-sm text-gray-700 min-h-[300px] resize-none focus:outline-none leading-relaxed"
                    placeholder="Add notes about this contact…&#10;&#10;Elvis AI notes appear here automatically after processing."
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    onBlur={saveNote}
                  />
                </div>

                {/* Historical GHL notes — bundle each row's body into per-entry sub-cards */}
                {ghlArchive.notes.length > 0 && (
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-100">
                      <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                        <span>📦</span> Historical notes from GHL
                        <span className="text-xs text-gray-400 font-normal">
                          {ghlArchive.notes.length} {ghlArchive.notes.length === 1 ? "row" : "rows"}, frozen archive
                        </span>
                      </h2>
                    </div>
                    <div className="p-4 space-y-3">
                      {ghlArchive.notes.map((n) => {
                        const entries = splitGhlNoteBundle(stripHtml(n.body));
                        return (
                          <div key={n.id} className="border border-gray-100 rounded-lg p-3 bg-gray-50">
                            <div className="flex items-center gap-2 mb-2 pb-1.5 border-b border-gray-200 text-xs text-gray-500">
                              <span>Last edit: {fmtDateTime(n.date_added)}</span>
                              {n.pinned && <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">📌 pinned</span>}
                              {entries.length > 1 && <span>· {entries.length} entries</span>}
                            </div>
                            <div className="space-y-2">
                              {entries.map((entry, i) => (
                                <div key={i} className="bg-white rounded-md border border-gray-100 p-3">
                                  <p className="text-sm text-gray-800 whitespace-pre-wrap">{entry.body || "(empty entry)"}</p>
                                  {(entry.date || entry.author) && (
                                    <div className="flex items-center justify-between gap-2 mt-2 pt-1.5 border-t border-gray-100 text-[11px] text-gray-500">
                                      {entry.date ? <span>{entry.date}</span> : <span></span>}
                                      {entry.author && <span>by {entry.author}</span>}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {ghlArchive.notes.length === 0 && ghlContactId && (
                  <p className="text-xs text-gray-400 italic">
                    No historical GHL notes for this contact (matched GHL id: <code>{ghlContactId}</code>).
                  </p>
                )}
              </div>
            )}

            {/* ── MATCHED PROPERTIES ── */}
            {tab === "Matched Properties" && (
              <div className="max-w-3xl space-y-4">
                {leads.length === 0 ? (
                  <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-400">
                    <p className="text-4xl mb-3">🏘</p>
                    <p className="font-medium">No matches yet</p>
                    <p className="text-sm mt-1">Elvis AI will match properties when this contact submits a lead</p>
                  </div>
                ) : (
                  leads.map((l) => (
                    <div key={l.lead_id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                      {/* Lead header */}
                      <div className="px-5 py-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                        <div>
                          <p className="text-sm font-semibold text-gray-900 capitalize">
                            {l.buyer_type} Lead — {l.state || "Unknown"}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5">
                            Lead ID: {l.lead_id.slice(0, 8)}… ·{" "}
                            {l.created_at ? new Date(l.created_at).toLocaleDateString("en-AU") : "—"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {l.score != null && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${l.score >= 70 ? "bg-green-100 text-green-700" : l.score >= 40 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                              Score {l.score}
                            </span>
                          )}
                          {l.match_status && (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${l.match_status === "matched" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                              {l.match_status}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Match details */}
                      <div className="px-5 py-4">
                        <div className="grid grid-cols-2 gap-4 mb-4">
                          <div>
                            <p className="text-xs text-gray-400 mb-0.5">Budget</p>
                            <p className="text-sm font-semibold text-gray-900">{l.budget || "—"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400 mb-0.5">Pipeline Stage</p>
                            <p className="text-sm font-semibold text-gray-900">{l.ghl_stage || "—"}</p>
                          </div>
                        </div>

                        {l.top_match_name && (
                          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                            <div className="flex items-start gap-3">
                              <span className="text-2xl">🏘</span>
                              <div>
                                <p className="text-xs text-green-600 font-semibold uppercase tracking-wide mb-1">Top Match</p>
                                <p className="text-base font-bold text-green-900">{l.top_match_name}</p>
                                {l.top_match_price && (
                                  <p className="text-sm text-green-700 font-medium mt-0.5">{l.top_match_price}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

/** Compact panel used in the Activity tab to surface GHL-archive sub-sections. */
function GhlSectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
      {children}
    </div>
  );
}
