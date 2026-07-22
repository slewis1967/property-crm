"use client";

/**
 * Borrower Fact Find — the form. Mirrors the seven-page paper "Generic Borrower
 * Fact Finder Form" section for section, so a printed copy can be signed and
 * filed against the original.
 *
 * The whole document is one `data` blob (utils/factfind.ts). Editing is local;
 * "Save" PATCHes the entire blob. "Export PDF" prints the form itself — inputs
 * are flattened to underlined text by the @media print block, so there is one
 * rendering to maintain rather than a separate print view that can drift.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { factFindToNeedsAnalysis } from "../../../utils/factFindToNeedsAnalysis";
import { factFindToCreditAuth } from "../../../utils/factFindToCreditAuth";
import { factFindToAmlCase } from "../../../utils/factFindToAmlCase";
import {
  APPLICANT_CAPACITIES,
  ASSET_KINDS,
  DISCLOSURE_QUESTIONS,
  ENTITY_TYPES,
  FACT_FIND_STATUSES,
  FACT_FIND_TERMINAL_STATUS,
  LIABILITY_KINDS,
  OWNERSHIP_STATUSES,
  PROPERTY_USES,
  PURPOSE_BASES,
  computeTotals,
  emptyAsset,
  emptyFactFind,
  emptyLiability,
  emptySecurity,
  factFindCompletionBlockers,
  formatMoney,
  outstandingSections,
  type Applicant,
  type AssetKind,
  type FactFindData,
  type LiabilityKind,
} from "../../../utils/factfind";
import { mergeSeededApplicant } from "../../../utils/needsAnalysisToFactFind";
import CapacityPanel from "./CapacityPanel";
import { LockedBanner, HistoryPanel, SaveStateIndicator } from "../../components/ComplianceDocAudit";
import SigningPanel from "../../components/SigningPanel";
import { useAutosave, type AutosaveOutcome } from "../../hooks/useAutosave";
import { useLocalDraft, draftStorageKey, SAVE_FAILED_HINT } from "../../hooks/useLocalDraft";
import UnsavedDraftBanner from "../../components/UnsavedDraftBanner";

const TEAL = "#0F4C5C";

/* ── Small field primitives ──────────────────────────────────────────────── */

function Label({ children }: { children: React.ReactNode }) {
  return <span className="block text-[11px] uppercase tracking-wide text-gray-500 font-semibold mb-1">{children}</span>;
}

const inputCls =
  "w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-[#0F4C5C]/30 focus:border-[#0F4C5C] transition";

/**
 * A `<input type="number">` prints its raw value ("400000"), which reads badly
 * on a document someone signs. Each money input is paired with this span: hidden
 * on screen, swapped in for the input under @media print. The non-breaking space
 * keeps an empty field's ruled line at full height.
 */
function PrintMoney({ value }: { value: number | null }) {
  return <span className="print-value hidden tabular-nums">{formatMoney(value) || " "}</span>;
}

function Text({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    </label>
  );
}

function Money({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <div className="relative">
        <span className="no-print absolute left-2 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
        <input
          type="number"
          inputMode="decimal"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          className={`${inputCls} print-hide pl-6 tabular-nums`}
        />
        <PrintMoney value={value} />
      </div>
    </label>
  );
}

function Num({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <input
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className={`${inputCls} tabular-nums`}
      />
    </label>
  );
}

