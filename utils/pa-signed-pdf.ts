/**
 * The signed copy of a Preliminary Assessment.
 *
 * Every other signable document is rendered from its `data` blob as HTML and
 * printed to PDF, so "signed" just means "rendered again with the signatures
 * in". The PA is different: it is a PDF Your Loan Assist SENT us. Re-creating
 * it from parsed data would produce our paraphrase of a credit proposal, and
 * the applicant would be signing that instead of the document YLA issued. So
 * the signed copy is YLA's own bytes with two things added:
 *
 *   1. each signature drawn sitting on that applicant's printed rule on the
 *      Proposal Disclosure Document, where a pen signature would go; and
 *   2. one appended "Electronic signature record" page.
 *
 * THE RECORD PAGE IS ALWAYS ADDED, and it is the part that cannot fail. Where a
 * rule sits is parsed out of YLA's layout by the mailbox feeder. If YLA moves a
 * line, renames an applicant or reissues the template, a signature may have no
 * line to land on — and a signed copy that silently omits a signature is worse
 * than one that shows it on a separate page. So placement on the line is
 * best-effort; the record page carries every signer regardless.
 *
 * `stampPaPdf` is PURE (bytes in, bytes out) so it is tested against a PDF made
 * in the test. `renderPaPdf` at the bottom is the only part that touches
 * storage.
 */

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { supabase } from "./supabase";
import { PA_BUCKET, type PaApplicant, type PaSignatureLine } from "./preliminary-assessments";
import type { SignatureMark } from "./signatures";

const A4: [number, number] = [595.28, 841.89];
const PNG_PREFIX = "data:image/png;base64,";

/** Tallest a signature may stand. YLA leaves roughly this much clear space over
 *  each line; taller and it runs into the declaration text above. */
const LINE_SIG_MAX_HEIGHT = 36;
/**
 * How far the image box drops below the rule, as a share of its height. The pad
 * on the signing page is a 600x200 transparent canvas and people sign in the
 * middle of it, so a box resting exactly on the rule leaves the ink floating
 * well above the line. Dropping it slightly puts the ink where a pen would,
 * and what crosses the rule is almost always transparent margin.
 */
const LINE_SIG_SINK = 0.1;
const CAPTION_SIZE = 5.5;
const CAPTION_GAP = 6;
/** Below this much room the signature is unreadable, so the caption moves. */
const MIN_SIG_WIDTH = 60;

const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.4, 0.4, 0.4);
const RULE = rgb(0.8, 0.8, 0.8);

