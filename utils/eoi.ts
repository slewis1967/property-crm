/**
 * Expression of Interest (EOI) domain module — a digital rebuild of NextKey's
 * two-page paper EOI, section for section: Buyer/s → Solicitor → Property →
 * Deposit → Finance → Notes. Prepopulated from property + opportunity/contact
 * data, then sent for e-signing (it is a signable ComplianceDocType — see
 * utils/compliance-audit.ts, utils/sign-doc-render.ts) with a driver's-licence
 * upload requested on the signing page.
 *
 * Everything here is PURE (no I/O) so it is shared by the API routes, the form,
 * the print/PDF renderer and the signing flow, and is vitest-tested.
 *
 * The paper form has free-text "Individuals Full Names" / "E-mail/s" / "Mobile/s"
 * lines. We model buyers as a STRUCTURED list instead (each buyer can be an
 * e-signer) and reconstruct those lines for display — so the rendered document
 * still matches the paper form.
 */

/* ── Vocabulary ──────────────────────────────────────────────────────────── */

/** Draft → Sent (out for signing) → Signed (terminal, locked). */
export const EOI_STATUSES = ["Draft", "Sent", "Signed"] as const;
export type EoiStatus = (typeof EOI_STATUSES)[number];

/** The status at which the EOI is fully signed and becomes read-only. */
export const EOI_TERMINAL_STATUS: EoiStatus = "Signed";

/** Finance / settlement term options on the form. */
export const TERM_OPTIONS = ["", "7", "14", "21", "other"] as const;
export type TermOption = (typeof TERM_OPTIONS)[number];

export const TERM_LABELS: Record<TermOption, string> = {
  "": "—",
  "7": "7 Days",
  "14": "14 Days",
  "21": "21 Days",
  other: "Other",
};

/* ── Data shape ──────────────────────────────────────────────────────────── */

export type EoiBuyer = {
  fullName: string;
  email: string;
  mobile: string;
};

export type EoiSolicitor = {
  name: string;
  attention: string;
  address: string;
  phone: string;
  fax: string;
  email: string;
};

export type EoiData = {
  date: string; // ISO date the EOI is made
  // Buyer/s
  buyers: EoiBuyer[];
  purchasingEntity: string; // full entity name incl. "ATF …" for a trust/SMSF
  buyerAddress: string;
  fax: string;
  smsfPurchase: boolean | null; // Yes / No / unset
  smsfEstablished: boolean | null; // only meaningful when smsfPurchase
  acnAbn: string;
  taxFileNos: string;
  // Solicitor
  solicitor: EoiSolicitor;
  // Property
  property: { address: string; purchasePrice: number | null };
  // Deposit — free text so "TBC" / "n/a" are faithful to the paper form
  deposit: { total: string; initialHolding: string };
  // Finance
  finance: {
    subjectToFinance: boolean | null;
    financeTerm: TermOption;
    financeOther: string;
    settlementTerm: TermOption;
    settlementOther: string;
  };
  // Notes
  notes: string;
  broker: { name: string; email: string };
};

function emptyBuyer(): EoiBuyer {
  return { fullName: "", email: "", mobile: "" };
}

export function emptyEoi(): EoiData {
  return {
    date: "",
    buyers: [emptyBuyer()],
    purchasingEntity: "",
    buyerAddress: "",
    fax: "",
    smsfPurchase: null,
    smsfEstablished: null,
    acnAbn: "",
    taxFileNos: "",
    solicitor: { name: "", attention: "", address: "", phone: "", fax: "", email: "" },
    property: { address: "", purchasePrice: null },
    deposit: { total: "", initialHolding: "" },
    finance: { subjectToFinance: null, financeTerm: "", financeOther: "", settlementTerm: "", settlementOther: "" },
    notes: "",
    broker: { name: "", email: "" },
  };
}

/* ── Hydration (merge a stored/partial blob over the template) ────────────── */

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function asTriState(v: unknown): boolean | null {
  return v === true ? true : v === false ? false : null;
}
function asNumOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

export function hydrateEoi(raw: unknown): EoiData {
  const base = emptyEoi();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const sol = (o.solicitor ?? {}) as Record<string, unknown>;
  const prop = (o.property ?? {}) as Record<string, unknown>;
  const dep = (o.deposit ?? {}) as Record<string, unknown>;
  const fin = (o.finance ?? {}) as Record<string, unknown>;
  const brk = (o.broker ?? {}) as Record<string, unknown>;

  const buyersRaw = Array.isArray(o.buyers) ? o.buyers : [];
  const buyers: EoiBuyer[] = buyersRaw.map((b) => {
    const bo = (b ?? {}) as Record<string, unknown>;
    return { fullName: asString(bo.fullName), email: asString(bo.email), mobile: asString(bo.mobile) };
  });

  return {
    date: asString(o.date),
    buyers: buyers.length > 0 ? buyers : [emptyBuyer()],
    purchasingEntity: asString(o.purchasingEntity),
    buyerAddress: asString(o.buyerAddress),
    fax: asString(o.fax),
    smsfPurchase: asTriState(o.smsfPurchase),
    smsfEstablished: asTriState(o.smsfEstablished),
    acnAbn: asString(o.acnAbn),
    taxFileNos: asString(o.taxFileNos),
    solicitor: {
      name: asString(sol.name),
      attention: asString(sol.attention),
      address: asString(sol.address),
      phone: asString(sol.phone),
      fax: asString(sol.fax),
      email: asString(sol.email),
    },
    property: { address: asString(prop.address), purchasePrice: asNumOrNull(prop.purchasePrice) },
    deposit: { total: asString(dep.total), initialHolding: asString(dep.initialHolding) },
    finance: {
      subjectToFinance: asTriState(fin.subjectToFinance),
      financeTerm: oneOf(fin.financeTerm, TERM_OPTIONS, ""),
      financeOther: asString(fin.financeOther),
      settlementTerm: oneOf(fin.settlementTerm, TERM_OPTIONS, ""),
      settlementOther: asString(fin.settlementOther),
    },
    notes: asString(o.notes),
    broker: { name: asString(brk.name), email: asString(brk.email) },
  };
}

