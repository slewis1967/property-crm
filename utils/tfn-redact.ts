/**
 * Removing a Tax File Number from a client's PDF.
 *
 * The gate ([[yla-verification]] `tfnBlocker`) stops a TFN reaching YLA; this is
 * what clears the gate. It does not COVER the number — it deletes the operators
 * that draw it, so there is nothing left underneath to recover. A black
 * rectangle over live text is not redaction, it is a rectangle.
 *
 * WHY IT IS HARDER THAN A STRING REPLACE. A myGov statement is printed by the
 * client's browser (Chrome/Skia) into Identity-H CID fonts: every character is
 * emitted as its own `<XX> Tj` where XX is a glyph index, not a character. The
 * digits appear nowhere in the file as text — searching the bytes for "342 491
 * 216" finds nothing, in the original or in a redacted copy, which is why that
 * test proves nothing either way. The characters only exist once each font's
 * ToUnicode CMap is used to map glyph indices back to Unicode.
 *
 * So: map the glyphs, read the page as text, find the number, and blank exactly
 * the show operators that produced it. Each is overwritten with spaces of the
 * same length, which keeps every other byte offset valid and leaves the
 * surrounding `Td` cursor moves intact, so nothing else on the page shifts.
 *
 * DETECTION IS THE ATO'S OWN CHECKSUM, not "nine digits in a row". An employee
 * number, a member account number, a BSB and an ABN all sit on these documents
 * and none of them may be destroyed. The checksum makes a false positive rare
 * and, paired with the label, rarer still.
 *
 * LIMIT, stated plainly: this reads a TEXT layer. A photographed or scanned
 * statement has the number in pixels and nothing here will find it — those are
 * caught by the AI gate instead and stay held. That is the safe direction to
 * fail: a document this cannot clean is one that does not get sent.
 */
import { deflateSync } from "node:zlib";
import { PDFDocument, PDFName, PDFNumber, PDFRawStream, decodePDFRawStream } from "pdf-lib";

/**
 * The ATO's TFN checksum. Weighted digits must sum to a multiple of 11.
 * A random nine-digit number passes one time in eleven; combined with the fact
 * that we only ever act on what the gate already flagged, that is tight enough.
 */
export function isTfn(digits: string): boolean {
  if (!/^\d{9}$/.test(digits)) return false;
  const weights = [1, 4, 3, 7, 5, 8, 6, 9, 10];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(digits[i]) * weights[i]!;
  return sum % 11 === 0;
}

/** Every TFN-looking run in a string, as {index, length, digits}. Exported for
 *  tests and for callers that only want to know whether one is present. */
export function findTfns(text: string): { index: number; length: number; digits: string }[] {
  const out: { index: number; length: number; digits: string }[] = [];
  // Allow the spacing myGov uses ("342 491 216") without swallowing a whole
  // table of figures: digits and single spaces only.
  for (const m of text.matchAll(/\d[\d ]{7,13}\d/g)) {
    const digits = m[0].replace(/\D/g, "");
    if (digits.length === 9 && isTfn(digits)) out.push({ index: m.index!, length: m[0].length, digits });
  }
  return out;
}

/** Parse a ToUnicode CMap: glyph code → the character it draws. */
export function parseToUnicode(src: string): Map<number, string> {
  const map = new Map<number, string>();
  for (const block of src.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const p of block[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const chars = (p[2]!.match(/.{4}/g) ?? []).map((h) => String.fromCharCode(parseInt(h, 16)));
      map.set(parseInt(p[1]!, 16), chars.join(""));
    }
  }
  for (const block of src.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    for (const r of block[1]!.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const lo = parseInt(r[1]!, 16);
      const hi = parseInt(r[2]!, 16);
      const dst = parseInt(r[3]!, 16);
      // A malformed range must not spin: myGov's are tiny, so cap it.
      if (hi < lo || hi - lo > 0xffff) continue;
      for (let c = lo; c <= hi; c++) map.set(c, String.fromCharCode(dst + (c - lo)));
    }
  }
  return map;
}

function streamText(obj: unknown): string | null {
  if (!(obj instanceof PDFRawStream)) return null;
  try {
    return Buffer.from(decodePDFRawStream(obj).decode()).toString("latin1");
  } catch {
    return null;
  }
}

