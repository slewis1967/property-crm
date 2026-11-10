/**
 * Issuing an introducer document and putting it in front of its signer.
 *
 * WHY THIS IS SHARED. All three introducer documents — NDA, referral agreement,
 * commission schedule — are issued the same way: snapshot the application into
 * a row in `introducer_agreement_docs`, then hand the signer exactly one live
 * signing link. The NDA had this logic first, with a comment on the load-bearing
 * part warning that "a second copy would eventually get it wrong". Rather than
 * make that second copy for the agreement, the logic moved here and the NDA
 * calls it.
 *
 * What is NOT here is what the documents disagree about: which states may issue
 * them, what happens once they come back signed, and whether there is more than
 * one of them. Those live with each document — see introducer-nda.ts and
 * introducer-agreement-signing.ts.
 */

import { supabase } from "./supabase";
import {
  emptyIntroducerAgreement,
  readyToIssue,
  isValidSharePct,
  TIER_BUILDER_SHARE,
  type IntroducerAgreementData,
  type IntroducerDocType,
} from "./introducer-agreement";
import { type Application } from "./introducer-onboarding-db";
import { newToken } from "./sign-token";
import { SIGNATURE_REQUESTS_TABLE } from "./signature-requests-db";

export const INTRODUCER_DOCS_TABLE = "introducer_agreement_docs";

/** How long a signing link stays live. Long enough to read a contract properly,
 *  short enough that an abandoned link doesn't sit open. */
export const SIGNING_LINK_DAYS = 14;

/**
 * Snapshot an application into a document body.
 *
 * Pure, so the mapping is testable without a database. Everything is copied
 * rather than referenced: a document has to render years later as it read when
 * it was signed, even if the firm renames itself in between.
 *
 * `issuedAt` is passed in rather than read from the clock so a caller can stamp
 * a whole issue with one timestamp, and so tests are deterministic.
 *
 * THE ACCREDITATION NUMBER IS THE ONE REAL DIFFERENCE between the three. The
 * NDA is signed before identity is verified and before the exam, so there is no
 * number yet and `readyToIssue` exempts it. The agreement and the schedule both
 * cite it, and refuse to issue without it.
 */
export function introducerDocDataFor(
  app: Application,
  docType: IntroducerDocType,
  issuedAt: string,
): IntroducerAgreementData {
  const d = emptyIntroducerAgreement(docType, app.agreement_variant ?? "standard");
  d.legal_name = (app.legal_name ?? "").trim();
  d.email = (app.email ?? "").trim();
  d.firm_name = (app.firm_name ?? "").trim();
  d.abn = (app.abn ?? "").trim();
  d.acn = (app.acn ?? "").trim();
  d.registered_address = (app.registered_address ?? "").trim();
  d.accreditation_no = docType === "introducer_nda" ? "" : (app.accreditation_no ?? "").trim();

  /* THE BUILDER SHARE, on both money-bearing documents — the agreement states
   * it and the schedule sets it out, and two documents naming different splits
   * is the dispute this whole module exists to avoid.
   *
   * Tier sets it: 75% for Tier 1, 90% for Tier 2. A per-introducer override on
   * the application wins where one has been agreed, which is why this is not
   * simply derived at render time. Not on the NDA, which is signed before the
   * tier means anything commercially. */
  if (docType !== "introducer_nda") {
    d.builder_share_pct = isValidSharePct(app.builder_share_pct)
      ? app.builder_share_pct
      : TIER_BUILDER_SHARE[app.tier === "t2" ? "t2" : "t1"];
  }
  d.issued_at = issuedAt;
  d.subtitle = app.tier === "t2" ? "Tier 2 accreditation" : "Tier 1 accreditation";

  // Only the schedule carries money, and only on the paid variant. Copying the
  // fee onto a standard document would put a figure on the page beside terms
  // that say no fee is payable — the contradiction readyToIssue exists to catch.
  if (docType === "introducer_schedule" && d.variant === "paid") {
    d.fee_per_settlement = (app.fee_per_settlement ?? "").trim();
    d.fee_notes = (app.fee_notes ?? "").trim();
    d.recruits_introducers = app.recruits_introducers === true;
  }
  return d;
}