/* ── Derived helpers ─────────────────────────────────────────────────────── */

const namedBuyers = (data: EoiData): EoiBuyer[] => data.buyers.filter((b) => b.fullName.trim());

/** Reconstruct the paper form's free-text "Individuals Full Names" line. */
export function buyerNamesLine(data: EoiData): string {
  return namedBuyers(data)
    .map((b) => b.fullName.trim())
    .join(" and ");
}

/** Reconstruct the "E-mail/s" line. */
export function buyerEmailsLine(data: EoiData): string {
  return namedBuyers(data)
    .map((b) => b.email.trim())
    .filter(Boolean)
    .join(" and ");
}

/** Reconstruct the "Mobile/s" line, labelling each with the buyer's first name. */
export function buyerMobilesLine(data: EoiData): string {
  return namedBuyers(data)
    .map((b) => {
      const first = b.fullName.trim().split(/\s+/)[0];
      return b.mobile.trim() ? `${b.mobile.trim()}${first ? ` (${first})` : ""}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

/** Short label for the list view: buyer(s) — property. */
export function eoiSummary(data: EoiData): string {
  const who = data.purchasingEntity.trim() || buyerNamesLine(data) || "Unnamed buyer";
  const what = data.property.address.trim();
  return what ? `${who} — ${what}` : who;
}

/** The signers proposed from the buyers (name + email where known). */
export function eoiProposedSigners(data: EoiData): { name: string; email: string }[] {
  return namedBuyers(data).map((b) => ({ name: b.fullName.trim(), email: b.email.trim() }));
}

/** Advisory completeness — names the still-blank essentials. Never blocks a save. */
export function eoiOutstanding(data: EoiData): string[] {
  const missing: string[] = [];
  if (namedBuyers(data).length === 0) missing.push("Buyer name");
  if (!data.property.address.trim()) missing.push("Property address");
  if (data.property.purchasePrice === null && !data.deposit.total.trim()) missing.push("Purchase price or deposit");
  if (eoiProposedSigners(data).some((s) => !s.email)) missing.push("Buyer email (for signing)");
  return missing;
}

/** Format a numeric price as AUD; blank/null renders as "TBC" on the form. */
export function formatEoiPrice(n: number | null): string {
  if (n === null) return "TBC";
  return "$" + n.toLocaleString("en-AU");
}

/* ── Prefill from CRM data ───────────────────────────────────────────────── */

/** Loose shapes — the API passes whatever columns it read; we take what's there. */
export type EoiPropertyPrefill = {
  address?: string | null;
  street_address?: string | null;
  suburb?: string | null;
  state?: string | null;
  estate_name?: string | null;
  lot_number?: string | null;
  builder_name?: string | null;
  total_package_price?: number | null;
  house_price?: number | null;
  price_total?: number | null;
};

export type EoiContactPrefill = {
  full_name?: string | null;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  home_address_street?: string | null;
  home_address_suburb?: string | null;
  home_address_state?: string | null;
  home_address_postcode?: string | null;
};

function propertyAddress(p: EoiPropertyPrefill): string {
  if (p.address) return p.address;
  const line = [p.street_address, p.suburb, p.state].filter(Boolean).join(", ");
  if (line) return line;
  // Off-plan / house-and-land: no street address yet — use the estate name and
  // lot (e.g. "Natalia Rise (Lot 42)"), else the builder name.
  if (p.estate_name) return p.lot_number ? `${p.estate_name} (Lot ${p.lot_number})` : p.estate_name;
  return p.builder_name || "";
}

function propertyPrice(p: EoiPropertyPrefill): number | null {
  return p.price_total ?? p.total_package_price ?? p.house_price ?? null;
}

/** Build an EOI seeded from a property (+ optional buyer contact + broker). */
export function eoiPrefill(opts: {
  property?: EoiPropertyPrefill | null;
  contact?: EoiContactPrefill | null;
  broker?: { name?: string | null; email?: string | null } | null;
  today?: string;
}): EoiData {
  const eoi = emptyEoi();
  eoi.date = opts.today ?? "";

  if (opts.property) {
    eoi.property.address = propertyAddress(opts.property);
    eoi.property.purchasePrice = propertyPrice(opts.property);
  }

  if (opts.contact) {
    const c = opts.contact;
    eoi.buyers = [
      { fullName: c.full_name || c.name || "", email: c.email || "", mobile: c.phone || "" },
    ];
    eoi.buyerAddress = [c.home_address_street, c.home_address_suburb, c.home_address_state, c.home_address_postcode]
      .filter(Boolean)
      .join(", ");
  }

  if (opts.broker) {
    eoi.broker = { name: opts.broker.name || "", email: opts.broker.email || "" };
  }

  return eoi;
}

/* ── Error / migration helpers (mirrors utils/aml.ts) ────────────────────── */

export function eoiErrMessage(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message || fallback;
  const o = e as { message?: string; details?: string; hint?: string; code?: string } | null;
  return o?.message || o?.details || o?.hint || o?.code || fallback;
}

/** Narrow "table not created yet" test — a missing COLUMN is NOT a missing table. */
export function eoisTableMissing(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === "PGRST204" || e.code === "42703") return false;
  if (e.code === "42P01" || e.code === "PGRST205") return true;
  const msg = (e.message ?? "").toLowerCase();
  return msg.includes("could not find the table") || (msg.includes("relation") && msg.includes("does not exist"));
}
