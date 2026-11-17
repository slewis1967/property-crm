/**
 * Channel-partner agreement: which version is current, how it is filled in for
 * one firm, and what an acceptance must contain. Pure (no Supabase), so the
 * portal page, the acceptance route and the tests share one definition.
 *
 * THE GATE. A firm may use the portal only once `partners.agreement_ref` equals
 * PARTNER_AGREEMENT_VERSION and `agreement_signed_at` is set. The portal's own
 * acceptance writes both; staff can also write them on /admin/partners when the
 * agreement was signed outside the portal (paper or DocuSign). Bumping the
 * version therefore sends every firm back through acceptance on its next click.
 *
 * WHAT IS RECORDED. The acceptance row stores the exact text the signatory saw
 * (with their firm's details filled in) and its SHA-256, so "which words did
 * they agree to" never depends on what this file says later.
 */
import { TIER_DEFINITIONS, normaliseTier, type PartnerTier } from "./partner";
import { PARTNER_AGREEMENT_TEMPLATE } from "./partner-agreement-text";

import { PARTNER_AGREEMENT_VERSION } from "./partner-agreement-version";

export { PARTNER_AGREEMENT_VERSION, agreementIsCurrent } from "./partner-agreement-version";

// ── Filling in the firm's details ────────────────────────────────────────────

export type AgreementParticulars = {
  entityName: string | null;
  abn: string | null;
  noticeEmail: string | null;
  tier: PartnerTier | string | null;
  whiteLabel: boolean;
};

const TO_ENTER = "(entered when you accept)";

/**
 * The agreement text for one firm. With nulls (the preview before acceptance)
 * the blanks read "(entered when you accept)"; with every value present the
 * result has no blank left, which `unfilledBlanks` checks before anything is
 * stored.
 */
export function renderAgreement(p: AgreementParticulars, template: string = PARTNER_AGREEMENT_TEMPLATE): string {
  const entity = p.entityName?.trim() || TO_ENTER;
  const abn = p.abn ? formatAbn(p.abn) : TO_ENTER;
  const email = p.noticeEmail?.trim() || TO_ENTER;
  const tier = TIER_DEFINITIONS[normaliseTier(p.tier)].label;

  return template
    .replace("**Partner**: [Partner legal entity] ABN [ ]", `**Partner**: ${entity} ABN ${abn}`)
    .replace("| Partner legal entity / ABN | [ ] |", `| Partner legal entity / ABN | ${entity}, ABN ${abn} |`)
    .replace("| Notice email (Partner) | [ ] |", `| Notice email (Partner) | ${email} |`)
    .replace("| Tier | Basic / Professional / Enterprise |", `| Tier | ${tier} |`)
    .replace(
      "| White-label | Yes / No. Configured by NextKey on request; Enterprise tier only |",
      `| White-label | ${p.whiteLabel ? "Yes" : "No"}. Configured by NextKey on request; Enterprise tier only |`,
    );
}

/** Blanks still present in a rendered agreement. Must be empty before it is stored. */
export function unfilledBlanks(text: string): string[] {
  const found: string[] = [];
  for (const marker of ["[ ]", "[Partner legal entity]", TO_ENTER, "Yes / No", "Basic / Professional / Enterprise"]) {
    if (text.includes(marker)) found.push(marker);
  }
  return found;
}

// ── ABN ──────────────────────────────────────────────────────────────────────

/** Digits only, or null. */
export function normaliseAbn(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const digits = input.replace(/\s+/g, "");
  return /^\d{11}$/.test(digits) ? digits : null;
}

/** The ATO's ABN checksum: subtract 1 from the first digit, weight, mod 89. */
export function isValidAbn(input: unknown): boolean {
  const abn = normaliseAbn(input);
  if (!abn) return false;
  const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
  const digits = abn.split("").map(Number);
  digits[0] -= 1;
  const sum = digits.reduce((acc, d, i) => acc + d * weights[i], 0);
  return sum % 89 === 0;
}

export function formatAbn(input: string): string {
  const abn = normaliseAbn(input);
  if (!abn) return input;
  return `${abn.slice(0, 2)} ${abn.slice(2, 5)} ${abn.slice(5, 8)} ${abn.slice(8)}`;
}