export type RedactionResult = {
  /** The cleaned PDF, or the original bytes when there was nothing to remove. */
  bytes: Uint8Array;
  /** How many TFNs were removed. 0 means the document is already clean OR the
   *  number is not in a text layer — the caller must not read it as "safe". */
  removed: number;
  /** True when the file could not be parsed as a PDF at all. */
  unreadable?: boolean;
};

/**
 * Remove every TFN from a PDF's text layer.
 *
 * Returns the original bytes untouched when nothing matched, so a caller can
 * cheaply tell whether anything needs storing.
 */
export async function redactTfns(input: Uint8Array): Promise<RedactionResult> {
  let pdf: PDFDocument;
  try {
    pdf = await PDFDocument.load(input, { ignoreEncryption: true });
  } catch {
    return { bytes: input, removed: 0, unreadable: true };
  }

  let removed = 0;

  for (const page of pdf.getPages()) {
    // Glyph maps for the fonts this page uses.
    const maps = new Map<string, Map<number, string>>();
    const fonts = page.node.Resources()?.lookup(PDFName.of("Font")) as
      | { asMap(): Map<{ asString(): string }, unknown> }
      | undefined;
    if (fonts?.asMap) {
      for (const [key, ref] of fonts.asMap()) {
        const font = pdf.context.lookup(ref as never) as { get?: (n: PDFName) => unknown } | undefined;
        const toUnicode = font?.get?.(PDFName.of("ToUnicode"));
        const src = toUnicode ? streamText(pdf.context.lookup(toUnicode as never)) : null;
        if (src) maps.set(key.asString().replace("/", ""), parseToUnicode(src));
      }
    }

    // Contents is one stream or an array of them; Skia emits an array.
    const contentsRef = page.node.get(PDFName.of("Contents"));
    const contents = pdf.context.lookup(contentsRef) as { asArray?: () => unknown[] } | undefined;
    const refs = contents?.asArray ? contents.asArray() : [contentsRef];

    // The selected font carries across the streams of one page.
    let current: Map<number, string> | null = null;

    for (const ref of refs) {
      const stream = pdf.context.lookup(ref as never);
      const raw = streamText(stream);
      if (!raw) continue;

      // Walk font selections and single-glyph show operators together, building
      // the page text alongside the byte range that drew each character.
      const tokens = [...raw.matchAll(/\/(\w+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f]+)>\s*Tj/g)];
      let text = "";
      const spans: { start: number; end: number }[] = [];
      for (const t of tokens) {
        if (t[1]) {
          current = maps.get(t[1]) ?? current;
          continue;
        }
        text += current?.get(parseInt(t[2]!, 16)) ?? "�";
        spans.push({ start: t.index!, end: t.index! + t[0].length });
      }

      const hits = findTfns(text);
      if (hits.length === 0) continue;

      const buf = Buffer.from(raw, "latin1");
      for (const hit of hits) {
        for (let i = hit.index; i < hit.index + hit.length; i++) {
          const span = spans[i];
          if (span) buf.fill(0x20, span.start, span.end);
        }
        removed++;
      }

      // Re-deflate the MODIFIED bytes. Compressing what we just cleaned is
      // safe; re-using the original stream would have been the quiet way to
      // ship the digits anyway.
      const packed = deflateSync(buf);
      const dict = pdf.context.obj({}) as unknown as {
        set(k: PDFName, v: unknown): void;
      };
      for (const [k, v] of (stream as PDFRawStream).dict.asMap()) {
        const name = k.asString();
        if (name === "/Filter" || name === "/Length" || name === "/DecodeParms") continue;
        dict.set(k, v);
      }
      dict.set(PDFName.of("Filter"), PDFName.of("FlateDecode"));
      dict.set(PDFName.of("Length"), PDFNumber.of(packed.length));
      pdf.context.assign(ref as never, PDFRawStream.of(dict as never, new Uint8Array(packed)));
    }
  }

  if (removed === 0) return { bytes: input, removed: 0 };
  // Object streams would re-compress the page contents into a shared blob; keep
  // the output simple and inspectable so a reviewer can verify the removal.
  return { bytes: await pdf.save({ useObjectStreams: false }), removed };
}
