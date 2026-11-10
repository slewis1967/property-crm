"use client";

/**
 * The in-portal myGov walkthrough — one step per screen, on the phone the
 * client is already holding, opened from the ATO Income Statement row.
 *
 * Replaces a link to the ATO's one-page PDF, which lost clients four ways: it
 * opened in another app, it assumed myGov was already linked to the ATO, it
 * never mentioned choosing the income YEAR (so we got two statements for the
 * same year and none for the other), and it gave one line of "print → save as
 * PDF" for three very different devices. See utils/mygov-guide.ts.
 *
 * "Show me your screen" sends a screenshot to the vision model and returns the
 * single next tap. The image is never stored — see the route.
 */
import { useMemo, useRef, useState } from "react";
import {
  detectDevice,
  financialYearsNeeded,
  guideSteps,
  type Device,
  type ScreenHelp,
} from "../../../utils/mygov-guide";

/** Downscale before upload — a modern phone photo is far larger than we need. */
async function toDataUrl(file: File, maxEdge = 1400): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not read that image");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", 0.8);
}

export default function MyGovGuide({ token, onClose }: { token: string; onClose: () => void }) {
  const device: Device = useMemo(
    () => detectDevice(typeof navigator === "undefined" ? null : navigator.userAgent),
    [],
  );
  const years = useMemo(() => financialYearsNeeded(new Date()), []);
  const steps = useMemo(() => guideSteps({ device, years }), [device, years]);

  const [i, setI] = useState(0);
  const [help, setHelp] = useState<ScreenHelp | null>(null);
  const [helpBusy, setHelpBusy] = useState(false);
  const [helpError, setHelpError] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);

  const step = steps[i]!;
  const last = i === steps.length - 1;

  async function askAboutScreen(file: File) {
    setHelpBusy(true);
    setHelpError("");
    setHelp(null);
    try {
      const image = await toDataUrl(file);
      const res = await fetch(`/api/portal/${token}/mygov-help`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setHelpError(json?.error || "We couldn't read that one — try again, or reply to our email and we'll call you.");
        return;
      }
      setHelp(json.help as ScreenHelp);
    } catch {
      setHelpError("We couldn't read that one — try again, or reply to our email and we'll call you.");
    } finally {
      setHelpBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Getting your ATO income statement"
    >
      <div className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Step {i + 1} of {steps.length}
            </p>
            <p className="text-sm text-gray-500">Getting your ATO income statement</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="h-1 w-full bg-gray-100">
          <div
            className="h-full bg-amber-500 transition-all"
            style={{ width: `${((i + 1) / steps.length) * 100}%` }}
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          <h3 className="text-lg font-semibold text-gray-900">{step.title}</h3>
          {step.body.map((p, n) => (
            <p key={n} className="mt-2 text-[15px] leading-relaxed text-gray-700">
              {p}
            </p>
          ))}

          {step.actions && (
            <ol className="mt-4 space-y-2">
              {step.actions.map((a, n) => (
                <li key={n} className="flex gap-3 text-[15px] leading-relaxed text-gray-800">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-semibold text-amber-800">
                    {n + 1}
                  </span>
                  <span>{a}</span>
                </li>
              ))}
            </ol>
          )}

          {step.link && (
            <a
              href={step.link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-[#020e40] px-4 py-2.5 text-sm font-semibold text-white"
            >
              {step.link.label} ↗
            </a>
          )}

          {/* Stuck? Look at their actual screen. */}
          <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-sm font-semibold text-gray-900">Stuck on this step?</p>
            <p className="mt-1 text-sm text-gray-600">
              Take a screenshot or photo of your screen and we&apos;ll tell you exactly what to tap next.
              We don&apos;t keep the image.
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(ev) => {
                const f = ev.target.files?.[0];
                ev.target.value = "";
                if (f) void askAboutScreen(f);
              }}
            />
            <button
              type="button"
              disabled={helpBusy}
              onClick={() => fileRef.current?.click()}
              className={`mt-3 rounded-lg px-4 py-2 text-sm font-semibold ${
                helpBusy ? "bg-gray-100 text-gray-400" : "bg-white text-gray-800 shadow-sm ring-1 ring-gray-300 hover:bg-gray-50"
              }`}
            >
              {helpBusy ? "Looking…" : "📷 Show me your screen"}
            </button>

            {helpError && <p className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-700">{helpError}</p>}

            {help && (
              <div className="mt-3 rounded-lg bg-white p-3 ring-1 ring-gray-200">
                {help.where && <p className="text-xs uppercase tracking-wide text-gray-500">{help.where}</p>}
                {help.next && <p className="mt-1 text-[15px] font-medium text-gray-900">{help.next}</p>}
                {help.warning && (
                  <p className="mt-2 rounded-md bg-amber-50 p-2 text-sm text-amber-900">⚠️ {help.warning}</p>
                )}
                {help.stuck && (
                  <p className="mt-2 text-sm text-gray-700">
                    This one&apos;s easier with a person. Reply to our email and we&apos;ll walk you
                    through it over the phone — it usually takes five minutes.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-gray-100 px-5 py-3">
          <button
            type="button"
            onClick={() => setI((n) => Math.max(0, n - 1))}
            disabled={i === 0}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              i === 0 ? "text-gray-300" : "text-gray-700 hover:bg-gray-100"
            }`}
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => (last ? onClose() : setI((n) => n + 1))}
            className="rounded-lg bg-[#020e40] px-5 py-2.5 text-sm font-semibold text-white"
          >
            {last ? "Done — upload it" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
