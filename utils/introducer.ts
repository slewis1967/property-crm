/**
 * Introducer portal — domain model.
 *
 * Pure functions and constants only (no Supabase, no Next), so the rules that
 * decide "can this introducer change this record" are unit-testable without a
 * database. The database trigger in migrations/20260811_introducer_portal.sql
 * enforces the same rules independently; this module is the version the UI and
 * route handlers reason with, and the two are deliberately redundant.
 *
 * Keep INTRODUCER_FIELDS in step with the column list in that trigger — a field
 * added here but not there would be editable after submit without authorisation.
 */

/** Referral lifecycle. Mirrors the CHECK constraint on introducer_clients.status. */
export const INTRODUCER_CLIENT_STATUSES = [
  "draft",
  "submitted",
  "info_requested",
  "accepted",
  "declined",
  "withdrawn",
] as const;
export type IntroducerClientStatus = (typeof INTRODUCER_CLIENT_STATUSES)[number];

/** Statuses in which the introducer may still freely edit everything. */
const OPEN_STATUSES: ReadonlySet<string> = new Set(["draft"]);

/** Terminal statuses — no further movement, by anyone, without a new referral. */
export const TERMINAL_STATUSES: ReadonlySet<string> = new Set(["declined", "withdrawn"]);

export const STATUS_LABELS: Record<IntroducerClientStatus, string> = {
  draft: "Draft",
  submitted: "Submitted — under review",
  info_requested: "More information needed",
  accepted: "Accepted",
  declined: "Not proceeding",
  withdrawn: "Withdrawn",
};

/**
 * The progress milestones an introducer is allowed to see.
 *
 * This list is the ENTIRE window an introducer has into the CRM. It is
 * deliberately coarse: an introducer needs to know their referral is moving and
 * roughly where it is, not what a lender said, what the client earns, or what
 * was discussed. Anything richer belongs in the CRM, behind Cloudflare Access.
 */
export const INTRODUCER_STAGES = [
  { key: "received", label: "Referral received", blurb: "We have the referral and it is queued for review." },
  { key: "under_review", label: "Under review", blurb: "We are checking the details and eligibility." },
  { key: "accepted", label: "Accepted", blurb: "Accepted — we have made contact with your client." },
  { key: "fact_find", label: "Fact find", blurb: "Gathering the full financial picture with your client." },
  { key: "documents", label: "Documents", blurb: "Your client is supplying supporting documents." },
  { key: "assessment", label: "Preliminary assessment", blurb: "With the assessor for a preliminary assessment." },
  { key: "assessment_returned", label: "Assessment returned", blurb: "The preliminary assessment is back and being actioned." },
  { key: "approved", label: "Approved", blurb: "Approved — moving to settlement." },
  { key: "settled", label: "Settled", blurb: "Settled. Thank you for the referral." },
  { key: "not_proceeding", label: "Not proceeding", blurb: "This referral is not moving forward." },
] as const;
export type IntroducerStageKey = (typeof INTRODUCER_STAGES)[number]["key"];

export function stageLabel(key: string | null | undefined): string {
  return INTRODUCER_STAGES.find((s) => s.key === key)?.label ?? "Received";
}

export function isValidStage(key: unknown): key is IntroducerStageKey {
  return typeof key === "string" && INTRODUCER_STAGES.some((s) => s.key === key);
}

/**
 * Every field an introducer may supply, and nothing more.
 *
 * `required` is enforced at SUBMIT, not at save — a draft can be half-finished.
 * The allow-list is also the write filter: a PATCH body key that isn't here is
 * dropped silently rather than 400-ing, so a future UI field can't sneak a
 * staff-controlled column (status, stage, opportunity_id) into an update.
 */
export type IntroducerFieldGroup = "client" | "applicant2" | "circumstances";

export type IntroducerField = {
  key: string;
  label: string;
  group: IntroducerFieldGroup;
  type: "text" | "email" | "tel" | "date" | "select" | "textarea";
  required?: boolean;
  options?: readonly string[];
  hint?: string;
};

export const INCOME_BANDS = [
  "Under $60,000",
  "$60,000 – $90,000",
  "$90,000 – $120,000",
  "$120,000 – $160,000",
  "$160,000 – $200,000",
  "Over $200,000",
  "Prefer not to say",
] as const;

export const DEPOSIT_BANDS = [
  "Under $20,000",
  "$20,000 – $40,000",
  "$40,000 – $60,000",
  "$60,000 – $100,000",
  "Over $100,000",
  "Unsure",
] as const;

