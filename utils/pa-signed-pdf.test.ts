import { describe, it, expect, vi } from "vitest";
import { PDFDict, PDFDocument, PDFName, StandardFonts } from "pdf-lib";
import { deflateSync } from "node:zlib";
import type { PaApplicant, PaSignatureLine } from "./preliminary-assessments";
import type { SignatureMark } from "./signatures";

// stampPaPdf is pure; only renderPaPdf (not exercised here) touches storage.
vi.mock("./supabase", () => ({ supabase: {} }));

const { stampPaPdf, assignSignatureLines } = await import("./pa-signed-pdf");

const APPLICANTS: PaApplicant[] = [
  { name: "Marcia LIBMAN", email: "marcia@example.com" },
  { name: "Mark Benjamin LIBMAN", email: "mark@example.com" },
];
// Deliberately in the OPPOSITE order to the applicants: the parser lists rules
// in the order it meets them on the page, which is not a promise.
const LINES: PaSignatureLine[] = [
  { name: "MARK BENJAMIN LIBMAN", page: 3, x: 320, y: 92, width: 205 },
  { name: "marcia  libman", page: 3, x: 49, y: 92, width: 205 },
];

/** A stand-in for YLA's 4-page PA: text pages, two printed rules on the last. */
async function fixturePdf(pageCount = 4): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pageCount; i++) {
    const page = pdf.addPage([595.28, 841.89]);
    page.drawText(`Preliminary Assessment page ${i + 1}`, { x: 49, y: 780, size: 14, font });
  }
  const last = pdf.getPage(pageCount - 1);
  for (const [x, name] of [
    [49, "Marcia LIBMAN"],
    [320, "Mark Benjamin LIBMAN"],
  ] as const) {
    last.drawLine({ start: { x, y: 92 }, end: { x: x + 205, y: 92 }, thickness: 0.75 });
    last.drawText(name, { x, y: 80, size: 9, font });
  }
  return pdf.save();
}

/* A real, valid RGBA PNG built by hand (no image dependency): the same shape
 * as the 600x200 transparent canvas the signing page captures. */
