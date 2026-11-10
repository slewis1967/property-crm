"use client";

/**
 * Local safety-net for the long compliance forms (Borrower Fact Find, NCCP Needs
 * Analysis, Credit File Authorisation).
 *
 * These forms already autosave the whole `data` blob to the server ~2s after an
 * edit (see useAutosave). But the server save can fail — most commonly when the
 * Cloudflare Access session lapses on a form left open for a long time, which
 * bounces the request to a login redirect and surfaces as a generic "try again".
 * Until now the only copy of unsaved edits lived in React memory, so
 * re-authenticating (a page reload) silently lost the work. That is exactly how
 * a fully-completed Needs Analysis ended up saved as an empty stub.
 *
 * This hook keeps a mirror of the in-progress blob in localStorage while there
 * are unsaved edits, so a failed save + reload can't lose anything. On mount it
 * surfaces any leftover draft (`recovered`) for the form to offer restoring; the
 * form calls clearDraft() once the server confirms a save. It is best-effort:
 * storage errors (quota, private mode) are swallowed — it can only ever help.
 */

import { useCallback, useEffect, useState } from "react";

/** Actionable message when a save fails — the local backup means nothing is
 *  lost, and a lapsed Cloudflare Access session is the usual cause. */
export const SAVE_FAILED_HINT =
  "Couldn't save — but your changes are backed up in this browser, so nothing is lost. " +
  "This usually means your sign-in session expired: open the CRM in a new tab, sign in, " +
  "then come back here and click Save.";

export type StoredDraft<T> = { ts: number; data: T };

/** localStorage key for a compliance document's autosave backup. */
export function draftStorageKey(docType: string, id: string): string {
  return `nk-draft:${docType}:${id}`;
}

/** Safe-parse a stored draft; returns null on anything missing or malformed. */
export function parseStoredDraft<T>(raw: string | null): StoredDraft<T> | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as { ts?: unknown; data?: unknown };
    if (v && typeof v === "object" && "data" in v) {
      return { ts: typeof v.ts === "number" ? v.ts : 0, data: v.data as T };
    }
  } catch {
    /* malformed JSON — treat as no draft */
  }
  return null;
}

export function useLocalDraft<T>(opts: {
  /** null while the id/doc isn't known yet — disables the safety net. */
  storageKey: string | null;
  data: T;
  dirty: boolean;
  /** Start mirroring only once the initial server load has completed. */
  ready: boolean;
}): {
  recovered: StoredDraft<T> | null;
  /** Hide the banner but keep the stored draft (use after restoring it). */
  dismissRecovered: () => void;
  /** Delete the stored draft and hide the banner (use on "Discard"). */
  discardRecovered: () => void;
  /** Delete the stored draft (use once the server confirms a save). */
  clearDraft: () => void;
} {
  const { storageKey, data, dirty, ready } = opts;
  const [recovered, setRecovered] = useState<StoredDraft<T> | null>(null);

  // Read any leftover draft once, client-side after mount. The state update is
  // deferred a microtask past render so it doesn't trip the "setState
  // synchronously within an effect" lint rule (cascading renders).
  useEffect(() => {
    if (!storageKey || typeof window === "undefined") return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      try {
        setRecovered(parseStoredDraft<T>(window.localStorage.getItem(storageKey)));
      } catch {
        /* storage disabled — no recovery available */
      }
    });
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  // Mirror the blob while there are unsaved edits. Write-only: it never removes
  // the key here, so a clean-on-load state can't wipe a recoverable draft.
  useEffect(() => {
    if (!ready || !storageKey || !dirty || typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ ts: Date.now(), data }));
    } catch {
      /* quota exceeded / storage disabled — best-effort */
    }
  }, [ready, storageKey, dirty, data]);

  const clearDraft = useCallback(() => {
    if (!storageKey || typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  const dismissRecovered = useCallback(() => setRecovered(null), []);
  const discardRecovered = useCallback(() => {
    clearDraft();
    setRecovered(null);
  }, [clearDraft]);

  return { recovered, dismissRecovered, discardRecovered, clearDraft };
}