export const EMPLOYMENT_STATUSES = [
  "PAYG full-time",
  "PAYG part-time",
  "Casual",
  "Self-employed",
  "Contractor",
  "Retired",
  "Not currently working",
] as const;

export const TIMEFRAMES = [
  "Ready now",
  "1 – 3 months",
  "3 – 6 months",
  "6 – 12 months",
  "12 months+",
] as const;

export const PURCHASE_INTENTS = [
  "First home",
  "Next home",
  "Investment",
  "Refinance",
  "Unsure",
] as const;

export const AU_STATES = ["QLD", "NSW", "VIC", "SA", "WA", "TAS", "NT", "ACT"] as const;

export const INTRODUCER_FIELDS: readonly IntroducerField[] = [
  { key: "first_name", label: "First name", group: "client", type: "text", required: true },
  { key: "last_name", label: "Last name", group: "client", type: "text", required: true },
  { key: "email", label: "Email", group: "client", type: "email", required: true },
  { key: "phone", label: "Mobile", group: "client", type: "tel", required: true },
  { key: "dob", label: "Date of birth", group: "client", type: "date", hint: "Optional. Helps us match an existing record." },
  { key: "state", label: "State", group: "client", type: "select", options: AU_STATES, required: true },
  { key: "suburb", label: "Suburb", group: "client", type: "text" },
  { key: "postcode", label: "Postcode", group: "client", type: "text" },

  { key: "applicant2_first_name", label: "Second applicant — first name", group: "applicant2", type: "text" },
  { key: "applicant2_last_name", label: "Second applicant — last name", group: "applicant2", type: "text" },
  { key: "applicant2_email", label: "Second applicant — email", group: "applicant2", type: "email" },
  { key: "applicant2_phone", label: "Second applicant — mobile", group: "applicant2", type: "tel" },

  { key: "employment_status", label: "Employment", group: "circumstances", type: "select", options: EMPLOYMENT_STATUSES, required: true },
  { key: "income_band", label: "Household income", group: "circumstances", type: "select", options: INCOME_BANDS, required: true },
  { key: "deposit_band", label: "Savings / deposit", group: "circumstances", type: "select", options: DEPOSIT_BANDS, required: true },
  { key: "purchase_intent", label: "What they're looking to do", group: "circumstances", type: "select", options: PURCHASE_INTENTS, required: true },
  { key: "timeframe", label: "Timeframe", group: "circumstances", type: "select", options: TIMEFRAMES, required: true },
  { key: "buying_in", label: "Where they want to buy", group: "circumstances", type: "text" },
  { key: "notes", label: "Anything else we should know", group: "circumstances", type: "textarea" },
];

export const INTRODUCER_FIELD_KEYS: readonly string[] = INTRODUCER_FIELDS.map((f) => f.key);

export function fieldLabel(key: string): string {
  return INTRODUCER_FIELDS.find((f) => f.key === key)?.label ?? key;
}

/**
 * The consent the introducer attests to at submit. Stored on the row verbatim,
 * so a later change to this wording can never be applied retrospectively to
 * referrals that were made under the old wording.
 *
 * IT NAMES THE WHOLE CHAIN, NOT JUST US. The client's details do not stop at
 * Springboard: they travel to G.B. Mayes Holdings, to Your Loan Assist under
 * ACL 477483, to a licensed financial adviser and to lenders. Consent to pass
 * details to ONE company does not cover onward disclosure to a credit licensee
 * and a separate advice business — so the attestation names each of them, in the
 * same words as the collection notice on the client's own consent form.
 *
 * It also carries the two things the introducer must have said out loud: that
 * they are independent and not an agent of Your Loan Assist, and that they may
 * be paid if the client proceeds. Both are conflict disclosures, and an
 * attestation that omits them evidences a consent narrower than the one the
 * arrangement actually needs.
 */
export const CONSENT_STATEMENT =
  "I confirm I have given the client the Springboard Homes Referral Consent and Privacy Form, that they " +
  "have signed it, and that they have consented to their personal details being provided to Springboard " +
  "Homes and disclosed to G.B. Mayes Holdings Pty Ltd, CRE8 Finance Pty Ltd trading as Your Loan Assist, " +
  "a licensed financial adviser and lenders, for the purpose of assessing and progressing an enquiry " +
  "about the Community Funding Program. I have told them I am an independent introducer, that I am not " +
  "an employee or agent of Your Loan Assist, and that I may be paid a fee if they proceed.";

