import { describe, it, expect, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { findTfnBoxes, redactTfnsInImages, type OcrWord } from "./tfn-redact-image";

const w = (text: string, line: number, x0: number): OcrWord => ({ text, line, x0, y0: 10, x1: x0 + 50, y1: 30 });

describe("findTfnBoxes", () => {
  it("finds a spaced TFN that passes the checksum", () => {
    // 123 456 782 is a synthetic number that satisfies the ATO checksum.
    const boxes = findTfnBoxes([w("TFN", 0, 0), w("123", 0, 60), w("456", 0, 120), w("782", 0, 180)]);
    expect(boxes).toEqual([{ x0: 60, y0: 10, x1: 230, y1: 30 }]);
  });

  it("forgives OCR letter swaps", () => {
    expect(findTfnBoxes([w("l23", 0, 0), w("4S6", 0, 60), w("782", 0, 120)])).toHaveLength(1);
  });

  it("takes nine digits beside a TFN label even if a misread breaks the checksum", () => {
    expect(findTfnBoxes([w("TFN", 0, 0), w("123", 0, 60), w("456", 0, 120), w("789", 0, 180)])).toHaveLength(1);
  });

  it("leaves other nine-digit numbers alone when there is no label and no checksum", () => {
    expect(findTfnBoxes([w("Account", 0, 0), w("123", 0, 60), w("456", 0, 120), w("789", 0, 180)])).toHaveLength(0);
  });

  it("does not join digits across lines, or take an ABN", () => {
    expect(findTfnBoxes([w("123", 0, 0), w("456", 1, 0), w("782", 2, 0)])).toHaveLength(0);
    expect(findTfnBoxes([w("22", 0, 0), w("119", 0, 60), w("632", 0, 120), w("825", 0, 180)])).toHaveLength(0);
  });
});

// Real OCR end to end. Opt-in: it downloads tesseract's English model (~4MB).
const RUN = process.env.RUN_OCR_TESTS === "1";
describe.skipIf(!RUN)("redactTfnsInImages with tesseract (RUN_OCR_TESTS=1)", () => {
  const fixture = new Uint8Array(readFileSync(path.join(__dirname, "../test/fixtures/tfn-scanned-statement.pdf")));
  afterAll(async () => (await import("./ocr-tesseract")).closeOcr());

  it("removes the TFN from the pixels and keeps everything else readable", async () => {
    const { tesseractOcr } = await import("./ocr-tesseract");
    const r = await redactTfnsInImages(fixture, tesseractOcr);
    expect(r.scanned).toBe(1);
    expect(r.removed).toBe(1);
    expect(r.verifyFailed).toBeFalsy();

    // Read the redacted file back from scratch.
    const again = await redactTfnsInImages(r.bytes, tesseractOcr);
    expect(again.scanned).toBe(1);
    expect(again.removed).toBe(0);

    // The rest of the page survived: name, ABN and account number are still there.
    const { PDFDocument, PDFName } = await import("pdf-lib");
    const jpeg = (await import("jpeg-js")).default;
    const pdf = await PDFDocument.load(r.bytes);
    const xo = pdf.getPages()[0]!.node.Resources()!.lookup(PDFName.of("XObject")) as unknown as { asMap(): Map<unknown, unknown> };
    const stream = pdf.context.lookup([...xo.asMap().values()][0] as never) as import("pdf-lib").PDFRawStream;
    const img = jpeg.decode(stream.contents, { useTArray: true });
    const words = await tesseractOcr(new Uint8Array(jpeg.encode(img, 92).data));
    const text = words.map((x) => x.text).join(" ");
    expect(text).toContain("Example");
    expect(text).toContain("632");
    expect(text).toContain("15564708");
    expect(text).not.toMatch(/123\s?456\s?782/);
  }, 120_000);
});
