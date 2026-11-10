/**
 * Turn whatever the client picked into a document Your Loan Assist will accept.
 *
 * YLA's standard is strict and unforgiving — PDF only, under 1MB, correctly
 * oriented, not a phone screenshot, not a photo of a screen — and they reject
 * the WHOLE set if one file misses. A rejected set costs a week. In practice
 * clients photograph documents with their phone, which fails on format, size
 * and rotation simultaneously.
 *
 * This runs entirely in the browser, for three reasons: the CRM has no
 * server-side PDF capability at all; Netlify functions have a body-size limit
 * that already forced uploads to bypass the server; and the client's own device
 * is the only place the original bytes exist anyway.
 *
 * A photo becomes an oriented, downscaled, quality-tuned JPEG wrapped in a
 * single-page PDF, named the way YLA asked for. A PDF that is already compliant
 * passes through untouched.
 */
import { jsPDF } from "jspdf";

/** YLA hard ceiling. */
const MAX_BYTES = 1024 * 1024;
/**
 * Longest edge, in pixels, of the image we embed. ~2000px across an A4 page is
 * roughly 170 DPI — comfortably legible for a payslip or a licence, and well
 * above the ~150 DPI below which scans start reading as blurry.
 */
const MAX_EDGE = 2000;
/** Quality ladder. We stop at the first rung that fits under the ceiling. */
const QUALITY_STEPS = [0.85, 0.75, 0.65, 0.55, 0.45];

export type NormaliseResult =
  | { ok: true; blob: Blob; mime: "application/pdf"; wasConverted: boolean; note?: string }
  | { ok: false; error: string };

const isImage = (f: File) => /^image\//i.test(f.type) || /\.(jpe?g|png|heic|heif|webp)$/i.test(f.name);
const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);

export async function normaliseToPdf(file: File): Promise<NormaliseResult> {
  if (isPdf(file)) return normalisePdf(file);
  if (isImage(file)) return imageToPdf(file);
  return {
    ok: false,
    error:
      "That file type can't be accepted. Please upload a PDF, or a photo in JPG or PNG format.",
  };
}

/**
 * PDFs pass through. We cannot recompress one in the browser without
 * rasterising it — which would destroy text quality on a document YLA want to
 * read — so an oversized PDF is reported back rather than silently mangled.
 */
async function normalisePdf(file: File): Promise<NormaliseResult> {
  if (file.size <= MAX_BYTES) {
    return { ok: true, blob: file, mime: "application/pdf", wasConverted: false };
  }
  const mb = (file.size / 1024 / 1024).toFixed(1);
  return {
    ok: false,
    error:
      `This PDF is ${mb}MB and the limit is 1MB. If you scanned it, try scanning in black and white ` +
      `or at a lower quality. If you downloaded it, the original from myGov or your payroll system ` +
      `is usually much smaller than a scan.`,
  };
}

async function imageToPdf(file: File): Promise<NormaliseResult> {
  let bitmap: ImageBitmap;
  try {
    // `from-image` applies the EXIF orientation, which is what stops a phone
    // photo arriving sideways — one of YLA's explicit rejection reasons.
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return {
      ok: false,
      error:
        "That image couldn't be read on this device. If it's a HEIC photo from an iPhone, " +
        "open it in Photos, choose Share, and save it as a JPG first — or upload the original PDF if you have one.",
    };
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  let w = Math.max(1, Math.round(bitmap.width * scale));
  let h = Math.max(1, Math.round(bitmap.height * scale));

  let dataUrl = "";
  let fitted = false;

  // Try the quality ladder at full size; if even the lowest quality is too big,
  // halve the dimensions and try again. Two shrink passes is plenty — a 2000px
  // photo at quality 0.45 is already well under 1MB in practice.
  for (let shrink = 0; shrink < 3 && !fitted; shrink++) {
    if (shrink > 0) {
      w = Math.max(1, Math.round(w * 0.7));
      h = Math.max(1, Math.round(h * 0.7));
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close?.();
      return { ok: false, error: "This browser couldn't process the image. Try a different browser." };
    }
    // White backdrop: a transparent PNG would otherwise render black in the PDF.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);

    for (const q of QUALITY_STEPS) {
      dataUrl = canvas.toDataURL("image/jpeg", q);
      // base64 is ~4/3 of the bytes; leave headroom for the PDF wrapper itself.
      if (dataUrl.length * 0.75 < MAX_BYTES * 0.9) {
        fitted = true;
        break;
      }
    }
  }

  bitmap.close?.();

  if (!fitted || !dataUrl) {
    return {
      ok: false,
      error:
        "That photo is very large and couldn't be reduced under 1MB. Please take the photo again " +
        "in better light and a bit further back, or download the original document instead.",
    };
  }

  // Page matches the image aspect ratio, so nothing is letterboxed or cropped.
  const orientation = w >= h ? "landscape" : "portrait";
  const pdf = new jsPDF({ orientation, unit: "px", format: [w, h], compress: true });
  pdf.addImage(dataUrl, "JPEG", 0, 0, w, h, undefined, "FAST");
  const blob = pdf.output("blob") as Blob;

  if (blob.size > MAX_BYTES) {
    return {
      ok: false,
      error:
        "That photo couldn't be reduced under the 1MB limit. Please download the original " +
        "document instead of photographing it, if you can.",
    };
  }

  return {
    ok: true,
    blob,
    mime: "application/pdf",
    wasConverted: true,
    note: `Converted to PDF (${Math.round(blob.size / 1024)}KB)`,
  };
}
