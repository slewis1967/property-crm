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
  ato_income: "an ATO Income Statement or PAYG payment summary (from myGov)",
  super_statement: "a superannuation account statement",
};

export function expectedDescription(docKey: string): string {
  return EXPECTED_DOC_DESCRIPTION[docKey] ?? "the required document";
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
  note?: string;
};

export function visualCheckPrompt(docKey: string): string {
  const expected = expectedDescription(docKey);
  return [
    "You are quality-checking ONE document before it is submitted to a mortgage assessor who REJECTS the entire application if any document is substandard.",
    `This document is supposed to be ${expected}.`,
    "Assess only what you can actually see. Reply with STRICT JSON and nothing else:",
    '{"legible": true/false, "correctType": true/false, "isScreenshot": true/false, "rotated": true/false, "note": "<short reason for any problem, else empty>"}',
    "- legible: is the text clearly readable (not blurry, dark, cut off)?",
    `- correctType: does it genuinely appear to be ${expected}?`,
    "- isScreenshot: is it a photo or screenshot of a phone/computer screen (status bar, app chrome) rather than an original document?",
    "- rotated: is it sideways or upside down?",
  ].join("\n");
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
    note: typeof obj.note === "string" ? obj.note.slice(0, 200) : undefined,
  };
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
