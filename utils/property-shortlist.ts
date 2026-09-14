/**
 * Property shortlists — the rules, in one pure module.
 *
 * A consultant picks one or many lots from the Aggregator Feed and sends a
 * client a private link. The client sees those properties, side-by-side
 * comparison, rent/yield/cashflow, stamp duty and upfront costs, and a suburb
 * profile; marks each one "Interested" or "Not for me"; and can book a call.
 *
 * Pure on purpose (no Supabase, no env): the staff routes, the public routes,
 * the client page and the tests all read these definitions, so "what a client
 * may see" and "how the numbers are worked out" cannot drift between them.
 * The client page imports `computeReport` directly so the client can change the
 * deposit or rate and see the figures move without a round-trip.
 *
 * Sean's decisions (2026-09-14):
 *   - NextKey branded (the portal and the email).
 *   - Builder, estate, lot number and street address are HIDDEN — the same
 *     masking as the channel-partner portal, so a client can't go direct to
 *     the builder. The lot view is built from `toPartnerLot`, the partner
 *     portal's whitelist, rather than a second copy of it.
 *   - Reports: comparison, rental yield & cashflow, suburb profile, stamp duty
 *     & upfront costs.
 *   - The client can register interest per property and book a call.
 */
import { toPartnerLot, type LotAvailability, type StockRow } from "./partner";
import { AUS_STATES, dutyPayable, type AusState } from "./finance/stampDuty";
import {
  AUTO_COST_RENT_RATIO,
  AUTO_COST_VALUE_RATIO_INVESTMENT,
  DEFAULT_CLOSING_COSTS,
} from "./finance/capacity";

// ── Limits ────────────────────────────────────────────────────────────────────

/** Enough for a genuine shortlist; beyond this it is a catalogue, not advice. */
export const SHORTLIST_MAX_ITEMS = 12;
export const SHORTLIST_DEFAULT_TTL_DAYS = 30;
export const SHORTLIST_MAX_TTL_DAYS = 90;
export const SHORTLIST_MAX_IMAGES = 8;
export const CLIENT_NOTE_MAX = 1000;
export const STAFF_NOTE_MAX = 600;
export const MESSAGE_MAX = 2000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v);
}

function toNumber(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim()) return Number(v);
  return NaN;
}