export type EnsureResult =
  | { ok: true; id: string; created: boolean }
  | { ok: false; error: string };

/**
 * Get this application's document of a given type, creating it on first use.
 *
 * Idempotent by design. A signer can land on the same step more than once — a
 * closed tab, a second device, a link opened twice — and each visit must reach
 * the SAME document rather than minting a fresh one. Two agreement rows for one
 * application would mean two things to sign and no answer to "which one did
 * they agree to".
 */
export async function ensureIntroducerDoc(
  app: Application,
  docType: IntroducerDocType,
  now: Date,
): Promise<EnsureResult> {
  const { data: existing, error: findErr } = await supabase
    .from(INTRODUCER_DOCS_TABLE)
    .select("id")
    .eq("application_id", app.id)
    .eq("doc_type", docType)
    /* Superseded rows are history. Without this an amended document could never
     * be reached: the oldest row wins, and the oldest row is the one that was
     * replaced. See 20260821i. */
    .is("superseded_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (findErr) throw findErr;
  if (existing?.id) return { ok: true, id: existing.id as string, created: false };

  const data = introducerDocDataFor(app, docType, now.toISOString());
  const ready = readyToIssue(data);
  if (!ready.ok) return { ok: false, error: ready.reason };

  const { data: inserted, error: insErr } = await supabase
    .from(INTRODUCER_DOCS_TABLE)
    .insert({ application_id: app.id, doc_type: docType, status: "Draft", data })
    .select("id")
    .single();
  if (insErr) throw insErr;

  return { ok: true, id: (inserted as { id: string }).id, created: true };
}

export type ReissueResult =
  | { ok: true; id: string; supersededId: string | null; signedOn: string }
  | { ok: false; error: string };

/**
 * Amend a document and put the new version out for signature.
 *
 * WHAT THIS DOES NOT DO: touch the document that was signed. That row is
 * evidence of what the person actually agreed to on that date, and the
 * signature captured against it is a signature over THAT content — editing it
 * in place would both destroy the record and invalidate the proof. So the old
 * row is marked superseded, kept, and a new one is issued beside it.
 *
 * The new document carries the reason on its face (see amendmentBanner): a
 * signer asked for a second copy of something they signed last week will assume
 * it is a duplicate unless the page itself says otherwise.
 *
 * `reason` is required. An amendment with no stated reason is indistinguishable
 * from an accident, and the person being asked to re-sign deserves to know what
 * changed and why.
 */
export async function reissueIntroducerDoc(
  app: Application,
  docType: IntroducerDocType,
  reason: string,
  now: Date,
): Promise<ReissueResult> {
  const why = reason.trim();
  if (!why) return { ok: false, error: "Say what changed — an unexplained amendment is just a duplicate." };

  // The document being replaced, and when it was signed. Both go onto the new
  // one so it can name what it supersedes.
  const { data: current, error: findErr } = await supabase
    .from(INTRODUCER_DOCS_TABLE)
    .select("id,status")
    .eq("application_id", app.id)
    .eq("doc_type", docType)
    .is("superseded_at", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (findErr) throw findErr;

  const currentId = (current as { id: string } | null)?.id ?? null;

  let signedOn = "";
  if (currentId) {
    const { data: req } = await supabase
      .from(SIGNATURE_REQUESTS_TABLE)
      .select("signed_at,status")
      .eq("doc_id", currentId)
      .eq("signer_index", 1)
      .maybeSingle();
    const at = (req as { signed_at?: string | null } | null)?.signed_at;
    if (at) {
      signedOn = new Date(at).toLocaleDateString("en-AU", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Australia/Brisbane",
      });
    }
  }

  const data = introducerDocDataFor(app, docType, now.toISOString());
  data.amends_signed_on = signedOn;
  data.amendment_reason = why;

  const ready = readyToIssue(data);
  if (!ready.ok) return { ok: false, error: ready.reason };

  const { data: inserted, error: insErr } = await supabase
    .from(INTRODUCER_DOCS_TABLE)
    .insert({ application_id: app.id, doc_type: docType, status: "Draft", data })
    .select("id")
    .single();
  if (insErr) throw insErr;
  const newId = (inserted as { id: string }).id;

  /* Supersede AFTER the replacement exists. If the insert fails, the old
   * document is still the live one — which is the safe direction to fail in.
   * The reverse order would leave the application with no live agreement at
   * all. */
  if (currentId) {
    const { error: supErr } = await supabase
      .from(INTRODUCER_DOCS_TABLE)
      .update({ superseded_at: now.toISOString(), superseded_by: newId })
      .eq("id", currentId);
    if (supErr) throw supErr;
  }

  return { ok: true, id: newId, supersededId: currentId, signedOn };
}

/** The application a signed introducer document belongs to. Used by the
 *  signing-completion hook, which knows the document id and nothing else. */
export async function applicationIdForDoc(docId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from(INTRODUCER_DOCS_TABLE)
    .select("application_id")
    .eq("id", docId)
    .maybeSingle();
  if (error) throw error;
  return (data as { application_id: string } | null)?.application_id ?? null;
}

export type OpenResult =
  | { ok: true; docId: string; raw: string; issued: boolean }
  | { ok: false; reason: "not_ready" | "already_signed"; error: string; docId?: string };

/**
 * Issue the document if needed and hand back a live signing link.
 *
 * Returns the raw token. That is the only moment it exists in plaintext; the
 * database stores its hash and nothing else.
 */
export async function openIntroducerDocSigning(
  app: Application,
  docType: IntroducerDocType,
  now: Date,
): Promise<OpenResult> {
  const doc = await ensureIntroducerDoc(app, docType, now);
  if (!doc.ok) return { ok: false, reason: "not_ready", error: doc.error };

  const { raw, hash } = newToken();

  // EXACTLY ONE REQUEST ROW PER SIGNER, ROTATED IN PLACE — load-bearing.
  //
  // The signing-completion route decides a document is executed with
  // allSigned(rows), which selects EVERY signature_requests row for the doc and
  // requires all of them to be 'signed'. Inserting a fresh request each time
  // and marking the old one 'expired' leaves a permanently-unsigned row, so
  // allSigned is never true, markDocSigned never runs, and the document sits
  // Draft *while telling the signer it worked*. That is exactly what the first
  // version of the NDA code did.
  //
  // Rotating the token on the single row kills the superseded link and leaves
  // nothing behind to block completion.
  const { data: existing, error: findErr } = await supabase
    .from(SIGNATURE_REQUESTS_TABLE)
    .select("id,status")
    .eq("doc_type", docType)
    .eq("doc_id", doc.id)
    .eq("signer_index", 1)
    .maybeSingle();
  if (findErr) throw findErr;

  if (existing?.status === "signed") {
    // Executed already. The caller decides what that means — for the NDA it
    // means an advance that never happened needs putting right; for the
    // agreement it means move on to the next document in the set.
    return {
      ok: false,
      reason: "already_signed",
      error: "That document has already been signed.",
      docId: doc.id,
    };
  }

  const patch = {
    signer_name: app.legal_name,
    signer_email: app.email,
    token_hash: hash,
    status: "sent" as const,
    /* SPRINGBOARD, NOT NEXTKEY. Every introducer document is a Springboard
     * instrument — the PDF is Springboard-headed and the contracting party is
     * the licensor — so the page it is signed on has to match. Left unset, the
     * column defaults to 'nextkey' and an introducer opened a Springboard
     * contract inside NextKey chrome; that is what all three NDAs did, and
     * both agreements sent on 21 August before this was put right.
     *
     * In the patch rather than only on insert, so re-sending a link corrects
     * the brand on a request that was created before this existed. */
    brand: "springboard" as const,
    sent_at: now.toISOString(),
    expires_at: new Date(now.getTime() + SIGNING_LINK_DAYS * 86_400_000).toISOString(),
    // Clear anything an earlier attempt left behind, so a rotated link starts
    // clean rather than inheriting a decline.
    viewed_at: null,
    signed_at: null,
    signature_image: null,
    signer_ip: null,
    signer_user_agent: null,
    consent_at: null,
    signed_pdf_path: null,
    decline_reason: null,
  };

  const { error: writeErr } = existing?.id
    ? await supabase.from(SIGNATURE_REQUESTS_TABLE).update(patch).eq("id", existing.id)
    : await supabase.from(SIGNATURE_REQUESTS_TABLE).insert({
        doc_type: docType,
        doc_id: doc.id,
        signer_index: 1,
        created_by: `applicant:${app.email}`,
        ...patch,
      });
  if (writeErr) throw writeErr;

  return { ok: true, docId: doc.id, raw, issued: doc.created };
}

/**
 * Which documents have come back signed, for MANY applications at once.
 *
 * Two queries total rather than two per application. The admin list calls this
 * for every accreditation on screen, and the per-application version below
 * would make that an N+1 — cheap at three introducers, not at fifty.
 */
export async function signedDocTypesFor(
  applicationIds: readonly string[],
): Promise<Map<string, Set<IntroducerDocType>>> {
  const out = new Map<string, Set<IntroducerDocType>>();
  if (applicationIds.length === 0) return out;

  const { data: docs, error: docErr } = await supabase
    .from(INTRODUCER_DOCS_TABLE)
    .select("id,application_id,doc_type")
    .in("application_id", applicationIds as string[])
    /* THE ONE THAT MATTERS MOST. A superseded agreement is signed — that is why
     * it needed replacing rather than editing. Counting it would report the
     * step complete while the amended document sat unsigned, the exact false
     * "all done" this mechanism exists to prevent. */
    .is("superseded_at", null);
  if (docErr) throw docErr;

  const rows = (docs ?? []) as { id: string; application_id: string; doc_type: IntroducerDocType }[];
  if (rows.length === 0) return out;

  const { data: reqs, error: reqErr } = await supabase
    .from(SIGNATURE_REQUESTS_TABLE)
    .select("doc_id,status")
    .in("doc_id", rows.map((r) => r.id));
  if (reqErr) throw reqErr;

  const byDoc = new Map<string, string[]>();
  for (const r of (reqs ?? []) as { doc_id: string; status: string }[]) {
    byDoc.set(r.doc_id, [...(byDoc.get(r.doc_id) ?? []), r.status]);
  }

  for (const row of rows) {
    const statuses = byDoc.get(row.id) ?? [];
    // Same rule as signedDocTypes and the completion route: every request row
    // for the document must be signed, so the three cannot disagree.
    if (statuses.length > 0 && statuses.every((s) => s === "signed")) {
      const set = out.get(row.application_id) ?? new Set<IntroducerDocType>();
      set.add(row.doc_type);
      out.set(row.application_id, set);
    }
  }
  return out;
}

/** Which of an application's documents have come back signed. */
export async function signedDocTypes(applicationId: string): Promise<Set<IntroducerDocType>> {
  const { data: docs, error: docErr } = await supabase
    .from(INTRODUCER_DOCS_TABLE)
    .select("id,doc_type")
    .eq("application_id", applicationId)
    .is("superseded_at", null);
  if (docErr) throw docErr;

  const rows = (docs ?? []) as { id: string; doc_type: IntroducerDocType }[];
  if (rows.length === 0) return new Set();

  const { data: reqs, error: reqErr } = await supabase
    .from(SIGNATURE_REQUESTS_TABLE)
    .select("doc_id,status")
    .in(
      "doc_id",
      rows.map((r) => r.id),
    );
  if (reqErr) throw reqErr;

  // A document counts as signed only when every one of its request rows is —
  // the same rule the completion route locks on, so the two cannot disagree.
  const byDoc = new Map<string, string[]>();
  for (const r of (reqs ?? []) as { doc_id: string; status: string }[]) {
    byDoc.set(r.doc_id, [...(byDoc.get(r.doc_id) ?? []), r.status]);
  }

  const signed = new Set<IntroducerDocType>();
  for (const row of rows) {
    const statuses = byDoc.get(row.id) ?? [];
    if (statuses.length > 0 && statuses.every((s) => s === "signed")) signed.add(row.doc_type);
  }
  return signed;
}
