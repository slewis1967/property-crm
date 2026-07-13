"use client";

/**
 * useOpportunityDocs — shared "open or create" logic for the three borrower
 * compliance documents reachable from an opportunity (Borrower Fact Find, NCCP
 * Needs Analysis, Credit File Authorisation).
 *
 * ONE implementation, used by both the top-of-page action buttons in
 * OpportunityDetail AND the buttons in the OpportunityCalculations working panel,
 * so the two can't drift. Each document follows the same pattern: if the
 * opportunity has a primary contact, reuse that contact's most-recent document
 * rather than spawning a duplicate; otherwise create one.
 *
 * The Fact Find create additionally carries the opportunity's serviceability
 * figures: it loads the most-recent saved BORROWING calculation for this
 * opportunity and passes its inputs as `capacityInputs`, so a brand-new fact find
 * arrives pre-populated with the calculator's properties / mortgages / income /
 * HECS / living expenses (via the server-side capacityInputsToFactFind bridge),
 * not just the contact's identity. No saved calc → contact-only prefill as before.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CapacityInputs } from "../../../utils/finance";

type DocRow = {
  id: string;
  contact_id: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

const byNewest = (a: DocRow, b: DocRow) =>
  new Date(b.updated_at || b.created_at || 0).getTime() -
  new Date(a.updated_at || a.created_at || 0).getTime();

const newestForContact = (rows: DocRow[], contactId: string): DocRow | undefined =>
  rows.filter((r) => r.contact_id === contactId).sort(byNewest)[0];

/**
 * The opportunity's most-recent saved BORROWING calculation inputs, or null.
 * Best-effort: any failure returns null so a fact-find create still proceeds
 * with contact-only prefill rather than being blocked by a calc lookup.
 */
async function loadLatestBorrowingInputs(
  opportunityId: string,
): Promise<CapacityInputs | null> {
  try {
    const res = await fetch(`/api/opportunities/${opportunityId}/calculations`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    const calcs: Array<{
      calculator_type: string;
      inputs: unknown;
      created_at?: string | null;
      updated_at?: string | null;
    }> = data.calculations || [];
    const borrowing = calcs
      .filter((c) => c.calculator_type === "borrowing")
      .sort(
        (a, b) =>
          new Date(b.updated_at || b.created_at || 0).getTime() -
          new Date(a.updated_at || a.created_at || 0).getTime(),
      )[0];
    return borrowing && borrowing.inputs && typeof borrowing.inputs === "object"
      ? (borrowing.inputs as CapacityInputs)
      : null;
  } catch {
    return null;
  }
}

export function useOpportunityDocs({
  opportunityId,
  contactId,
}: {
  opportunityId: string;
  contactId: string | null | undefined;
}) {
  const router = useRouter();

  // ── Fact Find ─────────────────────────────────────────────────────────────
  const [factFindLoading, setFactFindLoading] = useState(false);
  const [factFindError, setFactFindError] = useState("");

  const openFactFind = async () => {
    setFactFindLoading(true);
    setFactFindError("");
    try {
      // Reuse the contact's most-recent fact find rather than creating a duplicate.
      if (contactId) {
        const listRes = await fetch("/api/fact-finds", { cache: "no-store" });
        const listJson = await listRes.json();
        if (!listRes.ok || !listJson.ok) throw new Error(listJson.error || "Could not load fact finds");
        const existing = newestForContact(listJson.factFinds ?? [], contactId);
        if (existing) {
          router.push(`/fact-find/${existing.id}`);
          return; // keep loading state through navigation
        }
      }
      // None yet (or no contact) — create one, prefilling from the contact AND the
      // opportunity's latest borrowing calc (when present) so the advisor's
      // serviceability figures carry across.
      const capacityInputs = await loadLatestBorrowingInputs(opportunityId);
      const body: Record<string, unknown> = {};
      if (contactId) body.contactId = contactId;
      if (capacityInputs) body.capacityInputs = capacityInputs;
      const createRes = await fetch("/api/fact-finds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const createJson = await createRes.json();
      if (!createRes.ok || !createJson.ok) throw new Error(createJson.error || "Could not create a fact find");
      router.push(`/fact-find/${createJson.id}`);
    } catch (e) {
      setFactFindError(e instanceof Error ? e.message : "Fact find failed");
      setFactFindLoading(false);
    }
  };

  // ── Needs Analysis ────────────────────────────────────────────────────────
  const [needsAnalysisLoading, setNeedsAnalysisLoading] = useState(false);
  const [needsAnalysisError, setNeedsAnalysisError] = useState("");

  const openNeedsAnalysis = async () => {
    setNeedsAnalysisLoading(true);
    setNeedsAnalysisError("");
    try {
      if (contactId) {
        const listRes = await fetch("/api/needs-analyses", { cache: "no-store" });
        const listJson = await listRes.json();
        if (!listRes.ok || !listJson.ok) throw new Error(listJson.error || "Could not load needs analyses");
        const existing = newestForContact(listJson.needsAnalyses ?? [], contactId);
        if (existing) {
          router.push(`/needs-analysis/${existing.id}`);
          return;
        }
      }
      const createRes = await fetch("/api/needs-analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contactId ? { contactId } : {}),
      });
      const createJson = await createRes.json();
      if (!createRes.ok || !createJson.ok) throw new Error(createJson.error || "Could not create a needs analysis");
      router.push(`/needs-analysis/${createJson.id}`);
    } catch (e) {
      setNeedsAnalysisError(e instanceof Error ? e.message : "Needs analysis failed");
      setNeedsAnalysisLoading(false);
    }
  };

  // ── Credit Authorisation ──────────────────────────────────────────────────
  const [creditAuthLoading, setCreditAuthLoading] = useState(false);
  const [creditAuthError, setCreditAuthError] = useState("");

  const openCreditAuthorisation = async () => {
    setCreditAuthLoading(true);
    setCreditAuthError("");
    try {
      if (contactId) {
        const listRes = await fetch("/api/credit-authorisations", { cache: "no-store" });
        const listJson = await listRes.json();
        if (!listRes.ok || !listJson.ok) throw new Error(listJson.error || "Could not load credit authorisations");
        const existing = newestForContact(listJson.creditAuthorisations ?? [], contactId);
        if (existing) {
          router.push(`/credit-authorisation/${existing.id}`);
          return;
        }
      }
      const createRes = await fetch("/api/credit-authorisations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contactId ? { contactId } : {}),
      });
      const createJson = await createRes.json();
      if (!createRes.ok || !createJson.ok) throw new Error(createJson.error || "Could not create an authorisation");
      router.push(`/credit-authorisation/${createJson.id}`);
    } catch (e) {
      setCreditAuthError(e instanceof Error ? e.message : "Credit authorisation failed");
      setCreditAuthLoading(false);
    }
  };

  return {
    openFactFind,
    factFindLoading,
    factFindError,
    openNeedsAnalysis,
    needsAnalysisLoading,
    needsAnalysisError,
    openCreditAuthorisation,
    creditAuthLoading,
    creditAuthError,
  };
}
