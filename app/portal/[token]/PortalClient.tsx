"use client";

/**
 * The page a borrower opens on their phone to send us their Preliminary
 * Assessment documents.
 *
 * Design intent: the person using this is not technical, is probably on a
 * phone, and has been asked for six kinds of document they have never heard
 * described this way. Everything here exists to remove a reason to give up —
 * one obvious action at a time, plain language, no jargon, no account to
 * create, and the fiddly work (convert to PDF, shrink under 1MB, straighten a
 * sideways photo, name it the way YLA demand) happens invisibly on their device.
 *
 * The alternative is what happens today: they email a HEIC photo, YLA reject
 * the whole set, and the application loses a week.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "../../../utils/supabase-browser";
import { normaliseToPdf } from "./normalise";
import MyGovGuide from "./MyGovGuide";
import {
  MyDocumentsSection,
  HelpSection,
  BookSection,
  JourneySection,
  type SignedDoc,
} from "./PortalSections";

type Slot = {
  docKey: string;
  label: string;
  hint: string;
  slot: number;
  /** True for a document supplied beyond the required minimum (extra employer). */
  extra?: boolean;
  document: { id: string; filename: string; status: string; notes: string | null; size: number | null } | null;
};

/** An optional slot the client MAY fill — "another employer's statement". */
type ExtraSlot = { docKey: string; label: string; slot: number };

type State = {
  applicant_name: string;
  status: string;
  slots: Slot[];
  extra_slots?: ExtraSlot[];
  signed_documents?: SignedDoc[];
  booking_url?: string;
  /** Rep-released, per client. Undefined/false = the card never renders. */
  training_video?: boolean;
  outstanding: number;
  complete: boolean;
};

/** The portal is no longer just an upload form. */
type Tab = "upload" | "documents" | "help" | "next" | "book";
const TABS: { id: Tab; label: string }[] = [
  { id: "upload", label: "Upload" },
  { id: "documents", label: "My documents" },
  { id: "help", label: "Help" },
  { id: "next", label: "What's next" },
  { id: "book", label: "Talk to us" },
];

const slotId = (s: Slot) => `${s.docKey}:${s.slot}`;

