/**
 * OCR for the image TFN redactor (utils/tfn-redact-image.ts), on tesseract.js.
 *
 * Runs in-process (WebAssembly), so no document leaves our infrastructure for a
 * third-party OCR service — these are payslips and tax statements. The English
 * model (~4MB) is fetched once per warm container and cached in the temp dir.
 *
 * Only ever loaded by the background function: OCR takes seconds per page,
 * which the upload request and the scheduled sweep cannot afford.
 */
import os from "node:os";
import type { OcrFn, OcrWord } from "./tfn-redact-image";

type Worker = Awaited<ReturnType<typeof import("tesseract.js")["createWorker"]>>;
let worker: Promise<Worker> | null = null;

async function getWorker(): Promise<Worker> {
  if (!worker) {
    worker = (async () => {
      const { createWorker } = await import("tesseract.js");
      return createWorker("eng", 1, { cachePath: os.tmpdir() });
    })();
    worker.catch(() => {
      worker = null;
    });
  }
  return worker;
}

export const tesseractOcr: OcrFn = async (jpegBytes) => {
  const w = await getWorker();
  const { data } = await w.recognize(Buffer.from(jpegBytes));
  const out: OcrWord[] = [];
  (data.lines ?? []).forEach((line, li) => {
    for (const word of line.words ?? []) {
      out.push({ text: word.text, line: li, ...word.bbox });
    }
  });
  return out;
};

export async function closeOcr(): Promise<void> {
  if (!worker) return;
  const w = await worker.catch(() => null);
  worker = null;
  await w?.terminate();
}