function clamp(v: unknown, min: number, max: number, fallback: number): number {
  const n = toNumber(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function trimText(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/** Days until the link stops working. Integer, 1..90, default 30. */
export function parseTtlDays(v: unknown): number {
  return Math.round(clamp(v, 1, SHORTLIST_MAX_TTL_DAYS, SHORTLIST_DEFAULT_TTL_DAYS));
}

// ── Report assumptions ──────────────────────────────────────────────────────────

export type RepaymentType = "pi" | "io";

export type ShortlistAssumptions = {
  depositPct: number;
  interestRatePct: number;
  loanTermYears: number;
  repayment: RepaymentType;
  firstHomeBuyer: boolean;
};

/**
 * 6.5% matches the rate the Fact Find capacity bridge assumes for an unknown
 * mortgage. The consultant sets real figures per shortlist, and the client can
 * move them on the page — these are only the starting point.
 */
export const DEFAULT_ASSUMPTIONS: ShortlistAssumptions = {
  depositPct: 20,
  interestRatePct: 6.5,
  loanTermYears: 30,
  repayment: "pi",
  firstHomeBuyer: false,
};

/** Anything unparseable falls back to the default; numbers are clamped to sane ranges. */
export function parseAssumptions(raw: unknown): ShortlistAssumptions {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    depositPct: clamp(r.depositPct, 0, 100, DEFAULT_ASSUMPTIONS.depositPct),
    interestRatePct: clamp(r.interestRatePct, 0, 20, DEFAULT_ASSUMPTIONS.interestRatePct),
    loanTermYears: Math.round(clamp(r.loanTermYears, 1, 40, DEFAULT_ASSUMPTIONS.loanTermYears)),
    repayment: r.repayment === "io" ? "io" : "pi",
    firstHomeBuyer: r.firstHomeBuyer === true,
  };
}

// ── The numbers ──────────────────────────────────────────────────────────────────

/** Monthly repayment. Principal & interest (amortising) or interest-only. */
export function monthlyRepayment(
  principal: number,
  annualRatePct: number,
  years: number,
  type: RepaymentType,
): number {
  if (!(principal > 0)) return 0;
  const r = annualRatePct / 100 / 12;
  if (type === "io") return principal * r;
  const n = Math.max(1, Math.round(years * 12));
  if (r === 0) return principal / n;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

export function isAusState(v: unknown): v is AusState {
  return typeof v === "string" && (AUS_STATES as readonly string[]).includes(v);
}

export type ReportInput = {
  price: number | null;
  landPrice: number | null;
  contract: string | null;
  state: string | null;
  rentWeekly: number | null;
};

export type PropertyReport = {
  price: number;
  deposit: number;
  loan: number;
  /** Deposit under 20%: lenders usually charge LMI, which is NOT in these figures. */
  lmiLikely: boolean;
  /** null when the state is unknown — the page says so rather than showing $0. */
  duty: number | null;
  /** "land" for a two-part house-and-land contract, where duty is usually on the land. */
  dutyBasis: "land" | "package" | null;
  dutiableValue: number | null;
  closingCosts: number;
  /** Deposit + duty (when known) + closing costs. */
  upfrontCash: number;
  monthlyRepayment: number;
  annualRepayments: number;
  rentWeekly: number | null;
  annualRent: number | null;
  grossYieldPct: number | null;
  /** Management, vacancy, rates, insurance, maintenance — the CRM's standard allowance. */
  annualCosts: number | null;
  /** Rent − costs − repayments, per week, BEFORE tax and depreciation. */
  weeklyCashflow: number | null;
};

/**
 * One property's figures under the given assumptions. null when there is no
 * price, because every figure depends on it.
 *
 * Stamp duty basis: a house-and-land package on a two-part contract is usually
 * dutiable on the land only (the build contract is not a transfer of land). We
 * treat a package as two-part when the land price is known and below the total,
 * unless the lot is explicitly a single contract. State rules differ in the
 * detail (VIC off-the-plan concessions, for one), so the page labels the figure
 * as an estimate and names the basis used.
 *
 * Running costs use the same allowance as the borrowing-capacity engine
 * (utils/finance/capacity.ts autoAnnualCosts, investment case): the greater of
 * 25% of rent or 0.9% of value.
 */
export function computeReport(input: ReportInput, a: ShortlistAssumptions): PropertyReport | null {
  const price = input.price;
  if (price === null || !Number.isFinite(price) || price <= 0) return null;

  const deposit = Math.round((price * a.depositPct) / 100);
  const loan = Math.max(0, price - deposit);

  let duty: number | null = null;
  let dutyBasis: PropertyReport["dutyBasis"] = null;
  let dutiableValue: number | null = null;
  const state = input.state?.trim().toUpperCase();
  if (isAusState(state)) {
    const land = input.landPrice;
    const twoPart =
      input.contract !== "Single contract" && land !== null && land > 0 && land < price;
    dutiableValue = twoPart ? land : price;
    dutyBasis = twoPart ? "land" : "package";
    duty = Math.round(dutyPayable(state, dutiableValue, a.firstHomeBuyer));
  }

  const closingCosts = DEFAULT_CLOSING_COSTS;
  const monthly = monthlyRepayment(loan, a.interestRatePct, a.loanTermYears, a.repayment);
  const annualRepayments = monthly * 12;

  const rent = input.rentWeekly !== null && input.rentWeekly > 0 ? input.rentWeekly : null;
  const annualRent = rent !== null ? rent * 52 : null;
  const annualCosts =
    annualRent !== null
      ? Math.max(annualRent * AUTO_COST_RENT_RATIO, price * AUTO_COST_VALUE_RATIO_INVESTMENT)
      : null;
  const weeklyCashflow =
    annualRent !== null && annualCosts !== null
      ? (annualRent - annualCosts - annualRepayments) / 52
      : null;

  return {
    price,
    deposit,
    loan,
    lmiLikely: a.depositPct < 20,
    duty,
    dutyBasis,
    dutiableValue,
    closingCosts,
    upfrontCash: deposit + (duty ?? 0) + closingCosts,
    monthlyRepayment: Math.round(monthly),
    annualRepayments: Math.round(annualRepayments),
    rentWeekly: rent,
    annualRent,
    grossYieldPct: annualRent !== null ? Math.round((annualRent / price) * 10000) / 100 : null,
    annualCosts: annualCosts !== null ? Math.round(annualCosts) : null,
    weeklyCashflow: weeklyCashflow !== null ? Math.round(weeklyCashflow) : null,
  };
}

// ── What the client sees ─────────────────────────────────────────────────────────

export const CLIENT_RESPONSES = ["interested", "not_for_me"] as const;
export type ClientResponse = (typeof CLIENT_RESPONSES)[number];

export function isClientResponse(v: unknown): v is ClientResponse {
  return typeof v === "string" && (CLIENT_RESPONSES as readonly string[]).includes(v);
}

/**
 * A lot as the client sees it. Built from the partner portal's whitelist, minus
 * the referral fee (a client must never see what we are paid) and minus the
 * stock id. No builder, estate, lot number, street address, brochure, or free
 * text that can name the supplier.
 */
export type ClientLotView = {
  ref: string;
  suburb: string | null;
  state: string | null;
  propertyType: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  carSpaces: number | null;
  study: boolean;
  landSizeSqm: number | null;
  houseSizeSqm: number | null;
  frontageM: number | null;
  price: number | null;
  landPrice: number | null;
  buildPrice: number | null;
  contract: string | null;
  titled: boolean | null;
  completion: string | null;
  landRegistration: string | null;
  rentWeekly: number | null;
  availability: LotAvailability;
};

export type ClientProperty = ClientLotView & {
  itemId: string;
  /** Where the rent figure came from; null when there is none. */
  rentSource: "listing" | "consultant" | null;
  staffNote: string | null;
  /** Photos are served by index through the token-scoped image route. */
  imageCount: number;
  response: ClientResponse | null;
  clientNote: string | null;
  respondedAt: string | null;
};

export function toClientLotView(row: StockRow, supplierNames: readonly string[] = []): ClientLotView {
  const lot = toPartnerLot(row, { referralFee: null, heldByPartnerDeal: false, supplierNames });
  // Picked field by field, not spread: a field added to PartnerLot tomorrow
  // (a fee, an internal id) must not reach a client by default.
  return {
    ref: lot.ref,
    suburb: lot.suburb,
    state: lot.state,
    propertyType: lot.propertyType,
    bedrooms: lot.bedrooms,
    bathrooms: lot.bathrooms,
    carSpaces: lot.carSpaces,
    study: lot.study,
    landSizeSqm: lot.landSizeSqm,
    houseSizeSqm: lot.houseSizeSqm,
    frontageM: lot.frontageM,
    price: lot.price,
    landPrice: lot.landPrice,
    buildPrice: lot.buildPrice,
    contract: lot.contract,
    titled: lot.titled,
    completion: lot.completion,
    landRegistration: lot.landRegistration,
    rentWeekly: lot.rentWeekly,
    availability: lot.availability,
  };
}

export type ShortlistItemRow = {
  id: string;
  rent_weekly_override: number | string | null;
  staff_note: string | null;
  client_response: string | null;
  client_note: string | null;
  responded_at: string | null;
};

/**
 * The item as the client sees it. `lot` is the live view, or — when the stock
 * row has gone — the snapshot taken when the shortlist was sent, marked
 * unavailable. The consultant's rent wins over the listing's.
 */
export function toClientProperty(
  lot: ClientLotView,
  item: ShortlistItemRow,
  imageCount: number,
): ClientProperty {
  const override = toNumber(item.rent_weekly_override);
  const hasOverride = Number.isFinite(override) && override > 0;
  const rentWeekly = hasOverride ? override : lot.rentWeekly;
  return {
    ...lot,
    rentWeekly,
    rentSource: hasOverride ? "consultant" : lot.rentWeekly !== null ? "listing" : null,
    itemId: item.id,
    staffNote: trimText(item.staff_note, STAFF_NOTE_MAX),
    imageCount: Math.max(0, Math.min(SHORTLIST_MAX_IMAGES, Math.floor(imageCount))),
    response: isClientResponse(item.client_response) ? item.client_response : null,
    clientNote: trimText(item.client_note, CLIENT_NOTE_MAX),
    respondedAt: item.responded_at,
  };
}

/** A snapshot read back from jsonb, forced unavailable. Untrusted shape, so re-validated. */
export function lotFromSnapshot(snapshot: unknown): ClientLotView | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const s = snapshot as Record<string, unknown>;
  if (typeof s.ref !== "string") return null;
  const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : null);
  const t = (v: unknown, max = 80) => trimText(v, max);
  return {
    ref: s.ref,
    suburb: t(s.suburb),
    state: t(s.state, 8),
    propertyType: t(s.propertyType, 40),
    bedrooms: n(s.bedrooms),
    bathrooms: n(s.bathrooms),
    carSpaces: n(s.carSpaces),
    study: s.study === true,
    landSizeSqm: n(s.landSizeSqm),
    houseSizeSqm: n(s.houseSizeSqm),
    frontageM: n(s.frontageM),
    price: n(s.price),
    landPrice: n(s.landPrice),
    buildPrice: n(s.buildPrice),
    contract: t(s.contract, 40),
    titled: typeof s.titled === "boolean" ? s.titled : null,
    completion: t(s.completion, 60),
    landRegistration: t(s.landRegistration, 60),
    rentWeekly: n(s.rentWeekly),
    availability: "unavailable",
  };
}

// ── Photos ─────────────────────────────────────────────────────────────────────────

export type MediaRow = { kind: string | null; storage_path: string | null };

/**
 * The photo URLs for a lot, in display order: facade first, then gallery.
 *
 * SERVER-ONLY RESULT. These URLs are never sent to the client — their paths
 * carry the brochure folder name, which names the estate and the supplier
 * ("…/lot_1238_newbridge_spm_revised/facade_05.jpeg"). The page asks for photo
 * N through the token-scoped image route, which streams the bytes.
 *
 * Only our own Supabase public-storage URLs are accepted. The image route
 * fetches whatever this returns, so an arbitrary host would make it an open
 * proxy. Floor plans and brochure PDFs are left out: they are builder
 * documents, and carry the builder's name and design range.
 */
export function shortlistImageUrls(
  media: readonly MediaRow[],
  brochureUrl: unknown,
  supabaseUrl: string | null | undefined,
): string[] {
  let origin: string;
  try {
    origin = new URL(supabaseUrl ?? "").origin;
  } catch {
    return [];
  }
  const ours = (u: unknown): u is string => {
    if (typeof u !== "string" || !u) return false;
    try {
      const url = new URL(u);
      return (
        url.protocol === "https:" &&
        url.origin === origin &&
        url.pathname.startsWith("/storage/v1/object/public/")
      );
    } catch {
      return false;
    }
  };

  const out: string[] = [];
  const push = (u: unknown) => {
    if (ours(u) && !out.includes(u) && out.length < SHORTLIST_MAX_IMAGES) out.push(u);
  };
  for (const m of media) if (m.kind === "facade") push(m.storage_path);
  push(brochureUrl);
  for (const m of media) if (m.kind === "gallery") push(m.storage_path);
  return out;
}

// ── Access ─────────────────────────────────────────────────────────────────────────

/**
 * Can this link be used right now? A revoked link and an expired one get the
 * same answer, so a stranger cannot tell which links ever existed.
 */
export function shortlistUsable(
  row: { status: string | null; expires_at: string | null },
  now: number = Date.now(),
): boolean {
  if (row.status !== "active") return false;
  if (!row.expires_at) return false;
  const expires = new Date(row.expires_at).getTime();
  return Number.isFinite(expires) && expires > now;
}

// ── Client input ───────────────────────────────────────────────────────────────────

export type ResponseInput = {
  itemId: string;
  response: ClientResponse | null;
  note: string | null;
};

/** The body of POST /api/shortlist/<token>/respond. `response: null` clears it. */
export function parseResponseInput(
  body: unknown,
): { ok: true; value: ResponseInput } | { ok: false; error: string } {
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  if (!isUuid(b.itemId)) return { ok: false, error: "Unknown property." };
  if (b.response !== null && b.response !== undefined && !isClientResponse(b.response)) {
    return { ok: false, error: "Unknown response." };
  }
  return {
    ok: true,
    value: {
      itemId: b.itemId,
      response: isClientResponse(b.response) ? b.response : null,
      note: trimText(b.note, CLIENT_NOTE_MAX),
    },
  };
}

export type CreateItemInput = { propertyId: string; rentWeekly: number | null; staffNote: string | null };

/**
 * The staff create body's item list: de-duplicated, capped, every id a uuid.
 * Accepts bare ids or `{propertyId, rentWeekly?, staffNote?}`.
 */
export function parseCreateItems(
  raw: unknown,
): { ok: true; items: CreateItemInput[] } | { ok: false; error: string } {
  if (!Array.isArray(raw) || raw.length === 0) return { ok: false, error: "Pick at least one property." };
  const seen = new Set<string>();
  const items: CreateItemInput[] = [];
  for (const entry of raw) {
    const e = typeof entry === "string" ? { propertyId: entry } : (entry as Record<string, unknown> | null);
    const id = e?.propertyId;
    if (!isUuid(id)) return { ok: false, error: "Invalid property id." };
    if (seen.has(id)) continue;
    seen.add(id);
    const rent = toNumber(e?.rentWeekly);
    items.push({
      propertyId: id,
      rentWeekly: Number.isFinite(rent) && rent > 0 && rent < 100_000 ? Math.round(rent * 100) / 100 : null,
      staffNote: trimText(e?.staffNote, STAFF_NOTE_MAX),
    });
  }
  if (items.length > SHORTLIST_MAX_ITEMS) {
    return { ok: false, error: `A shortlist can hold up to ${SHORTLIST_MAX_ITEMS} properties.` };
  }
  return { ok: true, items };
}

/** Unique suburb+state pairs on a shortlist — the only suburbs its profile route will research. */
export function shortlistSuburbs(
  lots: readonly Pick<ClientLotView, "suburb" | "state">[],
): { suburb: string; state: string | null }[] {
  const seen = new Set<string>();
  const out: { suburb: string; state: string | null }[] = [];
  for (const l of lots) {
    if (!l.suburb) continue;
    const key = `${l.suburb.toLowerCase()}|${(l.state ?? "").toUpperCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ suburb: l.suburb, state: l.state ? l.state.toUpperCase() : null });
  }
  return out;
}

/** Table-level "migration not applied" only (42P01 / PGRST205), never column errors. */
export function shortlistTablesMissing(error: { code?: string } | null | undefined): boolean {
  return !!error && (error.code === "42P01" || error.code === "PGRST205");
}

export const SHORTLIST_MIGRATION_HINT =
  "Property shortlists aren't set up yet — run migrations/20260914_property_shortlists.sql in the Supabase SQL editor.";

/**
 * Shown on every report. General information: NextKey is not licensed to give
 * credit or financial advice, and a repayment figure at an assumed rate must
 * not read as a quote or a pre-approval.
 */
export const REPORT_DISCLAIMER =
  "These figures are general information and estimates only, based on the assumptions shown and the " +
  "information available to NextKey at the time. They are not financial, credit, tax or legal advice, " +
  "a loan quote or a pre-approval, and do not take your personal circumstances into account. Rent is an " +
  "estimate, not a guarantee. Stamp duty is indicative — confirm with your conveyancer and the state " +
  "revenue office. Lenders' mortgage insurance, legal fees and ongoing tax effects are not included. " +
  "Speak to a licensed adviser or broker before making a decision.";