function pngDataUri(width = 60, height = 20): string {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height); // filter byte 0 + transparent pixels
  for (let y = 0; y < height; y++) {
    const x = Math.floor((y / height) * width);
    raw.set([17, 24, 39, 255], y * (width * 4 + 1) + 1 + x * 4); // one diagonal ink stroke
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

const mark = (name: string, date = "6 Oct 2026"): SignatureMark => ({ image: pngDataUri(), name, date });

/** Image XObjects drawn on a page — how we tell a signature landed there. */
async function imagesOnPage(bytes: Uint8Array, pageIndex: number): Promise<number> {
  const pdf = await PDFDocument.load(bytes);
  const xobjects = pdf.getPage(pageIndex).node.Resources()?.lookupMaybe(PDFName.of("XObject"), PDFDict);
  return xobjects?.keys().length ?? 0;
}

describe("stampPaPdf", () => {
  it("returns the original bytes untouched when nobody has signed", async () => {
    const original = await fixturePdf();
    expect(await stampPaPdf(original, LINES, undefined, APPLICANTS)).toBe(original);
    expect(await stampPaPdf(original, LINES, [], APPLICANTS)).toBe(original);
    expect(await stampPaPdf(original, LINES, [null, null], APPLICANTS)).toBe(original);
  });

  it("appends exactly one record page and keeps every original page", async () => {
    const original = await fixturePdf();
    const signed = await stampPaPdf(
      original,
      LINES,
      [mark("Marcia LIBMAN"), mark("Mark Benjamin LIBMAN")],
      APPLICANTS,
    );
    const before = await PDFDocument.load(original);
    const after = await PDFDocument.load(signed);
    expect(after.getPageCount()).toBe(before.getPageCount() + 1);
    for (let i = 0; i < before.getPageCount(); i++) {
      expect(after.getPage(i).getSize()).toEqual(before.getPage(i).getSize());
    }
    expect(after.getPage(4).getSize()).toEqual({ width: 595.28, height: 841.89 });
  });

  it("draws each signature on the signature page as well as on the record page", async () => {
    const signed = await stampPaPdf(
      await fixturePdf(),
      LINES,
      [mark("Marcia LIBMAN"), mark("Mark Benjamin LIBMAN")],
      APPLICANTS,
    );
    expect(await imagesOnPage(signed, 3)).toBe(2);
    expect(await imagesOnPage(signed, 4)).toBe(2);
    // Untouched pages gain nothing.
    expect(await imagesOnPage(signed, 0)).toBe(0);
  });

  it("stamps only the applicant who has signed when the second is still outstanding", async () => {
    const signed = await stampPaPdf(await fixturePdf(), LINES, [null, mark("Mark Benjamin LIBMAN")], APPLICANTS);
    expect(await imagesOnPage(signed, 3)).toBe(1);
    expect(await imagesOnPage(signed, 4)).toBe(1);
    expect((await PDFDocument.load(signed)).getPageCount()).toBe(5);
  });

  it("does not throw with no signature lines at all — the record page still carries the signature", async () => {
    const signed = await stampPaPdf(await fixturePdf(), [], [mark("Marcia LIBMAN")], APPLICANTS);
    expect((await PDFDocument.load(signed)).getPageCount()).toBe(5);
    expect(await imagesOnPage(signed, 3)).toBe(0);
    expect(await imagesOnPage(signed, 4)).toBe(1);
  });

  it("ignores a line that points off the document or off the page", async () => {
    const bad: PaSignatureLine[] = [
      { name: "Marcia LIBMAN", page: 9, x: 49, y: 92, width: 205 },
      { name: "Mark Benjamin LIBMAN", page: 3, x: 500, y: 92, width: 400 },
    ];
    const signed = await stampPaPdf(
      await fixturePdf(),
      bad,
      [mark("Marcia LIBMAN"), mark("Mark Benjamin LIBMAN")],
      APPLICANTS,
    );
    expect(await imagesOnPage(signed, 3)).toBe(0);
    expect(await imagesOnPage(signed, 4)).toBe(2);
  });

  it("survives a signature image that is not a PNG, and a name the font cannot draw", async () => {
    const signed = await stampPaPdf(
      await fixturePdf(),
      LINES,
      [
        { image: "data:image/png;base64,bm90IGEgcG5n", name: "Nguyễn Thị Hoa 阮", date: "6 Oct 2026" },
        { image: "", name: "Mark Benjamin LIBMAN", date: "" },
      ],
      APPLICANTS,
    );
    const after = await PDFDocument.load(signed);
    expect(after.getPageCount()).toBe(5);
    expect(await imagesOnPage(signed, 3)).toBe(0);
  });

  it("fits a short rule without throwing", async () => {
    const short: PaSignatureLine[] = [{ name: "Marcia LIBMAN", page: 3, x: 49, y: 92, width: 40 }];
    const signed = await stampPaPdf(await fixturePdf(), short, [mark("Marcia LIBMAN")], APPLICANTS);
    expect(await imagesOnPage(signed, 3)).toBe(1);
  });

  it("starts a second record page rather than running off the bottom", async () => {
    const many: PaApplicant[] = Array.from({ length: 9 }, (_, i) => ({ name: `Signer ${i + 1}`, email: "" }));
    const signed = await stampPaPdf(
      await fixturePdf(),
      [],
      many.map((a) => mark(a.name)),
      many,
    );
    expect((await PDFDocument.load(signed)).getPageCount()).toBe(6);
  });
});

describe("assignSignatureLines", () => {
  it("matches by printed name, ignoring case and spacing, whatever order the lines are in", () => {
    expect(assignSignatureLines(LINES, APPLICANTS, 2)).toEqual([1, 0]);
  });

  it("falls back to position when no name matches", () => {
    const lines: PaSignatureLine[] = [
      { name: "M LIBMAN", page: 3, x: 49, y: 92, width: 205 },
      { name: "M B LIBMAN", page: 3, x: 320, y: 92, width: 205 },
    ];
    expect(assignSignatureLines(lines, APPLICANTS, 2)).toEqual([0, 1]);
  });

  it("never puts someone on a line that belongs to another applicant by name", () => {
    // Applicant 0's name is not printed anywhere; line 0 is applicant 1's.
    const lines: PaSignatureLine[] = [{ name: "Mark Benjamin LIBMAN", page: 3, x: 49, y: 92, width: 205 }];
    expect(assignSignatureLines(lines, APPLICANTS, 2)).toEqual([-1, 0]);
  });

  it("gives nobody a line when there are none", () => {
    expect(assignSignatureLines([], APPLICANTS, 2)).toEqual([-1, -1]);
  });
});
