"use client";

/**
 * PUBLIC signing page — the external signer's view. NO app chrome, NO
 * CF-Access assumptions: it authenticates purely by the token in the URL and
 * talks only to the public /api/sign/[token]/* endpoints.
 *
 * Flow: load state → show a document preview + a signature pad (draw with
 * mouse/touch, or type a name rendered in a script style) + an explicit
 * electronic-signature consent → POST the captured PNG to /complete → confirm
 * with a download of the signed copy. Every non-ready state (already signed,
 * expired, invalid, declined) renders a friendly message with no PII or stack
 * traces.
 *
 * The signature pad is a small self-contained <canvas> implementation (no
 * library): pointer events cover mouse and touch, and drawing state is held in
 * refs so a stroke doesn't re-render the component mid-draw.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const TEAL = "#0F4C5C";

type LoadState = "loading" | "ready" | "signed" | "declined" | "expired" | "invalid" | "error";

const CONSENT_TEXT =
  "I agree to sign this document electronically and that my electronic signature is legally binding (Electronic Transactions Act 1999).";

export default function SignClient({ token }: { token: string }) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [signerName, setSignerName] = useState("");
  const [docLabel, setDocLabel] = useState("document");

  const [consent, setConsent] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [showDecline, setShowDecline] = useState(false);
  const [declineReason, setDeclineReason] = useState("");
  const [declined, setDeclined] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  // Load the request state. Async fetch → setState after await (not a synchronous
  // set during render/effect), so it's safe.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sign/${encodeURIComponent(token)}`);
        const json = await res.json();
        if (cancelled) return;
        const state = (json?.state as LoadState) ?? "error";
        setLoadState(state);
        if (state === "ready") {
          setSignerName(typeof json.signer_name === "string" ? json.signer_name : "");
          setDocLabel(typeof json.doc_label === "string" ? json.doc_label : "document");
        }
      } catch {
        if (!cancelled) setLoadState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const ctx = useCallback((): CanvasRenderingContext2D | null => {
    const c = canvasRef.current;
    return c ? c.getContext("2d") : null;
  }, []);

  /** Map a pointer event to canvas-internal coordinates (accounts for CSS scaling). */
  const pointFromEvent = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const rect = c.getBoundingClientRect();
    const scaleX = c.width / rect.width;
    const scaleY = c.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const g = ctx();
      if (!g) return;
      canvasRef.current?.setPointerCapture(e.pointerId);
      drawing.current = true;
      last.current = pointFromEvent(e);
    },
    [ctx, pointFromEvent],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!drawing.current) return;
      const g = ctx();
      const p = pointFromEvent(e);
      const l = last.current;
      if (!g || !l) return;
      g.strokeStyle = "#111827";
      g.lineWidth = 2.5;
      g.lineCap = "round";
      g.lineJoin = "round";
      g.beginPath();
      g.moveTo(l.x, l.y);
      g.lineTo(p.x, p.y);
      g.stroke();
      last.current = p;
      if (!hasSignature) setHasSignature(true);
    },
    [ctx, pointFromEvent, hasSignature],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = false;
    last.current = null;
    canvasRef.current?.releasePointerCapture?.(e.pointerId);
  }, []);

  const clearPad = useCallback(() => {
    const c = canvasRef.current;
    const g = ctx();
    if (c && g) g.clearRect(0, 0, c.width, c.height);
    setHasSignature(false);
  }, [ctx]);

  /** Render the typed name in a script style onto the pad (typed fallback). */
  const applyTypedName = useCallback(() => {
    const c = canvasRef.current;
    const g = ctx();
    if (!c || !g || !typedName.trim()) return;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = "#111827";
    g.font = "48px 'Segoe Script', 'Brush Script MT', cursive";
    g.textBaseline = "middle";
    g.fillText(typedName.trim(), 20, c.height / 2);
    setHasSignature(true);
  }, [ctx, typedName]);

  const submit = useCallback(async () => {
    const c = canvasRef.current;
    if (!c || !hasSignature || !consent) return;
    setSubmitting(true);
    setError("");
    try {
      const signature_image = c.toDataURL("image/png");
      const res = await fetch(`/api/sign/${encodeURIComponent(token)}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signature_image, typed_name: typedName.trim() || undefined, consent: true }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(typeof json.error === "string" ? json.error : "Could not complete signing.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Could not complete signing. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [token, hasSignature, consent, typedName]);

  const submitDecline = useCallback(async () => {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`/api/sign/${encodeURIComponent(token)}/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: declineReason.trim() || undefined }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(typeof json.error === "string" ? json.error : "Could not record your response.");
        return;
      }
      setDeclined(true);
    } catch {
      setError("Could not record your response. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [token, declineReason]);

  /* ── Render ─────────────────────────────────────────────────────────────── */

  if (loadState === "loading") {
    return <Centered><p className="text-gray-500">Loading…</p></Centered>;
  }

  if (declined) {
    return (
      <Centered>
        <Brand />
        <h1 className="text-xl font-bold text-gray-800 mt-4">Response recorded</h1>
        <p className="text-gray-600 mt-2">{"You've declined to sign this document. You can close this window."}</p>
      </Centered>
    );
  }

  if (submitted) {
    return (
      <Centered>
        <Brand />
        <div className="text-5xl mt-4">✓</div>
        <h1 className="text-xl font-bold text-gray-800 mt-2">Signed — thank you</h1>
        <p className="text-gray-600 mt-2">{`Your ${docLabel} has been signed. A copy has been emailed to you.`}</p>
        <a
          href={`/api/sign/${encodeURIComponent(token)}/signed`}
          className="inline-block mt-5 px-5 py-2.5 rounded-lg text-white font-semibold"
          style={{ backgroundColor: TEAL }}
        >
          Download your signed copy
        </a>
      </Centered>
    );
  }

  if (loadState !== "ready") {
    const msg =
      loadState === "signed"
        ? "This document has already been signed. Thank you."
        : loadState === "declined"
          ? "This document was declined and can no longer be signed."
          : loadState === "expired"
            ? "This signing link has expired. Please contact your adviser for a new link."
            : "This signing link is not valid. Please contact your adviser.";
    return (
      <Centered>
        <Brand />
        <h1 className="text-xl font-bold text-gray-800 mt-4">Unable to sign</h1>
        <p className="text-gray-600 mt-2">{msg}</p>
      </Centered>
    );
  }

  const canSign = hasSignature && consent && !submitting;

  return (
    <div className="min-h-screen bg-gray-50 py-6 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="rounded-t-xl px-6 py-4 text-white" style={{ backgroundColor: TEAL }}>
          <div className="text-lg font-bold">NextKey Property Strategists</div>
        </div>
        <div className="bg-white border border-gray-200 border-t-0 rounded-b-xl p-6 space-y-6">
          <div>
            <h1 className="text-xl font-bold text-gray-800">
              {signerName ? `Hi ${signerName}, you've` : "You've"} been asked to sign
            </h1>
            <p className="text-gray-600 mt-1">{`Please review your ${docLabel} below, then add your signature.`}</p>
          </div>

          {/* Document preview */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Document preview</p>
            <iframe
              title="Document preview"
              src={`/api/sign/${encodeURIComponent(token)}/preview`}
              className="w-full h-[420px] border border-gray-200 rounded-lg bg-white"
            />
          </div>

          {/* Signature pad */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Your signature</p>
              <button onClick={clearPad} className="text-xs font-semibold hover:underline" style={{ color: TEAL }}>
                Clear
              </button>
            </div>
            <canvas
              ref={canvasRef}
              width={600}
              height={200}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
              className="w-full rounded-lg border-2 border-dashed border-gray-300 bg-white touch-none"
              style={{ touchAction: "none", height: "200px" }}
            />
            <p className="text-xs text-gray-400 mt-1">Draw your signature above with your mouse or finger.</p>

            {/* Typed-name fallback */}
            <div className="flex items-end gap-2 mt-3">
              <label className="flex-1">
                <span className="block text-xs text-gray-500 mb-1">Or type your name</span>
                <input
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  placeholder="Full name"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2"
                  style={{ borderColor: undefined }}
                />
              </label>
              <button
                onClick={applyTypedName}
                disabled={!typedName.trim()}
                className="px-3 py-2 text-sm font-semibold rounded-md border disabled:opacity-50"
                style={{ borderColor: TEAL, color: TEAL }}
              >
                Use typed
              </button>
            </div>
          </div>

          {/* Consent */}
          <label className="flex items-start gap-3 rounded-lg bg-gray-50 border border-gray-200 p-3">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 w-5 h-5 flex-shrink-0"
            />
            <span className="text-sm text-gray-700">{CONSENT_TEXT}</span>
          </label>

          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={() => void submit()}
              disabled={!canSign}
              className="px-6 py-2.5 rounded-lg text-white font-semibold disabled:opacity-50 transition"
              style={{ backgroundColor: TEAL }}
            >
              {submitting ? "Signing…" : "Sign document"}
            </button>
            <button
              onClick={() => setShowDecline((v) => !v)}
              className="text-sm text-gray-500 hover:text-gray-800 hover:underline"
            >
              Decline to sign
            </button>
          </div>

          {showDecline && (
            <div className="rounded-lg border border-gray-200 p-3 space-y-2">
              <label className="block text-sm text-gray-600">Reason (optional)</label>
              <textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md"
              />
              <button
                onClick={() => void submitDecline()}
                disabled={submitting}
                className="px-4 py-2 text-sm font-semibold rounded-md border border-red-300 text-red-700 disabled:opacity-50"
              >
                Confirm decline
              </button>
            </div>
          )}

          <p className="text-xs text-gray-400 text-center pt-2">
            Secured by NextKey. This link is unique to you — please don&apos;t share it.
          </p>
        </div>
      </div>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-gray-200 rounded-xl p-8 text-center">{children}</div>
    </div>
  );
}

function Brand() {
  return <div className="text-lg font-bold" style={{ color: TEAL }}>NextKey Property Strategists</div>;
}
