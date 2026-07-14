"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { stripHtml, splitGhlNoteBundle, fmtDateTime, truncate } from "../../../utils/archive-helpers";
import AIOpportunityDiagnosis from "../../components/AIOpportunityDiagnosis";
import EditRecordModal from "../../components/EditRecordModal";
import OpportunityAppointments from "./OpportunityAppointments";
import OpportunityCalculations from "./OpportunityCalculations";
import OpportunityPiaReports from "./OpportunityPiaReports";
import ScheduleMeetingModal from "./ScheduleMeetingModal";
import AddTaskModal from "./AddTaskModal";
import { useOpportunityDocs } from "./useOpportunityDocs";
import { SCHEDULING_HOSTS } from "../../../utils/scheduling-hosts";

const STAGES = [
  "New Lead", "Qualified", "Matched", "Contacted",
  "Proposal Sent", "Negotiating", "Closed Won", "Closed Lost",
];

const stageStyle: Record<string, string> = {
  "New Lead":      "bg-gray-100 text-gray-600",
  "Qualified":     "bg-blue-100 text-blue-700",
  "Matched":       "bg-purple-100 text-purple-700",
  "Contacted":     "bg-yellow-100 text-yellow-700",
  "Proposal Sent": "bg-orange-100 text-orange-700",
  "Negotiating":   "bg-pink-100 text-pink-700",
  "Closed Won":    "bg-green-100 text-green-700",
  "Closed Lost":   "bg-red-100 text-red-700",
};

const tempConfig: Record<string, { label: string; badge: string; icon: string }> = {
  hot:  { label: "Hot",  badge: "bg-red-100 text-red-700 border border-red-200",    icon: "🔥" },
  warm: { label: "Warm", badge: "bg-amber-100 text-amber-700 border border-amber-200", icon: "⚡" },
  cold: { label: "Cold", badge: "bg-blue-100 text-blue-700 border border-blue-200",  icon: "❄️" },
};

const avatarColors = ["bg-violet-600","bg-blue-600","bg-emerald-600","bg-rose-600","bg-amber-600","bg-cyan-600"];
const avatarBg = (name: string) => avatarColors[name.charCodeAt(0) % avatarColors.length];

type Contact = {
  id: string;
  name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  buyer_type: string | null;
};

type Lead = {
  lead_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  buyer_type: string | null;
  state: string | null;
  budget: string | null;
  budget_numeric: number | null;
  score: number | null;
  temperature: string | null;
  ghl_stage: string | null;
  match_status: string | null;
  top_match_name: string | null;
  top_match_price: string | null;
  timeframe: string | null;
  message: string | null;
  source: string | null;
  segment: string | null;
  scoring_notes: string | null;
  created_at: string | null;
  primary_contact_id: string | null;
  linked_contact_ids: string | null;
  notes: string | null;
  tags: string | null;
  pipeline_id: string | null;
  preferred_location: string | null;
  // Personal / employment / financial — flow from contact at creation
  date_of_birth: string | null;
  marital_status: string | null;
  dependents_count: number | null;
  home_address_street: string | null;
  home_address_suburb: string | null;
  home_address_state: string | null;
  home_address_postcode: string | null;
  employment_type: string | null;
  employer_name: string | null;
  occupation: string | null;
  annual_income: number | null;
  partner_annual_income: number | null;
  existing_savings: number | null;
  hecs_balance: number | null;
};

type GhlArchive = {
  notes: Array<{ id: string; body: string | null; user_id: string | null; pinned: boolean | null; date_added: string | null }>;
  conversations: Array<{ id: string; type: string | null; unread_count: number | null; last_message_body: string | null; last_message_type: string | null; last_message_date: string | null }>;
  tasks: Array<{ id: string; title: string | null; body: string | null; due_date: string | null; completed: boolean | null; date_added: string | null }>;
  appointments: Array<{ id: string; title: string | null; appointment_status: string | null; start_time: string | null }>;
};