export default function PortalClient({ token }: { token: string }) {
  const [state, setState] = useState<State | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [guideOpen, setGuideOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("upload");
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  // Pure fetch — returns a result rather than setting state, so the effect below
  // can guard against a response landing after the client has navigated away.
  const fetchState = useCallback(async (): Promise<
    { ok: true; data: State } | { ok: false; error: string }
  > => {
    try {
      const res = await fetch(`/api/portal/${token}`, { cache: "no-store" });
      const json = await res.json();
      if (!json.ok) return { ok: false, error: json.error || "This link is not valid." };
      return { ok: true, data: json as State };
    } catch {
      return { ok: false, error: "Could not load this page. Please check your connection and try again." };
    }
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const r = await fetchState();
      if (cancelled) return;
      if (r.ok) setState(r.data);
      else setLoadError(r.error);
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchState]);

  /** Re-read after an upload. Called from an event handler, not an effect. */
  const refresh = useCallback(async () => {
    const r = await fetchState();
    if (r.ok) setState(r.data);
  }, [fetchState]);

  async function handleFile(slot: Slot, file: File) {
    const id = slotId(slot);
    setErrors((e) => ({ ...e, [id]: "" }));
    setBusy((b) => ({ ...b, [id]: "Preparing…" }));

    // 1. Normalise on-device: orientation, size, format, all before upload.
    const norm = await normaliseToPdf(file);
    if (!norm.ok) {
      setBusy((b) => ({ ...b, [id]: "" }));
      setErrors((e) => ({ ...e, [id]: norm.error }));
      return;
    }

    setBusy((b) => ({ ...b, [id]: "Uploading…" }));

    // 2. Ask for a signed slot. The server names the file the way YLA require.
    let signed: { token: string; path: string; bucket: string; document_id: string };
    try {
      const res = await fetch(`/api/portal/${token}/upload-url`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          doc_key: slot.docKey,
          slot: slot.slot,
          size: norm.blob.size,
          mime_type: "application/pdf",
          original_name: file.name,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setBusy((b) => ({ ...b, [id]: "" }));
        setErrors((e) => ({ ...e, [id]: json.error || "Could not start the upload." }));
        return;
      }
      signed = json;
    } catch {
      setBusy((b) => ({ ...b, [id]: "" }));
      setErrors((e) => ({ ...e, [id]: "Could not reach the server. Please try again." }));
      return;
    }

    // 3. Straight to storage — the bytes never pass through our server.
    let uploadOk = true;
    try {
      const { error } = await supabaseBrowser.storage
        .from(signed.bucket)
        .uploadToSignedUrl(signed.path, signed.token, norm.blob, { contentType: "application/pdf" });
      if (error) uploadOk = false;
    } catch {
      uploadOk = false;
    }

    // 4. Tell the server how it went, so a failed upload doesn't sit there
    //    looking like a delivered document.
    try {
      await fetch(`/api/portal/${token}/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ document_id: signed.document_id, ok: uploadOk }),
      });
    } catch {
      /* the row stays 'uploaded'; the rep still sees it */
    }

    setBusy((b) => ({ ...b, [id]: "" }));
    if (!uploadOk) {
      setErrors((e) => ({ ...e, [id]: "The upload didn't finish. Please try again." }));
    }
    await refresh();
  }

  if (loadError) {
    return (
      <Centered>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/api/portal/logo" alt="Springboard Homes" className="mx-auto mb-6 h-10 w-auto" />
        <h1 className="text-xl font-semibold text-gray-900">This link isn&apos;t working</h1>
        <p className="mt-3 text-gray-600">{loadError}</p>
        <p className="mt-6 text-sm text-gray-500">
          Please get in touch with your Springboard consultant and they&apos;ll send you a new one.
        </p>
      </Centered>
    );
  }

  if (!state) {
    return (
      <Centered>
        <p className="text-gray-500">Loading…</p>
      </Centered>
    );
  }

  const done = state.slots.length - state.outstanding;
  const pct = state.slots.length ? Math.round((done / state.slots.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-4 py-8 pb-24">
        <header>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/api/portal/logo" alt="Springboard Homes" className="h-12 w-auto" />
          <h1 className="mt-3 text-2xl font-semibold text-gray-900">Your documents</h1>
          <p className="mt-2 text-gray-600">
            Hello {state.applicant_name.split(" ")[0]} — we need a few documents to complete your
            assessment. You can do this on your phone, and you don&apos;t need an account.
          </p>
        </header>

        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-gray-900">
              {done} of {state.slots.length} received
            </span>
            {state.complete ? (
              <span className="text-sm font-medium text-green-700">All done</span>
            ) : (
              <span className="text-sm text-gray-500">{state.outstanding} to go</span>
            )}
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full rounded-full transition-all ${state.complete ? "bg-green-600" : "bg-amber-500"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          {state.complete && (
            <p className="mt-3 text-sm text-gray-600">
              Thank you — we have everything we need. Your consultant will be in touch.
            </p>
          )}
        </div>

        <nav className="mt-5 flex gap-1 overflow-x-auto border-b border-gray-200">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap px-3 py-2 text-sm font-medium transition ${
                tab === t.id
                  ? "border-b-2 border-[#020e40] text-[#020e40]"
                  : "border-b-2 border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {tab !== "upload" && (
          <div className="mt-5">
            {tab === "documents" && (
              <MyDocumentsSection
                token={token}
                documents={state.slots
                  .filter((s) => s.document)
                  .map((s) => ({
                    id: s.document!.id,
                    label: s.label,
                    filename: s.document!.filename,
                    status: s.document!.status,
                  }))}
                signedDocuments={state.signed_documents ?? []}
              />
            )}
            {tab === "help" && (
              <HelpSection
                onOpenWalkthrough={() => setGuideOpen(true)}
                token={token}
                showDirectorIdVideo={state.training_video === true}
              />
            )}
            {tab === "next" && <JourneySection />}
            {tab === "book" && <BookSection bookingUrl={state.booking_url ?? "/book/glenn"} />}
          </div>
        )}

        {tab === "upload" && (
        <>
        <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
          <p className="font-medium">A tip that saves time</p>
          <p className="mt-1">
            Where you can, download the original document (from myGov, your payroll system or your
            super fund) rather than photographing a printout. Photos are fine — we&apos;ll tidy them
            up automatically — but originals are always clearer.
          </p>
        </div>

        <section className="mt-8">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              Your documents
            </h2>
            <ul className="mt-3 space-y-3">
              {state.slots.map((s) => {
                const id = slotId(s);
                const label =
                  s.docKey === "photo_id"
                    ? `${s.label} — ${s.slot === 1 ? "front" : "back"}`
                    : s.slot > 1 || (s.docKey === "payslip" && s.slot === 1)
                      ? `${s.label} ${s.slot}`
                      : s.label;
                const uploaded = !!s.document;
                return (
                  <li
                    key={id}
                    className={`rounded-lg border bg-white p-4 ${uploaded ? "border-green-200" : "border-gray-200"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-gray-900">{label}</p>
                        {!uploaded && <p className="mt-1 text-sm text-gray-500">{s.hint}</p>}
                        {!uploaded && s.docKey === "ato_income" && (
                          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                            {/* The guided walkthrough, not a PDF in another app —
                                this document is where clients get stuck. */}
                            <button
                              type="button"
                              onClick={() => setGuideOpen(true)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100"
                            >
                              👉 Show me how to get this
                            </button>
                            <a
                              href="/api/portal/mygov-guide"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-gray-500 hover:underline"
                            >
                              Printable guide
                            </a>
                          </div>
                        )}
                        {uploaded && (
                          <p className="mt-1 truncate text-sm text-green-700">
                            ✓ {s.document!.filename}
                          </p>
                        )}
                        {errors[id] && (
                          <p className="mt-2 rounded bg-red-50 p-2 text-sm text-red-700">{errors[id]}</p>
                        )}
                      </div>
                      <div className="shrink-0">
                        <input
                          ref={(el) => {
                            inputs.current[id] = el;
                          }}
                          type="file"
                          accept="application/pdf,image/*"
                          className="hidden"
                          onChange={(ev) => {
                            const f = ev.target.files?.[0];
                            ev.target.value = "";
                            if (f) void handleFile(s, f);
                          }}
                        />
                        <button
                          type="button"
                          disabled={!!busy[id]}
                          onClick={() => inputs.current[id]?.click()}
                          className={`rounded-md px-3 py-2 text-sm font-medium ${
                            busy[id]
                              ? "bg-gray-100 text-gray-400"
                              : uploaded
                                ? "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                                : "bg-amber-600 text-white hover:bg-amber-700"
                          }`}
                        >
                          {busy[id] ? busy[id] : uploaded ? "Replace" : "Upload"}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Another employer's statement. myGov issues one per employer, so a
                year with two jobs has two — and a fixed slot list left the
                client nowhere to put the second. Optional: never counts as
                outstanding, so it can't make a complete set look incomplete. */}
            {(state.extra_slots ?? []).map((x) => {
              const id = `${x.docKey}:${x.slot}`;
              return (
                <div key={id} className="mt-3">
                  <input
                    ref={(el) => {
                      inputs.current[id] = el;
                    }}
                    type="file"
                    accept="application/pdf,image/*"
                    className="hidden"
                    onChange={(ev) => {
                      const f = ev.target.files?.[0];
                      ev.target.value = "";
                      if (f) void handleFile({ docKey: x.docKey, label: x.label, hint: "", slot: x.slot, document: null }, f);
                    }}
                  />
                  <button
                    type="button"
                    disabled={!!busy[id]}
                    onClick={() => inputs.current[id]?.click()}
                    className="w-full rounded-lg border border-dashed border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-600 hover:border-amber-400 hover:text-amber-700 disabled:opacity-50"
                  >
                    {busy[id] ? busy[id] : `+ Add another ${x.label} (if you had more than one employer)`}
                  </button>
                </div>
              );
            })}
        </section>

        </>
        )}

        <footer className="mt-10 border-t border-gray-200 pt-6 text-sm text-gray-500">
          <p>
            Your documents are stored securely and shared only with Your Loan Assist for the purpose
            of assessing your application.
          </p>
          <p className="mt-2">
            Stuck on something? Contact your Springboard consultant and they&apos;ll walk you through it.
          </p>
        </footer>
      </div>

      {guideOpen && <MyGovGuide token={token} onClose={() => setGuideOpen(false)} />}
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-md text-center">{children}</div>
    </div>
  );
}