// ── The acceptance form ──────────────────────────────────────────────────────

export type AcceptanceInput = {
  signerName: string;
  signerTitle: string;
  entityName: string;
  abn: string;
};

function text(v: unknown, min: number, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s.length >= min && s.length <= max ? s : null;
}

/**
 * Validate what the signatory submitted. Both ticks are required: that they
 * have read the agreement, and that they have authority to bind the firm.
 * The version they were shown must be the current one, so a page left open
 * across a version change cannot accept the old text under the new number.
 */
export function parseAcceptance(body: Record<string, unknown>):
  | { ok: true; value: AcceptanceInput }
  | { ok: false; error: string } {
  if (body.version !== PARTNER_AGREEMENT_VERSION) {
    return { ok: false, error: "The agreement has been updated since this page loaded. Reload it and read the current version." };
  }
  const signerName = text(body.signerName, 2, 120);
  if (!signerName) return { ok: false, error: "Enter your full name." };
  const signerTitle = text(body.signerTitle, 2, 80);
  if (!signerTitle) return { ok: false, error: "Enter your position (for example Director)." };
  const entityName = text(body.entityName, 2, 200);
  if (!entityName) return { ok: false, error: "Enter your firm's legal entity name." };
  if (!isValidAbn(body.abn)) return { ok: false, error: "Enter a valid 11-digit ABN." };
  if (body.readAgreement !== true) return { ok: false, error: "Confirm you have read the agreement." };
  if (body.hasAuthority !== true) return { ok: false, error: "Confirm you are authorised to sign for your firm." };
  return { ok: true, value: { signerName, signerTitle, entityName, abn: normaliseAbn(body.abn)! } };
}

// ── Display ──────────────────────────────────────────────────────────────────

export type AgreementBlock =
  | { kind: "h1" | "h2"; text: string }
  | { kind: "p"; text: string }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "hr" };

/**
 * Split the agreement into blocks for display. It handles only what the
 * agreement uses (two heading levels, paragraphs, pipe tables, rules); the
 * text inside a block keeps its line breaks and `**bold**`, which the page
 * renders. Deliberately no general Markdown library: nothing here is user
 * input, and a small known subset is easier to check.
 */
export function agreementBlocks(text: string): AgreementBlock[] {
  const blocks: AgreementBlock[] = [];
  const chunks = text.replace(/\r\n/g, "\n").split(/\n\s*\n/);
  for (const raw of chunks) {
    const chunk = raw.replace(/\s+$/, "");
    if (!chunk.trim()) continue;
    if (chunk.trim() === "---") {
      blocks.push({ kind: "hr" });
    } else if (chunk.startsWith("## ")) {
      blocks.push({ kind: "h2", text: chunk.slice(3).trim() });
    } else if (chunk.startsWith("# ")) {
      blocks.push({ kind: "h1", text: chunk.slice(2).trim() });
    } else if (chunk.trimStart().startsWith("|")) {
      const lines = chunk.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("|"));
      const cells = (l: string) => l.replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
      const [head, , ...body] = lines;
      blocks.push({ kind: "table", header: cells(head ?? ""), rows: body.map(cells) });
    } else {
      blocks.push({ kind: "p", text: unwrapLines(chunk) });
    }
  }
  return blocks;
}

/**
 * The source text is hard-wrapped at ~110 characters. A line that starts a new
 * item (a clause number like "5.4", "(a)", "A.", "1." or a "- " bullet) keeps
 * its line break; any other line is a continuation and joins the line above.
 */
const NEW_ITEM = /^(\d+(\.\d+)*\.?\s|\([a-z]\)\s|[A-Z]\.\s|- )/;
export function unwrapLines(text: string): string {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (out.length === 0 || NEW_ITEM.test(line)) out.push(line.startsWith("- ") ? `• ${line.slice(2)}` : line);
    else out[out.length - 1] += ` ${line}`;
  }
  return out.join("\n");
}

/** `**bold**` → alternating plain/bold segments. */
export function boldSegments(text: string): { text: string; bold: boolean }[] {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((s) =>
    s.startsWith("**") && s.endsWith("**") ? { text: s.slice(2, -2), bold: true } : { text: s, bold: false },
  );
}
