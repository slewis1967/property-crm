"use client";

import { useState, useEffect, useRef } from "react";
import FeasibilityReportBody from "../components/FeasibilityReportBody";

/**
 * Planning Feasibility — AI-led, Australia-wide.
 * The tool interviews the advisor (targeted questions grounded in the council's
 * planning scheme) then generates a comprehensive preliminary feasibility
 * report, rendered in the NextKey letterhead with export-to-PDF (browser print).
 */

type Msg = { role: "user" | "assistant"; content: string };

type Question = {
  id: string;
  label: string;
  why?: string;
  placeholder?: string;
  suggestion?: string;
};

type Tone = "good" | "warn" | "bad" | "info";

type Block =
  | { type: "p"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "callout"; tone?: Tone; title?: string; text: string }
  | { type: "table"; columns?: string[]; rows: string[][] };

type Section = { heading: string; blocks: Block[] };

type Report = {
  title?: string;
  subtitle?: string;
  meta?: { scope?: string; statusPills?: { label: string; tone?: Tone }[] };
  keyStats?: { n: string; l: string }[];
  sections?: Section[];
  disclaimer?: string;
  location?: { lat: number; lng: number };
};

type SavedRow = {
  id: string;
  address?: string | null;
  title?: string | null;
  subtitle?: string | null;
  created_by?: string | null;
  created_at: string;
  property_id?: string | null;
};

const TEAL = "#0F4C5C";

async function callApi(
  phase: "interview" | "report" | "prepare",
  messages: Msg[],
  address: string,
  prepared?: unknown,
) {
  const res = await fetch("/api/ai/planning-feasibility", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phase, messages, address, prepared }),
  });
  // On a serverless timeout the platform returns a truncated HTML error page,
  // not JSON — parse defensively so the user gets a clear, actionable message
  // instead of a raw "Unexpected token <" JSON.parse exception.
  const raw = await res.text();
  let json: {
    ok?: boolean;
    error?: string;
    understanding?: string;
    status?: string;
    questions?: Question[];
    report?: Report;
    jobId?: string;
    location?: { lat: number; lng: number } | null;
    satellite?: string | null;
  };
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(
      res.status >= 500
        ? "The server hit an error or timeout — please try again."
        : `Request failed (${res.status}).`,
    );
  }
  if (!res.ok || !json.ok) {
    throw new Error(json?.error || `Request failed (${res.status})`);
  }
  return json;
}

/**
 * Poll a background report job until it is ready (or failed). Gives up after
 * 12 minutes; the server marks a stuck job failed after 10.
 */
async function waitForReport(jobId: string): Promise<Report> {
  const started = Date.now();
  while (Date.now() - started < 12 * 60_000) {
    await new Promise((r) => setTimeout(r, 4000));
    let json: { status?: string; report?: Report; error?: string } = {};
    try {
      const res = await fetch(`/api/ai/planning-feasibility/jobs/${jobId}`, { cache: "no-store" });
      json = await res.json();
    } catch {
      continue; // a dropped poll is not a failed report
    }
    if (json.status === "ready" && json.report) return json.report;
    if (json.status === "failed") throw new Error(json.error || "Report generation failed");
  }
  throw new Error("The report is taking much longer than usual. Please try again.");
}

