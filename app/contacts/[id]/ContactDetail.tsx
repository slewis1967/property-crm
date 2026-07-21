"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import NewOpportunityModal from "../../opportunities/NewOpportunityModal";
import { stripHtml, splitGhlNoteBundle, fmtDateTime, truncate } from "../../../utils/archive-helpers";
import AIBrief from "../../components/AIBrief";
import AISuggestedAction from "../../components/AISuggestedAction";
import AISmartReply from "../../components/AISmartReply";
import AIContactMatches from "../../components/AIContactMatches";
import AIQuickLog from "../../components/AIQuickLog";
import AIDocumentExtract from "../../components/AIDocumentExtract";
import AIPropertyPitch from "../../components/AIPropertyPitch";
import EmailComposeModal from "../../components/EmailComposeModal";
import StartVideoCallButton from "../../components/StartVideoCallButton";
import GuestLinkButton from "../../components/GuestLinkButton";
import RequestDocumentsButton from "../../components/RequestDocumentsButton";
import DocumentProgress from "../../components/DocumentProgress";
import EditRecordModal from "../../components/EditRecordModal";
import DeleteReasonModal from "../../components/DeleteReasonModal";
import ContactEmailHistory, { type EmailRow } from "./ContactEmailHistory";
import ContactVideoCalls from "../../components/ContactVideoCalls";

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
  // Personal
  date_of_birth: string | null;
  marital_status: string | null;
  dependents_count: number | null;
  // Home address
  home_address_street: string | null;
  home_address_suburb: string | null;
  home_address_state: string | null;
  home_address_postcode: string | null;
  // Employment
  employment_type: string | null;
  employer_name: string | null;
  occupation: string | null;
  // Financial — feeds borrowing calc
  annual_income: number | null;
  partner_annual_income: number | null;
  existing_savings: number | null;
  hecs_balance: number | null;
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
  pipeline_id?: string | null;
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

type LiveAppointment = {
  id: string;
  cal_uid: string | null;
  event_title: string | null;
  event_slug: string | null;
  host_email: string | null;
  host_name: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  status: string | null;
  cancel_reason: string | null;
  additional_notes: string | null;
};

type PipelineLite = { id: string; name: string; color: string; stages: string[] };

