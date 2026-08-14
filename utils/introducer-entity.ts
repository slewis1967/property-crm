/**
 * The applicant's business details — the entity the agreement is executed with.
 *
 * Pure: no database, no network. The route and the UI both validate through
 * here so a browser with JavaScript off cannot post something the form would
 * have refused.
 *
 * ABN and ACN are checksum-bearing, and the checksums are the point. "11 digits"
 * accepts a transposed pair; the real algorithm doesn't. Getting this wrong puts
 * a wrong ABN in the party clause of a signed contract, which is discovered at
 * exactly the worst moment.
 */

export const ENTITY_TYPES = ["sole_trader", "company", "trust", "partnership"] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const ENTITY_TYPE_LABEL: Record<EntityType, string> = {
  sole_trader: "Sole trader",
  company: "Company (Pty Ltd)",
  trust: "Trust",
  partnership: "Partnership",
};

export function isEntityType(v: unknown): v is EntityType {
  return typeof v === "string" && (ENTITY_TYPES as readonly string[]).includes(v);
}

/** Strip everything that isn't a digit. ABNs and ACNs are quoted with spaces. */
export const digitsOnly = (v: string): string => v.replace(/\D+/g, "");

/**
 * ABN check: 11 digits, weighted mod 89 with 1 subtracted from the first digit.
 * The algorithm is published by the ATO.
 */
export function isValidAbn(raw: string): boolean {
  const d = digitsOnly(raw);
  if (d.length !== 11) return false;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    const digit = Number(d[i]) - (i === 0 ? 1 : 0);
    sum += digit * weights[i];
  }
  return sum % 89 === 0;
}

/**
 * ACN check: 9 digits, weighted mod 10 with the last digit as the complement.
 * Published by ASIC.
 */
export function isValidAcn(raw: string): boolean {
  const d = digitsOnly(raw);
  if (d.length !== 9) return false;
  const weights = [8, 7, 6, 5, 4, 3, 2, 1];
  let sum = 0;
  for (let i = 0; i < 8; i++) sum += Number(d[i]) * weights[i];
  const remainder = sum % 10;
  const check = remainder === 0 ? 0 : 10 - remainder;
  return check === Number(d[8]);
}

/** "12345678901" → "12 345 678 901" — how an ABN is written everywhere. */
export function formatAbn(raw: string): string {
  const d = digitsOnly(raw);
  if (d.length !== 11) return raw.trim();
  return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8)}`;
}

/** "123456789" → "123 456 789". */
export function formatAcn(raw: string): string {
  const d = digitsOnly(raw);
  if (d.length !== 9) return raw.trim();
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
}

export type BusinessDetailsInput = {
  entity_type?: unknown;
  firm_name?: unknown;
  abn?: unknown;
  acn?: unknown;
  registered_address?: unknown;
};

export type BusinessDetails = {
  entity_type: EntityType;
  firm_name: string;
  abn: string;
  acn: string;
  registered_address: string;
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Validate and normalise what the applicant typed.
 *
 * What is required depends on the entity type, and that is not pedantry:
 *   - a sole trader has no ACN at all, so demanding one makes the form
 *     impossible to complete honestly;
 *   - a company always has one, and an agreement naming a Pty Ltd without its
 *     ACN is missing the only identifier that survives a name change.
 */
export function validateBusinessDetails(
  input: BusinessDetailsInput,
): { ok: true; value: BusinessDetails } | { ok: false; field: string; error: string } {
  const entity_type = input.entity_type;
  if (!isEntityType(entity_type)) {
    return { ok: false, field: "entity_type", error: "Choose how your business is set up." };
  }

  const firm_name = str(input.firm_name, 200);
  if (!firm_name) {
    return {
      ok: false,
      field: "firm_name",
      error:
        entity_type === "sole_trader"
          ? "Enter your registered business name, or your own name if you trade under it."
          : "Enter the full registered name of the entity.",
    };
  }

  const abnRaw = str(input.abn, 40);
  if (!abnRaw) return { ok: false, field: "abn", error: "Enter your ABN." };
  if (!isValidAbn(abnRaw)) {
    return {
      ok: false,
      field: "abn",
      error: "That ABN doesn't check out — it should be 11 digits. Check for a typo.",
    };
  }

  const acnRaw = str(input.acn, 40);
  const needsAcn = entity_type === "company";
  if (needsAcn && !acnRaw) {
    return { ok: false, field: "acn", error: "A company has an ACN — it's on your ASIC registration." };
  }
  if (acnRaw && !isValidAcn(acnRaw)) {
    return {
      ok: false,
      field: "acn",
      error: "That ACN doesn't check out — it should be 9 digits. Check for a typo.",
    };
  }

  const registered_address = str(input.registered_address, 300);
  if (!registered_address) {
    return {
      ok: false,
      field: "registered_address",
      error: "Enter the address for the entity — this is where formal notices go.",
    };
  }

  return {
    ok: true,
    value: {
      entity_type,
      firm_name,
      abn: formatAbn(abnRaw),
      acn: acnRaw ? formatAcn(acnRaw) : "",
      registered_address,
    },
  };
}

/**
 * True when the failure is a missing COLUMN rather than a missing table —
 * i.e. this migration has not been applied yet. Mirrors amlColumnMissing: the
 * caller retries without the new fields so onboarding keeps working while the
 * SQL is pending.
 */
export function introducerEntityColumnMissing(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === "PGRST204" || e.code === "42703") return true;
  const msg = (e.message ?? "").toLowerCase();
  return msg.includes("could not find the") && msg.includes("column");
}
