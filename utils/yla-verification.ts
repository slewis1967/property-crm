/**
 * YLA submission verification — the pure logic behind the "verification agent".
 *
 * YLA reject the WHOLE application if any document is missing or below their
 * standard (PDF, <1MB, named to reflect the document, no phone screenshots, not
 * rotated, not password-locked), and a rejection costs a full week. This module
 * turns raw per-document facts into a pass/fail with specific, fixable issues.
 *
 * Split in two: cheap deterministic STRUCTURAL checks (done on the bytes) and an
 * AI VISUAL check (legibility / correct document / screenshot / rotation) whose
 * raw verdict is parsed here. The I/O — fetching bytes, calling the model —
 * lives in the route; everything here is pure and unit-tested.
 */
import { YLA_DOCUMENTS, YLA_MAX_BYTES } from "./yla-documents";

/** What each document is meant to be — drives the AI "correct type?" check. */
export const EXPECTED_DOC_DESCRIPTION: Record<string, string> = {
  payslip: "a recent payslip / payroll income advice",
  photo_id: "photo identification — an Australian driver licence or passport",
  // Deliberately still accepts the "PAYG payment summary" title — that is what
  // myGov itself called the same download in earlier years — while ruling out
  // the two things clients actually send by mistake.
  ato_income:
    "an ATO Income Statement downloaded from the ATO section of myGov (it may be titled " +
    '"Income statement" or "PAYG payment summary"). A tax return, a notice of assessment, ' +
    "or a payment summary issued by an employer is NOT this document",
  super_statement: "a superannuation account statement",
};

/**
 * Slot-specific overrides. YLA want a licence's FRONT **and** BACK as two files
 * (yla-documents.ts names them "Photo ID 1 Front" / "Photo ID 2 Back"), but the
 * generic photo_id description says "photo identification", so the model marked
 * a perfectly good back-of-licence down for having no photograph on it —
 * "not legible", "doesn't look like the expected document". Two real clients
 * were nearly emailed and told to re-photograph a compliant document because of
 * it. Describe each slot as what it actually is.
 */
const EXPECTED_BY_SLOT: Record<string, Record<number, string>> = {
  photo_id: {
    1: "the FRONT of an Australian driver licence (or the photo page of a passport) — the side carrying the photograph, name and licence number",
    2:
      "the BACK of an Australian driver licence — the reverse side carrying the card number, licence classes and conditions. " +
      "It correctly has NO photograph and no date of birth on it; that is expected and is not a fault",
  },
};

/** `slot` is the 1-based index within the document type (payslip 1 vs 2, licence front vs back). */
export function expectedDescription(docKey: string, slot?: number): string {
  const bySlot = slot != null ? EXPECTED_BY_SLOT[docKey]?.[slot] : undefined;
  return bySlot ?? EXPECTED_DOC_DESCRIPTION[docKey] ?? "the required document";
}

// ── Structural checks (deterministic) ────────────────────────────────────────
export type StructuralInput = {
  mime: string;
  sizeBytes: number;
  /** First bytes start with "%PDF". */
  isPdfHeader: boolean;
  /** PDF trailer contains an /Encrypt entry → password/permissions protected. */
  encrypted: boolean;
};

export function structuralIssues(d: StructuralInput): string[] {
  const issues: string[] = [];
  if (!(d.mime === "application/pdf" || d.isPdfHeader)) issues.push("not a PDF file");
  if (d.sizeBytes > YLA_MAX_BYTES) {
    issues.push(`over YLA's 1MB limit (${(d.sizeBytes / 1024 / 1024).toFixed(2)}MB)`);
  }
  if (d.encrypted) issues.push("password-protected / encrypted — YLA can't open it");
  return issues;
}

/** Scan raw PDF bytes for an /Encrypt entry. Cheap and good enough — a false
 *  positive only means a doc gets manually re-checked, never a bad send. */