export default function ContactDetail({
  contact: initialContact,
  leads,
  pipelines = [],
  ghlArchive = { notes: [], conversations: [], tasks: [], appointments: [], opportunities: [] },
  ghlContactId = null,
  liveAppointments = [],
}: {
  contact: Contact;
  leads: Lead[];
  pipelines?: PipelineLite[];
  ghlArchive?: GhlArchive;
  ghlContactId?: string | null;
  liveAppointments?: LiveAppointment[];
}) {
  const router = useRouter();
  // Local contact state — edits via the modal land here so the page
  // updates immediately without a refetch. Aliased to `contact` so the
  // existing read-side code keeps working unchanged.
  const [contact, setContact] = useState(initialContact);
  const [showEdit, setShowEdit] = useState(false);
  const [tab, setTab] = useState<Tab>("Overview");
  const [noteText, setNoteText] = useState(contact.notes || "");
  const [noteSaved, setNoteSaved] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [showOpportunityModal, setShowOpportunityModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [buyerType, setBuyerType] = useState(contact.buyer_type || "");
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailRefreshKey, setEmailRefreshKey] = useState(0);
  const [replyContext, setReplyContext] = useState<EmailRow | null>(null);
  // `now` is state, kept fresh on a 60s tick, so the appointment "past" badge
  // stays a pure render (no Date.now() call during render).
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const openReply = (email: EmailRow) => {
    setReplyContext(email);
    setShowEmailModal(true);
  };
  const openCompose = () => {
    setReplyContext(null);
    setShowEmailModal(true);
  };
  // Baseline of the last-saved notes. State (not a ref) because it drives the
  // Save-button visibility during render.
  const [savedNotes, setSavedNotes] = useState(contact.notes || "");

  const handleAssignType = async (type: string) => {
    setShowTypeMenu(false);
    setBuyerType(type);
    await fetch(`/api/contacts/${contact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buyer_type: type }),
    });
  };

  const handleDelete = async (reason: string, name: string) => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/contacts/${contact.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, deleter_name: name }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.error || "Failed to delete. Please try again.");
        return;
      }
      router.push("/contacts");
    } catch {
      setDeleteError("Failed to delete. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  const name = displayName(contact);
  const temp = contact.temperature ? tempConfig[contact.temperature] : null;
  const status = contact.status ? statusConfig[contact.status] : null;
  const budget = fmt(contact.budget_max || contact.budget);

  const saveNote = async () => {
    if (noteText === savedNotes) return;
    setSavingNote(true);
    try {
      await fetch(`/api/contacts/${contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: noteText }),
      });
      setSavedNotes(noteText);
      setNoteSaved(true);
      setTimeout(() => setNoteSaved(false), 2000);
    } finally {
      setSavingNote(false);
    }
  };

  return (
    <div className="flex flex-col h-full -mx-8 -my-8 bg-gray-50">

      {/* Confirm delete — requires a reason + the user's name */}
      <DeleteReasonModal
        open={confirmDelete}
        entityLabel={name}
        entityType="contact"
        busy={deleting}
        error={deleteError}
        onCancel={() => { setConfirmDelete(false); setDeleteError(null); }}
        onConfirm={handleDelete}
      />

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
          <button
            onClick={() => setShowEdit(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 transition">
            ✏️ Edit
          </button>
          {contact.email && (
            <button
              onClick={openCompose}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 transition">
              ✉️ Send Email
            </button>
          )}
          {contact.phone && (
            <a href={`tel:${contact.phone}`}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 transition">
              📱 Call
            </a>
          )}
          <StartVideoCallButton
            contactId={contact.id}
            label="🎥 Video call"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 transition"
          />
          <GuestLinkButton
            contactId={contact.id}
            guestName={contact.name || undefined}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 transition"
          />
          <RequestDocumentsButton
            applicantName={contact.full_name || contact.name}
            applicantEmail={contact.email}
            applicantPhone={contact.phone}
            contactId={contact.id}
            // Stamp the opportunity only when there's exactly one — a contact can
            // have several, and guessing the wrong one is worse than none.
            opportunityId={leads.length === 1 ? leads[0]!.lead_id : undefined}
            applicantCount={contact.partner_annual_income ? 2 : 1}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 transition disabled:opacity-50"
          />
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
        </div>
      </div>

      {showOpportunityModal && (
        <NewOpportunityModal
          onClose={() => setShowOpportunityModal(false)}
          onCreated={() => { setShowOpportunityModal(false); router.refresh(); }}
          pipelines={pipelines}
          prefillContact={{
            id: contact.id,
            name: contact.name,
            full_name: contact.full_name,
            email: contact.email,
            phone: contact.phone,
            buyer_type: contact.buyer_type,
            preferred_state: contact.preferred_state || contact.state,
            budget_max: contact.budget_max || contact.budget,
            date_of_birth: contact.date_of_birth,
            marital_status: contact.marital_status,
            dependents_count: contact.dependents_count,
            home_address_street: contact.home_address_street,
            home_address_suburb: contact.home_address_suburb,
            home_address_state: contact.home_address_state,
            home_address_postcode: contact.home_address_postcode,
            employment_type: contact.employment_type,
            employer_name: contact.employer_name,
            occupation: contact.occupation,
            annual_income: contact.annual_income,
            partner_annual_income: contact.partner_annual_income,
            existing_savings: contact.existing_savings,
            hecs_balance: contact.hecs_balance,
          }}
        />
      )}

      {showEdit && (
        <EditRecordModal
          kind="contact"
          record={contact as unknown as Record<string, unknown>}
          patchUrl={`/api/contacts/${contact.id}`}
          onClose={() => setShowEdit(false)}
          onSaved={(updated) => setContact(updated as unknown as Contact)}
        />
      )}

      <EmailComposeModal
        key={replyContext ? `reply-${replyContext.id}` : `compose-${emailRefreshKey}`}
        open={showEmailModal}
        onClose={() => { setShowEmailModal(false); setReplyContext(null); }}
        defaultTo={replyContext ? replyContext.from_email : (contact.email ?? "")}
        defaultToName={replyContext ? (replyContext.from_name ?? "") : name}
        defaultSubject={replyContext ? prefixReply(replyContext.subject) : ""}
        defaultBody={replyContext ? quotedBody(replyContext) : ""}
        contactId={contact.id}
        tags={replyContext ? ["contact-detail", "reply"] : ["contact-detail"]}
        inReplyTo={replyContext?.message_id ?? undefined}
        threadId={replyContext?.thread_id ?? undefined}
        onSent={() => setEmailRefreshKey((k) => k + 1)}
      />



      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT SIDEBAR ── */}
        <aside className="w-80 bg-white border-r border-gray-200 flex flex-col overflow-y-auto flex-shrink-0">

          {/* Avatar + name */}
          <div className="px-6 py-6 border-b border-gray-100 text-center">
            <div className={`w-20 h-20 rounded-full ${avatarBg(name)} text-white flex items-center justify-center text-3xl font-bold mx-auto mb-4`}>
              {name[0]?.toUpperCase() || "?"}
            </div>
            <h1 className="text-xl font-bold text-gray-900">{name}</h1>
            {contact.email && (
              <p className="text-sm text-gray-400 mt-0.5 break-all inline-flex items-center justify-center gap-1">
                {contact.email}
                <CopyButton text={contact.email} />
              </p>
            )}
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

          {/* Document collection progress */}
          <DocumentProgress contactId={contact.id} />

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
                {/* Pipelines + opportunities this contact is currently in */}
                <PipelinesAndOpportunitiesPanel leads={leads} pipelines={pipelines} />

                {/* Personal / Employment / Financial — feeds borrowing calc + AI matchmaker */}
                <PersonalDetailsPanel contact={contact} />

                {/* AI brief + next-action pill */}
                <AIBrief contactId={contact.id} />
                <div className="flex flex-wrap items-center gap-2">
                  <AISuggestedAction contactId={contact.id} />
                  <AISmartReply contactId={contact.id} />
                  <AIPropertyPitch contactId={contact.id} />
                  <AIQuickLog contactId={contact.id} />
                  <AIDocumentExtract contactId={contact.id} />
                </div>

                {/* AI matchmaker — properties that fit this contact */}
                <AIContactMatches contactId={contact.id} />

                {/* Video-call history (only renders once calls exist) */}
                <ContactVideoCalls contactId={contact.id} />

                {/* Summary card */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <h2 className="text-sm font-semibold text-gray-700 mb-4">Contact Summary</h2>
                  <div className="grid grid-cols-2 gap-4">
                    {contact.email && (
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs text-gray-400 font-medium">Email</span>
                        <span className="text-sm text-gray-900 font-semibold inline-flex items-center gap-1.5">
                          {contact.email}
                          <CopyButton text={contact.email} />
                        </span>
                      </div>
                    )}
                    {[
                      { label: "Full Name",    value: name },
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

                {/* Email history */}
                <div className="bg-white rounded-xl border border-gray-200 p-6">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="text-sm font-semibold text-gray-700">Email History</h2>
                    {contact.email && (
                      <button
                        onClick={openCompose}
                        className="px-3 py-1 text-xs font-semibold bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
                      >
                        ✉️ Compose
                      </button>
                    )}
                  </div>
                  <ContactEmailHistory contactId={contact.id} refreshKey={emailRefreshKey} onReply={openReply} />
                </div>


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

                {/* Live Cal.com appointments (current — sourced via webhook) */}
                {liveAppointments.length > 0 && (
                  <div className="mt-8 space-y-4">
                    <div className="flex items-center gap-2 pt-4 border-t border-gray-200">
                      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">📅 Bookings</span>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm space-y-2">
                      {liveAppointments.map((a) => {
                        const start = a.start_time ? new Date(a.start_time) : null;
                        const isPast = start && start.getTime() < now;
                        const statusBadge =
                          a.status === "cancelled" ? "bg-red-100 text-red-700"
                          : a.status === "rescheduled" ? "bg-amber-100 text-amber-700"
                          : isPast ? "bg-gray-100 text-gray-600"
                          : "bg-green-100 text-green-700";
                        return (
                          <div key={a.id} className="flex items-start justify-between gap-3 py-2 border-b border-gray-50 last:border-0 text-xs">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-gray-900">{a.event_title || "(untitled event)"}</span>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${statusBadge}`}>
                                  {a.status}{isPast && a.status === "booked" ? " • past" : ""}
                                </span>
                              </div>
                              <p className="text-gray-500 mt-0.5">
                                {start ? start.toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }) : "—"}
                                {a.host_name ? ` · with ${a.host_name}` : a.host_email ? ` · with ${a.host_email}` : ""}
                              </p>
                              {a.location && (a.location.startsWith("http") ? (
                                <a href={a.location} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline mt-0.5 inline-block">
                                  Join meeting →
                                </a>
                              ) : (
                                <p className="text-gray-500 mt-0.5">{a.location}</p>
                              ))}
                              {a.cancel_reason && (
                                <p className="text-red-600 mt-1 italic">Cancelled: {a.cancel_reason}</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
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
                    {noteText !== savedNotes && (
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
// ─── Pipelines + opportunities panel ────────────────────────────────────────
//
// Surfaces, in one strip near the top of the contact card, every pipeline
// this contact currently sits in and every opportunity (lead) connected
// to them. Pipeline name + stage form a header; below it, each
// opportunity in that pipeline is a clickable chip that jumps to
// /opportunities/{lead_id}. Leads with no pipeline_id assignment are
// grouped under "Unassigned".

function stageDot(stageName: string | null) {
  const s = (stageName || "").toLowerCase();
  if (s.includes("won"))    return "bg-green-500";
  if (s.includes("lost"))   return "bg-red-400";
  if (s.includes("matched"))return "bg-purple-500";
  if (s.includes("propos") || s.includes("sent")) return "bg-orange-400";
  if (s.includes("contact"))return "bg-yellow-400";
  if (s.includes("negotiat"))return "bg-pink-400";
  if (s.includes("qualif")) return "bg-blue-400";
  return "bg-gray-400";
}

function PipelinesAndOpportunitiesPanel({
  leads,
  pipelines,
}: {
  leads: Lead[];
  pipelines: PipelineLite[];
}) {
  const router = useRouter();

  // Group leads by pipeline_id (or "unassigned")
  const groups = new Map<string, Lead[]>();
  for (const l of leads) {
    const k = l.pipeline_id || "__unassigned__";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(l);
  }

  if (groups.size === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Pipelines &amp; opportunities</h2>
        <p className="text-xs text-gray-400">
          This contact isn&apos;t in any opportunity yet. Click &quot;+ New Opportunity&quot; above to create one.
        </p>
      </div>
    );
  }

  const pipelineById = new Map(pipelines.map((p) => [p.id, p]));

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700">Pipelines &amp; opportunities</h2>
        <span className="text-[11px] text-gray-400">
          {leads.length} opportunit{leads.length === 1 ? "y" : "ies"}
        </span>
      </div>
      <div className="space-y-3">
        {Array.from(groups.entries()).map(([pipelineId, group]) => {
          const pipeline = pipelineId !== "__unassigned__" ? pipelineById.get(pipelineId) : null;
          const pipelineName = pipeline?.name || (pipelineId === "__unassigned__" ? "Unassigned" : "Unknown pipeline");
          return (
            <div key={pipelineId} className="border border-gray-100 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                {pipeline && (
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: pipeline.color }} />
                )}
                <span className="text-xs font-bold uppercase tracking-wide text-gray-700">{pipelineName}</span>
                <span className="text-[10px] text-gray-400 ml-auto">{group.length}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {group.map((l) => (
                  <button
                    key={l.lead_id}
                    onClick={() => router.push(`/opportunities/${l.lead_id}`)}
                    title={`${l.full_name || "Opportunity"} · ${l.ghl_stage || "—"}`}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-50 hover:bg-blue-50 hover:text-blue-700 border border-gray-200 hover:border-blue-200 text-xs text-gray-700 transition"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${stageDot(l.ghl_stage)}`} />
                    <span className="font-medium truncate max-w-[180px]">
                      {l.full_name || "Opportunity"}
                    </span>
                    {l.ghl_stage && (
                      <span className="text-[10px] text-gray-500">· {l.ghl_stage}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GhlSectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{title}</h3>
      {children}
    </div>
  );
}

// ─── Personal / Employment / Financial details ──────────────────────────────
//
// Three small grouped cards. Empty state nudges Sean toward the edit modal so
// the contact gets fleshed out before AI matchmaking / borrowing calc runs.

function fmtMoney(n: number | null | undefined) {
  if (n == null) return null;
  return `$${Number(n).toLocaleString("en-AU")}`;
}

function fmtDob(s: string | null) {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function joinAddress(c: {
  home_address_street: string | null;
  home_address_suburb: string | null;
  home_address_state: string | null;
  home_address_postcode: string | null;
}) {
  const line = [c.home_address_street, c.home_address_suburb, c.home_address_state, c.home_address_postcode]
    .filter(Boolean)
    .join(", ");
  return line || null;
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3 py-1">
      <span className="text-xs text-gray-400 flex-shrink-0">{label}</span>
      <span className="text-xs font-medium text-gray-800 text-right">{value}</span>
    </div>
  );
}

function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard access denied or unavailable — no-op
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={copied ? "Copied!" : "Copy email"}
      aria-label={copied ? "Copied" : "Copy email"}
      className={`inline-flex items-center justify-center text-gray-400 hover:text-indigo-600 transition flex-shrink-0 ${className}`}
    >
      {copied ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-green-500">
          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
          <path d="M7.5 3.375c0-1.036.84-1.875 1.875-1.875h.375a3.75 3.75 0 013.75 3.75v1.875C13.5 8.161 14.34 9 15.375 9h1.875A3.75 3.75 0 0121 12.75v3.375C21 17.16 20.16 18 19.125 18h-9.75A1.875 1.875 0 017.5 16.125V3.375z" />
          <path d="M15 5.25a5.23 5.23 0 00-1.279-3.434 9.768 9.768 0 016.963 6.963A5.23 5.23 0 0017.25 7.5h-1.875A.375.375 0 0115 7.125V5.25zM4.875 6H6v10.125A3.375 3.375 0 009.375 19.5H16.5v1.125c0 1.035-.84 1.875-1.875 1.875h-9.75A1.875 1.875 0 013 20.625V7.875C3 6.839 3.84 6 4.875 6z" />
        </svg>
      )}
    </button>
  );
}

function PersonalDetailsPanel({ contact }: { contact: Contact }) {
  const personal = [
    { label: "Date of birth",   value: fmtDob(contact.date_of_birth) },
    { label: "Marital status",  value: contact.marital_status },
    { label: "Dependents",      value: contact.dependents_count != null ? String(contact.dependents_count) : null },
  ];
  const address = joinAddress(contact);
  const employment = [
    { label: "Type",       value: contact.employment_type },
    { label: "Employer",   value: contact.employer_name },
    { label: "Occupation", value: contact.occupation },
  ];
  const financial = [
    { label: "Annual income",         value: fmtMoney(contact.annual_income) },
    { label: "Partner annual income", value: fmtMoney(contact.partner_annual_income) },
    { label: "Savings / deposit",     value: fmtMoney(contact.existing_savings) },
    { label: "HECS-HELP balance",     value: fmtMoney(contact.hecs_balance) },
  ];
  const hasAny =
    personal.some((r) => r.value) ||
    !!address ||
    employment.some((r) => r.value) ||
    financial.some((r) => r.value);

  if (!hasAny) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Personal details</h2>
        <p className="text-xs text-gray-400">
          No personal info captured yet — click <span className="font-semibold">✏️ Edit</span> at
          the top to add address, employment and income. These flow through to opportunities
          and the borrowing-capacity calculator automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Personal</h3>
        <dl className="divide-y divide-gray-50">
          {personal.map((r) => <DetailRow key={r.label} label={r.label} value={r.value} />)}
        </dl>
        {address && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <p className="text-xs text-gray-400 mb-1">Home address</p>
            <p className="text-sm text-gray-800">{address}</p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Employment</h3>
        <dl className="divide-y divide-gray-50">
          {employment.map((r) => <DetailRow key={r.label} label={r.label} value={r.value} />)}
        </dl>
      </div>

      <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700">Financial</h3>
          <span className="text-[11px] text-gray-400">feeds borrowing calculator</span>
        </div>
        <dl className="divide-y divide-gray-50">
          {financial.map((r) => <DetailRow key={r.label} label={r.label} value={r.value} />)}
        </dl>
      </div>
    </div>
  );
}

/** Add "Re:" prefix unless one is already there. */
function prefixReply(subject: string): string {
  if (/^(re|fwd|fw):/i.test(subject.trim())) return subject;
  return `Re: ${subject}`;
}

/** Quote the original email body (text or stripped HTML) in reply format. */
function quotedBody(parent: EmailRow): string {
  const author = parent.from_name || parent.from_email;
  const when = parent.sent_at ?? parent.created_at;
  const dateStr = when ? new Date(when).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" }) : "earlier";
  const original = (parent.body_html ? parent.body_html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim() : "(no body captured)").slice(0, 1500);
  return `\n\n\nOn ${dateStr}, ${author} wrote:\n> ${original.split("\n").join("\n> ")}`;
}
