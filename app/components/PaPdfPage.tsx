"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist/legacy/build/pdf.mjs";
import { clampPage } from "../../utils/pa-presentation";

/**
 * One page of a PDF, drawn to a canvas that fits its container.
 *
 * Used on both ends of a Preliminary Assessment presentation: the rep's screen
 * and every applicant's phone show the same page, each rendered locally from
 * the same bytes, so what is shared over the call is a page NUMBER, not video
 * of a document (which would arrive blurred and eat the uplink).
 *
 * pdf.js notes that matter here:
 *
 * - The LEGACY build, because applicants join from whatever phone they own. The
 *   modern build assumes current-year browsers; legacy is transpiled and
 *   polyfilled back to Safari 16.4 / Chrome 110 in the pinned 5.4.x line. See
 *   package.json: the version is pinned exactly, because 5.5 raises the Chrome
 *   floor and 6.x raises Safari to 18.
 *
 * - Loaded with a dynamic import() inside an effect, never a static import.
 *   pdf.js reaches for browser globals at module scope; a static import drags it
 *   into the server bundle and SSR dies while the route still answers 200. The
 *   `import type` above is erased at compile time and is safe. A source-level
 *   test in utils/pa-presentation.test.ts guards this.
 *
 * - The worker is bundled with the app: `new URL(<package file>, import.meta.url)`
 *   makes the bundler emit it under /_next/static, which is same-origin (so it
 *   passes `worker-src 'self' blob:`) and is outside Cloudflare Access (so a
 *   guest with no login can fetch it; anything in public/ would 302 to the
 *   login page for exactly the people this is for). No CDN.
 *
 * - `isEvalSupported: false`. The PDF arrives by email from a third party; this
 *   closes the font-program eval path regardless of the pdf.js version.
 */

/** Sharp on retina phones without asking a 3x device for a 30-megapixel canvas. */
const MAX_DPR = 3;
/** iOS Safari refuses canvases much past 16.7M pixels and draws nothing. Stay well under. */
const MAX_CANVAS_PIXELS = 8_000_000;

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfjsPromise: Promise<PdfJs> | null = null;

/** Load pdf.js once per tab and point it at the bundled worker. */
function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs").then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
      return lib;
    });
    // A failed chunk load (flaky mobile data) must not poison every later try.
    pdfjsPromise.catch(() => {
      pdfjsPromise = null;
    });
  }
  return pdfjsPromise;
}

/**
 * How much room to leave at the bottom of a presentation overlay so LiveKit's
 * own control bar (mute, camera, leave) stays visible and tappable under it.
 *
 * Measured rather than hard-coded: the bar is taller when its buttons wrap on a
 * narrow phone, and it does not exist until the room has connected. Polled
 * because the bar belongs to <VideoConference>, which gives no hook for it, and
 * a twice-a-second read of one element's height is cheaper than a subtree
 * MutationObserver over a video grid.
 */
export function useControlBarInset(anchor: React.RefObject<HTMLElement | null>): number {
  const [inset, setInset] = useState(72);
  useEffect(() => {
    const read = () => {
      const root = anchor.current?.closest("[data-lk-theme]") ?? document;
      const bar = root.querySelector(".lk-control-bar");
      const h = bar ? Math.ceil(bar.getBoundingClientRect().height) : 0;
      // No bar yet (still connecting): keep the default rather than covering
      // the spot where it is about to appear.
      if (h > 0) setInset((prev) => (prev === h ? prev : h));
    };
    read();
    const timer = window.setInterval(read, 500);
    return () => window.clearInterval(timer);
  }, [anchor]);
  return inset;
}