const norm = (s: string | null | undefined): string =>
  (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Which printed rule each applicant signs on: `out[i]` is the index into
 * `lines` for applicant i, or -1 for "none".
 *
 * By NAME first, because that is what is printed under the rule and the order
 * of `signature_lines` is whatever order the parser met them in. By position
 * only as a fallback (YLA prints "Mark B LIBMAN" where the application said
 * "Mark Benjamin LIBMAN"), and only onto a rule nobody else matched by name —
 * a signature on the wrong person's line is worse than one on no line at all.
 */
export function assignSignatureLines(
  lines: PaSignatureLine[],
  applicants: PaApplicant[],
  signerCount: number,
): number[] {
  const count = Math.max(applicants.length, signerCount);
  const out = new Array<number>(count).fill(-1);
  const taken = new Set<number>();

  for (let i = 0; i < count; i++) {
    const want = norm(applicants[i]?.name);
    if (!want) continue;
    const hit = lines.findIndex((l, li) => !taken.has(li) && norm(l.name) === want);
    if (hit >= 0) {
      out[i] = hit;
      taken.add(hit);
    }
  }
  for (let i = 0; i < count; i++) {
    if (out[i] >= 0 || i >= lines.length || taken.has(i)) continue;
    out[i] = i;
    taken.add(i);
  }
  return out;
}

/** Decode a `data:image/png;base64,` URI, or null when it isn't one. */
function pngBytes(dataUri: string): Uint8Array | null {
  if (typeof dataUri !== "string" || !dataUri.startsWith(PNG_PREFIX)) return null;
  try {
    const bytes = Buffer.from(dataUri.slice(PNG_PREFIX.length), "base64");
    return bytes.length > 0 ? new Uint8Array(bytes) : null;
  } catch {
    return null;
  }
}

/**
 * The standard fonts only encode WinAnsi, and pdf-lib THROWS on anything else.
 * An applicant's name is not ours to restrict — one "Nguyễn" must not turn a
 * completed signing into a 500 — so characters the font can't draw become "?".
 */
function drawable(font: PDFFont, text: string): string {
  const known = new Set(font.getCharacterSet());
  return Array.from(text.replace(/[\r\n\t]+/g, " "))
    .map((ch) => (known.has(ch.codePointAt(0) ?? -1) ? ch : "?"))
    .join("");
}

/** Largest size that fits the box without distorting or enlarging the image. */
function fit(img: PDFImage, maxW: number, maxH: number): { width: number; height: number } {
  const scale = Math.min(maxW / img.width, maxH / img.height, 1);
  return { width: img.width * scale, height: img.height * scale };
}

/** True when the rule lies on a real page, inside that page. */
function lineUsable(line: PaSignatureLine | undefined, pages: PDFPage[]): line is PaSignatureLine {
  if (!line || !Number.isInteger(line.page) || line.page < 0 || line.page >= pages.length) return false;
  const { width, height } = pages[line.page].getSize();
  return line.width > 0 && line.x >= 0 && line.y >= 0 && line.x + line.width <= width + 1 && line.y < height;
}

/**
 * Draw one signature on its rule, with the "signed electronically" caption.
 *
 * The caption goes ABOVE the rule at its right-hand end, and the signature gets
 * the rest of the rule to its left. Never below: that is where YLA prints the
 * applicant's name. Never over the top of the signature either, because the
 * space above a rule is only as tall as YLA left it. On a rule too short to
 * share, the signature takes the full width and the caption stacks on top.
 */
function drawOnLine(
  page: PDFPage,
  line: PaSignatureLine,
  img: PDFImage,
  date: string,
  font: PDFFont,
): void {
  const captionLines = ["Signed electronically", date].map((t) => drawable(font, t)).filter(Boolean);
  const captionW = Math.max(...captionLines.map((t) => font.widthOfTextAtSize(t, CAPTION_SIZE)));
  const leading = CAPTION_SIZE + 1.5;

  const shared = line.width - captionW - CAPTION_GAP;
  const sideBySide = shared >= MIN_SIG_WIDTH;
  const size = fit(img, sideBySide ? shared : line.width, LINE_SIG_MAX_HEIGHT);
  const imgY = line.y - size.height * LINE_SIG_SINK;
  page.drawImage(img, { x: line.x, y: imgY, width: size.width, height: size.height });

  // Side by side: right-aligned to the end of the rule, its last line just
  // clear of it. Stacked: left-aligned over the signature.
  const captionBottom = sideBySide ? line.y + 2.5 : imgY + size.height + 2;
  const captionTop = captionBottom + leading * (captionLines.length - 1);
  captionLines.forEach((text, i) => {
    const w = font.widthOfTextAtSize(text, CAPTION_SIZE);
    page.drawText(text, {
      x: sideBySide ? line.x + line.width - w : line.x,
      y: captionTop - leading * i,
      size: CAPTION_SIZE,
      font,
      color: MUTED,
    });
  });
}

/**
 * YLA's PDF with the signatures applied.
 *
 * `signatures[i]` belongs to `applicants[i]` (signer_index i+1 — see
 * buildSignaturesArray); null/absent means that applicant has not signed.
 *
 * With NO signatures the original bytes are returned untouched — not re-saved
 * through pdf-lib, which would rewrite the file. That is the unsigned preview
 * on the signing page, and what the applicant reviews there must be exactly
 * what YLA sent.
 */
export async function stampPaPdf(
  pdfBytes: Uint8Array,
  signatureLines: PaSignatureLine[],
  signatures: (SignatureMark | null)[] | undefined,
  applicants: PaApplicant[],
): Promise<Uint8Array> {
  const marks = Array.from(signatures ?? [], (m) => m ?? null);
  if (!marks.some((m) => m !== null)) return pdfBytes;

  const pdf = await PDFDocument.load(pdfBytes);
  const pages = pdf.getPages();
  const originalPageCount = pages.length;
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const lineFor = assignSignatureLines(signatureLines, applicants, marks.length);

  // One row per person on the record page: every applicant, signed or not, so a
  // copy made after the first of two signatures says plainly who is outstanding.
  const rows: { name: string; date: string; img: PDFImage | null; signed: boolean }[] = [];
  for (let i = 0; i < Math.max(applicants.length, marks.length); i++) {
    const mark = marks[i] ?? null;
    const name = (mark?.name || applicants[i]?.name || `Signer ${i + 1}`).trim();
    if (!mark) {
      rows.push({ name, date: "", img: null, signed: false });
      continue;
    }
    // A signature image we can't decode must not lose the fact of the signing:
    // the row still appears, and says the image is missing.
    let img: PDFImage | null = null;
    const bytes = pngBytes(mark.image);
    if (bytes) {
      try {
        img = await pdf.embedPng(bytes);
      } catch {
        img = null;
      }
    }
    const line = signatureLines[lineFor[i]];
    if (img && lineUsable(line, pages)) drawOnLine(pages[line.page], line, img, mark.date, font);
    rows.push({ name, date: mark.date, img, signed: true });
  }

  /* ── The appended record page ──────────────────────────────────────────── */
  const MARGIN = 56;
  const BLOCK = 100;
  let page = pdf.addPage(A4);
  let y = A4[1] - MARGIN;

  const text = (t: string, opts: { size: number; bold?: boolean; muted?: boolean; dy?: number }) => {
    const f = opts.bold ? bold : font;
    page.drawText(drawable(f, t), {
      x: MARGIN,
      y: y - (opts.dy ?? 0),
      size: opts.size,
      font: f,
      color: opts.muted ? MUTED : INK,
    });
  };

  text("Electronic signature record", { size: 18, bold: true });
  y -= 22;
  text("Preliminary Assessment", { size: 11, muted: true });
  y -= 16;
  text(
    `This page was added to the ${originalPageCount}-page document that precedes it and records who signed it.`,
    { size: 9, muted: true },
  );
  y -= 30;

  for (const row of rows) {
    // More signers than a page holds is not a real case (two is the cap today),
    // but running off the bottom of a signature record is not an acceptable
    // way to find out that changed.
    if (y - BLOCK < MARGIN + 30) {
      page = pdf.addPage(A4);
      y = A4[1] - MARGIN;
    }
    page.drawLine({
      start: { x: MARGIN, y: y + 12 },
      end: { x: A4[0] - MARGIN, y: y + 12 },
      thickness: 0.5,
      color: RULE,
    });
    y -= 6;
    text(row.name, { size: 12, bold: true });
    y -= 16;
    text(
      row.signed ? `Signed electronically${row.date ? ` on ${row.date}` : ""}` : "Not yet signed",
      { size: 10, muted: !row.signed },
    );
    if (row.signed) {
      if (row.img) {
        const size = fit(row.img, 190, 52);
        page.drawImage(row.img, { x: MARGIN, y: y - 8 - size.height, width: size.width, height: size.height });
      } else {
        text("(The signature image could not be reproduced on this copy.)", { size: 9, muted: true, dy: 16 });
      }
    }
    y -= BLOCK - 22;
  }

  y = Math.max(y, MARGIN + 12);
  page.drawLine({
    start: { x: MARGIN, y: y + 12 },
    end: { x: A4[0] - MARGIN, y: y + 12 },
    thickness: 0.5,
    color: RULE,
  });
  y -= 6;
  text("Signed under the Electronic Transactions Act 1999", { size: 10 });

  return pdf.save();
}

/**
 * Fetch YLA's PDF from the private bucket and apply the signatures. Throws when
 * the object can't be read: the signing routes turn that into "preview failed"
 * / a signed-but-no-copy warning, which is the truth — there is nothing we
 * could render in its place.
 */
export async function renderPaPdf(
  pdfPath: string,
  signatureLines: PaSignatureLine[],
  signatures: (SignatureMark | null)[] | undefined,
  applicants: PaApplicant[],
): Promise<Uint8Array> {
  if (!pdfPath) throw new Error("Preliminary Assessment has no stored PDF (pdf_path is empty)");
  const { data, error } = await supabase.storage.from(PA_BUCKET).download(pdfPath);
  if (error || !data) {
    throw new Error(
      `Could not read the Preliminary Assessment PDF from storage: ${error?.message ?? "no data returned"}`,
    );
  }
  const original = new Uint8Array(await data.arrayBuffer());
  return stampPaPdf(original, signatureLines, signatures, applicants);
}
