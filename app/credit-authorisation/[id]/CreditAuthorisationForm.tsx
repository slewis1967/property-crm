"use client";

/**
 * Credit File Authorisation — the form. The Equifax "Access Seeker Report –
 * Client Privacy Consent Form".
 *
 * The document is almost entirely FIXED LEGAL TEXT (CREDIT_AUTHORISATION_TEXT in
 * utils/creditAuthorisation.ts), rendered read-only. The only editable inputs
 * are the applicant name(s) line, the address line, and the two signature/date
 * blocks. "Print" prints the form itself — the @media print block flattens the
 * inputs to underlined lines and hides the chrome, so it can be printed and
 * physically signed. There is one rendering to maintain, not a separate print
 * view that can drift.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CREDIT_AUTHORISATION_STATUSES,
  CREDIT_AUTHORISATION_TERMINAL_STATUS,
  CREDIT_AUTHORISATION_TEXT,
  emptyCreditAuthorisation,
  type CreditAuthorisationData,
} from "../../../utils/creditAuthorisation";
import { LockedBanner, HistoryPanel, SaveStateIndicator } from "../../components/ComplianceDocAudit";
import { useAutosave, type AutosaveOutcome } from "../../hooks/useAutosave";

const TEAL = "#0F4C5C";

const STATUS_LABEL: Record<string, string> = { draft: "Draft", signed: "Signed" };

const inputCls =
  "px-2 py-1 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-[#0F4C5C]/30 focus:border-[#0F4C5C] transition";

/**
 * Render a legal string with any embedded https:// URLs turned into clickable
 * links, leaving every other character exactly as written. Used for the (d) and
 * (e) acknowledgements, which cite the Equifax privacy and credit-reporting URLs.
 */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s,;]+)/g);
  return (
    <>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="underline break-words"
            style={{ color: TEAL }}
          >
            {part}
          </a>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

/** A "Signature / Date" block: a ruled signature line, a signed tick, and a date. */
function SignatureBlock({
  index,
  signed,
  date,
  onSigned,
  onDate,
}: {
  index: number;
  signed: boolean;
  date: string;
  onSigned: (v: boolean) => void;
  onDate: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="pt-6 border-b border-gray-400" aria-hidden />
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-[11px] text-gray-500">Signature of Applicant {index}</p>
        <label className="flex items-center gap-1.5 text-xs text-gray-700">
          <input type="checkbox" checked={signed} onChange={(e) => onSigned(e.target.checked)} className="w-4 h-4" />
          Signed
        </label>
      </div>
      <label className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Date</span>
        <input type="date" value={date} onChange={(e) => onDate(e.target.value)} className={inputCls} />
      </label>
    </div>
  );
}

export default function CreditAuthorisationForm({ id }: { id: string }) {
  const [data, setData] = useState<CreditAuthorisationData>(emptyCreditAuthorisation());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Dirtiness is derived from a monotonic edit counter vs. the counter captured
  // at the last successful save — survives autosave (an edit mid-save keeps the
  // doc dirty rather than being wrongly cleared by the completing save).
  const [rev, setRev] = useState(0);
  const [savedRev, setSavedRev] = useState(0);
  const dirty = rev !== savedRev;
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/credit-authorisations/${id}`);
        const json = await res.json();
        if (!json.ok) throw new Error(json.error || "Load failed");
        if (cancelled) return;
        setData(json.creditAuthorisation.data);
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
  const update = useCallback((mut: (d: CreditAuthorisationData) => void) => {
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
   * `saveNow`). A 409 means the doc was signed elsewhere → reflect locked and
   * stop autosaving; other failures keep the data and surface the error.
   */
  const doSave = useCallback(
    async (next?: CreditAuthorisationData): Promise<AutosaveOutcome> => {
      const body = next ?? data;
      const revAtSave = rev;
      setSaving(true);
      setError("");
      try {
        const res = await fetch(`/api/credit-authorisations/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ data: body }),
        });
        const json = await res.json();
        if (res.status === 409) {
          setData((prev) => {
            const n = structuredClone(prev);
            n.status = CREDIT_AUTHORISATION_TERMINAL_STATUS as CreditAuthorisationData["status"];
            return n;
          });
          setError(json.error || "This authorisation is signed/locked.");
          return "locked";
        }
        if (!json.ok) {
          setError(json.error || "Save failed");
          return "error";
        }
        setSavedRev(revAtSave);
        return "saved";
      } catch (e) {
        setError(e instanceof Error ? e.message : "Save failed");
        return "error";
      } finally {
        setSaving(false);
      }
    },
    [id, data, rev],
  );

  // "Locked" is derived from status — a signed authorisation is read-only until
  // reopened. Single source of truth: CREDIT_AUTHORISATION_TERMINAL_STATUS.
  const locked = data.status === CREDIT_AUTHORISATION_TERMINAL_STATUS;

  const {
    state: saveState,
    lastSavedAt,
    saveNow,
  } = useAutosave({ isDirty: dirty, isLocked: locked, rev, save: () => doSave() });

  if (loading) return <p className="p-6 text-sm text-gray-500">Loading authorisation…</p>;

  /** Reopen a signed authorisation for amendment (recorded as a reopen by the API). */
  const reopen = () => {
    const next = structuredClone(data);
    next.status = "draft";
    setData(next);
    void doSave(next);
  };

  const t = CREDIT_AUTHORISATION_TEXT;

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #credit-auth-document, #credit-auth-document * { visibility: visible !important; }
          #credit-auth-document { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          /* Flatten controls into printable lines. */
          #credit-auth-document input {
            border: none !important; border-bottom: 1px solid #999 !important;
            border-radius: 0 !important; background: transparent !important;
            padding-left: 0 !important; -webkit-appearance: none; appearance: none;
          }
          #credit-auth-document input[type="checkbox"] {
            border: 1px solid #333 !important; border-radius: 2px !important;
          }
          /* Date inputs otherwise print a calendar-picker glyph beside the value. */
          #credit-auth-document input[type="date"]::-webkit-calendar-picker-indicator { display: none !important; }
          #credit-auth-document section { border: none !important; page-break-inside: avoid; }
          a { color: #000 !important; text-decoration: underline !important; }
          @page { size: A4; margin: 14mm 14mm; }
        }
      `}</style>

      {/* Toolbar */}
      <div className="no-print sticky top-0 z-10 bg-gray-50/90 backdrop-blur border-b border-gray-200 px-4 py-3 flex gap-3 items-center flex-wrap">
        <Link href="/credit-authorisation" className="text-sm text-gray-600 hover:text-gray-900 hover:underline">
          ← All authorisations
        </Link>
        <div className="flex-1" />
        {!locked && <SaveStateIndicator state={saveState} lastSavedAt={lastSavedAt} onRetry={saveNow} />}
        <select
          value={data.status}
          onChange={(e) => {
            const status = e.target.value as CreditAuthorisationData["status"];
            const next = structuredClone(data);
            next.status = status;
            setData(next);
            void doSave(next);
          }}
          disabled={saving}
          className="px-2 py-1.5 text-sm border border-gray-300 rounded-md bg-white"
        >
          {CREDIT_AUTHORISATION_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 text-sm font-semibold rounded-lg border transition"
          style={{ borderColor: TEAL, color: TEAL }}
        >
          Print to sign
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

      {locked && <LockedBanner onReopen={reopen} busy={saving} />}
      <HistoryPanel apiBase="/api/credit-authorisations" id={id} />

      {/* When locked (signed) every input inside is disabled — the document is
          read-only until reopened. min-w-0 keeps the fieldset from forcing its
          intrinsic min-width and overflowing on small screens. */}
      <fieldset id="credit-auth-document" disabled={locked} className="max-w-3xl mx-auto p-4 sm:p-8 min-w-0 border-0">
        <section className="rounded-xl border border-gray-200 bg-white p-6 sm:p-8 space-y-5">
          {/* Title + heading */}
          <header className="text-center pb-1">
            <h1 className="text-lg font-bold" style={{ color: TEAL }}>
              {t.title}
            </h1>
            <p className="text-sm font-semibold text-gray-700 mt-2 uppercase tracking-wide">{t.heading}</p>
          </header>

          {/* Body — "I <names> of <address> authorise …" */}
          <p className="text-sm text-gray-800 leading-relaxed">
            I{" "}
            <input
              value={data.names}
              onChange={(e) => update((d) => void (d.names = e.target.value))}
              placeholder="Name/s"
              aria-label="Name/s"
              className={`${inputCls} inline-block w-64 max-w-full align-baseline`}
            />{" "}
            of{" "}
            <input
              value={data.address}
              onChange={(e) => update((d) => void (d.address = e.target.value))}
              placeholder="Address"
              aria-label="Address"
              className={`${inputCls} inline-block w-80 max-w-full align-baseline`}
            />{" "}
            {t.body}
          </p>

          {/* Acknowledgements (read-only, verbatim) */}
          <p className="text-sm text-gray-800">{t.acknowledgeIntro}</p>
          <ol className="space-y-2">
            {t.acknowledgements.map((a) => (
              <li key={a.key} className="grid grid-cols-[1.5rem_1fr] gap-1 text-sm text-gray-800 leading-relaxed">
                <span className="text-gray-500">({a.key})</span>
                <span>
                  <Linkified text={a.text} />
                </span>
              </li>
            ))}
          </ol>

          {/* Signature / Date blocks */}
          <div className="grid sm:grid-cols-2 gap-8 pt-4">
            {data.signatories.map((s, i) => (
              <SignatureBlock
                key={i}
                index={i + 1}
                signed={s.signed}
                date={s.date}
                onSigned={(v) => update((d) => void (d.signatories[i].signed = v))}
                onDate={(v) => update((d) => void (d.signatories[i].date = v))}
              />
            ))}
          </div>
        </section>
      </fieldset>
    </div>
  );
}