export default function OpportunityDetail({
  lead: initialLead,
  ghlArchive = { notes: [], conversations: [], tasks: [], appointments: [] },
  ghlContactId = null,
}: {
  lead: Lead;
  ghlArchive?: GhlArchive;
  ghlContactId?: string | null;
}) {
  const router = useRouter();
  // Local lead state — used so edits via the modal reflect immediately
  // without a server roundtrip / page refresh. Aliased to `lead` so the
  // rest of the file can keep referencing it without changes.
  const [lead, setLead] = useState(initialLead);
  const [showEdit, setShowEdit] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showBookingLinks, setShowBookingLinks] = useState(false);
  const bookingLinkRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showBookingLinks) return;
    const onDocClick = (e: MouseEvent) => {
      if (bookingLinkRef.current && !bookingLinkRef.current.contains(e.target as Node)) {
        setShowBookingLinks(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [showBookingLinks]);
  const [stage, setStage] = useState(lead.ghl_stage || "New Lead");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Fact Find / Needs Analysis / Credit Authorisation — open (or create) this
  // borrower's compliance documents, linked to their primary contact. The
  // open-or-create logic (reuse the contact's most-recent doc; the Fact Find
  // also prefills from the opportunity's saved borrowing calc) lives in the
  // shared useOpportunityDocs hook so these top buttons and the buttons in the
  // Calculations panel can't drift.
  const {
    openFactFind,
    factFindLoading,
    factFindError,
    openNeedsAnalysis,
    needsAnalysisLoading,
    needsAnalysisError,
    openCreditAuthorisation,
    creditAuthLoading,
    creditAuthError,
  } = useOpportunityDocs({ opportunityId: lead.lead_id, contactId: lead.primary_contact_id });

  // Pipeline switcher — load available pipelines, allow moving the
  // opportunity between them. Stage buttons below now reflect whichever
  // pipeline is currently selected (falls back to the legacy 8-stage
  // STAGES list if no pipeline is loaded).
  type PipelineOption = { id: string; name: string; stages: string[] };
  const [pipelines, setPipelines] = useState<PipelineOption[]>([]);
  const [pipelineId, setPipelineId] = useState<string | null>(lead.pipeline_id);
  const [savingPipeline, setSavingPipeline] = useState(false);

  useEffect(() => {
    fetch("/api/pipelines", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setPipelines(d.pipelines || []))
      .catch(() => {});
  }, []);

  const activePipeline = pipelines.find((p) => p.id === pipelineId);
  const activeStages = activePipeline?.stages?.length ? activePipeline.stages : STAGES;

  // Back button — return to the specific pipeline this opportunity lives in,
  // built from its own pipeline_id so it's correct on a fresh load / shared
  // link (not reliant on browser history). Falls back to the default
  // opportunities view when the opportunity has no pipeline. The label uses the
  // pipeline's name once the pipelines list has loaded.
  const backHref = pipelineId
    ? `/opportunities?pipeline=${encodeURIComponent(pipelineId)}`
    : "/opportunities";
  const backLabel = activePipeline?.name
    ? `← Back to ${activePipeline.name}`
    : "← Back to pipeline";

  const updatePipeline = async (newPipelineId: string | null) => {
    const prevPipelineId = pipelineId;
    setPipelineId(newPipelineId);
    setSavingPipeline(true);
    try {
      const res = await fetch(`/api/opportunities/${lead.lead_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipeline_id: newPipelineId }),
      });
      if (!res.ok) throw new Error();
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      setPipelineId(prevPipelineId);
    } finally {
      setSavingPipeline(false);
    }
  };

  // Notes feed
  type NoteEntry = { text: string; created_at: string };
  const parseNotes = (raw: string | null): NoteEntry[] => {
    if (!raw) return [];
    try { return JSON.parse(raw); }
    catch { return raw.trim() ? [{ text: raw, created_at: lead.created_at || new Date().toISOString() }] : []; }
  };
  const [noteEntries, setNoteEntries] = useState<NoteEntry[]>(() => parseNotes(lead.notes));
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  // Tags
  const parseTags = (raw: string | null): string[] => { try { return raw ? JSON.parse(raw) : []; } catch { return []; } };
  const [leadTags, setLeadTags] = useState<string[]>(() => parseTags(lead.tags));
  const [tagInput, setTagInput] = useState("");
  const [savingTags, setSavingTags] = useState(false);
  const TAG_COLORS = ["bg-blue-100 text-blue-700","bg-violet-100 text-violet-700","bg-emerald-100 text-emerald-700","bg-amber-100 text-amber-700","bg-pink-100 text-pink-700","bg-cyan-100 text-cyan-700","bg-orange-100 text-orange-700","bg-indigo-100 text-indigo-700"];
  const tagColor = (tag: string) => TAG_COLORS[Math.abs(tag.split("").reduce((a,c) => a + c.charCodeAt(0), 0)) % TAG_COLORS.length];

  const saveTags = async (newTags: string[]) => {
    setSavingTags(true);
    try {
      await fetch(`/api/opportunities/${lead.lead_id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: newTags }),
      });
    } finally { setSavingTags(false); }
  };
  const addTag = () => {
    const t = tagInput.trim();
    if (!t || leadTags.includes(t)) { setTagInput(""); return; }
    const next = [...leadTags, t]; setLeadTags(next); setTagInput(""); saveTags(next);
  };
  const removeTag = (tag: string) => { const next = leadTags.filter(t => t !== tag); setLeadTags(next); saveTags(next); };

  // Linked contacts
  const [linkedIds, setLinkedIds] = useState<string[]>(() => {
    try { return lead.linked_contact_ids ? JSON.parse(lead.linked_contact_ids) : []; }
    catch { return []; }
  });
  const [allContacts, setAllContacts] = useState<Contact[]>([]);
  const [contactQuery, setContactQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [savingContacts, setSavingContacts] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/contacts/search")
      .then((r) => r.json())
      .then((d) => setAllContacts(d.contacts || []))
      .catch(() => {});
  }, []);

  // Both of these are pure functions of state we already hold, so they are
  // derived during render rather than mirrored into state from an effect —
  // which cost an extra render pass on every keystroke.
  const linkedContacts = useMemo(
    () => allContacts.filter((c) => linkedIds.includes(c.id)),
    [allContacts, linkedIds],
  );

  const filtered = useMemo(() => {
    if (!contactQuery.trim()) return [];
    const q = contactQuery.toLowerCase();
    return allContacts
      .filter((c) => !linkedIds.includes(c.id))
      .filter((c) => [c.name, c.full_name, c.email, c.phone].some((v) => v?.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [contactQuery, allContacts, linkedIds]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const name = lead.full_name || "Unknown";
  const temp = lead.temperature ? tempConfig[lead.temperature] : null;

  const updateStage = async (newStage: string) => {
    setStage(newStage);
    setSaving(true);
    try {
      await fetch(`/api/opportunities/${lead.lead_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: newStage }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const addContact = async (c: Contact) => {
    const newIds = [...linkedIds, c.id];
    setLinkedIds(newIds);
    setContactQuery("");
    setShowDropdown(false);
    setSavingContacts(true);
    try {
      await fetch(`/api/opportunities/${lead.lead_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linked_contact_ids: newIds }),
      });
    } finally {
      setSavingContacts(false);
    }
  };

  const addNote = async () => {
    const text = newNote.trim();
    if (!text) return;
    const entry: NoteEntry = { text, created_at: new Date().toISOString() };
    const updated = [entry, ...noteEntries];
    setNoteEntries(updated);
    setNewNote("");
    setSavingNote(true);
    try {
      await fetch(`/api/opportunities/${lead.lead_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: JSON.stringify(updated) }),
      });
    } finally {
      setSavingNote(false);
    }
  };

  const removeContact = async (id: string) => {
    const newIds = linkedIds.filter((i) => i !== id);
    setLinkedIds(newIds);
    setSavingContacts(true);
    try {
      await fetch(`/api/opportunities/${lead.lead_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linked_contact_ids: newIds }),
      });
    } finally {
      setSavingContacts(false);
    }
  };

  return (
    <div className="flex flex-col h-full -mx-8 -my-8 bg-gray-50">

      {/* Top bar — breadcrumb on the first row, actions wrap onto a second row
          so the buttons get full width instead of squashing beside the name. */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex flex-col gap-2.5 flex-shrink-0">
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => router.push(backHref)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold text-white shadow-sm transition hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-[#0F4C5C]"
            style={{ backgroundColor: "#0F4C5C" }}
          >
            {backLabel}
          </button>
          <span className="text-gray-300">/</span>
          <span className="text-gray-700 font-medium">{name}</span>
        </div>
        <div className="flex items-center flex-wrap gap-2">
          <button
            onClick={() => setShowEdit(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 transition"
          >
            ✏️ Edit
          </button>
          <button
            onClick={() => setShowSchedule(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 transition"
          >
            📅 Schedule meeting
          </button>
          <button
            onClick={() => setShowAddTask(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 transition"
          >
            ✅ Add task
          </button>
          <button
            onClick={openFactFind}
            disabled={factFindLoading}
            title={factFindError || "Open this borrower's Fact Find"}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 transition disabled:opacity-50"
          >
            📋 {factFindLoading ? "Opening…" : "Fact Find"}
          </button>
          {factFindError && (
            <span className="text-xs font-medium text-red-600 max-w-[16rem] truncate" title={factFindError}>
              {factFindError}
            </span>
          )}
          <button
            onClick={openNeedsAnalysis}
            disabled={needsAnalysisLoading}
            title={needsAnalysisError || "Open this borrower's NCCP Needs Analysis"}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 transition disabled:opacity-50"
          >
            🧭 {needsAnalysisLoading ? "Opening…" : "Needs Analysis"}
          </button>
          {needsAnalysisError && (
            <span className="text-xs font-medium text-red-600 max-w-[16rem] truncate" title={needsAnalysisError}>
              {needsAnalysisError}
            </span>
          )}
          <button
            onClick={openCreditAuthorisation}
            disabled={creditAuthLoading}
            title={creditAuthError || "Open this borrower's Credit File Authorisation"}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 transition disabled:opacity-50"
          >
            🔏 {creditAuthLoading ? "Opening…" : "Credit Authorisation"}
          </button>
          {creditAuthError && (
            <span className="text-xs font-medium text-red-600 max-w-[16rem] truncate" title={creditAuthError}>
              {creditAuthError}
            </span>
          )}
          <div ref={bookingLinkRef} className="relative">
            <button
              onClick={() => setShowBookingLinks((s) => !s)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 transition"
              title="Send a self-book link to the lead instead"
            >
              📤 Self-book link
              <span className="text-gray-400 text-[10px]">▾</span>
            </button>
            {showBookingLinks && (
              <div className="absolute right-0 mt-1.5 w-56 bg-white border border-gray-200 rounded-xl shadow-lg z-30 py-1">
                {SCHEDULING_HOSTS.filter((h) => h.bookingPageUrl).map((host) => (
                  <a
                    key={host.email}
                    href={host.bookingPageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setShowBookingLinks(false)}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
                  >
                    📅 Book with {host.label}
                  </a>
                ))}
              </div>
            )}
          </div>

          {lead.email && (
            <a href={`mailto:${lead.email}`}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 transition">
              ✉️ Send Email
            </a>
          )}
          {lead.phone && (
            <a href={`tel:${lead.phone}`}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700 transition">
              📱 Call
            </a>
          )}
        </div>
      </div>

      {showEdit && (
        <EditRecordModal
          kind="opportunity"
          record={lead}
          patchUrl={`/api/opportunities/${lead.lead_id}`}
          onClose={() => setShowEdit(false)}
          onSaved={(updated) => setLead(updated as Lead)}
        />
      )}

      {showSchedule && (
        <ScheduleMeetingModal
          lead={lead}
          hosts={SCHEDULING_HOSTS}
          contactId={lead.primary_contact_id}
          onClose={() => setShowSchedule(false)}
          onCreated={() => router.refresh()}
        />
      )}

      {showAddTask && (
        <AddTaskModal
          lead={lead}
          contactId={lead.primary_contact_id}
          onClose={() => setShowAddTask(false)}
          onCreated={() => router.refresh()}
        />
      )}

      <div className="flex flex-1 overflow-hidden">

        {/* LEFT SIDEBAR */}
        <aside className="w-80 bg-white border-r border-gray-200 flex flex-col overflow-y-auto flex-shrink-0">

          {/* Avatar + name */}
          <div className="px-6 py-6 border-b border-gray-100 text-center">
            <div className={`w-20 h-20 rounded-full ${avatarBg(name)} text-white flex items-center justify-center text-3xl font-bold mx-auto mb-4`}>
              {name[0]?.toUpperCase() || "?"}
            </div>
            <h1 className="text-xl font-bold text-gray-900">{name}</h1>
            {lead.email && <p className="text-sm text-gray-400 mt-0.5 break-all">{lead.email}</p>}
            {lead.phone && <p className="text-sm text-gray-500 mt-0.5">{lead.phone}</p>}

            <div className="flex justify-center gap-2 mt-3 flex-wrap">
              {temp && (
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${temp.badge}`}>
                  {temp.icon} {temp.label}
                </span>
              )}
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${stageStyle[stage] || "bg-gray-100 text-gray-600"}`}>
                {stage}
              </span>
              {lead.buyer_type && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700 capitalize">
                  {lead.buyer_type}
                </span>
              )}
            </div>
          </div>

          {/* Score */}
          {lead.score != null && (
            <div className="px-6 py-4 border-b border-gray-100">
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Triage Score</span>
                <span className="text-lg font-bold text-gray-900">{lead.score}</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${lead.score >= 70 ? "bg-green-500" : lead.score >= 40 ? "bg-amber-400" : "bg-red-400"}`}
                  style={{ width: `${Math.min(lead.score, 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Details */}
          <div className="px-6 py-4 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Lead Details</p>
            <dl className="space-y-3">
              {[
                ["State",      lead.state],
                ["Budget",     lead.budget],
                ["Timeframe",  lead.timeframe],
                ["Source",     lead.source?.replace(/_/g, " ")],
                ["Segment",    lead.segment],
              ].filter(([, v]) => v).map(([k, v]) => (
                <div key={k as string} className="flex justify-between gap-2">
                  <dt className="text-xs text-gray-400 flex-shrink-0">{k}</dt>
                  <dd className="text-xs font-medium text-gray-800 text-right capitalize">{v}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Linked contacts count */}
          {linkedContacts.length > 0 && (
            <div className="px-6 py-4 border-b border-gray-100">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Linked Contacts</p>
              <p className="text-sm font-semibold text-gray-700">{linkedContacts.length} contact{linkedContacts.length > 1 ? "s" : ""}</p>
            </div>
          )}

          {/* Timestamps */}
          <div className="px-6 py-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Timeline</p>
            {lead.created_at && (
              <div className="flex justify-between gap-2">
                <dt className="text-xs text-gray-400">Created</dt>
                <dd className="text-xs font-medium text-gray-600">
                  {new Date(lead.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
                </dd>
              </div>
            )}
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5 max-w-3xl">

          {/* AI diagnosis — is this opp stuck and why? */}
          <AIOpportunityDiagnosis opportunityId={lead.lead_id} />

          {/* Personal / employment / financial — copied from the contact at
              creation; feeds the borrowing-capacity calculator below. */}
          <OpportunityPersonalDetails lead={lead} />

          {/* Pipeline + Stage */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Pipeline</h2>
              {(saving || savingPipeline) && <span className="text-xs text-gray-400">Saving…</span>}
              {saved && !saving && !savingPipeline && <span className="text-xs text-green-600 font-medium">✓ Saved</span>}
            </div>

            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">In pipeline</label>
              <select
                value={pipelineId ?? ""}
                onChange={(e) => updatePipeline(e.target.value || null)}
                disabled={savingPipeline || pipelines.length === 0}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
              >
                <option value="">— Unassigned —</option>
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              {pipelines.length === 0 && (
                <p className="text-[11px] text-gray-400 mt-1">Loading pipelines…</p>
              )}
            </div>

            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Stage</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {activeStages.map((s) => (
                <button
                  key={s}
                  onClick={() => updateStage(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                    stage === s
                      ? (stageStyle[s] || "bg-blue-100 text-blue-700") + " border-transparent ring-2 ring-offset-1 ring-blue-400"
                      : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                  }`}
                >
                  {s}
                </button>
              ))}
              {activeStages.length === 0 && (
                <p className="text-xs text-gray-400">This pipeline has no stages yet — add some from the Opportunities board.</p>
              )}
            </div>
          </div>

          {/* Tags */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-700">Tags</h2>
              {savingTags && <span className="text-xs text-gray-400">Saving…</span>}
            </div>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {leadTags.map(tag => (
                <span key={tag} className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${tagColor(tag)}`}>
                  {tag}
                  <button onClick={() => removeTag(tag)} className="opacity-60 hover:opacity-100 leading-none ml-0.5">✕</button>
                </span>
              ))}
              {leadTags.length === 0 && <span className="text-xs text-gray-400">No tags yet</span>}
            </div>
            <div className="flex gap-2">
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); }}}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                placeholder="Add a tag…"
              />
              <button onClick={addTag} disabled={!tagInput.trim()}
                className="px-4 py-2 text-sm font-semibold bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 disabled:opacity-50 transition">
                Add
              </button>
            </div>
          </div>

          {/* Linked Contacts */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700">Linked Contacts</h2>
              {savingContacts && <span className="text-xs text-gray-400">Saving…</span>}
            </div>

            {/* Existing linked contacts */}
            {linkedContacts.length > 0 && (
              <div className="space-y-2 mb-3">
                {linkedContacts.map((c) => (
                  <div key={c.id} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full ${avatarBg(c.full_name || c.name || "?")} text-white text-xs font-bold flex items-center justify-center flex-shrink-0`}>
                        {(c.full_name || c.name || "?")[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-800">{c.full_name || c.name}</p>
                        <p className="text-xs text-gray-400">{c.email}</p>
                      </div>
                      {c.buyer_type && (
                        <span className="text-xs text-gray-400 capitalize">{c.buyer_type}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => router.push(`/contacts/${c.id}`)}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium transition"
                      >
                        View
                      </button>
                      <button
                        onClick={() => removeContact(c.id)}
                        className="text-xs text-gray-400 hover:text-red-500 font-medium transition"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Search to add */}
            <div className="relative" ref={dropdownRef}>
              <input
                type="text"
                className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="＋ Search to add a contact…"
                value={contactQuery}
                onChange={(e) => {
                  setContactQuery(e.target.value);
                  setShowDropdown(e.target.value.trim().length > 0);
                }}
                onFocus={() => filtered.length > 0 && setShowDropdown(true)}
              />
              {showDropdown && filtered.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                  {filtered.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={() => addContact(c)}
                      className="w-full text-left px-4 py-3 hover:bg-blue-50 transition flex items-center gap-3 border-b border-gray-50 last:border-0"
                    >
                      <div className={`w-8 h-8 rounded-full ${avatarBg(c.full_name || c.name || "?")} text-white text-xs font-bold flex items-center justify-center flex-shrink-0`}>
                        {(c.full_name || c.name || "?")[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{c.full_name || c.name}</p>
                        <p className="text-xs text-gray-400 truncate">{c.email}</p>
                      </div>
                      {c.buyer_type && (
                        <span className="text-xs text-gray-400 capitalize flex-shrink-0">{c.buyer_type}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Overview */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-4">Opportunity Summary</h2>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: "Full Name",    value: name },
                { label: "Email",        value: lead.email },
                { label: "Phone",        value: lead.phone },
                { label: "Buyer Type",   value: lead.buyer_type },
                { label: "State",        value: lead.state },
                { label: "Budget",       value: lead.budget },
                { label: "Timeframe",    value: lead.timeframe },
                { label: "Temperature",  value: lead.temperature },
                { label: "Stage",        value: stage },
                { label: "Match Status", value: lead.match_status },
                { label: "Source",       value: lead.source?.replace(/_/g, " ") },
                { label: "Triage Score", value: lead.score?.toString() },
              ].filter((r) => r.value).map((row) => (
                <div key={row.label} className="flex flex-col gap-0.5">
                  <span className="text-xs text-gray-400 font-medium">{row.label}</span>
                  <span className="text-sm text-gray-900 font-semibold capitalize">{row.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top match */}
          {lead.top_match_name && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Top Property Match</h2>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                <span className="text-2xl">🏘</span>
                <div>
                  <p className="text-xs text-green-600 font-semibold uppercase tracking-wide mb-1">Best Match</p>
                  <p className="text-base font-bold text-green-900">{lead.top_match_name}</p>
                  {lead.top_match_price && (
                    <p className="text-sm text-green-700 font-medium mt-0.5">{lead.top_match_price}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Appointments (Cal.com) */}
          <OpportunityAppointments opportunityId={lead.lead_id} leadEmail={lead.email} />

          {/* PIA Reports */}
          <OpportunityPiaReports leadId={lead.lead_id} />

          {/* War Room calculator scenarios */}
          <OpportunityCalculations
            opportunityId={lead.lead_id}
            contactId={lead.primary_contact_id}
            lead={{
              annual_income: lead.annual_income,
              partner_annual_income: lead.partner_annual_income,
              dependents_count: lead.dependents_count,
              hecs_balance: lead.hecs_balance,
              existing_savings: lead.existing_savings,
            }}
          />

          {/* Notes feed */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">Notes</h2>
              {savingNote && <span className="text-xs text-gray-400">Saving…</span>}
            </div>

            {/* Add new note */}
            <div className="px-5 pt-4 pb-3 border-b border-gray-100">
              <textarea
                className="w-full px-4 py-3 text-sm text-gray-700 border border-gray-200 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                placeholder="Write a note…"
                rows={3}
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) addNote(); }}
              />
              <div className="flex justify-between items-center mt-2">
                <span className="text-xs text-gray-400">Ctrl+Enter to save</span>
                <button
                  onClick={addNote}
                  disabled={!newNote.trim() || savingNote}
                  className="px-4 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
                >
                  Add Note
                </button>
              </div>
            </div>

            {/* Existing notes */}
            {noteEntries.length === 0 && !lead.message ? (
              <div className="px-5 py-6 text-center text-sm text-gray-400">No notes yet</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {noteEntries.map((n, i) => (
                  <div key={i} className="px-5 py-4">
                    <p className="text-xs text-gray-400 mb-1.5">
                      {new Date(n.created_at).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{n.text}</p>
                  </div>
                ))}
                {lead.message && (
                  <div className="px-5 py-4 bg-gray-50">
                    <p className="text-xs text-gray-400 mb-1.5">Initial message</p>
                    <p className="text-sm text-gray-500 whitespace-pre-wrap leading-relaxed">{lead.message}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Historical GHL data — only render when this lead matches a GHL archive contact by email */}
          {ghlContactId && (ghlArchive.notes.length > 0 || ghlArchive.conversations.length > 0 ||
            ghlArchive.tasks.length > 0 || ghlArchive.appointments.length > 0) && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 pt-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">📦 Historical from GHL</span>
                <span className="text-xs text-gray-400">matched via email</span>
              </div>

              {ghlArchive.notes.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-700">
                      Historical notes <span className="text-xs text-gray-400 font-normal">({ghlArchive.notes.length} {ghlArchive.notes.length === 1 ? "row" : "rows"})</span>
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

              {ghlArchive.conversations.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-700">
                      Conversations <span className="text-xs text-gray-400 font-normal">({ghlArchive.conversations.length})</span>
                    </h2>
                  </div>
                  <div className="px-5 py-3 space-y-1.5">
                    {ghlArchive.conversations.slice(0, 12).map((c) => (
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
                    {ghlArchive.conversations.length > 12 && (
                      <p className="text-xs text-gray-400 italic mt-2">
                        + {ghlArchive.conversations.length - 12} more — see full list at <a href={`/archive/contacts/${ghlContactId}`} className="text-blue-600 hover:underline">archive</a>
                      </p>
                    )}
                  </div>
                </div>
              )}

              {ghlArchive.appointments.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-700">
                      Appointments <span className="text-xs text-gray-400 font-normal">({ghlArchive.appointments.length})</span>
                    </h2>
                  </div>
                  <div className="px-5 py-3 space-y-1.5">
                    {ghlArchive.appointments.map((a) => (
                      <div key={a.id} className="flex items-center justify-between py-1 text-xs border-b border-gray-50 last:border-0">
                        <div>
                          <p className="font-medium text-gray-800">{a.title || "(untitled)"}</p>
                          <p className="text-gray-400">{a.appointment_status || "—"}</p>
                        </div>
                        <span className="text-gray-500">{fmtDateTime(a.start_time)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {ghlArchive.tasks.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-3 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-700">
                      Tasks <span className="text-xs text-gray-400 font-normal">({ghlArchive.tasks.length})</span>
                    </h2>
                  </div>
                  <div className="px-5 py-3 space-y-1.5">
                    {ghlArchive.tasks.map((t) => (
                      <div key={t.id} className="flex items-start justify-between gap-2 py-1 text-xs border-b border-gray-50 last:border-0">
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
                </div>
              )}
            </div>
          )}

          {/* Scoring notes */}
          {lead.scoring_notes && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Elvis AI Analysis</h2>
              <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{lead.scoring_notes}</p>
            </div>
          )}

          {/* Lead ID */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-semibold text-gray-400 mb-2">Lead ID</h2>
            <p className="text-xs font-mono text-gray-500 break-all">{lead.lead_id}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Personal / employment / financial details on the opportunity ──────────
//
// Mirrors the panel on the contact page. Hidden when nothing's been
// captured yet so the page stays clean for legacy leads.

function fmtMoneyAU(n: number | null | undefined) {
  if (n == null) return null;
  return `$${Number(n).toLocaleString("en-AU")}`;
}

function fmtDob(s: string | null) {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function joinAddressLead(l: Lead) {
  const line = [l.home_address_street, l.home_address_suburb, l.home_address_state, l.home_address_postcode]
    .filter(Boolean)
    .join(", ");
  return line || null;
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3 py-1">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-xs font-medium text-gray-800 text-right">{value}</span>
    </div>
  );
}

function OpportunityPersonalDetails({ lead }: { lead: Lead }) {
  const personal = [
    { label: "Date of birth",  value: fmtDob(lead.date_of_birth) },
    { label: "Marital status", value: lead.marital_status },
    { label: "Dependents",     value: lead.dependents_count != null ? String(lead.dependents_count) : null },
  ];
  const address = joinAddressLead(lead);
  const employment = [
    { label: "Type",       value: lead.employment_type },
    { label: "Employer",   value: lead.employer_name },
    { label: "Occupation", value: lead.occupation },
  ];
  const financial = [
    { label: "Annual income",         value: fmtMoneyAU(lead.annual_income) },
    { label: "Partner annual income", value: fmtMoneyAU(lead.partner_annual_income) },
    { label: "Savings / deposit",     value: fmtMoneyAU(lead.existing_savings) },
    { label: "HECS-HELP balance",     value: fmtMoneyAU(lead.hecs_balance) },
  ];
  const hasAny =
    personal.some((r) => r.value) ||
    !!address ||
    employment.some((r) => r.value) ||
    financial.some((r) => r.value);

  if (!hasAny) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-700 mb-2">Personal</h3>
        <dl className="divide-y divide-gray-50">
          {personal.map((r) => <Row key={r.label} label={r.label} value={r.value} />)}
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
          {employment.map((r) => <Row key={r.label} label={r.label} value={r.value} />)}
        </dl>
      </div>

      <div className="md:col-span-2 bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700">Financial</h3>
          <span className="text-[11px] text-gray-400">feeds borrowing calculator below</span>
        </div>
        <dl className="divide-y divide-gray-50">
          {financial.map((r) => <Row key={r.label} label={r.label} value={r.value} />)}
        </dl>
      </div>
    </div>
  );
}