export function looksEncrypted(bytes: Uint8Array): boolean {
  const needle = "/Encrypt";
  const hay = Buffer.from(bytes).toString("latin1");
  return hay.includes(needle);
}

export function hasPdfHeader(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46; // %PDF
}

// ── AI visual check ──────────────────────────────────────────────────────────
export type VisualVerdict = {
  legible: boolean;
  correctType: boolean;
  isScreenshot: boolean;
  rotated: boolean;
  /** ATO statements only: the financial year printed on it, e.g. "2025-26". */
  financialYear?: string | null;
  note?: string;
};

export function visualCheckPrompt(docKey: string, slot?: number): string {
  const expected = expectedDescription(docKey, slot);
  const lines = [
    "You are quality-checking ONE document before it is submitted to a mortgage assessor who REJECTS the entire application if any document is substandard.",
    `This document is supposed to be ${expected}.`,
    "Judge it ONLY against that description — a document is not at fault for lacking something the description says it will not have.",
    "Assess only what you can actually see. Reply with STRICT JSON and nothing else:",
    jsonShape(docKey),
    "- legible: is the text clearly readable (not blurry, dark, cut off)?",
    `- correctType: does it genuinely appear to be ${expected}?`,
    "- isScreenshot: is it a photo or screenshot of a phone/computer screen (status bar, app chrome) rather than an original document?",
    "- rotated: is it sideways or upside down?",
  ];
  if (docKey === "ato_income") {
    lines.push(
      '- financialYear: the financial year the statement covers, as printed on it, in "YYYY-YY" form (e.g. "2025-26"). Use null if it genuinely is not shown.',
    );
  }
  return lines.join("\n");
}

function jsonShape(docKey: string): string {
  const fields = [
    '"legible": true/false',
    '"correctType": true/false',
    '"isScreenshot": true/false',
    '"rotated": true/false',
  ];
  if (docKey === "ato_income") fields.push('"financialYear": "<YYYY-YY or null>"');
  fields.push('"note": "<short reason for any problem, else empty>"');
  return `{${fields.join(", ")}}`;
}

/** Parse the model's reply into a VisualVerdict, defaulting UNKNOWN fields to
 *  the SAFE value (a problem) so a garbled reply never waves a bad doc through. */
export function parseVisualVerdict(raw: string): VisualVerdict {
  let obj: Record<string, unknown> = {};
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) obj = JSON.parse(m[0]);
  } catch {
    /* fall through to safe defaults */
  }
  const bool = (v: unknown, dflt: boolean) => (typeof v === "boolean" ? v : dflt);
  return {
    legible: bool(obj.legible, false),
    correctType: bool(obj.correctType, false),
    isScreenshot: bool(obj.isScreenshot, true),
    rotated: bool(obj.rotated, true),
    financialYear: normaliseFinancialYear(obj.financialYear),
    note: typeof obj.note === "string" ? obj.note.slice(0, 200) : undefined,
  };
}

/**
 * Canonicalise whatever the model reports into "YYYY-YY", so "2025-2026",
 * "2025/26", "FY25-26" and an en-dash all compare equal. Returns null when the
 * year can't be read — deliberately NOT treated as a fault (see
 * atoYearCoverageIssues).
 */
export function normaliseFinancialYear(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/[‐-―]/g, "-").trim();
  // 2025-26 | 2025-2026 | 2025/26 — the leading year is what matters.
  const m = s.match(/(?:^|\D)(20\d{2})\s*[-/]\s*(\d{2}|\d{4})(?:\D|$)/);
  if (!m) return null;
  const start = Number(m[1]);
  const endRaw = m[2]!;
  const end = endRaw.length === 4 ? Number(endRaw) : Math.floor(start / 100) * 100 + Number(endRaw);
  // An Australian financial year always spans exactly two consecutive years.
  if (end !== start + 1) return null;
  return `${start}-${String(end % 100).padStart(2, "0")}`;
}

