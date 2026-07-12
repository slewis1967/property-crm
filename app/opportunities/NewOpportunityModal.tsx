"use client";

import { useState, useEffect, useRef } from "react";
import { errMessage } from "../../utils/errors";

type Contact = {
  id: string;
  name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  buyer_type: string | null;
  preferred_state: string | null;
  budget_max: number | null;
  // Personal / employment / financial — copied to the new opportunity so
  // the borrowing calculator + AI matchmaker have real data without
  // re-typing.
  date_of_birth?: string | null;
  marital_status?: string | null;
  dependents_count?: number | null;
  home_address_street?: string | null;
  home_address_suburb?: string | null;
  home_address_state?: string | null;
  home_address_postcode?: string | null;
  employment_type?: string | null;
  employer_name?: string | null;
  occupation?: string | null;
  annual_income?: number | null;
  partner_annual_income?: number | null;
  existing_savings?: number | null;
  hecs_balance?: number | null;
};

type Pipeline = { id: string; name: string; stages: string[]; color: string };

// Shape passed to onCreated: the API response spread together with the form
// values the parent re-reads to build a board card. All fields optional/nullable
// since callers may ignore the payload entirely.
type CreatedLead = {
  id?: string;
  lead_id?: string;
  full_name?: string | null;
  email?: string | null;
  buyer_type?: string | null;
  state?: string | null;
  budget?: string | null;
  score?: number | null;
  temperature?: string | null;
  _stage?: string;
  match_status?: string | null;
  top_match_name?: string | null;
  top_match_price?: string | null;
  created_at?: string | null;
  pipeline_id?: string | null;
  tags?: string | null;
};

type Props = {
  onClose: () => void;
  onCreated: (lead: CreatedLead) => void;
  prefillContact?: Contact | null;
  pipelines?: Pipeline[];
  defaultPipelineId?: string;
};

const STAGES = [
  "New Lead", "Qualified", "Matched", "Contacted",
  "Proposal Sent", "Negotiating", "Closed Won", "Closed Lost",
];

const BUYER_TYPES = ["Investor", "First Home Buyer", "Downsizer", "SDA", "Owner Occupier"];
const STATES      = ["QLD", "NSW", "VIC", "SA", "WA", "TAS", "NT", "ACT"];
const TIMEFRAMES  = ["ASAP", "1-3 months", "3-6 months", "6-12 months", "12+ months"];