export default function PaPdfPage({
  data,
  page,
  zoom = 1,
  onPageCount,
  onError,
}: {
  /** The whole PDF. A new array identity means a new document. */
  data: Uint8Array | null;
  /** 1-based; clamped to the document. */
  page: number;
  /** 1 = whole page visible. Above 1 the container scrolls. */
  zoom?: number;
  onPageCount?: (pageCount: number) => void;
  onError?: (message: string) => void;
}) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const slotRef = useRef<HTMLDivElement | null>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  // Callbacks are read through refs so a parent passing inline arrows does not
  // tear the document down and reload it on every render.
  const onPageCountRef = useRef(onPageCount);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onPageCountRef.current = onPageCount;
    onErrorRef.current = onError;
  });

  // Open the document.
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    let destroy: (() => void) | null = null;

    (async () => {
      try {
        const lib = await loadPdfJs();
        if (cancelled) return;
        // pdf.js TRANSFERS the buffer to its worker, which detaches it here.
        // Hand over a copy so the caller's bytes survive a re-open (React
        // strict mode mounts twice; a parent may also keep them for later).
        const task = lib.getDocument({ data: data.slice(), isEvalSupported: false });
        destroy = () => {
          void task.destroy().catch(() => {});
        };
        const opened = await task.promise;
        if (cancelled) return;
        setDoc(opened);
        onPageCountRef.current?.(opened.numPages);
      } catch (err) {
        if (cancelled) return;
        console.error("[PaPdfPage] could not open the document:", err);
        setStatus("error");
        onErrorRef.current?.("This document could not be displayed.");
      }
    })();

    return () => {
      cancelled = true;
      destroy?.();
      setDoc(null);
      setStatus("loading");
    };
  }, [data]);

  // Track the space available, so a rotated phone or a resized window re-renders
  // at the new size instead of stretching a stale bitmap.
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const measure = () => {
      const w = Math.floor(el.clientWidth);
      const h = Math.floor(el.clientHeight);
      setBox((prev) => (prev.w === w && prev.h === h ? prev : { w, h }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Draw the page.
  useEffect(() => {
    const slot = slotRef.current;
    if (!doc || !slot || box.w < 8 || box.h < 8) return;
    let cancelled = false;
    let task: RenderTask | null = null;

    (async () => {
      try {
        const pdfPage = await doc.getPage(clampPage(page, doc.numPages));
        if (cancelled) return;

        const base = pdfPage.getViewport({ scale: 1 });
        const fit = Math.min(box.w / base.width, box.h / base.height) * Math.max(1, zoom);
        const cssW = Math.max(1, Math.floor(base.width * fit));
        const cssH = Math.max(1, Math.floor(base.height * fit));

        let dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
        const pixels = cssW * cssH * dpr * dpr;
        if (pixels > MAX_CANVAS_PIXELS) dpr *= Math.sqrt(MAX_CANVAS_PIXELS / pixels);

        // A FRESH canvas per render, swapped in only once it is complete. pdf.js
        // throws if two renders share a canvas, and drawing into the visible one
        // would flash white on every page turn and every resize tick.
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.floor(cssW * dpr));
        canvas.height = Math.max(1, Math.floor(cssH * dpr));
        canvas.style.width = `${cssW}px`;
        canvas.style.height = `${cssH}px`;
        canvas.style.display = "block";
        canvas.style.background = "#fff";
        canvas.style.boxShadow = "0 2px 16px rgba(0,0,0,0.45)";

        task = pdfPage.render({
          canvas,
          viewport: pdfPage.getViewport({ scale: fit * dpr }),
        });
        await task.promise;
        if (cancelled) return;
        slot.replaceChildren(canvas);
        setStatus("ready");
      } catch (err) {
        // A superseded render rejects with RenderingCancelledException. That is
        // the cancel working, not a failure.
        if (cancelled || (err as { name?: string } | null)?.name === "RenderingCancelledException") return;
        console.error("[PaPdfPage] could not draw the page:", err);
        setStatus("error");
        onErrorRef.current?.("This page could not be displayed.");
      }
    })();

    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [doc, page, zoom, box.w, box.h]);

  return (
    <div
      ref={frameRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        // Zoomed in, the page is larger than the frame and the applicant pans it.
        overflow: zoom > 1 ? "auto" : "hidden",
        WebkitOverflowScrolling: "touch",
      }}
    >
      <div
        ref={slotRef}
        style={{
          minWidth: "100%",
          minHeight: "100%",
          width: "max-content",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      />
      {status !== "ready" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#e5e7eb",
            fontSize: 15,
            textAlign: "center",
            padding: 16,
            pointerEvents: "none",
          }}
        >
          {status === "error" ? "This document could not be displayed." : "Loading the document…"}
        </div>
      )}
    </div>
  );
}