/**
 * Cross-document check: YLA require the PREVIOUS **and** the CURRENT financial
 * year's ATO Income Statement per applicant. Every per-document check can pass
 * while the pair covers the same year twice — which is exactly what happened to
 * NK-10010, where an applicant with two employers uploaded two 2025-26
 * statements and no 2024-25. Nothing in the file itself is wrong, so only the
 * pair can reveal it.
 *
 * Deliberately narrow: flags ONLY a positively-detected duplicate year. An
 * unreadable year is not evidence of a problem, and a false positive here costs
 * a real client a pointless "re-upload this" email — the failure mode this
 * module has already been bitten by once.
 */
export type AtoYearInput = { applicant: string; financialYear: string | null };

export function atoYearCoverageIssues(docs: AtoYearInput[]): Map<number, string> {
  const out = new Map<number, string>();
  const byApplicant = new Map<string, number[]>();
  docs.forEach((d, i) => {
    const list = byApplicant.get(d.applicant) ?? [];
    list.push(i);
    byApplicant.set(d.applicant, list);
  });

  for (const indexes of byApplicant.values()) {
    const seen = new Map<string, number[]>();
    for (const i of indexes) {
      const fy = docs[i]!.financialYear;
      if (!fy) continue;
      const list = seen.get(fy) ?? [];
      list.push(i);
      seen.set(fy, list);
    }
    for (const [fy, dupes] of seen) {
      if (dupes.length < 2) continue;
      for (const i of dupes) {
        out.set(
          i,
          `both ATO Income Statements are for ${fy} — YLA need the previous AND the current financial year`,
        );
      }
    }
  }
  return out;
}

export function visualIssues(v: VisualVerdict): string[] {
  const issues: string[] = [];
  if (!v.legible) issues.push("not clearly legible");
  if (!v.correctType) issues.push("doesn't look like the expected document");
  if (v.isScreenshot) issues.push("looks like a phone/screen screenshot");
  if (v.rotated) issues.push("rotated / not upright");
  return issues;
}

// ── Aggregate result ─────────────────────────────────────────────────────────
export type DocVerdict = {
  docKey: string;
  applicant: string;
  filename: string;
  sizeBytes: number;
  issues: string[];
  pass: boolean;
};

export type VerificationResult = {
  complete: boolean;
  pass: boolean;
  received: number;
  total: number;
  missing: string[];
  docs: DocVerdict[];
  summary: string;
};

export function docVerdict(input: {
  docKey: string;
  applicant: string;
  filename: string;
  sizeBytes: number;
  structural: string[];
  visual: string[];
}): DocVerdict {
  const issues = [...input.structural, ...input.visual];
  return {
    docKey: input.docKey,
    applicant: input.applicant,
    filename: input.filename,
    sizeBytes: input.sizeBytes,
    issues,
    pass: issues.length === 0,
  };
}

/** Total document slots one applicant must provide (payslip×2, id×2, ato×2, super×1). */
export function slotsPerApplicant(): number {
  return YLA_DOCUMENTS.reduce((n, d) => n + d.count, 0);
}

export function buildResult(args: {
  applicantCount: number;
  received: number;
  missing: string[];
  docs: DocVerdict[];
}): VerificationResult {
  const total = slotsPerApplicant() * Math.max(1, args.applicantCount);
  const complete = args.missing.length === 0 && args.received >= total;
  const allDocsPass = args.docs.every((d) => d.pass);
  const pass = complete && allDocsPass;

  let summary: string;
  if (!complete) {
    summary = `Not ready — ${args.missing.length} document${args.missing.length === 1 ? "" : "s"} still outstanding.`;
  } else if (pass) {
    summary = `All ${args.received} documents pass YLA's standard — ready to submit.`;
  } else {
    const failing = args.docs.filter((d) => !d.pass).length;
    summary = `${failing} document${failing === 1 ? "" : "s"} need fixing before YLA submission.`;
  }

  return { complete, pass, received: args.received, total, missing: args.missing, docs: args.docs, summary };
}
