"use client";

/**
 * Debounced autosave for the long compliance forms (Borrower Fact Find, NCCP
 * Needs Analysis, Credit File Authorisation).
 *
 * The forms already have ONE save path — a PATCH of the whole `data` blob. This
 * hook drives that same path automatically: ~2s after the user stops editing it
 * saves, coalescing rapid edits into a single request and never overlapping two
 * requests. It also wires Cmd/Ctrl-S (immediate save) and a beforeunload guard,
 * and exposes a display `state` for the save-state indicator.
 *
 * It does NOT know how to save — the caller passes `save`, the form's existing
 * PATCH function, and the hook only decides WHEN to call it. The caller reports
 * the result via the `AutosaveOutcome`:
 *
 *   - "saved"  → applied; the indicator shows "Saved <time>".
 *   - "locked" → the server refused with 409 because the document is signed
 *                (another session completed it). Autosave STOPS — no retry — and
 *                the form's locked state takes over.
 *   - "error"  → transient failure; the hook backs off and retries (data is kept
 *                in memory; manual Save stays available).
 *
 * Dirtiness is expressed two ways by the caller: `isDirty` (is there anything to
 * save?) and `rev` (a counter bumped on every edit) which drives the debounce so
 * it resets to the LAST keystroke rather than firing per-keystroke. Saving is
 * gated on `!isLocked` so a locked document is never PATCHed (that would 409).
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type AutosaveOutcome = "saved" | "locked" | "error";
export type AutosaveState = "idle" | "unsaved" | "saving" | "saved" | "error";

/** Default idle time after the last edit before autosave fires. */
export const AUTOSAVE_DEBOUNCE_MS = 2000;

/* ── Pure logic (unit-tested; no DOM / no React) ─────────────────────────────── */

/** Display state from the internal save phase, dirtiness, and save history. */
export function deriveAutosaveState(opts: {
  phase: "idle" | "saving" | "error";
  isDirty: boolean;
  hasSaved: boolean;
}): AutosaveState {
  if (opts.phase === "saving") return "saving";
  if (opts.phase === "error") return "error";
  if (opts.isDirty) return "unsaved";
  if (opts.hasSaved) return "saved";
  return "idle";
}

/** Exponential backoff (ms) for an autosave retry, capped. attempt 0 = base. */
export function autosaveBackoffMs(attempt: number, baseMs = AUTOSAVE_DEBOUNCE_MS, capMs = 30_000): number {
  if (attempt <= 0) return baseMs;
  return Math.min(capMs, baseMs * 2 ** attempt);
}

/** Short relative-time label, e.g. "just now", "42s ago", "3m ago", "2h ago". */
export function relativeTime(fromMs: number, nowMs: number): string {
  const s = Math.max(0, Math.round((nowMs - fromMs) / 1000));
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}

/* ── The hook ────────────────────────────────────────────────────────────────── */

export function useAutosave(opts: {
  isDirty: boolean;
  isLocked: boolean;
  rev: number;
  save: () => Promise<AutosaveOutcome>;
  debounceMs?: number;
}): { state: AutosaveState; lastSavedAt: number | null; saveNow: () => void } {
  const { isDirty, isLocked, rev, debounceMs = AUTOSAVE_DEBOUNCE_MS } = opts;

  const [phase, setPhase] = useState<"idle" | "saving" | "error">("idle");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  // Refs let the async/timer callbacks read the latest values without being
  // torn down and recreated on every render.
  const saveRef = useRef(opts.save);
  const isDirtyRef = useRef(isDirty);
  const isLockedRef = useRef(isLocked);
  const debounceMsRef = useRef(debounceMs);
  const inFlightRef = useRef(false);
  const attemptRef = useRef(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Lets the deferred (setTimeout) reschedule/retry call the latest runSave
  // without referencing it before its own declaration.
  const runSaveRef = useRef<() => void>(() => {});

  useEffect(() => {
    saveRef.current = opts.save;
  });
  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);
  useEffect(() => {
    isLockedRef.current = isLocked;
  }, [isLocked]);
  useEffect(() => {
    debounceMsRef.current = debounceMs;
  }, [debounceMs]);

  const clearDebounce = () => {
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
  };
  const clearRetry = () => {
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
  };

  // The single save runner. Guards against overlap and against saving a clean or
  // locked document. Stable identity (no deps) so the timers/listeners that call
  // it never need re-binding.
  const runSave = useCallback(async () => {
    if (isLockedRef.current || inFlightRef.current || !isDirtyRef.current) return;
    clearRetry();
    inFlightRef.current = true;
    setPhase("saving");
    let outcome: AutosaveOutcome;
    try {
      outcome = await saveRef.current();
    } catch {
      outcome = "error";
    }
    inFlightRef.current = false;

    if (outcome === "saved") {
      attemptRef.current = 0;
      setLastSavedAt(Date.now());
      setPhase("idle");
      // An edit that landed DURING the save leaves the doc dirty — save it again
      // after another debounce interval so nothing is lost.
      if (isDirtyRef.current && !isLockedRef.current) {
        clearDebounce();
        debounceTimer.current = setTimeout(() => runSaveRef.current(), debounceMsRef.current);
      }
    } else if (outcome === "locked") {
      // Signed elsewhere — stop autosaving; the form's locked UI takes over.
      attemptRef.current = 0;
      setPhase("idle");
    } else {
      // Transient failure: keep the data, show the failed state, back off, retry.
      setPhase("error");
      const delay = autosaveBackoffMs(attemptRef.current++);
      clearRetry();
      retryTimer.current = setTimeout(() => runSaveRef.current(), delay);
    }
  }, []);

  useEffect(() => {
    runSaveRef.current = () => void runSave();
  }, [runSave]);

  const saveNow = useCallback(() => {
    clearDebounce();
    void runSave();
  }, [runSave]);

  // Debounced autosave: (re)arm the timer on every edit (rev change). When the
  // document is clean or locked, no timer is armed.
  useEffect(() => {
    if (!isDirty || isLocked) return;
    clearDebounce();
    debounceTimer.current = setTimeout(() => void runSave(), debounceMs);
    return clearDebounce;
  }, [rev, isDirty, isLocked, debounceMs, runSave]);

  // Cmd/Ctrl-S → immediate save; always swallow the browser's save dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        if (!isLockedRef.current) saveNow();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [saveNow]);

  // Warn before unloading the tab with unsaved edits.
  useEffect(() => {
    if (!isDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty]);

  // Clear any pending timers on unmount.
  useEffect(
    () => () => {
      clearDebounce();
      clearRetry();
    },
    [],
  );

  const state = deriveAutosaveState({ phase, isDirty, hasSaved: lastSavedAt !== null });
  return { state, lastSavedAt, saveNow };
}
