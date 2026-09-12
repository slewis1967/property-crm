/**
 * Channel-partner portal — the rules, in one pure module.
 *
 * Pure on purpose (no Supabase, no env reads except where a function says so):
 * the portal pages, the public API, the staff console and the tests all read
 * the same definitions, so "what a partner may see" cannot drift between them.
 *
 * Three decisions from Sean (2026-09-11) shape everything here:
 *   - Stock is MASKED. Builder, estate, lot number and street address never
 *     reach the portal; NextKey reveals them per deal (see `revealed` on
 *     partner_enquiries). A partner who can see the builder can go direct.
 *   - The partner sees THEIR referral fee per lot, never the gross developer
 *     fee or NextKey's share.
 *   - Everyone starts on the basic tier. White-label and anything beyond basic
 *     is sold on request and switched on by staff — never self-serve.
 */

// ── Tiers and features ─────────────────────────────────────────────────────

/**
 * Every feature a tier can unlock. `built: false` means priced and planned but
 * not yet exposed in the portal: the staff console shows it so the tier matrix
 * can be sold honestly, and the portal never renders it.
 */
export const PARTNER_FEATURES = {
  stock: { label: "Browse the full stock book", built: true },
  clients: { label: "Client register", built: true },
  deals: { label: "Hold requests and deal tracking", built: true },
  referral_fee: { label: "Referral fee shown on every lot", built: true },
  white_label: { label: "Portal in your own branding", built: true },
  lot_sheets: { label: "Client-ready lot sheets (PDF)", built: false },
  suburb_reports: { label: "Suburb research reports", built: false },
  feasibility: { label: "Planning feasibility reports", built: false },
} as const;

export type PartnerFeature = keyof typeof PARTNER_FEATURES;

export const PARTNER_TIERS = ["basic", "professional", "enterprise"] as const;
export type PartnerTier = (typeof PARTNER_TIERS)[number];

/**
 * What each tier includes. Prices are not here — they are Sean's to set and
 * live in the partner agreement. `maxUsers` is the number of logins a firm may
 * hold; null is unlimited.
 */
export const TIER_DEFINITIONS: Record<
  PartnerTier,
  { label: string; features: readonly PartnerFeature[]; maxUsers: number | null }
> = {
  basic: {
    label: "Basic",
    features: ["stock", "clients", "deals", "referral_fee"],
    maxUsers: 2,
  },
  professional: {
    label: "Professional",
    features: ["stock", "clients", "deals", "referral_fee", "lot_sheets", "suburb_reports"],
    maxUsers: 5,
  },
  enterprise: {
    label: "Enterprise",
    features: [
      "stock", "clients", "deals", "referral_fee",
      "lot_sheets", "suburb_reports", "feasibility", "white_label",
    ],
    maxUsers: null,
  },
};

export function isPartnerTier(v: unknown): v is PartnerTier {
  return typeof v === "string" && (PARTNER_TIERS as readonly string[]).includes(v);
}

export function isPartnerFeature(v: unknown): v is PartnerFeature {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(PARTNER_FEATURES, v);
}

/** Unknown tiers read as basic — a bad value must never widen access. */
export function normaliseTier(v: unknown): PartnerTier {
  return isPartnerTier(v) ? v : "basic";
}

/**
 * The firm's effective features: its tier's list plus anything granted on
 * request. Grants that don't name a real feature are dropped rather than
 * trusted.
 */
export function featuresFor(tier: unknown, grants: unknown): Set<PartnerFeature> {
  const set = new Set<PartnerFeature>(TIER_DEFINITIONS[normaliseTier(tier)].features);
  if (Array.isArray(grants)) {
    for (const g of grants) if (isPartnerFeature(g)) set.add(g);
  }
  return set;
}

/** Built AND held. The portal asks this, never `featuresFor` directly. */
export function canUse(features: ReadonlySet<PartnerFeature>, feature: PartnerFeature): boolean {
  return PARTNER_FEATURES[feature].built && features.has(feature);
}

