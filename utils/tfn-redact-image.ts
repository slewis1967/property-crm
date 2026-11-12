/**
 * Removing a Tax File Number that lives in PIXELS — a scanned or photographed
 * statement, or a myGov page saved as a screenshot and wrapped in a PDF.
 *
 * utils/tfn-redact.ts handles the common case, a TFN in a PDF's text layer, by
 * deleting the operators that draw it. A scan has no text layer: the number is
 * part of an embedded image, so there is nothing for that module to find, and
 * until now such a document simply stayed held by the AI gate until a person
 * redacted it by hand.
 *
 * Here: pull each image out of the PDF, read it with OCR, find the TFN, paint
 * over those PIXELS in the image itself, and put the image back. The digits are
 * destroyed, not covered — there is no rectangle on top of an intact picture
 * that a PDF editor could move aside.
 *
 * DETECTION, in the same spirit as the text redactor:
 *   - a run of up to three digit groups on one OCR line that makes nine digits
 *     passing the ATO checksum, or
 *   - nine digits on a line that ALSO says "TFN" / "Tax file number" — OCR can
 *     misread a digit and break the checksum, and blanking a nine-digit number
 *     printed next to that label costs nothing.
 *
 * VERIFIED, not assumed: after painting, the image is read again, and if a TFN
 * can still be found the change is thrown away and the caller is told nothing
 * was removed — the document stays held. As with the text redactor, the failure
 * direction is "not sent", never "sent with the number in it".
 *
 * Supported images: JPEG (DCTDecode — what phones, scanners and our own portal
 * normaliser produce) and plain 8-bit Flate RGB/grey without a predictor.
 * Anything else is counted as `unsupported` and left for the gate.
 */
import { deflateSync } from "node:zlib";
import jpeg from "jpeg-js";
import { PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFDict, decodePDFRawStream } from "pdf-lib";
import { isTfn } from "./tfn-redact";

export type OcrWord = { text: string; line: number; x0: number; y0: number; x1: number; y1: number };
/** Reads a JPEG and returns its words with pixel boxes. Injected so tests and
 *  other OCR engines can stand in for tesseract. */
export type OcrFn = (jpegBytes: Uint8Array) => Promise<OcrWord[]>;

type Box = { x0: number; y0: number; x1: number; y1: number };

/** Images smaller than this on both sides are logos and icons, not documents. */
const MIN_EDGE = 300;
const LABEL = /\bTFN\b|tax\s*file\s*n(?:o|umber)/i;

/** A word as digits, forgiving the letters OCR most often swaps in. */
function digitsOf(word: string): string | null {
  const w = word.replace(/[.,:;'"()[\]-]+$|^[.,:;'"()[\]-]+/g, "");
  if (!w) return null;
  if (!/^[0-9OoIlSB]+$/.test(w) || !/\d/.test(w)) return null;
  return w.replace(/[Oo]/g, "0").replace(/[Il]/g, "1").replace(/S/g, "5").replace(/B/g, "8");
}

/** Boxes of every TFN found in OCR output. Exported for tests. */
export function findTfnBoxes(words: OcrWord[]): Box[] {
  const byLine = new Map<number, OcrWord[]>();
  for (const w of words) {
    const l = byLine.get(w.line) ?? [];
    l.push(w);
    byLine.set(w.line, l);
  }
  const boxes: Box[] = [];
  for (const line of byLine.values()) {
    line.sort((a, b) => a.x0 - b.x0);
    const labelled = LABEL.test(line.map((w) => w.text).join(" "));
    for (let i = 0; i < line.length; i++) {
      let digits = "";
      for (let j = i; j < Math.min(i + 3, line.length); j++) {
        const d = digitsOf(line[j]!.text);
        if (d === null) break;
        digits += d;
        if (digits.length > 9) break;
        if (digits.length === 9 && (isTfn(digits) || labelled)) {
          const span = line.slice(i, j + 1);
          boxes.push({
            x0: Math.min(...span.map((w) => w.x0)),
            y0: Math.min(...span.map((w) => w.y0)),
            x1: Math.max(...span.map((w) => w.x1)),
            y1: Math.max(...span.map((w) => w.y1)),
          });
          break;
        }
      }
    }
  }
  return boxes;
}

/** Fill boxes (padded) with black in an RGBA buffer. */
export function paintBoxes(rgba: Uint8Array, width: number, height: number, boxes: Box[]): void {
  for (const b of boxes) {
    const pad = Math.max(4, Math.round((b.y1 - b.y0) * 0.25));
    const x0 = Math.max(0, b.x0 - pad);
    const y0 = Math.max(0, b.y0 - pad);
    const x1 = Math.min(width, b.x1 + pad);
    const y1 = Math.min(height, b.y1 + pad);
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const o = (y * width + x) * 4;
        rgba[o] = 0;
        rgba[o + 1] = 0;
        rgba[o + 2] = 0;
        rgba[o + 3] = 255;
      }
    }
  }
}

type Decoded = { width: number; height: number; rgba: Uint8Array; kind: "jpeg" | "flate"; channels: number };

function filterName(dict: PDFDict): string | null {
  const f = dict.get(PDFName.of("Filter"));
  if (f instanceof PDFName) return f.asString();
  const arr = (f as { asArray?: () => unknown[] } | undefined)?.asArray?.();
  if (arr && arr.length === 1 && arr[0] instanceof PDFName) return (arr[0] as PDFName).asString();
  return null;
}

function num(dict: PDFDict, key: string): number | null {
  const v = dict.get(PDFName.of(key));
  return v instanceof PDFNumber ? v.asNumber() : null;
}