export default function FeasibilityClient({
  initialAddress = "",
  auto = false,
  propertyId = "",
}: {
  initialAddress?: string;
  auto?: boolean;
  propertyId?: string;
}) {
  const [stage, setStage] = useState<"start" | "interview" | "generating" | "report">(
    auto && initialAddress ? "generating" : "start",
  );
  const [address, setAddress] = useState(initialAddress);
  const [brief, setBrief] = useState("");
  const [transcript, setTranscript] = useState<Msg[]>([]);
  const [understanding, setUnderstanding] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedList, setSavedList] = useState<SavedRow[]>([]);
  const startedRef = useRef(false);

  // Launched from a property record (?auto=1 + address): research everything
  // from the address and go straight to the report — no questions asked.
  useEffect(() => {
    if (!auto || !initialAddress || startedRef.current) return;
    startedRef.current = true;
    const content =
      `Property address: ${initialAddress}\n\n` +
      `Objective: comprehensive preliminary development feasibility — assess subdivision potential and likely yield, dual occupancy / duplex (including subdividing a duplex into separate titles), and any additional or secondary dwelling opportunity, plus the assessment pathway. Research everything publicly determinable yourself from the address (council/LGA, zone, minimum lot size, overlays, and the lot size, dimensions and existing site layout from the cadastre and satellite/aerial imagery). Do not ask me questions for anything you can research — only flag genuine unknowns in the report as items to verify.`;
    const msgs: Msg[] = [{ role: "user", content }];
    setTranscript(msgs);
    void generateReport(msgs);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load saved reports for the start screen.
  useEffect(() => {
    if (auto) return;
    void loadSavedList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function reset() {
    setStage("start");
    setTranscript([]);
    setUnderstanding("");
    setQuestions([]);
    setAnswers({});
    setReport(null);
    setError("");
    setSavedId(null);
    void loadSavedList();
  }

  async function loadSavedList() {
    try {
      const res = await fetch("/api/feasibility/reports");
      const json = await res.json();
      if (json.ok) setSavedList(json.reports || []);
    } catch {
      /* non-fatal — list just stays empty */
    }
  }

  async function saveReport() {
    if (!report || saving || savedId) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/feasibility/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address, property_id: propertyId, report, transcript }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error || "Save failed");
      setSavedId(json.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function openSaved(id: string) {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/feasibility/reports/${id}`);
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json?.error || "Could not open report");
      setReport(json.report);
      setAddress(json.address || "");
      setTranscript(Array.isArray(json.transcript) ? json.transcript : []);
      setSavedId(id);
      setStage("report");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open report");
    } finally {
      setLoading(false);
    }
  }

  async function deleteSaved(id: string) {
    if (!window.confirm("Delete this saved report?")) return;
    try {
      await fetch(`/api/feasibility/reports/${id}`, { method: "DELETE" });
      setSavedList((list) => list.filter((r) => r.id !== id));
    } catch {
      /* non-fatal */
    }
  }

  async function runInterview(msgs: Msg[]) {
    setLoading(true);
    setError("");
    try {
      const json = await callApi("interview", msgs, address);
      setUnderstanding(json.understanding || "");
      if (json.status === "ready" || !json.questions?.length) {
        await generateReport(msgs);
        return;
      }
      // Record what the AI asked so the next turn has context.
      const asked =
        (json.understanding ? `Understanding: ${json.understanding}\n` : "") +
        "Questions:\n" +
        json.questions.map((q: Question, i: number) => `${i + 1}. ${q.label}`).join("\n");
      setTranscript([...msgs, { role: "assistant", content: asked }]);
      setQuestions(json.questions);
      const seed: Record<string, string> = {};
      for (const q of json.questions) if (q.suggestion) seed[q.id] = q.suggestion;
      setAnswers(seed);
      setStage("interview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setStage((s) => (s === "start" ? "start" : "interview"));
    } finally {
      setLoading(false);
    }
  }

  async function generateReport(msgs: Msg[]) {
    setStage("generating");
    setLoading(true);
    setError("");
    try {
      // Two-step so each request stays under the serverless function cap: a fast
      // "prepare" (geocode + satellite, no model call), then the AI-only report.
      const prep = await callApi("prepare", msgs, address);
      // The report is written by a background job (it takes longer than a
      // request may run); this call only starts it, then we wait for it.
      const started = await callApi("report", msgs, address, {
        location: prep.location,
        satellite: prep.satellite,
      });
      const finished = started.jobId ? await waitForReport(started.jobId) : started.report;
      if (!finished) throw new Error("The report came back empty. Please try again.");
      setReport(finished);
      setStage("report");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Report generation failed");
      setStage("interview");
    } finally {
      setLoading(false);
    }
  }

  function start() {
    const content =
      (address.trim() ? `Property address: ${address.trim()}\n\n` : "") +
      `Advisor brief / objective:\n${brief.trim()}`;
    const msgs: Msg[] = [{ role: "user", content }];
    setTranscript(msgs);
    runInterview(msgs);
  }

  /** Fold any answers typed against the current questions into the transcript. */
  function withAnswers(): Msg[] {
    if (!questions.length) return transcript;
    const lines = questions.map(
      (q) => `- ${q.label}\n  Answer: ${(answers[q.id] || "").trim() || "(not provided)"}`,
    );
    return [...transcript, { role: "user", content: `Answers:\n${lines.join("\n")}` }];
  }

  function submitAnswers() {
    const msgs = withAnswers();
    setTranscript(msgs);
    runInterview(msgs);
  }

  /** "Generate report now" — skip further questions but keep any typed answers. */
  function generateNow() {
    const msgs = withAnswers();
    setTranscript(msgs);
    generateReport(msgs);
  }

  // ---------- Render ----------

  if (stage === "report" && report) {
    return (
      <ReportView
        report={report}
        address={address}
        onReset={reset}
        onSave={saveReport}
        saving={saving}
        saved={!!savedId}
      />
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Planning Feasibility</h1>
        <p className="text-sm text-gray-500 mt-1">
          AI-led development feasibility for any property in Australia. Answer a few targeted
          questions and generate a client-ready preliminary planning report.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      {stage === "start" && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <label className="block text-sm font-semibold text-gray-700 mb-1">Property address</label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="e.g. 1491 Riverway Drive, Kelso QLD 4815"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[#0F4C5C]"
          />
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            What do you want to assess?
          </label>
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            rows={4}
            placeholder="e.g. Client wants to know if this block can be subdivided, and whether they can build a duplex and later subdivide it. Anything you already know (zone, lot size, existing approvals, constraints) helps."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-[#0F4C5C]"
          />
          <button
            onClick={start}
            disabled={loading || (!brief.trim() && !address.trim())}
            className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-[#0F4C5C] hover:bg-[#0B3D4A] disabled:opacity-50 transition"
          >
            {loading ? "Analysing…" : "Start assessment"}
          </button>
        </div>
      )}

      {stage === "start" && savedList.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-2">Saved reports</h2>
          <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
            {savedList.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {r.address || r.title || "Untitled report"}
                  </p>
                  <p className="text-xs text-gray-400 truncate">
                    {new Date(r.created_at).toLocaleString("en-AU")}
                    {r.created_by ? ` · ${r.created_by}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => openSaved(r.id)}
                  disabled={loading}
                  className="text-sm font-semibold text-[#0F4C5C] hover:underline disabled:opacity-50"
                >
                  Open
                </button>
                <button
                  onClick={() => deleteSaved(r.id)}
                  className="text-sm text-gray-400 hover:text-red-600 transition"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {stage === "interview" && (
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          {understanding && (
            <div className="mb-4 rounded-lg bg-[#E0F2F1] border-l-4 border-[#0F4C5C] px-4 py-3 text-sm text-gray-800">
              <span className="font-semibold">Understanding: </span>
              {understanding}
            </div>
          )}
          <p className="text-sm text-gray-500 mb-4">
            A few questions to sharpen the report — pre-filled with the AI&apos;s best guesses where
            it could find them. Edit or clear anything, then continue.
          </p>
          <div className="space-y-4">
            {questions.map((q) => (
              <div key={q.id}>
                <label className="block text-sm font-semibold text-gray-700">{q.label}</label>
                {q.why && <p className="text-xs text-gray-400 mb-1">{q.why}</p>}
                <input
                  value={answers[q.id] || ""}
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                  placeholder={q.placeholder || ""}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F4C5C]"
                />
              </div>
            ))}
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              onClick={submitAnswers}
              disabled={loading}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white bg-[#0F4C5C] hover:bg-[#0B3D4A] disabled:opacity-50 transition"
            >
              {loading ? "Working…" : "Continue"}
            </button>
            <button
              onClick={generateNow}
              disabled={loading}
              className="px-5 py-2.5 rounded-lg text-sm font-semibold text-[#0F4C5C] border border-[#0F4C5C] hover:bg-[#E0F2F1] disabled:opacity-50 transition"
            >
              Generate report now
            </button>
            <button
              onClick={reset}
              disabled={loading}
              className="px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:text-gray-800 transition"
            >
              Start over
            </button>
          </div>
        </div>
      )}

      {stage === "generating" && (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center shadow-sm">
          <div className="animate-pulse text-[#0F4C5C] font-semibold">
            Researching the site &amp; generating the report…
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Checking the council planning scheme, cadastre and satellite imagery of the site, then
            preparing the assessment. This can take up to a minute.
          </p>
        </div>
      )}
    </div>
  );
}

function ReportView({
  report,
  address,
  onReset,
  onSave,
  saving,
  saved,
}: {
  report: Report;
  address: string;
  onReset: () => void;
  onSave: () => void;
  saving: boolean;
  saved: boolean;
}) {
  return (
    <div>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #feasibility-report, #feasibility-report * { visibility: visible !important; }
          #feasibility-report { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          @page { size: A4; margin: 16mm 14mm; }
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 bg-gray-50/90 backdrop-blur border-b border-gray-200 px-4 py-3 flex gap-3 items-center">
        <button
          onClick={() => window.print()}
          className="px-4 py-2 text-sm font-semibold bg-[#0F4C5C] text-white rounded-lg hover:bg-[#0B3D4A] transition"
        >
          Export PDF
        </button>
        <button
          onClick={onSave}
          disabled={saving || saved}
          className="px-4 py-2 text-sm font-semibold rounded-lg border border-[#0F4C5C] text-[#0F4C5C] hover:bg-[#E0F2F1] disabled:opacity-60 transition"
        >
          {saved ? "Saved ✓" : saving ? "Saving…" : "Save to CRM"}
        </button>
        <button
          onClick={onReset}
          className="px-4 py-2 text-sm font-semibold text-[#0F4C5C] border border-[#0F4C5C] rounded-lg hover:bg-[#E0F2F1] transition"
        >
          New assessment
        </button>
        <span className="text-xs text-gray-400 ml-auto">
          Preliminary planning information — verify with Council &amp; a town planner
        </span>
      </div>

      <div id="feasibility-report" className="max-w-[900px] mx-auto bg-white px-10 py-8 my-6 shadow-sm text-[#1a2332]">
        {/* Letterhead */}
        <div className="flex justify-between items-start border-b-[3px] pb-4 mb-2" style={{ borderColor: TEAL }}>
          <div>
            <div className="text-2xl font-bold" style={{ color: TEAL }}>
              NextKey
            </div>
            <div className="text-[11px] tracking-[2px] uppercase text-gray-500 mt-0.5">
              Property · Planning · Advisory
            </div>
          </div>
          <div className="text-right text-[11px] text-gray-500 leading-5">
            NEXTKEY PTY LTD · ABN 28 689 818 264
            <br />
            0477 201 245 · glenn.m@nextkey.com.au
            <br />
            nextkey.com.au
          </div>
        </div>

        <FeasibilityReportBody report={report} address={address} color={TEAL} />

        <div className="text-[11px] text-gray-400 text-center mt-6 border-t border-gray-200 pt-3">
          NextKey · Preliminary Planning Feasibility · Generated {new Date().toLocaleDateString("en-AU")}
        </div>
      </div>
    </div>
  );
}