/**
 * The label the signed consent form is filed under.
 *
 * A constant rather than a string in two routes: the upload path authorises on
 * it and the submit path looks for it, and those two having drifted apart would
 * mean an introducer uploading a form that submit could not see.
 */
export const CONSENT_FORM_LABEL = "Signed consent form";

/** Keep only allow-listed keys, trimmed. Everything else is dropped. */
export function pickEditableFields(body: unknown): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  if (!body || typeof body !== "object") return out;
  const src = body as Record<string, unknown>;
  for (const key of INTRODUCER_FIELD_KEYS) {
    if (!(key in src)) continue;
    const raw = src[key];
    if (raw === null || raw === undefined) {
      out[key] = null;
      continue;
    }
    if (typeof raw !== "string" && typeof raw !== "number") continue;
    const value = String(raw).trim();
    out[key] = value === "" ? null : value;
  }
  return out;
}

export type ClientRecordShape = Record<string, unknown> & { status?: string | null };

function isBlank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

export type ActiveGrant = {
  id: string;
  scope: string;
  fields: string[] | null;
  expires_at: string;
  consumed_at: string | null;
  revoked_at: string | null;
};

export type OpenInfoRequest = {
  id: string;
  fields: string[] | null;
  documents: string[] | null;
  status: string;
};

/** A grant is only usable while unconsumed, unrevoked and unexpired. */
export function grantIsActive(grant: ActiveGrant | null | undefined, now = new Date()): boolean {
  if (!grant) return false;
  if (grant.consumed_at || grant.revoked_at) return false;
  return new Date(grant.expires_at).getTime() > now.getTime();
}

export type EditDecision =
  | { allowed: true; via: "draft" | "grant" | "info_request"; grantId?: string; infoRequestIds?: string[] }
  | { allowed: false; reason: string; blockedFields: string[] };

/**
 * Can this introducer apply these changes right now?
 *
 * The authoritative answer, used by every write path in the portal. Mirrors
 * introducer_clients_locked_guard() in the migration. Three ways through:
 *
 *   draft         — nothing is locked yet.
 *   grant         — a super admin authorised it; a 'fields' grant must cover
 *                   every changed field.
 *   info_request  — an open request named the field AND the field is blank and
 *                   is being filled. Additive only: an info request never
 *                   authorises overwriting what was already submitted.
 *
 * Fields whose value is unchanged are ignored entirely, so a UI that re-posts
 * the whole form doesn't trip the lock.
 */
export function evaluateEdit(
  record: ClientRecordShape,
  changes: Record<string, string | null>,
  ctx: { grant?: ActiveGrant | null; infoRequests?: OpenInfoRequest[]; now?: Date } = {},
): EditDecision {
  const now = ctx.now ?? new Date();
  const status = String(record.status ?? "draft");

  const changed = Object.keys(changes).filter((k) => {
    if (!INTRODUCER_FIELD_KEYS.includes(k)) return false;
    const before = record[k];
    const after = changes[k];
    const beforeNorm = isBlank(before) ? null : String(before).trim();
    const afterNorm = isBlank(after) ? null : String(after).trim();
    return beforeNorm !== afterNorm;
  });

  if (changed.length === 0) {
    return { allowed: true, via: "draft" };
  }

  if (OPEN_STATUSES.has(status)) {
    return { allowed: true, via: "draft" };
  }

  if (TERMINAL_STATUSES.has(status)) {
    return {
      allowed: false,
      blockedFields: changed,
      reason:
        "This referral is closed. It cannot be changed — please submit a new referral if the client's situation has changed.",
    };
  }

  if (grantIsActive(ctx.grant, now)) {
    const grant = ctx.grant!;
    const covered =
      grant.scope === "full" || changed.every((f) => (grant.fields ?? []).includes(f));
    if (covered) return { allowed: true, via: "grant", grantId: grant.id };
    const blocked = changed.filter((f) => !(grant.fields ?? []).includes(f));
    return {
      allowed: false,
      blockedFields: blocked,
      reason: `The change you were authorised to make doesn't cover ${blocked
        .map(fieldLabel)
        .join(", ")}. Ask Springboard to authorise those as well.`,
    };
  }

  const open = (ctx.infoRequests ?? []).filter((r) => r.status === "open");
  if (open.length > 0) {
    const allowedFields = new Set(open.flatMap((r) => r.fields ?? []));
    const matchingRequests = open
      .filter((r) => (r.fields ?? []).some((f) => changed.includes(f)))
      .map((r) => r.id);

    const bad = changed.filter((f) => {
      if (!allowedFields.has(f)) return true;
      if (!isBlank(record[f])) return true;       // already answered — overwriting needs a grant
      return isBlank(changes[f]);                 // clearing a field is not "supplying information"
    });

    if (bad.length === 0) {
      return { allowed: true, via: "info_request", infoRequestIds: matchingRequests };
    }
    return {
      allowed: false,
      blockedFields: bad,
      reason: `You can only supply the information we asked for. ${bad
        .map(fieldLabel)
        .join(", ")} ${bad.length === 1 ? "is" : "are"} already submitted and can't be changed without authorisation from Springboard.`,
    };
  }

  return {
    allowed: false,
    blockedFields: changed,
    reason:
      "This referral has been submitted and is locked. Ask Springboard to authorise a change if something needs correcting.",
  };
}