function decodeImage(stream: PDFRawStream): Decoded | null {
  const dict = stream.dict;
  const width = num(dict, "Width");
  const height = num(dict, "Height");
  if (!width || !height || (width < MIN_EDGE && height < MIN_EDGE)) return null;
  const filter = filterName(dict);

  if (filter === "/DCTDecode") {
    try {
      const img = jpeg.decode(stream.contents, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 1024 });
      return { width: img.width, height: img.height, rgba: img.data, kind: "jpeg", channels: 4 };
    } catch {
      return null;
    }
  }

  if (filter === "/FlateDecode" && num(dict, "BitsPerComponent") === 8) {
    const parms = dict.get(PDFName.of("DecodeParms")) as PDFDict | undefined;
    const predictor = parms instanceof PDFDict ? num(parms, "Predictor") : null;
    if (predictor && predictor > 1) return null;
    let raw: Uint8Array;
    try {
      raw = decodePDFRawStream(stream).decode();
    } catch {
      return null;
    }
    const channels = raw.length / (width * height);
    if (channels !== 1 && channels !== 3) return null;
    const rgba = new Uint8Array(width * height * 4);
    for (let p = 0; p < width * height; p++) {
      const r = raw[p * channels]!;
      rgba[p * 4] = r;
      rgba[p * 4 + 1] = channels === 3 ? raw[p * 3 + 1]! : r;
      rgba[p * 4 + 2] = channels === 3 ? raw[p * 3 + 2]! : r;
      rgba[p * 4 + 3] = 255;
    }
    return { width, height, rgba, kind: "flate", channels };
  }
  return null;
}

function toJpeg(d: { width: number; height: number; rgba: Uint8Array }, quality: number): Uint8Array {
  return new Uint8Array(jpeg.encode({ width: d.width, height: d.height, data: d.rgba }, quality).data);
}

function encodeBack(d: Decoded): Uint8Array {
  if (d.kind === "jpeg") return toJpeg(d, 88);
  const px = d.width * d.height;
  const raw = new Uint8Array(px * d.channels);
  for (let p = 0; p < px; p++) {
    raw[p * d.channels] = d.rgba[p * 4]!;
    if (d.channels === 3) {
      raw[p * 3 + 1] = d.rgba[p * 4 + 1]!;
      raw[p * 3 + 2] = d.rgba[p * 4 + 2]!;
    }
  }
  return new Uint8Array(deflateSync(raw));
}

export type ImageRedactionResult = {
  bytes: Uint8Array;
  /** TFNs removed. 0 = none found OR none could be removed safely. */
  removed: number;
  /** Images read with OCR. 0 means there was nothing to look at. */
  scanned: number;
  /** Images in a format this cannot rewrite — left for the gate. */
  unsupported: number;
  /** A TFN was found but survived the paint and the change was discarded. */
  verifyFailed?: boolean;
  unreadable?: boolean;
};

export async function redactTfnsInImages(input: Uint8Array, ocr: OcrFn): Promise<ImageRedactionResult> {
  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(input, { ignoreEncryption: true });
  } catch {
    return { bytes: input, removed: 0, scanned: 0, unsupported: 0, unreadable: true };
  }

  let removed = 0;
  let scanned = 0;
  let unsupported = 0;
  let verifyFailed = false;
  const seen = new Set<string>();

  for (const page of pdf.getPages()) {
    const xobjects = page.node.Resources()?.lookup(PDFName.of("XObject"));
    if (!(xobjects instanceof PDFDict)) continue;
    for (const [, ref] of xobjects.asMap()) {
      const key = String(ref);
      if (seen.has(key)) continue; // one image drawn on several pages
      seen.add(key);
      const stream = pdf.context.lookup(ref as never);
      if (!(stream instanceof PDFRawStream)) continue;
      if (stream.dict.get(PDFName.of("Subtype")) !== PDFName.of("Image")) continue;

      const decoded = decodeImage(stream);
      if (!decoded) {
        const w = num(stream.dict, "Width") ?? 0;
        const h = num(stream.dict, "Height") ?? 0;
        if (w >= MIN_EDGE || h >= MIN_EDGE) unsupported++;
        continue;
      }

      scanned++;
      const boxes = findTfnBoxes(await ocr(toJpeg(decoded, 92)));
      if (boxes.length === 0) continue;

      paintBoxes(decoded.rgba, decoded.width, decoded.height, boxes);
      // Read it again. A box that missed the number is not a redaction.
      if (findTfnBoxes(await ocr(toJpeg(decoded, 92))).length > 0) {
        verifyFailed = true;
        continue;
      }

      const bytes = encodeBack(decoded);
      const dict = pdf.context.obj({}) as unknown as PDFDict;
      for (const [k, v] of stream.dict.asMap()) {
        const name = k.asString();
        if (name === "/Length" || name === "/DecodeParms" || name === "/Filter") continue;
        dict.set(k, v);
      }
      dict.set(PDFName.of("Filter"), PDFName.of(decoded.kind === "jpeg" ? "DCTDecode" : "FlateDecode"));
      dict.set(PDFName.of("Length"), PDFNumber.of(bytes.length));
      pdf.context.assign(ref as never, PDFRawStream.of(dict, bytes));
      removed += boxes.length;
    }
  }

  if (removed === 0) return { bytes: input, removed: 0, scanned, unsupported, verifyFailed };
  return { bytes: await pdf.save({ useObjectStreams: false }), removed, scanned, unsupported, verifyFailed };
}