function Choice({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
        <option value="">—</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function Area({
  label,
  value,
  onChange,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <label className="block">
      <Label>{label}</Label>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className={inputCls} />
    </label>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 break-inside-avoid">
      <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: TEAL }}>
        {title}
      </h2>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** A typed name + date. The wet signature is added to the printed copy. */
function SignatureBlock({
  index,
  name,
  date,
  onName,
  onDate,
}: {
  index: number;
  name: string;
  date: string;
  onName: (v: string) => void;
  onDate: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Text label={`Applicant ${index} — print name`} value={name} onChange={onName} />
        <Text label="Date" value={date} onChange={onDate} type="date" />
      </div>
      <div className="pt-4 border-b border-gray-400" aria-hidden />
      <p className="text-[11px] text-gray-500">Signature of Applicant {index}</p>
    </div>
  );
}

/* ── The form ────────────────────────────────────────────────────────────── */

export default function FactFindForm({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<FactFindData>(emptyFactFind());
  const [status, setStatus] = useState<string>("Draft");
  const [contactId, setContactId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  // Dirtiness is derived from a monotonic edit counter vs. the counter captured
  // at the last successful save. This survives autosave: an edit that lands mid-
  // save bumps `rev` past `savedRev`, so the doc stays dirty and is saved again
  // (a bare boolean would be wrongly cleared by the in-flight save completing).
  const [rev, setRev] = useState(0);
  const [savedRev, setSavedRev] = useState(0);
  const dirty = rev !== savedRev;
  const [error, setError] = useState("");

  // Local safety-net: mirror unsaved edits to localStorage so a failed save +
  // reload can't lose them; offer to restore a leftover draft on reopen.
  const { recovered, dismissRecovered, discardRecovered, clearDraft } = useLocalDraft({
    storageKey: draftStorageKey("fact_find", id),
    data,
    dirty,
    ready: !loading,
  });
  // Needs Analysis pre-fill state.
  const [seeding, setSeeding] = useState(false);
  const [seedResult, setSeedResult] = useState<{ naId: string; notes: string[] } | null>(null);
  const [seedingNa, setSeedingNa] = useState(false);
  const [naSeedNotes, setNaSeedNotes] = useState<string[] | null>(null);
  const [creatingCa, setCreatingCa] = useState(false);
  const [creatingAml, setCreatingAml] = useState(false);
  const [brokers, setBrokers] = useState<{ id: string; name: string; active: boolean }[]>([]);
  const [brokerId, setBrokerId] = useState("");
  const [sendingBroker, setSendingBroker] = useState(false);
  const [brokerMsg, setBrokerMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/fact-finds/${id}`);
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || "Load failed");
        if (cancelled) return;
        setData(json.factFind.data);
        setStatus(json.factFind.status);
        setContactId(json.factFind.contact_id ?? null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  /** Structured-clone edit: mutate a draft, get a new immutable state. */
  const update = useCallback((mut: (d: FactFindData) => void) => {
    setData((prev) => {
      const next = structuredClone(prev);
      mut(next);
      return next;
    });
    setRev((r) => r + 1);
  }, []);

  /**
   * The single save path — PATCHes the whole blob. Used by the manual Save
   * button, the status dropdown, the reopen action, AND autosave (via
   * `saveNow`). Returns an outcome so autosave can react: a 409 means the doc was
   * signed elsewhere → reflect locked and stop; other failures keep the data and
   * surface the error for retry.
   */
  const doSave = useCallback(
    async (nextStatus?: string): Promise<AutosaveOutcome> => {
      const revAtSave = rev;
      setSaving(true);
      setError("");
      try {
        const res = await fetch(`/api/fact-finds/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data, status: nextStatus ?? status }),
        });
        // A lapsed Cloudflare Access session bounces the request to a login page
        // (a redirect and/or a non-JSON body) rather than the API. Surface a
        // clear, reassuring message (the edits are in the local backup) instead
        // of a generic failure, and never parse the login HTML as JSON.
        if (res.redirected || !(res.headers.get("content-type") || "").includes("application/json")) {
          setError(SAVE_FAILED_HINT);
          return "error";
        }
        const json = await res.json();
        if (res.status === 409) {
          // Signed/locked elsewhere — reflect the lock so autosave stops.
          setStatus(FACT_FIND_TERMINAL_STATUS);
          setError(json.error || "This document is signed/locked.");
          return "locked";
        }
        if (!json.ok) {
          setError(json.error || "Save failed");
          return "error";
        }
        if (nextStatus) setStatus(nextStatus);
        setSavedRev(revAtSave);
        clearDraft(); // the server has it now — drop the local backup
        return "saved";
      } catch {
        // Network drop / blocked auth redirect — data is safe in the local backup.
        setError(SAVE_FAILED_HINT);
        return "error";
      } finally {
        setSaving(false);
      }
    },
    [id, data, status, rev, clearDraft],
  );

  // "Locked" is derived from status — the signed/complete document is read-only
  // until reopened. Single source of truth: FACT_FIND_TERMINAL_STATUS.
  const locked = status === FACT_FIND_TERMINAL_STATUS;

  /**
   * Status change from the dropdown. Marking a fact find Complete is gated: a
   * stub (missing name / DOB / address) can't be signed off. We check locally
   * for an instant, specific message; the server enforces the same rule as a
   * backstop (422). Any other status change saves straight through.
   */
  const requestStatusChange = useCallback(
    (next: string) => {
      if (next === FACT_FIND_TERMINAL_STATUS) {
        const blockers = factFindCompletionBlockers(data);
        if (blockers.length) {
          setError(`Can't mark Complete yet — still needed: ${blockers.join(", ")}.`);
          return; // dropdown reverts because its value is bound to `status`
        }
      }
      void doSave(next);
    },
    [data, doSave],
  );

  /**
   * Pull applicant identity from this contact's newest Needs Analysis into the
   * Fact Find (empty fields only — never overwrites existing values). Fixes the
   * common case where the detail was entered in the Needs Analysis and the Fact
   * Find was left an empty stub. Reviewable: the advisor confirms and saves.
   */
  const populateFromNeedsAnalysis = useCallback(async () => {
    if (!contactId) {
      setError("Link a contact to this fact find first — the Needs Analysis is found by contact.");
      return;
    }
    setSeedingNa(true);
    setError("");
    setNaSeedNotes(null);
    try {
      const res = await fetch(`/api/fact-finds/na-seed?contact_id=${encodeURIComponent(contactId)}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Could not read the Needs Analysis");
      if (!json.found) {
        setError("No Needs Analysis found for this contact to pull from.");
        return;
      }
      const seeded = json.applicants as Applicant[];
      update((d) => {
        seeded.forEach((s, i) => {
          d.applicants[i] = d.applicants[i] ? mergeSeededApplicant(d.applicants[i], s) : s;
        });
      });
      setNaSeedNotes((json.notes as string[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not populate from Needs Analysis");
    } finally {
      setSeedingNa(false);
    }
  }, [contactId, update]);

  /**
   * Download the server-rendered PDF (headless Chromium reusing the print
   * document). Distinct from "Export PDF" (window.print): this yields an
   * attachable file. Saves first so the PDF reflects the latest edits — the
   * server reads the persisted blob, not the in-memory form state.
   */
  const downloadPdf = useCallback(async () => {
    setDownloading(true);
    setError("");
    try {
      if (dirty && !locked) await doSave();
      const res = await fetch(`/api/fact-finds/${id}/pdf`);
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(json?.error || "PDF download failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `fact-find-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "PDF download failed");
    } finally {
      setDownloading(false);
    }
    // `dirty` / `locked` are read fresh at call time; `doSave` is stable enough
    // for this manual action.
  }, [id, dirty, locked, doSave]);

  const {
    state: saveState,
    lastSavedAt,
    saveNow,
  } = useAutosave({ isDirty: dirty, isLocked: locked, rev, save: () => doSave() });

  /**
   * Seed a fresh NCCP Needs Analysis from this Fact Find's current data. The
   * seeded document opens as a reviewable Draft. When the mapping made any
   * assumptions, we surface them here (banner with a link) rather than
   * navigating straight off, so the advisor sees what needs checking.
   */
  const createNeedsAnalysis = useCallback(async () => {
    setSeeding(true);
    setError("");
    try {
      const { data: naData, notes } = factFindToNeedsAnalysis(data);
      const res = await fetch("/api/needs-analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, data: naData }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Could not create Needs Analysis");
      if (notes.length) {
        // Let the advisor read the review notes, then click through.
        setSeedResult({ naId: json.id, notes });
      } else {
        router.push(`/needs-analysis/${json.id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create Needs Analysis");
    } finally {
      setSeeding(false);
    }
  }, [data, contactId, router]);

  // Load the configurable broker list (Settings → Brokers) for the dropdown.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/settings/brokers");
        const json = await res.json();
        if (!cancelled && json.ok) setBrokers((json.brokers as typeof brokers).filter((b) => b.active));
      } catch {
        /* brokers are optional — the control just won't show any */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Submit this Fact Find to the selected broker: save any pending edits, then
   * the server verifies it's complete, renders the PDF and emails the broker.
   * Blocks (with the missing fields) if the Fact Find is a stub.
   */
  const sendToBroker = useCallback(async () => {
    if (!brokerId) {
      setBrokerMsg({ ok: false, text: "Pick a broker first." });
      return;
    }
    setSendingBroker(true);
    setBrokerMsg(null);
    setError("");
    try {
      if (dirty && !locked) await doSave();
      const res = await fetch(`/api/fact-finds/${id}/submit-to-broker`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brokerId }),
      });
      const json = await res.json();
      if (!json.ok) {
        setBrokerMsg({ ok: false, text: json.error || "Could not send to the broker." });
        return;
      }
      setBrokerMsg({ ok: true, text: `Fact Find sent to ${json.broker} (${json.email}).` });
    } catch (e) {
      setBrokerMsg({ ok: false, text: e instanceof Error ? e.message : "Could not send to the broker." });
    } finally {
      setSendingBroker(false);
    }
  }, [brokerId, id, dirty, locked, doSave]);

  /**
   * Create a Credit File Authorisation pre-filled from this Fact Find — both
   * applicants' names and Applicant 1's home address, so the broker doesn't
   * re-key what this form already holds. Persists any pending edits first so the
   * derived document reflects the latest data, then links the new Credit
   * Authorisation to the same contact and opens it.
   */
  const createCreditAuthorisation = useCallback(async () => {
    setCreatingCa(true);
    setError("");
    try {
      if (dirty && !locked) await doSave();
      const caData = factFindToCreditAuth(data);
      const res = await fetch("/api/credit-authorisations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, data: caData }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Could not create Credit Authorisation");
      router.push(`/credit-authorisation/${json.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create Credit Authorisation");
    } finally {
      setCreatingCa(false);
    }
  }, [data, contactId, dirty, locked, doSave, router]);

  /**
   * Create an AML/CTF CDD case pre-filled from this Fact Find's primary borrower
   * (Applicant 1) — legal name, date of birth and residential address as an
   * individual party. A co-borrower (Applicant 2) is a separate natural person
   * who needs their own case. Persists any pending edits first, links the new
   * case to the same contact, and opens it.
   */
  const createAmlCase = useCallback(async () => {
    setCreatingAml(true);
    setError("");
    try {
      if (dirty && !locked) await doSave();
      const caseData = factFindToAmlCase(data);
      const res = await fetch("/api/aml/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, partyType: "individual", data: caseData }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Could not create AML case");
      router.push(`/aml/${json.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create AML case");
    } finally {
      setCreatingAml(false);
    }
  }, [data, contactId, dirty, locked, doSave, router]);

  if (loading) return <p className="p-6 text-sm text-gray-500">Loading fact find…</p>;

  const totals = computeTotals(data);
  const missing = outstandingSections(data);
  const money = formatMoney;

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #factfind-document, #factfind-document * { visibility: visible !important; }
          #factfind-document { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          /* Flatten controls into printable lines. */
          #factfind-document input, #factfind-document select, #factfind-document textarea {
            border: none !important; border-bottom: 1px solid #999 !important;
            border-radius: 0 !important; background: transparent !important;
            padding-left: 0 !important; -webkit-appearance: none; appearance: none;
          }
          #factfind-document input[type="checkbox"], #factfind-document input[type="radio"] {
            border: 1px solid #333 !important; border-radius: 2px !important;
          }
          /* Date inputs otherwise print a calendar-picker glyph beside the value. */
          #factfind-document input[type="date"]::-webkit-calendar-picker-indicator { display: none !important; }
          /* Swap each money <input type=number> (prints "400000") for its
             formatted twin (prints "$400,000"). See PrintMoney. */
          #factfind-document .print-hide { display: none !important; }
          #factfind-document .print-value {
            display: block !important;
            border-bottom: 1px solid #999;
            padding: 2px 0;
            font-size: 0.875rem;
            min-height: 1.5em;
          }
          /* The privacy notice is a scroll box on screen. Unclip it, or the page
             the applicant signs shows only the first screenful of the notice. */
          #factfind-document .print-unclip {
            max-height: none !important; overflow: visible !important; border: none !important; background: none !important;
          }
          #factfind-document section { border: 1px solid #ddd !important; page-break-inside: avoid; }
          @page { size: A4; margin: 14mm 12mm; }
        }
      `}</style>

      {/* Toolbar */}
      <div className="no-print sticky top-0 z-10 bg-gray-50/90 backdrop-blur border-b border-gray-200 px-4 py-3 flex gap-3 items-center flex-wrap">
        <Link href="/fact-find" className="text-sm text-gray-600 hover:text-gray-900 hover:underline">
          ← All fact finds
        </Link>
        <div className="flex-1" />
        {!locked && <SaveStateIndicator state={saveState} lastSavedAt={lastSavedAt} onRetry={saveNow} />}
        <select
          value={status}
          onChange={(e) => requestStatusChange(e.target.value)}
          disabled={saving}
          className="px-2 py-1.5 text-sm border border-gray-300 rounded-md bg-white"
        >
          {FACT_FIND_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        {!locked && (
          <button
            onClick={() => void populateFromNeedsAnalysis()}
            disabled={seedingNa}
            className="px-4 py-2 text-sm font-semibold rounded-lg border transition disabled:opacity-60"
            style={{ borderColor: TEAL, color: TEAL }}
            title="Fill empty applicant fields from this contact's newest Needs Analysis"
          >
            {seedingNa ? "Pulling…" : "↓ Populate from Needs Analysis"}
          </button>
        )}
        {brokers.length > 0 && (
          <div className="flex items-center gap-1.5">
            <select
              value={brokerId}
              onChange={(e) => {
                setBrokerId(e.target.value);
                setBrokerMsg(null);
              }}
              className="px-2 py-1.5 text-sm border border-gray-300 rounded-md bg-white"
              title="Submit this Fact Find to a broker"
            >
              <option value="">Send to broker…</option>
              {brokers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <button
              onClick={() => void sendToBroker()}
              disabled={sendingBroker || !brokerId}
              className="px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-50 transition"
              style={{ backgroundColor: TEAL }}
              title="Verify the Fact Find is complete, then email it to the selected broker"
            >
              {sendingBroker ? "Sending…" : "Send"}
            </button>
          </div>
        )}
        <button
          onClick={() => void createNeedsAnalysis()}
          disabled={seeding}
          className="px-4 py-2 text-sm font-semibold rounded-lg border transition disabled:opacity-60"
          style={{ borderColor: TEAL, color: TEAL }}
          title="Create an NCCP Needs Analysis pre-filled from this Fact Find"
        >
          {seeding ? "Creating…" : "→ Create Needs Analysis"}
        </button>
        <button
          onClick={() => void createCreditAuthorisation()}
          disabled={creatingCa}
          className="px-4 py-2 text-sm font-semibold rounded-lg border transition disabled:opacity-60"
          style={{ borderColor: TEAL, color: TEAL }}
          title="Create a Credit File Authorisation pre-filled with both applicants' names and address"
        >
          {creatingCa ? "Creating…" : "→ Create Credit Authorisation"}
        </button>
        <button
          onClick={() => void createAmlCase()}
          disabled={creatingAml}
          className="px-4 py-2 text-sm font-semibold rounded-lg border transition disabled:opacity-60"
          style={{ borderColor: TEAL, color: TEAL }}
          title="Create an AML/CTF CDD case pre-filled from Applicant 1"
        >
          {creatingAml ? "Creating…" : "→ Create AML case"}
        </button>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 text-sm font-semibold rounded-lg border transition"
          style={{ borderColor: TEAL, color: TEAL }}
        >
          Export PDF
        </button>
        <button
          onClick={() => void downloadPdf()}
          disabled={downloading}
          className="px-4 py-2 text-sm font-semibold rounded-lg border transition disabled:opacity-60"
          style={{ borderColor: TEAL, color: TEAL }}
        >
          {downloading ? "Preparing…" : "Download PDF"}
        </button>
        <button
          onClick={() => saveNow()}
          disabled={saving || !dirty || locked}
          className="px-4 py-2 text-sm font-semibold text-white rounded-lg disabled:opacity-60 transition"
          style={{ backgroundColor: TEAL }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>

      {error && (
        <div className="no-print mx-4 mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">
          {error}
        </div>
      )}

      {brokerMsg && (
        <div
          className={`no-print mx-4 mt-4 p-3 rounded-lg border text-sm ${
            brokerMsg.ok ? "bg-green-50 border-green-200 text-green-800" : "bg-amber-50 border-amber-200 text-amber-800"
          }`}
        >
          {brokerMsg.text}
        </div>
      )}

      {naSeedNotes && (
        <div className="no-print mx-4 mt-4 p-3 rounded-lg bg-teal-50 border border-teal-200 text-sm text-teal-900">
          <p className="font-semibold">Pulled applicant details from the Needs Analysis — please review, then Save.</p>
          <ul className="mt-1 list-disc pl-5 text-teal-800">
            {naSeedNotes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
          <button
            onClick={() => setNaSeedNotes(null)}
            className="mt-2 text-xs font-medium text-teal-700 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {recovered && !locked && (
        <UnsavedDraftBanner
          ts={recovered.ts}
          onRestore={() => {
            setData(recovered.data);
            setRev((r) => r + 1); // mark dirty so autosave persists the restored blob
            dismissRecovered();
          }}
          onDiscard={discardRecovered}
        />
      )}

      {locked && <LockedBanner onReopen={() => void doSave(FACT_FIND_STATUSES[0])} busy={saving} />}
      <HistoryPanel apiBase="/api/fact-finds" id={id} />
      <SigningPanel
        docType="fact_find"
        docId={id}
        proposedSigners={data.applicants
          .map((a) => ({
            name: [a.given_names, a.family_name].map((v) => v.trim()).filter(Boolean).join(" "),
            email: a.email.trim(),
          }))
          .filter((s) => s.name || s.email)}
      />

      {seedResult && (
        <div className="no-print mx-4 mt-4 p-4 rounded-lg bg-amber-50 border border-amber-200">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-amber-900">
                Needs Analysis created as a Draft — carried over with {seedResult.notes.length}{" "}
                {seedResult.notes.length === 1 ? "item" : "items"} to review
              </p>
              <p className="text-xs text-amber-800 mt-1">
                The seeded values are a reviewable draft. Please confirm each of the following before completing:
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => router.push(`/needs-analysis/${seedResult.naId}`)}
                className="px-4 py-2 text-sm font-semibold text-white rounded-lg transition"
                style={{ backgroundColor: TEAL }}
              >
                Open Needs Analysis →
              </button>
              <button
                onClick={() => setSeedResult(null)}
                className="text-amber-700 hover:text-amber-900 px-1"
                title="Dismiss"
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          </div>
          <ul className="mt-3 ml-5 list-disc text-sm text-amber-900 space-y-0.5">
            {seedResult.notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {/* When locked (signed/complete) every input inside is disabled — the
          document is read-only until reopened. min-w-0 keeps the fieldset from
          forcing its intrinsic min-width and overflowing on small screens. */}
      <fieldset id="factfind-document" disabled={locked} className="max-w-5xl mx-auto p-4 sm:p-6 space-y-5 min-w-0 border-0">
        {/* Letterhead */}
        <header className="text-center pb-2">
          <h1 className="text-xl font-bold tracking-wide" style={{ color: TEAL }}>
            BORROWER FACT FINDER FORM
          </h1>
          <p className="text-xs text-gray-500 mt-1">NextKey Property Strategists</p>
        </header>

        <Section title="Referral">
          <div className="max-w-md">
            <Text
              label="Individuals referred by"
              value={data.referred_by}
              onChange={(v) => update((d) => void (d.referred_by = v))}
            />
          </div>
        </Section>

        {/* 1. Individual applicants */}
        <Section title="Individual applicants">
          <div className="grid md:grid-cols-2 gap-6">
            {data.applicants.map((a, i) => (
              <div key={i} className="space-y-3">
                <h3 className="text-xs font-bold text-gray-700">Individual Applicant {i + 1}</h3>
                <div className="grid grid-cols-3 gap-3">
                  <Text
                    label="Title"
                    placeholder="Mr / Mrs / Ms / Dr"
                    value={a.title}
                    onChange={(v) => update((d) => void (d.applicants[i].title = v))}
                  />
                  <div className="col-span-2">
                    <Text
                      label="Family name"
                      value={a.family_name}
                      onChange={(v) => update((d) => void (d.applicants[i].family_name = v))}
                    />
                  </div>
                </div>
                <Text
                  label="Given name(s)"
                  value={a.given_names}
                  onChange={(v) => update((d) => void (d.applicants[i].given_names = v))}
                />
                <Choice
                  label="Capacity of applicant"
                  value={a.capacity}
                  options={APPLICANT_CAPACITIES}
                  onChange={(v) => update((d) => void (d.applicants[i].capacity = v))}
                />
                <Area
                  label="Current home address"
                  rows={2}
                  value={a.address}
                  onChange={(v) => update((d) => void (d.applicants[i].address = v))}
                />
                <p className="text-[11px] text-gray-500 -mt-1">
                  Provide a recent rates or utility bill to confirm the address. Cannot be a P.O. Box.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <Text
                    label="Postcode"
                    value={a.postcode}
                    onChange={(v) => update((d) => void (d.applicants[i].postcode = v))}
                  />
                  <Text
                    label="Phone (work)"
                    value={a.phone_work}
                    onChange={(v) => update((d) => void (d.applicants[i].phone_work = v))}
                  />
                  <Text
                    label="Phone (home)"
                    value={a.phone_home}
                    onChange={(v) => update((d) => void (d.applicants[i].phone_home = v))}
                  />
                </div>
                <Text
                  label="Email address"
                  type="email"
                  value={a.email}
                  onChange={(v) => update((d) => void (d.applicants[i].email = v))}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Text
                    label="Date of birth"
                    type="date"
                    value={a.date_of_birth}
                    onChange={(v) => update((d) => void (d.applicants[i].date_of_birth = v))}
                  />
                  <Text
                    label="Driver's licence no."
                    value={a.drivers_licence}
                    onChange={(v) => update((d) => void (d.applicants[i].drivers_licence = v))}
                  />
                </div>
                <Text
                  label="Occupation / position / industry"
                  value={a.occupation}
                  onChange={(v) => update((d) => void (d.applicants[i].occupation = v))}
                />
                {/* Not on the paper form. Without income the fact find can't
                    service, and the whole point of a fact find is to service. */}
                <div className="grid sm:grid-cols-2 gap-3 mt-3">
                  <Money
                    label="Gross annual income"
                    value={a.annual_income}
                    onChange={(v) => update((d) => void (d.applicants[i].annual_income = v))}
                  />
                  <Money
                    label="HECS/HELP balance owing"
                    value={a.hecs_balance}
                    onChange={(v) =>
                      update((d) => {
                        d.applicants[i].hecs_balance = v;
                        d.applicants[i].has_hecs = (v ?? 0) > 0;
                      })
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* 2. Companies / trusts */}
        <Section title="Companies / trusts" subtitle="Complete only if the borrower is a company, trust or partnership.">
          <div className="grid md:grid-cols-2 gap-3">
            <Text label="Name" value={data.entity.name} onChange={(v) => update((d) => void (d.entity.name = v))} />
            <Text label="A.C.N." value={data.entity.acn} onChange={(v) => update((d) => void (d.entity.acn = v))} />
            <Choice
              label="Entity type"
              value={data.entity.entity_type}
              options={ENTITY_TYPES}
              onChange={(v) => update((d) => void (d.entity.entity_type = v))}
            />
            <Choice
              label="Capacity"
              value={data.entity.capacity}
              options={APPLICANT_CAPACITIES}
              onChange={(v) => update((d) => void (d.entity.capacity = v))}
            />
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <Text
                label="Postal address"
                value={data.entity.postal_address}
                onChange={(v) => update((d) => void (d.entity.postal_address = v))}
              />
              <div className="w-24">
                <Text
                  label="Postcode"
                  value={data.entity.postal_postcode}
                  onChange={(v) => update((d) => void (d.entity.postal_postcode = v))}
                />
              </div>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <Text
                label="Trading address"
                value={data.entity.trading_address}
                onChange={(v) => update((d) => void (d.entity.trading_address = v))}
              />
              <div className="w-24">
                <Text
                  label="Postcode"
                  value={data.entity.trading_postcode}
                  onChange={(v) => update((d) => void (d.entity.trading_postcode = v))}
                />
              </div>
            </div>
            <Text label="Phone number" value={data.entity.phone} onChange={(v) => update((d) => void (d.entity.phone = v))} />
            <Text label="Facsimile number" value={data.entity.fax} onChange={(v) => update((d) => void (d.entity.fax = v))} />
            <Text
              label="Incorporation date"
              type="date"
              value={data.entity.incorporation_date}
              onChange={(v) => update((d) => void (d.entity.incorporation_date = v))}
            />
            <Text
              label="Principal activity"
              value={data.entity.principal_activity}
              onChange={(v) => update((d) => void (d.entity.principal_activity = v))}
            />
          </div>
        </Section>

        {/* 3. Advisors */}
        <Section title="Advisors' details">
          <div className="grid md:grid-cols-2 gap-6">
            {(["solicitor", "accountant"] as const).map((who) => {
              const adv = data.advisors[who];
              return (
                <div key={who} className="space-y-3">
                  <h3 className="text-xs font-bold text-gray-700 uppercase">{who}</h3>
                  <Text label="Name of firm" value={adv.firm} onChange={(v) => update((d) => void (d.advisors[who].firm = v))} />
                  <Area label="Address" rows={2} value={adv.address} onChange={(v) => update((d) => void (d.advisors[who].address = v))} />
                  <div className="grid grid-cols-3 gap-3">
                    <Text label="Postcode" value={adv.postcode} onChange={(v) => update((d) => void (d.advisors[who].postcode = v))} />
                    <Text label="Telephone" value={adv.telephone} onChange={(v) => update((d) => void (d.advisors[who].telephone = v))} />
                    <Text label="Fax" value={adv.fax} onChange={(v) => update((d) => void (d.advisors[who].fax = v))} />
                  </div>
                  <Text
                    label="Contact name"
                    value={adv.contact_name}
                    onChange={(v) => update((d) => void (d.advisors[who].contact_name = v))}
                  />
                  {who === "solicitor" && (
                    <div className="grid grid-cols-2 gap-3">
                      <Text
                        label="DX no."
                        value={adv.dx_number ?? ""}
                        onChange={(v) => update((d) => void (d.advisors.solicitor.dx_number = v))}
                      />
                      <Text
                        label="DX location"
                        value={adv.dx_location ?? ""}
                        onChange={(v) => update((d) => void (d.advisors.solicitor.dx_location = v))}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        {/* 4. Loan required */}
        <Section title="Details of loan required">
          <div className="grid md:grid-cols-3 gap-3">
            <Money
              label="Loan amount required (net of fees & charges)"
              value={data.loan.amount_required}
              onChange={(v) => update((d) => void (d.loan.amount_required = v))}
            />
            <Num label="Term (months)" value={data.loan.term_months} onChange={(v) => update((d) => void (d.loan.term_months = v))} />
            <Text
              label="Expected settlement date"
              type="date"
              value={data.loan.expected_settlement}
              onChange={(v) => update((d) => void (d.loan.expected_settlement = v))}
            />
          </div>
          <div className="grid md:grid-cols-2 gap-3 mt-3">
            <Area label="Loan purpose" value={data.loan.purpose} onChange={(v) => update((d) => void (d.loan.purpose = v))} />
            <Area
              label="Loan repayment strategy (e.g. refinance, sale of property)"
              value={data.loan.repayment_strategy}
              onChange={(v) => update((d) => void (d.loan.repayment_strategy = v))}
            />
          </div>
        </Section>

        {/* 5. Security */}
        <Section title="Security offered for the loan">
          <div className="space-y-6">
            {data.securities.map((s, i) => (
              <div key={i} className="space-y-3 pb-5 border-b border-gray-100 last:border-0 last:pb-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-gray-700">Property {i + 1}</h3>
                  {data.securities.length > 1 && (
                    <button
                      onClick={() => update((d) => void d.securities.splice(i, 1))}
                      className="no-print text-xs text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid md:grid-cols-4 gap-3">
                  <div className="md:col-span-2">
                    <Text label="Address" value={s.address} onChange={(v) => update((d) => void (d.securities[i].address = v))} />
                  </div>
                  <Text label="Suburb" value={s.suburb} onChange={(v) => update((d) => void (d.securities[i].suburb = v))} />
                  <Text label="Postcode" value={s.postcode} onChange={(v) => update((d) => void (d.securities[i].postcode = v))} />
                  <Text
                    label="Folio identifier"
                    value={s.folio_identifier}
                    onChange={(v) => update((d) => void (d.securities[i].folio_identifier = v))}
                  />
                  <Text label="Zoning" value={s.zoning} onChange={(v) => update((d) => void (d.securities[i].zoning = v))} />
                  <Choice
                    label="Use of property"
                    value={s.use}
                    options={PROPERTY_USES}
                    onChange={(v) => update((d) => void (d.securities[i].use = v))}
                  />
                  <Choice
                    label="Ownership"
                    value={s.ownership}
                    options={OWNERSHIP_STATUSES}
                    onChange={(v) => update((d) => void (d.securities[i].ownership = v))}
                  />
                  <Money
                    label="Estimated value / purchase price"
                    value={s.estimated_value}
                    onChange={(v) => update((d) => void (d.securities[i].estimated_value = v))}
                  />
                  <Money
                    label="Rental value per week (if applicable)"
                    value={s.rental_per_week}
                    onChange={(v) => update((d) => void (d.securities[i].rental_per_week = v))}
                  />
                  <label className="flex items-end gap-2 pb-1.5">
                    <input
                      type="checkbox"
                      checked={s.quick_valuation}
                      onChange={(e) => update((d) => void (d.securities[i].quick_valuation = e.target.checked))}
                      className="w-4 h-4"
                    />
                    <span className="text-xs text-gray-700">Quick valuation requested</span>
                  </label>
                </div>
                <div className="grid md:grid-cols-4 gap-3">
                  <Text
                    label="Contact for valuer access"
                    value={s.valuer_contact_name}
                    onChange={(v) => update((d) => void (d.securities[i].valuer_contact_name = v))}
                  />
                  <Text
                    label="Business hours"
                    value={s.phone_business}
                    onChange={(v) => update((d) => void (d.securities[i].phone_business = v))}
                  />
                  <Text
                    label="After hours"
                    value={s.phone_after_hours}
                    onChange={(v) => update((d) => void (d.securities[i].phone_after_hours = v))}
                  />
                  <Text label="Mobile" value={s.phone_mobile} onChange={(v) => update((d) => void (d.securities[i].phone_mobile = v))} />
                </div>
              </div>
            ))}
          </div>
          <button
            onClick={() => update((d) => void d.securities.push(emptySecurity()))}
            className="no-print mt-4 text-xs font-semibold hover:underline"
            style={{ color: TEAL }}
          >
            + Add another security property
          </button>
        </Section>

        {/* 6. Financial position */}
        <Section title="Personal financial statements">
          <div className="grid sm:grid-cols-3 gap-3 mb-5 max-w-3xl">
            <Text
              label="Statement for"
              value={data.financials.statement_for}
              onChange={(v) => update((d) => void (d.financials.statement_for = v))}
            />
            <Num
              label="Dependents"
              value={data.financials.servicing.dependents}
              onChange={(v) => update((d) => void (d.financials.servicing.dependents = v))}
            />
            <Money
              label="Monthly living expenses"
              value={data.financials.servicing.monthly_living_expenses}
              onChange={(v) =>
                update((d) => void (d.financials.servicing.monthly_living_expenses = v))
              }
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-8">
            {/* Liabilities */}
            <div>
              <h3 className="text-xs font-bold text-gray-700 uppercase mb-3">Liabilities</h3>
              <div className="space-y-2">
                {data.financials.liabilities.map((l, i) => (
                  <div key={l.id} className="grid grid-cols-[1.4fr_1fr_1fr_auto] gap-2 items-end">
                    <label className="block">
                      {i === 0 && <Label>Type / lender</Label>}
                      <div className="flex gap-1">
                        <select
                          value={l.kind}
                          onChange={(e) =>
                            update((d) => void (d.financials.liabilities[i].kind = e.target.value as LiabilityKind))
                          }
                          className={`${inputCls} w-28 shrink-0`}
                        >
                          {LIABILITY_KINDS.map((k) => (
                            <option key={k} value={k}>
                              {k}
                            </option>
                          ))}
                        </select>
                        <input
                          value={l.label}
                          placeholder={l.kind === "Credit card" ? "Issuer" : "Lender / description"}
                          onChange={(e) => update((d) => void (d.financials.liabilities[i].label = e.target.value))}
                          className={inputCls}
                        />
                      </div>
                    </label>
                    <label className="block">
                      {i === 0 && <Label>{"Balance / limit"}</Label>}
                      <input
                        type="number"
                        value={l.balance ?? ""}
                        onChange={(e) =>
                          update(
                            (d) =>
                              void (d.financials.liabilities[i].balance =
                                e.target.value === "" ? null : Number(e.target.value)),
                          )
                        }
                        className={`${inputCls} print-hide tabular-nums`}
                      />
                      <PrintMoney value={l.balance} />
                    </label>
                    <label className="block">
                      {i === 0 && <Label>Per month</Label>}
                      <input
                        type="number"
                        value={l.monthly ?? ""}
                        onChange={(e) =>
                          update(
                            (d) =>
                              void (d.financials.liabilities[i].monthly =
                                e.target.value === "" ? null : Number(e.target.value)),
                          )
                        }
                        className={`${inputCls} print-hide tabular-nums`}
                      />
                      <PrintMoney value={l.monthly} />
                    </label>
                    <button
                      onClick={() => update((d) => void d.financials.liabilities.splice(i, 1))}
                      className="no-print text-gray-400 hover:text-red-600 pb-2 px-1"
                      title="Remove row"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() =>
                  update((d) => void d.financials.liabilities.push(emptyLiability("Mortgage", d.financials.liabilities.length)))
                }
                className="no-print mt-3 text-xs font-semibold hover:underline"
                style={{ color: TEAL }}
              >
                + Add liability
              </button>
              <div className="mt-4 pt-3 border-t border-gray-200 flex justify-between text-sm">
                <span className="font-semibold text-gray-700">Total liabilities</span>
                <span className="font-bold tabular-nums">{money(totals.totalLiabilities)}</span>
              </div>
              <div className="mt-1 flex justify-between text-xs text-gray-500">
                <span>Monthly commitments</span>
                <span className="tabular-nums">{money(totals.monthlyCommitments)}</span>
              </div>
            </div>

            {/* Assets */}
            <div>
              <h3 className="text-xs font-bold text-gray-700 uppercase mb-3">Assets</h3>
              <div className="space-y-2">
                {data.financials.assets.map((a, i) => (
                  <div key={a.id} className="grid grid-cols-[1.4fr_1fr_auto] gap-2 items-end">
                    <label className="block">
                      {i === 0 && <Label>Type / description</Label>}
                      <div className="flex gap-1">
                        <select
                          value={a.kind}
                          onChange={(e) => update((d) => void (d.financials.assets[i].kind = e.target.value as AssetKind))}
                          className={`${inputCls} w-36 shrink-0`}
                        >
                          {ASSET_KINDS.map((k) => (
                            <option key={k} value={k}>
                              {k}
                            </option>
                          ))}
                        </select>
                        <input
                          value={a.label}
                          placeholder={a.kind === "Property" ? "Property at…" : "Description"}
                          onChange={(e) => update((d) => void (d.financials.assets[i].label = e.target.value))}
                          className={inputCls}
                        />
                      </div>
                    </label>
                    <label className="block">
                      {i === 0 && <Label>Value</Label>}
                      <input
                        type="number"
                        value={a.value ?? ""}
                        onChange={(e) =>
                          update(
                            (d) =>
                              void (d.financials.assets[i].value = e.target.value === "" ? null : Number(e.target.value)),
                          )
                        }
                        className={`${inputCls} print-hide tabular-nums`}
                      />
                      <PrintMoney value={a.value} />
                    </label>
                    <button
                      onClick={() => update((d) => void d.financials.assets.splice(i, 1))}
                      className="no-print text-gray-400 hover:text-red-600 pb-2 px-1"
                      title="Remove row"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => update((d) => void d.financials.assets.push(emptyAsset("Property", d.financials.assets.length)))}
                className="no-print mt-3 text-xs font-semibold hover:underline"
                style={{ color: TEAL }}
              >
                + Add asset
              </button>
              <div className="mt-4 pt-3 border-t border-gray-200 flex justify-between text-sm">
                <span className="font-semibold text-gray-700">Total assets</span>
                <span className="font-bold tabular-nums">{money(totals.totalAssets)}</span>
              </div>
            </div>
          </div>

          <div
            className="mt-6 p-3 rounded-lg flex justify-between items-center"
            style={{ backgroundColor: totals.surplusAssets < 0 ? "#FEF2F2" : "#E0F2F1" }}
          >
            <span className="text-sm font-bold" style={{ color: totals.surplusAssets < 0 ? "#991B1B" : TEAL }}>
              Surplus assets
            </span>
            <span
              className="text-lg font-bold tabular-nums"
              style={{ color: totals.surplusAssets < 0 ? "#991B1B" : TEAL }}
            >
              {money(totals.surplusAssets)}
            </span>
          </div>
        </Section>

        {/* 7. Disclosures */}
        <Section title="Disclosures">
          <div className="space-y-4">
            {DISCLOSURE_QUESTIONS.map((q) => {
              const answer = data.disclosures[q.key]?.answer ?? null;
              return (
                <div key={q.key} className="grid md:grid-cols-[1fr_auto] gap-3 items-start">
                  <p className="text-sm text-gray-800">{q.text}</p>
                  <div className="flex gap-4">
                    {(["yes", "no"] as const).map((opt) => (
                      <label key={opt} className="flex items-center gap-1.5 text-sm">
                        <input
                          type="radio"
                          name={q.key}
                          checked={answer === opt}
                          onChange={() => update((d) => void (d.disclosures[q.key].answer = opt))}
                          className="w-4 h-4"
                        />
                        <span className="uppercase text-xs font-semibold text-gray-700">{opt}</span>
                      </label>
                    ))}
                  </div>
                  {answer === "yes" && (
                    <div className="md:col-span-2">
                      <Area
                        label="Details"
                        rows={2}
                        value={data.disclosures[q.key].details}
                        onChange={(v) => update((d) => void (d.disclosures[q.key].details = v))}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Section>

        {/* 8. Declaration */}
        <Section title="Declaration">
          <label className="flex items-start gap-2 mb-5">
            <input
              type="checkbox"
              checked={data.declarations.info_confirmed}
              onChange={(e) => update((d) => void (d.declarations.info_confirmed = e.target.checked))}
              className="w-4 h-4 mt-0.5"
            />
            <span className="text-sm text-gray-800">I confirm that the above information is complete and correct.</span>
          </label>
          <div className="grid md:grid-cols-2 gap-8">
            {data.declarations.signatories.map((s, i) => (
              <SignatureBlock
                key={i}
                index={i + 1}
                name={s.name}
                date={s.date}
                onName={(v) => update((d) => void (d.declarations.signatories[i].name = v))}
                onDate={(v) => update((d) => void (d.declarations.signatories[i].date = v))}
              />
            ))}
          </div>
        </Section>

        {/* 9. Declaration of purpose */}
        <Section
          title="Declaration of purpose"
          subtitle="As required under the Consumer Credit Code, Section 11, Regulation 10."
        >
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 mb-4">
            <p className="text-xs font-bold text-amber-900 uppercase">Important</p>
            <p className="text-sm text-amber-900 mt-1">
              You should only sign this declaration if this loan is wholly or predominantly for:
            </p>
            <ul className="text-sm text-amber-900 mt-1 ml-5 list-[lower-alpha] space-y-0.5">
              {PURPOSE_BASES.map((p) => (
                <li key={p.key}>{p.text}</li>
              ))}
            </ul>
            <p className="text-sm font-semibold text-amber-900 mt-2">
              By signing this declaration, you may lose your protection under the National Credit Code.
            </p>
          </div>

          <div className="flex flex-wrap gap-4 mb-4">
            {PURPOSE_BASES.map((p) => (
              <label key={p.key} className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="purpose_basis"
                  checked={data.declarations.purpose.basis === p.key}
                  onChange={() => update((d) => void (d.declarations.purpose.basis = p.key))}
                  className="w-4 h-4"
                />
                <span className="text-gray-800 capitalize">{p.key} purposes</span>
              </label>
            ))}
          </div>

          <label className="flex items-start gap-2 mb-5">
            <input
              type="checkbox"
              checked={data.declarations.purpose.acknowledged}
              onChange={(e) => update((d) => void (d.declarations.purpose.acknowledged = e.target.checked))}
              className="w-4 h-4 mt-0.5"
            />
            <span className="text-sm text-gray-800">
              The applicant(s) have read the above and declare the loan is wholly or predominantly for the purpose
              selected.
            </span>
          </label>

          <div className="grid md:grid-cols-2 gap-8">
            {data.declarations.purpose.signatories.map((s, i) => (
              <SignatureBlock
                key={i}
                index={i + 1}
                name={s.name}
                date={s.date}
                onName={(v) => update((d) => void (d.declarations.purpose.signatories[i].name = v))}
                onDate={(v) => update((d) => void (d.declarations.purpose.signatories[i].date = v))}
              />
            ))}
          </div>
        </Section>

        {/* 10. Privacy */}
        <Section
          title="Privacy — notice & consent"
          subtitle="Important notice to applicant(s) for credit — s.18E(8)(c) and s.18L(4), Privacy Act 1988."
        >
          <div className="print-unclip text-xs text-gray-700 space-y-2 max-h-64 overflow-y-auto p-3 rounded-lg bg-gray-50 border border-gray-200">
            <p className="font-semibold">
              Notice of disclosure of your credit information to a credit reporting agency.
            </p>
            <p>We may give information about you to a credit reporting agency, for the following purposes:</p>
            <ul className="ml-4 list-disc space-y-0.5">
              <li>to obtain a consumer credit report about you; and/or</li>
              <li>
                to allow the credit reporting agency to create or maintain a credit information file containing
                information about you.
              </li>
            </ul>
            <p>The information is limited to:</p>
            <ul className="ml-4 list-disc space-y-0.5">
              <li>
                identity particulars — your name, sex, address (and the previous two addresses), date of birth, name of
                employer, and driver&apos;s licence number;
              </li>
              <li>your application for credit or commercial credit — the fact that you have applied for credit and the amount;</li>
              <li>the fact that the lender is a current credit provider to you;</li>
              <li>advice that your loan repayments are no longer overdue in respect of any default that has been listed;</li>
              <li>
                information that, in the opinion of the lender, you have committed a serious credit infringement (that is,
                acted fraudulently or shown an intention not to comply with your credit obligations);
              </li>
              <li>dishonoured cheques — cheques drawn by you for $100 or more which have been dishonoured more than once;</li>
              <li>that credit provided to you by the lender has been paid or otherwise discharged.</li>
            </ul>
            <p className="font-semibold pt-1">Period to which this understanding applies</p>
            <p>This information may be given before, during or after the provision of credit to you.</p>
            <p className="font-semibold pt-1">Statement by applicant(s) for credit</p>
            <p>Please read carefully before signing. Where there is more than one applicant, each applicant must sign.</p>
            <p>
              <strong>1. Giving information to a credit reporting agency (s.18E(8)(c) Privacy Act 1988).</strong> The
              service provider has informed me that it may give certain personal information about me to a credit
              reporting agency.
            </p>
            <p>
              <strong>2. Access to commercial credit information (s.18L(4) Privacy Act 1988).</strong> I/We agree that the
              service provider may obtain information about me/us from a business which provides information about the
              commercial credit worthiness of people, for the purpose of assessing my/our application for consumer credit.
            </p>
            <p>The information exchanged may be used:</p>
            <ul className="ml-4 list-disc space-y-0.5">
              <li>to notify other credit providers of a default by me/us;</li>
              <li>
                to exchange information with other credit providers as to the status of this loan where I am in default
                with other credit providers;
              </li>
              <li>to assess my/our credit worthiness.</li>
            </ul>
            <p>
              I/We understand that the information exchanged can include anything about my/our credit worthiness, credit
              standing, credit history or credit capacity that credit providers are allowed to exchange under the Privacy
              Act. I/We hereby apply to establish credit facilities with the lender and agree to abide by the attached
              terms and conditions. I/We understand that a credit check will be undertaken as part of this application and
              that I/we have read and understood the acknowledgement and authority regarding the Privacy Protection of
              Information.
            </p>
          </div>

          <label className="flex items-start gap-2 mt-4 mb-5">
            <input
              type="checkbox"
              checked={data.declarations.privacy.acknowledged}
              onChange={(e) => update((d) => void (d.declarations.privacy.acknowledged = e.target.checked))}
              className="w-4 h-4 mt-0.5"
            />
            <span className="text-sm text-gray-800">
              The applicant(s) have read and understood the privacy notice above and consent to the disclosures described.
            </span>
          </label>

          <div className="grid md:grid-cols-2 gap-8">
            {data.declarations.privacy.signatories.map((s, i) => (
              <SignatureBlock
                key={i}
                index={i + 1}
                name={s.name}
                date={s.date}
                onName={(v) => update((d) => void (d.declarations.privacy.signatories[i].name = v))}
                onDate={(v) => update((d) => void (d.declarations.privacy.signatories[i].date = v))}
              />
            ))}
          </div>
        </Section>

        {/* Servicing estimate off the captured data — screen only. */}
        <CapacityPanel data={data} />

        {/* Completeness helper — screen only. */}
        {missing.length > 0 && (
          <div className="no-print p-4 rounded-xl bg-amber-50 border border-amber-200">
            <p className="text-sm font-semibold text-amber-900">Outstanding before this can be marked Complete</p>
            <ul className="mt-2 ml-5 list-disc text-sm text-amber-900 space-y-0.5">
              {missing.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
      </fieldset>
    </div>
  );
}