export default function NewOpportunityModal({ onClose, onCreated, prefillContact, pipelines = [], defaultPipelineId }: Props) {
  // Contact search (primary)
  const [contactQuery, setContactQuery]       = useState("");
  const [allContacts, setAllContacts]         = useState<Contact[]>([]);
  const [filteredContacts, setFilteredContacts] = useState<Contact[]>([]);
  const [primaryContact, setPrimaryContact]   = useState<Contact | null>(prefillContact || null);
  const [showDropdown, setShowDropdown]       = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Additional contacts
  const [addQuery, setAddQuery]                 = useState("");
  const [addFiltered, setAddFiltered]           = useState<Contact[]>([]);
  const [linkedContacts, setLinkedContacts]     = useState<Contact[]>([]);
  const [showAddDropdown, setShowAddDropdown]   = useState(false);
  const addDropdownRef = useRef<HTMLDivElement>(null);

  // Form fields
  const [fullName,    setFullName]    = useState(prefillContact ? (prefillContact.full_name || prefillContact.name || "") : "");
  const [email,       setEmail]       = useState(prefillContact?.email || "");
  const [phone,       setPhone]       = useState(prefillContact?.phone || "");
  const [buyerType,   setBuyerType]   = useState(prefillContact?.buyer_type || "");
  const [state,       setState]       = useState(prefillContact?.preferred_state || "");
  const [budget,      setBudget]      = useState(prefillContact?.budget_max ? `$${Number(prefillContact.budget_max).toLocaleString()}` : "");
  const [timeframe,   setTimeframe]   = useState("");
  const [preferredLocation, setPreferredLocation] = useState("");
  const [message,     setMessage]     = useState("");
  const [stage,       setStage]       = useState("New Lead");
  const [temperature, setTemperature] = useState("warm");

  // OO/FHB buyers should live near where they want to buy unless explicitly
  // stated otherwise. Required so the matchmaker (and Sean himself when
  // looking at the lead) has somewhere concrete to bias suggestions toward.
  const requiresPreferredLocation = ["Owner Occupier", "First Home Buyer"].includes(buyerType);
  const [pipelineId,  setPipelineId]  = useState(defaultPipelineId || pipelines[0]?.id || "");
  const [tagInput,    setTagInput]    = useState("");
  const [tags,        setTags]        = useState<string[]>([]);

  // Optional appointment to schedule alongside the opportunity (POST /api/appointments).
  // Hidden by default so the existing flow stays one-screen; expanding reveals a quick
  // scheduler that creates a Google Calendar event (+ invite) and a Supabase appointments
  // row in one go. Falls back to CRM-only if Google Calendar isn't connected.
  const [apptOpen,      setApptOpen]      = useState(false);
  const [apptTitle,     setApptTitle]     = useState("");
  const [apptStartTime, setApptStartTime] = useState(""); // <input type="datetime-local"> value
  const [apptNotes,     setApptNotes]     = useState("");
  const [apptInvite,    setApptInvite]    = useState(true);

  // Optional task to schedule alongside the opportunity (POST /api/tasks).
  // Same collapsible pattern as the appointment block. Inserts a row into the
  // tasks table with source="crm_modal", linked to the primary contact.
  const [taskOpen,    setTaskOpen]    = useState(false);
  const [taskTitle,   setTaskTitle]   = useState("");
  const [taskDueDate, setTaskDueDate] = useState(""); // <input type="date"> value

  // Update stage options when pipeline changes
  const activePipeline = pipelines.find(p => p.id === pipelineId);
  const pipelineStages = activePipeline?.stages || STAGES;

  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Load all contacts once
  useEffect(() => {
    fetch("/api/contacts/search")
      .then((r) => r.json())
      .then((d) => setAllContacts(d.contacts || []))
      .catch(() => {});
  }, []);

  // Filter primary dropdown
  useEffect(() => {
    if (!contactQuery.trim()) { queueMicrotask(() => { setFilteredContacts([]); setShowDropdown(false); }); return; }
    const q = contactQuery.toLowerCase();
    const matches = allContacts.filter((c) =>
      [c.name, c.full_name, c.email, c.phone].some((v) => v?.toLowerCase().includes(q))
    ).slice(0, 8);
    queueMicrotask(() => { setFilteredContacts(matches); setShowDropdown(matches.length > 0); });
  }, [contactQuery, allContacts]);

  // Filter additional contacts dropdown (exclude already-linked + primary)
  useEffect(() => {
    if (!addQuery.trim()) { queueMicrotask(() => { setAddFiltered([]); setShowAddDropdown(false); }); return; }
    const q = addQuery.toLowerCase();
    const excludeIds = new Set([
      ...(primaryContact ? [primaryContact.id] : []),
      ...linkedContacts.map((c) => c.id),
    ]);
    const matches = allContacts
      .filter((c) => !excludeIds.has(c.id))
      .filter((c) => [c.name, c.full_name, c.email, c.phone].some((v) => v?.toLowerCase().includes(q)))
      .slice(0, 8);
    queueMicrotask(() => { setAddFiltered(matches); setShowAddDropdown(matches.length > 0); });
  }, [addQuery, allContacts, primaryContact, linkedContacts]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowDropdown(false);
      if (addDropdownRef.current && !addDropdownRef.current.contains(e.target as Node)) setShowAddDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectPrimary = (c: Contact) => {
    setPrimaryContact(c);
    setFullName(c.full_name || c.name || "");
    setEmail(c.email || "");
    setPhone(c.phone || "");
    setBuyerType(c.buyer_type || "");
    setState(c.preferred_state || "");
    setBudget(c.budget_max ? `$${Number(c.budget_max).toLocaleString()}` : "");
    setContactQuery(c.full_name || c.name || "");
    setShowDropdown(false);
  };

  const clearPrimary = () => {
    setPrimaryContact(null);
    setContactQuery("");
    setFullName(""); setEmail(""); setPhone("");
    setBuyerType(""); setState(""); setBudget("");
  };

  const addLinkedContact = (c: Contact) => {
    setLinkedContacts((prev) => [...prev, c]);
    setAddQuery("");
    setShowAddDropdown(false);
  };

  const removeLinkedContact = (id: string) => {
    setLinkedContacts((prev) => prev.filter((c) => c.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) {
      setError("Name and email are required.");
      return;
    }
    if (requiresPreferredLocation && !preferredLocation.trim()) {
      setError(
        `Preferred buy location is required for ${buyerType} — where do they actually want to buy? (e.g. "Brisbane northside", "Adelaide CBD"). If they're flexible, write that.`,
      );
      return;
    }
    setSaving(true);
    setError(null);

    const linkedIds = [
      ...(primaryContact ? [primaryContact.id] : []),
      ...linkedContacts.map((c) => c.id),
    ];

    try {
      // Personal / employment / financial come straight from the prefilled
      // contact (if any). User can override them later via edit modal.
      const carryFromContact = prefillContact ?? primaryContact ?? null;
      const res = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email:     email.trim().toLowerCase(),
          phone:     phone.trim(),
          buyer_type: buyerType,
          state,
          budget,
          timeframe,
          preferred_location: preferredLocation.trim() || null,
          message,
          ghl_stage:   stage,
          temperature,
          source:      "crm_manual",
          primary_contact_id: primaryContact?.id || null,
          linked_contact_ids: linkedIds.length > 0 ? linkedIds : null,
          pipeline_id: pipelineId || null,
          tags:        tags.length > 0 ? tags : null,
          // Personal / employment / financial carried from contact
          date_of_birth:         carryFromContact?.date_of_birth ?? null,
          marital_status:        carryFromContact?.marital_status ?? null,
          dependents_count:      carryFromContact?.dependents_count ?? null,
          home_address_street:   carryFromContact?.home_address_street ?? null,
          home_address_suburb:   carryFromContact?.home_address_suburb ?? null,
          home_address_state:    carryFromContact?.home_address_state ?? null,
          home_address_postcode: carryFromContact?.home_address_postcode ?? null,
          employment_type:       carryFromContact?.employment_type ?? null,
          employer_name:         carryFromContact?.employer_name ?? null,
          occupation:            carryFromContact?.occupation ?? null,
          annual_income:         carryFromContact?.annual_income ?? null,
          partner_annual_income: carryFromContact?.partner_annual_income ?? null,
          existing_savings:      carryFromContact?.existing_savings ?? null,
          hecs_balance:          carryFromContact?.hecs_balance ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create");

      // Optional: schedule an appointment and/or a task alongside the opportunity.
      // Both are best-effort — the opp is already saved at this point, so a
      // sub-step failure is a soft warning rather than a rollback.
      const warnings: string[] = [];
      const contactForExtras = primaryContact ?? prefillContact ?? null;

      if (apptOpen && apptStartTime && contactForExtras?.id) {
        try {
          const apptRes = await fetch("/api/appointments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contact_id: contactForExtras.id,
              contact_email: email.trim().toLowerCase(),
              contact_name: fullName.trim(),
              title: apptTitle.trim() || `Meeting with ${fullName.trim()}`,
              start_time: new Date(apptStartTime).toISOString(),
              notes: apptNotes.trim() || undefined,
              invite_contact: apptInvite,
            }),
          });
          const apptData = await apptRes.json().catch(() => ({}));
          if (!apptRes.ok) {
            warnings.push(`Appointment: ${apptData.error || `HTTP ${apptRes.status}`}.`);
          } else if (apptData.calendar_warning) {
            warnings.push(`Appointment: ${apptData.calendar_warning}`);
          }
        } catch (apptErr) {
          warnings.push(`Appointment: ${errMessage(apptErr, "request failed")}.`);
        }
      }

      if (taskOpen && taskTitle.trim() && contactForExtras?.id) {
        try {
          const taskRes = await fetch("/api/tasks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: taskTitle.trim(),
              contact_id: contactForExtras.id,
              due_date: taskDueDate || null,
              source: "opportunity_modal",
            }),
          });
          const taskData = await taskRes.json().catch(() => ({}));
          if (!taskRes.ok) {
            warnings.push(`Task: ${taskData.error || `HTTP ${taskRes.status}`}.`);
          }
        } catch (taskErr) {
          warnings.push(`Task: ${errMessage(taskErr, "request failed")}.`);
        }
      }

      setSuccess(true);
      if (warnings.length > 0) {
        setError(`⚠ Opportunity created. ${warnings.join(" ")}`);
      }
      setTimeout(() => {
        onCreated({
          ...data,
          _stage: stage,
          full_name: fullName,
          email,
          buyer_type: buyerType,
          state,
          budget,
          temperature,
          score: null,
          match_status: "pending",
          top_match_name: null,
          top_match_price: null,
          created_at: new Date().toISOString(),
        });
      }, warnings.length > 0 ? 3000 : 800);
    } catch (err) {
      setError(errMessage(err));
      setSaving(false);
    }
  };

  const contactRow = (c: Contact, onSelect: (c: Contact) => void) => (
    <button
      key={c.id}
      type="button"
      onMouseDown={() => onSelect(c)}
      className="w-full text-left px-4 py-3 hover:bg-blue-50 transition flex items-center gap-3 border-b border-gray-50 last:border-0"
    >
      <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-600 text-xs font-bold flex items-center justify-center flex-shrink-0">
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
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">New Opportunity</h2>
            <p className="text-xs text-gray-400 mt-0.5">Search a contact or enter details manually</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition text-lg leading-none">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="px-6 py-5 space-y-5">

            {/* ── Primary contact ── */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Primary Contact
              </label>
              {primaryContact ? (
                <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center">
                      {(primaryContact.full_name || primaryContact.name || "?")[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{primaryContact.full_name || primaryContact.name}</p>
                      <p className="text-xs text-gray-500">{primaryContact.email}</p>
                    </div>
                  </div>
                  <button type="button" onClick={clearPrimary} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Change</button>
                </div>
              ) : (
                <div className="relative" ref={dropdownRef}>
                  <input
                    type="text"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Search by name, email or phone…"
                    value={contactQuery}
                    onChange={(e) => setContactQuery(e.target.value)}
                    onFocus={() => filteredContacts.length > 0 && setShowDropdown(true)}
                  />
                  {showDropdown && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                      {filteredContacts.map((c) => contactRow(c, selectPrimary))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Additional contacts ── */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Additional Contacts
                <span className="ml-1.5 text-gray-300 font-normal normal-case">optional — e.g. co-buyers, partners</span>
              </label>

              {/* Already-linked list */}
              {linkedContacts.length > 0 && (
                <div className="space-y-2 mb-2">
                  {linkedContacts.map((c) => (
                    <div key={c.id} className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-gray-300 text-gray-600 text-xs font-bold flex items-center justify-center">
                          {(c.full_name || c.name || "?")[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-800">{c.full_name || c.name}</p>
                          <p className="text-xs text-gray-400">{c.email}</p>
                        </div>
                      </div>
                      <button type="button" onClick={() => removeLinkedContact(c.id)} className="text-xs text-gray-400 hover:text-red-500 font-medium transition">Remove</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add more search */}
              <div className="relative" ref={addDropdownRef}>
                <input
                  type="text"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="＋ Search to add another contact…"
                  value={addQuery}
                  onChange={(e) => setAddQuery(e.target.value)}
                  onFocus={() => addFiltered.length > 0 && setShowAddDropdown(true)}
                />
                {showAddDropdown && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 overflow-hidden">
                    {addFiltered.map((c) => contactRow(c, addLinkedContact))}
                  </div>
                )}
              </div>
            </div>

            <div className="border-t border-gray-100" />

            {/* ── Contact fields ── */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Full Name *</label>
                <input required value={fullName} onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Jordan Blake" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Email *</label>
                <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="email@example.com" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Phone</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="04xx xxx xxx" />
              </div>
            </div>

            {/* ── Lead details ── */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Buyer Type</label>
                <select value={buyerType} onChange={(e) => setBuyerType(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select type…</option>
                  {BUYER_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">State</label>
                <select value={state} onChange={(e) => setState(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select state…</option>
                  {STATES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Budget</label>
                <input value={budget} onChange={(e) => setBudget(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. $650,000" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Timeframe</label>
                <select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">Select timeframe…</option>
                  {TIMEFRAMES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
            </div>

            {/* Preferred buy location — required for OO/FHB so the AI
                matchmaker doesn't suggest properties in the wrong city. */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Preferred buy location {requiresPreferredLocation && <span className="text-red-500">*</span>}
                <span className="ml-1.5 text-gray-300 font-normal normal-case">
                  city / suburb / region they want to buy in
                </span>
              </label>
              <input
                value={preferredLocation}
                onChange={(e) => setPreferredLocation(e.target.value)}
                required={requiresPreferredLocation}
                className={`w-full px-3 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  requiresPreferredLocation && !preferredLocation.trim()
                    ? "border-amber-300 bg-amber-50/50"
                    : "border-gray-200"
                }`}
                placeholder='e.g. "Brisbane northside", "Adelaide CBD", "anywhere in QLD"'
              />
              {requiresPreferredLocation && (
                <p className="text-[11px] text-gray-400 mt-1.5">
                  For owner-occupiers and first-home buyers, the matchmaker biases
                  property suggestions toward this location (or the contact&apos;s current
                  state if blank). Write a city, suburb, region, or &quot;{state || "anywhere"}&quot;.
                </p>
              )}
            </div>

            {/* ── Pipeline selector ── */}
            {pipelines.length > 0 && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Pipeline</label>
                <select value={pipelineId} onChange={(e) => { setPipelineId(e.target.value); setStage(pipelines.find(p => p.id === e.target.value)?.stages[0] || "New Lead"); }}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}

            {/* ── Pipeline + temperature ── */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Pipeline Stage</label>
                <select value={stage} onChange={(e) => setStage(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  {pipelineStages.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Temperature</label>
                <div className="flex gap-2 mt-0.5">
                  {[["hot","🔥"],["warm","⚡"],["cold","❄️"]].map(([val, icon]) => (
                    <button key={val} type="button" onClick={() => setTemperature(val)}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium transition border ${temperature === val ? val === "hot" ? "bg-red-100 border-red-300 text-red-700" : val === "warm" ? "bg-amber-100 border-amber-300 text-amber-700" : "bg-blue-100 border-blue-300 text-blue-700" : "bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100"}`}>
                      {icon}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Tags ── */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Tags</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {tags.map(tag => (
                  <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                    {tag}
                    <button type="button" onClick={() => setTags(tags.filter(t => t !== tag))} className="text-blue-400 hover:text-blue-700 leading-none">✕</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); const t = tagInput.trim(); if (t && !tags.includes(t)) setTags([...tags, t]); setTagInput(""); }}}
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
                  placeholder="Type a tag and press Enter…"
                />
              </div>
            </div>

            {/* ── Notes ── */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Notes / Message</label>
              <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Any additional context about this opportunity…" />
            </div>

            {/* ── Schedule appointment (optional) ── */}
            <div className="border-t border-gray-100 pt-4">
              {!apptOpen ? (
                <button
                  type="button"
                  onClick={() => {
                    setApptOpen(true);
                    if (!apptTitle && fullName.trim()) setApptTitle(`Meeting with ${fullName.trim()}`);
                  }}
                  className="text-sm font-semibold text-blue-600 hover:text-blue-700"
                >
                  ＋ Schedule appointment (optional)
                </button>
              ) : (
                <div className="space-y-3 bg-blue-50/40 border border-blue-100 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-gray-900">📅 Schedule appointment</h3>
                    <button
                      type="button"
                      onClick={() => { setApptOpen(false); setApptStartTime(""); }}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      Remove
                    </button>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Title</label>
                    <input
                      type="text"
                      value={apptTitle}
                      onChange={(e) => setApptTitle(e.target.value)}
                      placeholder={fullName.trim() ? `Meeting with ${fullName.trim()}` : "Meeting title"}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Date & time</label>
                    <input
                      type="datetime-local"
                      value={apptStartTime}
                      onChange={(e) => setApptStartTime(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                    <p className="text-xs text-gray-400 mt-1">Defaults to a 60-minute slot. Google Meet link auto-attached.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Notes (optional)</label>
                    <textarea
                      value={apptNotes}
                      onChange={(e) => setApptNotes(e.target.value)}
                      rows={2}
                      placeholder="Agenda or context for the meeting…"
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={apptInvite}
                      onChange={(e) => setApptInvite(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600"
                    />
                    <span className="text-sm text-gray-700">
                      Send calendar invite to <span className="font-semibold">{email.trim() || "the contact"}</span>
                    </span>
                  </label>
                </div>
              )}
            </div>

            {/* ── Schedule task (optional) ── */}
            <div className="border-t border-gray-100 pt-4">
              {!taskOpen ? (
                <button
                  type="button"
                  onClick={() => {
                    setTaskOpen(true);
                    if (!taskTitle && fullName.trim()) setTaskTitle(`Follow up with ${fullName.trim()}`);
                  }}
                  className="text-sm font-semibold text-blue-600 hover:text-blue-700"
                >
                  ＋ Schedule task (optional)
                </button>
              ) : (
                <div className="space-y-3 bg-amber-50/40 border border-amber-100 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-gray-900">✅ Schedule task</h3>
                    <button
                      type="button"
                      onClick={() => { setTaskOpen(false); setTaskTitle(""); setTaskDueDate(""); }}
                      className="text-xs text-gray-500 hover:text-gray-700"
                    >
                      Remove
                    </button>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Task</label>
                    <input
                      type="text"
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      placeholder={fullName.trim() ? `Follow up with ${fullName.trim()}` : "What needs to be done"}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Due date (optional)</label>
                    <input
                      type="date"
                      value={taskDueDate}
                      onChange={(e) => setTaskDueDate(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                    />
                    <p className="text-xs text-gray-400 mt-1">Leave blank for an open-ended task. Visible on /tasks and on the contact&apos;s detail page.</p>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition">
              Cancel
            </button>
            <button type="submit" disabled={saving || success}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition ${success ? "bg-green-500 text-white" : "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"}`}>
              {success ? "✓ Created!" : saving ? "Creating…" : "Create Opportunity"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