/** Which required fields are still missing? Empty array means ready to submit. */
export function missingRequiredFields(record: ClientRecordShape): string[] {
  return INTRODUCER_FIELDS.filter((f) => f.required && isBlank(record[f.key])).map((f) => f.key);
}

/**
 * Has migrations/20260811_introducer_portal.sql not been applied yet?
 *
 * Deliberately narrow, for the reason CLAUDE.md records against
 * `factFindsTableMissing`: matching the error TEXT ("does not exist", "schema
 * cache") also catches COLUMN-level errors, so a schema mismatch would report
 * itself as "run the migration" for a migration you already ran. Match the
 * table-level codes only.
 *
 * This matters more here than elsewhere. A missing table on this feature is
 * silent from both ends — the introducer sees "check your email" and no email
 * ever comes — which is exactly how the YLA sweep sat broken. Callers use this
 * to say something true instead of nothing.
 */
export function introducerTablesMissing(error: { code?: string } | null | undefined): boolean {
  if (!error?.code) return false;
  return error.code === "42P01" || error.code === "PGRST205";
}

/** Basic shape check — we are not verifying deliverability, just catching typos. */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

/**
 * AU mobile/landline, normalised to +61 form for the CRM. Returns null when it
 * doesn't look like an AU number at all — the caller decides whether that's a
 * validation error or just a pass-through.
 */
export function normaliseAuPhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  const bare = digits.replace(/^\+?61/, "").replace(/^0/, "");
  if (!/^\d{9}$/.test(bare)) return null;
  return `+61${bare}`;
}

/**
 * What the introducer is allowed to see about their own referral.
 *
 * Whitelist, not blacklist. A new internal column added to introducer_clients
 * later is invisible to the portal by default — which is the correct failure
 * mode. `decision_reason` and `notes` (internal) never appear here;
 * `message_to_introducer` is the one channel back.
 */
export function toPortalView(row: Record<string, unknown>) {
  const status = String(row.status ?? "draft") as IntroducerClientStatus;
  return {
    id: String(row.id),
    client_ref: (row.client_ref as string) ?? null,
    first_name: (row.first_name as string) ?? "",
    last_name: (row.last_name as string) ?? "",
    email: (row.email as string) ?? null,
    phone: (row.phone as string) ?? null,
    dob: (row.dob as string) ?? null,
    state: (row.state as string) ?? null,
    suburb: (row.suburb as string) ?? null,
    postcode: (row.postcode as string) ?? null,
    applicant2_first_name: (row.applicant2_first_name as string) ?? null,
    applicant2_last_name: (row.applicant2_last_name as string) ?? null,
    applicant2_email: (row.applicant2_email as string) ?? null,
    applicant2_phone: (row.applicant2_phone as string) ?? null,
    employment_status: (row.employment_status as string) ?? null,
    income_band: (row.income_band as string) ?? null,
    deposit_band: (row.deposit_band as string) ?? null,
    purchase_intent: (row.purchase_intent as string) ?? null,
    timeframe: (row.timeframe as string) ?? null,
    buying_in: (row.buying_in as string) ?? null,
    notes: (row.notes as string) ?? null,
    status,
    status_label: STATUS_LABELS[status] ?? status,
    stage: (row.stage as string) ?? null,
    stage_label: stageLabel(row.stage as string | null),
    message_to_introducer: (row.message_to_introducer as string) ?? null,
    submitted_at: (row.submitted_at as string) ?? null,
    updated_at: (row.updated_at as string) ?? null,
    created_at: (row.created_at as string) ?? null,
  };
}

export type PortalClientView = ReturnType<typeof toPortalView>;

export function displayName(row: { first_name?: string | null; last_name?: string | null }): string {
  const name = `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
  return name || "Unnamed referral";
}