// ── Referral fee ─────────────────────────────────────────────────────────────

/** NextKey never retains less than this on a channel sale. Not configurable. */
export const PLATFORM_FLOOR_MIN = 10_000;

export type FeeRule = { floor: number; percent: number };

/** Ported from PropChannel OS fee_rules: the greater of $10k or 30% of gross. */
export const DEFAULT_FEE_RULE: FeeRule = { floor: PLATFORM_FLOOR_MIN, percent: 30 };

/**
 * The rule in force. Reads env (server only). The floor can be raised but never
 * lowered below $10k, and a nonsense percentage falls back to the default.
 */
export function feeRuleFromEnv(env: Record<string, string | undefined> = process.env): FeeRule {
  const floor = Number(env.PARTNER_FEE_FLOOR);
  const percent = Number(env.PARTNER_FEE_PERCENT);
  return {
    floor: Number.isFinite(floor) ? Math.max(PLATFORM_FLOOR_MIN, floor) : DEFAULT_FEE_RULE.floor,
    percent:
      env.PARTNER_FEE_PERCENT !== undefined && Number.isFinite(percent) && percent >= 0 && percent <= 100
        ? percent
        : DEFAULT_FEE_RULE.percent,
  };
}

/**
 * The partner's share of a lot's gross developer fee, or null when there is
 * nothing to offer (no fee recorded, or the fee is too small to share).
 *
 * Returns ONLY the partner's figure. Callers must not compute or pass on
 * NextKey's share: a partner who can subtract can recover the gross fee from
 * the two, which is exactly what rule 4 in the migration forbids.
 */
export function referralFee(gross: unknown, rule: FeeRule = DEFAULT_FEE_RULE): number | null {
  const g = typeof gross === "number" ? gross : typeof gross === "string" ? Number(gross) : NaN;
  if (!Number.isFinite(g) || g <= 0) return null;
  const floor = Math.max(PLATFORM_FLOOR_MIN, rule.floor);
  const retained = Math.max(floor, Math.round(g * rule.percent) / 100);
  if (retained >= g) return null;
  return Math.round((g - retained) * 100) / 100;
}

// ── Availability ─────────────────────────────────────────────────────────────

export type LotAvailability = "available" | "on_hold" | "unavailable";

/** Deal stages that tie a lot up. Keep in step with the partial unique index. */
export const ACTIVE_HOLD_STAGES = ["hold", "eoi", "unconditional"] as const;

/**
 * global_stock_pool.status is free text from builders' stocklists ("Completed
 * Build - UNDER CONTRACT", "Leased at $620pw ... - UNDER CONTRACT", "TBCG HOLD").
 * Reduce it to the three states a partner can act on. Anything sold or
 * contracted is unavailable even if the pipeline still calls the row active.
 */
export function lotAvailability(
  status: string | null | undefined,
  pipelineStatus: string | null | undefined,
  heldByPartnerDeal = false,
): LotAvailability {
  if (pipelineStatus !== "active") return "unavailable";
  const s = (status ?? "").toLowerCase();
  if (/\b(sold|settled)\b/.test(s) || /under\s+contract/.test(s) || /\bunconditional\b/.test(s)) {
    return "unavailable";
  }
  if (heldByPartnerDeal || /\bhold\b/.test(s)) return "on_hold";
  return "available";
}

// ── The masked lot ───────────────────────────────────────────────────────────

/**
 * Keys that must never appear in anything sent to a partner. Checked by
 * `assertNoForbiddenKeys` on every payload — a whitelist can be widened by
 * mistake, and this is the tripwire that makes that mistake loud.
 */
export const FORBIDDEN_PARTNER_KEYS = [
  "builder_name", "builder_id", "estate_name", "lot_number", "street_address",
  "source", "source_document_url", "source_email_id", "source_artifact_url",
  "ocr_text", "extraction_logic", "brochure_url", "floorplan_url", "description",
  "inclusions", "rebates", "specs", "gross_developer_fee", "platform_fee",
  "platform_retained_fee", "staff_notes", "notes_internal",
] as const;

