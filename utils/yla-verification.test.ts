import { describe, it, expect } from "vitest";
import {
  structuralIssues,
  looksEncrypted,
  hasPdfHeader,
  parseVisualVerdict,
  visualIssues,
  docVerdict,
  buildResult,
  slotsPerApplicant,
} from "./yla-verification";

describe("structural checks", () => {
  it("passes a small unencrypted PDF", () => {
    expect(structuralIssues({ mime: "application/pdf", sizeBytes: 500_000, isPdfHeader: true, encrypted: false })).toEqual([]);
  });
  it("flags non-PDF, oversize, and encrypted", () => {
    const issues = structuralIssues({ mime: "image/jpeg", sizeBytes: 2_000_000, isPdfHeader: false, encrypted: true });
    expect(issues.some((i) => /not a PDF/.test(i))).toBe(true);
    expect(issues.some((i) => /1MB limit/.test(i))).toBe(true);
    expect(issues.some((i) => /password-protected/.test(i))).toBe(true);
  });
  it("accepts a PDF by header even if mime is wrong", () => {
    expect(structuralIssues({ mime: "application/octet-stream", sizeBytes: 1000, isPdfHeader: true, encrypted: false })).toEqual([]);
  });
  it("hasPdfHeader / looksEncrypted read the bytes", () => {
    expect(hasPdfHeader(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe(true);
    expect(hasPdfHeader(new Uint8Array([0x89, 0x50]))).toBe(false);
    expect(looksEncrypted(new Uint8Array(Buffer.from("...\n/Encrypt 12 0 R\n...")))).toBe(true);
    expect(looksEncrypted(new Uint8Array(Buffer.from("%PDF-1.4 no crypt here")))).toBe(false);
  });
});

describe("parseVisualVerdict — safe defaults", () => {
  it("parses clean JSON", () => {
    const v = parseVisualVerdict('{"legible":true,"correctType":true,"isScreenshot":false,"rotated":false,"note":""}');
    expect(visualIssues(v)).toEqual([]);
  });
  it("treats missing/garbled fields as problems (never waves a bad doc through)", () => {
    const v = parseVisualVerdict("not json at all");
    // unknown → legible false, isScreenshot true, rotated true, correctType false
    expect(v.legible).toBe(false);
    expect(v.isScreenshot).toBe(true);
    expect(visualIssues(v).length).toBeGreaterThan(0);
  });
  it("surfaces each visual problem", () => {
    const v = parseVisualVerdict('{"legible":false,"correctType":false,"isScreenshot":true,"rotated":true}');
    const issues = visualIssues(v);
    expect(issues).toContain("not clearly legible");
    expect(issues).toContain("looks like a phone/screen screenshot");
    expect(issues).toContain("rotated / not upright");
  });
});

describe("buildResult", () => {
  const good = (docKey: string, applicant: string) =>
    docVerdict({ docKey, applicant, filename: `${docKey}.pdf`, sizeBytes: 100, structural: [], visual: [] });

  it("is not ready when documents are missing", () => {
    const r = buildResult({ applicantCount: 1, received: 3, missing: ["Applicant: Super statement"], docs: [good("payslip", "A")] });
    expect(r.complete).toBe(false);
    expect(r.pass).toBe(false);
    expect(r.summary).toMatch(/outstanding/);
  });

  it("passes only when complete AND every doc passes", () => {
    const total = slotsPerApplicant(); // 7
    const docs = Array.from({ length: total }, () => good("payslip", "A"));
    const r = buildResult({ applicantCount: 1, received: total, missing: [], docs });
    expect(r.complete).toBe(true);
    expect(r.pass).toBe(true);
    expect(r.summary).toMatch(/ready to submit/i);
  });

  it("fails when complete but a doc has issues", () => {
    const total = slotsPerApplicant();
    const docs = Array.from({ length: total }, (_, i) =>
      i === 0
        ? docVerdict({ docKey: "payslip", applicant: "A", filename: "x.pdf", sizeBytes: 9, structural: ["over YLA's 1MB limit"], visual: [] })
        : good("payslip", "A"),
    );
    const r = buildResult({ applicantCount: 1, received: total, missing: [], docs });
    expect(r.complete).toBe(true);
    expect(r.pass).toBe(false);
    expect(r.summary).toMatch(/need fixing/);
  });

  it("scales the total by applicant count (joint = 14)", () => {
    const r = buildResult({ applicantCount: 2, received: 0, missing: [], docs: [] });
    expect(r.total).toBe(slotsPerApplicant() * 2);
  });
});