export type StockRow = Record<string, unknown> & { id: string };

export type PartnerLot = {
  id: string;
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
  referralFee: number | null;
  updatedAt: string | null;
};

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function text(v: unknown, max = 80): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
}

/** A short, stable, meaningless reference a partner can quote on the phone. */
export function lotRef(id: string): string {
  return `NK-${id.replace(/-/g, "").slice(0, 6).toUpperCase()}`;
}

const CONTRACT_LABELS: Record<string, string> = {
  single: "Single contract",
  split: "Two-part contract",
};

/**
 * The ONLY projection of a stock row a partner receives. A whitelist, not a
 * redaction: a column added to global_stock_pool tomorrow is invisible here by
 * default.
 *
 * Deliberately absent, because each can name the supplier: builder, estate, lot
 * number, street address, brochure/floorplan/image URLs (builder-branded),
 * description/inclusions/rebates/specs (free text that routinely names the
 * estate or the design range), and the raw status string.
 *
 * The free-text fields that DO come through (completion, land registration,
 * property type) are scrubbed of any supplier name by `redactSupplierNames`.
 */
export function toPartnerLot(
  row: StockRow,
  opts: { referralFee: number | null; heldByPartnerDeal: boolean; supplierNames?: readonly string[] },
): PartnerLot {
  const houseSize = num(row.house_size);
  const landSize = num(row.land_size_sqm) ?? num(row.land_size);
  const buildPrice = num(row.build_price) ?? num(row.house_price);
  const contractKey = typeof row.contract_type === "string" ? row.contract_type.toLowerCase() : "";
  const names = opts.supplierNames ?? [];

  return {
    id: row.id,
    ref: lotRef(row.id),
    suburb: text(row.suburb),
    state: text(row.state, 8),
    propertyType: redactSupplierNames(text(row.property_type, 40), names),
    bedrooms: num(row.bedrooms),
    bathrooms: num(row.bathrooms),
    carSpaces: num(row.car_spaces),
    study: (num(row.study_room) ?? 0) > 0,
    landSizeSqm: landSize,
    houseSizeSqm: houseSize,
    frontageM: num(row.frontage_m),
    price: num(row.total_package_price) ?? num(row.house_price),
    landPrice: num(row.land_price),
    buildPrice,
    contract: CONTRACT_LABELS[contractKey] ?? null,
    titled: typeof row.titled === "boolean" ? row.titled : null,
    completion: redactSupplierNames(text(row.completion_date, 60), names),
    landRegistration: redactSupplierNames(text(row.land_registration_date, 60), names),
    rentWeekly: num(row.expected_rent_weekly),
    availability: lotAvailability(
      typeof row.status === "string" ? row.status : null,
      typeof row.pipeline_status === "string" ? row.pipeline_status : null,
      opts.heldByPartnerDeal,
    ),
    referralFee: opts.referralFee,
    updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
  };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replace any known builder/estate name in a short free-text value. Names under
 * four characters are ignored: "Aura" is a real estate, "The" is not a name.
 * Whole-word, case-insensitive.
 */
export function redactSupplierNames(value: string | null, names: readonly string[]): string | null {
  if (!value) return value;
  let out = value;
  for (const name of names) {
    const n = name.trim();
    if (n.length < 4) continue;
    const re = new RegExp(`\\b${escapeRegExp(n)}\\b`, "gi");
    out = out.replace(re, "—");
  }
  return out;
}

/**
 * Throws if a forbidden key survived into an outbound partner payload. Fails
 * closed: a 500 is better than a partner seeing a builder's name or our margin.
 */
export function assertNoForbiddenKeys<T>(payload: T): T {
  const json = JSON.stringify(payload);
  for (const key of FORBIDDEN_PARTNER_KEYS) {
    if (json.includes(`"${key}"`)) {
      throw new Error(`PARTNER_PAYLOAD_LEAK: "${key}" found in an outbound partner payload`);
    }
  }
  return payload;
}

// ── Revealed supplier details ───────────────────────────────────────────────

export const REVEAL_FIELDS = [
  { key: "builder_name", label: "Builder" },
  { key: "estate_name", label: "Estate" },
  { key: "lot_number", label: "Lot" },
  { key: "street_address", label: "Address" },
] as const;

export type RevealKey = (typeof REVEAL_FIELDS)[number]["key"];

/**
 * Clean a staff-entered reveal. Only the four known keys survive, each trimmed
 * and capped. Stored on the deal and shown to that partner only, and it is sent
 * under the key `revealed` — never at the top level — so the forbidden-key
 * tripwire does not fire on a deliberate reveal.
 */
export function parseReveal(input: unknown): Partial<Record<RevealKey, string>> {
  const out: Partial<Record<RevealKey, string>> = {};
  if (!input || typeof input !== "object") return out;
  const src = input as Record<string, unknown>;
  for (const { key } of REVEAL_FIELDS) {
    const v = text(src[key], 160);
    if (v) out[key] = v;
  }
  return out;
}

/**
 * The revealed details as a list of label/value pairs. A list, not an object
 * keyed by column name, so a deliberately revealed builder can travel through
 * `assertNoForbiddenKeys` without whitelisting the key itself.
 */
export function revealedForPortal(revealed: unknown): { label: string; value: string }[] {
  const parsed = parseReveal(revealed);
  return REVEAL_FIELDS.flatMap(({ key, label }) =>
    parsed[key] ? [{ label, value: parsed[key] as string }] : [],
  );
}

// ── Deal stages ──────────────────────────────────────────────────────────────

export const DEAL_STAGES = [
  "requested", "hold", "eoi", "unconditional", "settled", "declined", "released", "withdrawn",
] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

export const DEAL_STAGE_LABELS: Record<DealStage, string> = {
  requested: "Hold requested",
  hold: "On hold for your client",
  eoi: "EOI signed",
  unconditional: "Unconditional",
  settled: "Settled",
  declined: "Not available",
  released: "Hold released",
  withdrawn: "Withdrawn",
};

export function isDealStage(v: unknown): v is DealStage {
  return typeof v === "string" && (DEAL_STAGES as readonly string[]).includes(v);
}

/** Stages from which a lot is no longer the partner's to lose. */
export const CLOSED_STAGES: ReadonlySet<DealStage> = new Set(["settled", "declined", "released", "withdrawn"]);

/**
 * The only moves staff may make. The DB index stops two holds on one lot; this
 * stops nonsense like settled -> requested.
 */
export const STAFF_TRANSITIONS: Record<DealStage, readonly DealStage[]> = {
  requested: ["hold", "declined"],
  hold: ["eoi", "released"],
  eoi: ["unconditional", "released"],
  unconditional: ["settled", "released"],
  settled: [],
  declined: [],
  released: [],
  withdrawn: [],
};

export function canTransition(from: string, to: string): boolean {
  return isDealStage(from) && isDealStage(to) && STAFF_TRANSITIONS[from].includes(to);
}

/** A partner may withdraw their own request only before we have acted on it. */
export function partnerMayWithdraw(stage: string): boolean {
  return stage === "requested";
}

// ── White-label branding ─────────────────────────────────────────────────────

export type PartnerBranding = {
  displayName: string;
  logoUrl: string | null;
  primaryColor: string;
  accentColor: string;
  whiteLabel: boolean;
};

/** NextKey brand (see memory nextkey-brand): navy + amber. */
export const NEXTKEY_BRANDING: PartnerBranding = {
  displayName: "NextKey",
  logoUrl: "https://nextkey.com.au/wp-content/uploads/2026/07/nextkey-logo.png",
  primaryColor: "#1b1f44",
  accentColor: "#da9845",
  whiteLabel: false,
};

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * Validate a staff-entered branding blob. Returns the cleaned value or a list
 * of problems. Logos must be https (the CSP allows https images, and an http
 * logo would be mixed content); colours must be 6-digit hex so they can go
 * straight into a style attribute without any chance of CSS injection.
 */
export function parseBranding(
  input: unknown,
): { ok: true; value: Record<string, string> } | { ok: false; errors: string[] } {
  const src = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const errors: string[] = [];
  const value: Record<string, string> = {};

  const name = text(src.display_name, 80);
  if (name) value.display_name = name;

  if (src.logo_url !== undefined && src.logo_url !== null && src.logo_url !== "") {
    const raw = String(src.logo_url).trim();
    let ok = false;
    try {
      ok = new URL(raw).protocol === "https:" && raw.length <= 500;
    } catch {
      ok = false;
    }
    if (ok) value.logo_url = raw;
    else errors.push("Logo must be an https:// image URL (500 characters max).");
  }

  for (const [key, label] of [["primary_color", "Primary colour"], ["accent_color", "Accent colour"]] as const) {
    const raw = src[key];
    if (raw === undefined || raw === null || raw === "") continue;
    if (typeof raw === "string" && HEX.test(raw.trim())) value[key] = raw.trim().toLowerCase();
    else errors.push(`${label} must be a hex colour like #1b1f44.`);
  }

  return errors.length ? { ok: false, errors } : { ok: true, value };
}

/**
 * What the portal renders. The firm's branding applies ONLY while it holds the
 * white_label feature — switching the feature off reverts the portal to NextKey
 * without anyone having to clear the stored settings. Anything missing or
 * invalid in the stored blob falls back to NextKey's value.
 */
export function resolveBranding(
  firmName: string,
  features: ReadonlySet<PartnerFeature>,
  stored: unknown,
): PartnerBranding {
  if (!canUse(features, "white_label")) return NEXTKEY_BRANDING;
  const parsed = parseBranding(stored);
  const b = parsed.ok ? parsed.value : {};
  return {
    displayName: b.display_name ?? firmName,
    logoUrl: b.logo_url ?? null,
    primaryColor: b.primary_color ?? NEXTKEY_BRANDING.primaryColor,
    accentColor: b.accent_color ?? NEXTKEY_BRANDING.accentColor,
    whiteLabel: true,
  };
}

// ── Clients ──────────────────────────────────────────────────────────────────

export type ClientInput = {
  first_name: string;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  state: string | null;
  budget_max: number | null;
  notes: string | null;
};

const AU_STATES = new Set(["QLD", "NSW", "VIC", "SA", "WA", "TAS", "NT", "ACT"]);

/** Validate the partner's client form. Consent is checked by the caller. */
export function parseClientInput(
  body: Record<string, unknown>,
): { ok: true; value: ClientInput } | { ok: false; error: string } {
  const first = text(body.first_name, 80);
  if (!first) return { ok: false, error: "First name is required." };
  const email = text(body.email, 320)?.toLowerCase() ?? null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: "That email address doesn't look right." };
  }
  const phone = text(body.phone, 30);
  if (!email && !phone) return { ok: false, error: "Add an email or a phone number for the client." };
  const state = text(body.state, 3)?.toUpperCase() ?? null;
  if (state && !AU_STATES.has(state)) return { ok: false, error: "Choose an Australian state." };
  const budget = num(body.budget_max);

  return {
    ok: true,
    value: {
      first_name: first,
      last_name: text(body.last_name, 80),
      email,
      phone,
      state,
      budget_max: budget,
      notes: text(body.notes, 2000),
    },
  };
}

// ── Plumbing ─────────────────────────────────────────────────────────────────

/**
 * The partner portal subtree. `"/partners".startsWith("/partner")` is true, so
 * this matches "/partner" exactly plus "/partner/" and nothing else — the same
 * trailing-slash discipline as the introducer carve-out. The staff side lives
 * at /admin/partners, a different subtree entirely.
 */
export function isPartnerPortalPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return pathname === "/partner" || pathname.startsWith("/partner/");
}

/** Table-level "migration not applied" only (42P01 / PGRST205), never column errors. */
export function partnerTablesMissing(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205";
}

export function formatAud(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
}
