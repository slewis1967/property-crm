"use client";

import { useState, type CSSProperties } from "react";

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
};

const TEAL = "#0F4C5C";

const CALLOUT: Record<Tone, string> = {
  good: "background:#ECFDF5;border-color:#059669;",
  warn: "background:#FFFBEB;border-color:#D97706;",
  bad: "background:#FEF2F2;border-color:#DC2626;",
  info: "background:#EFF6FF;border-color:#0F4C5C;",
};

const PILL: Record<Tone, string> = {
  good: "bg-emerald-100 text-emerald-800",
  warn: "bg-amber-100 text-amber-800",
  bad: "bg-red-100 text-red-800",
  info: "bg-[#E0F2F1] text-[#0F4C5C]",
};

async function callApi(phase: "interview" | "report", messages: Msg[]) {
  const res = await fetch("/api/ai/planning-feasibility", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phase, messages }),
  });
  const json = await res.json();
  if (!res.ok || !json.ok) {
    throw new Error(json?.error || `Request failed (${res.status})`);
  }
  return json;
}

export default function FeasibilityClient({ initialAddress = "" }: { initialAddress?: string }) {
  const [stage, setStage] = useState<"start" | "interview" | "generating" | "report">("start");
  const [address, setAddress] = useState(initialAddress);
  const [brief, setBrief] = useState("");
  const [transcript, setTranscript] = useState<Msg[]>([]);
  const [understanding, setUnderstanding] = useState("");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    setStage("start");
    setTranscript([]);
    setUnderstanding("");
    setQuestions([]);
    setAnswers({});
    setReport(null);
    setError("");
  }

  async function runInterview(msgs: Msg[]) {
    setLoading(true);
    setError("");
    try {
      const json = await callApi("interview", msgs);
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
      const json = await callApi("report", msgs);
      setReport(json.report);
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
    return <ReportView report={report} onReset={reset} />;
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
            Generating comprehensive report…
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Researching the council planning scheme and preparing the assessment. This can take up to
            a minute.
          </p>
        </div>
      )}
    </div>
  );
}

function ReportView({ report, onReset }: { report: Report; onReset: () => void }) {
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
            0477 007 785 · sean.l@nextkey.com.au
            <br />
            nextkey.com.au
          </div>
        </div>

        <h1 className="text-2xl font-bold mt-6 mb-1">
          {report.title || "Preliminary Planning Feasibility Assessment"}
        </h1>
        {report.subtitle && <p className="text-sm text-gray-500">{report.subtitle}</p>}

        {(report.meta?.scope || report.meta?.statusPills?.length) && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {report.meta?.statusPills?.map((p, i) => (
              <span
                key={i}
                className={`inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full ${PILL[p.tone || "info"]}`}
              >
                {p.label}
              </span>
            ))}
            {report.meta?.scope && <span className="text-xs text-gray-500">{report.meta.scope}</span>}
          </div>
        )}

        {!!report.keyStats?.length && (
          <div className="flex gap-3 my-5">
            {report.keyStats.slice(0, 4).map((s, i) => (
              <div key={i} className="flex-1 border border-gray-200 rounded-md px-3 py-3 text-center">
                <div className="text-lg font-bold" style={{ color: TEAL }}>
                  {s.n}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-gray-500">{s.l}</div>
              </div>
            ))}
          </div>
        )}

        {report.sections?.map((sec, si) => (
          <section key={si} style={{ breakInside: "avoid" }}>
            <h2
              className="text-[15px] font-semibold uppercase tracking-wide border-b border-gray-200 pb-1.5 mt-8 mb-3"
              style={{ color: TEAL }}
            >
              {sec.heading}
            </h2>
            {sec.blocks?.map((b, bi) => (
              <BlockView key={bi} block={b} />
            ))}
          </section>
        ))}

        {report.disclaimer && (
          <div className="text-[11.5px] text-gray-500 border-t border-gray-200 mt-9 pt-3.5">
            <span className="font-semibold">Important disclaimer. </span>
            {report.disclaimer}
          </div>
        )}

        <div className="text-[11px] text-gray-400 text-center mt-6 border-t border-gray-200 pt-3">
          NextKey · Preliminary Planning Feasibility · Generated {new Date().toLocaleDateString("en-AU")}
        </div>
      </div>
    </div>
  );
}

function BlockView({ block }: { block: Block }) {
  if (block.type === "p") {
    return <p className="text-[13.5px] leading-relaxed my-2">{block.text}</p>;
  }
  if (block.type === "bullets") {
    return (
      <ul className="list-disc pl-5 my-2 space-y-1">
        {block.items.map((it, i) => (
          <li key={i} className="text-[13.5px] leading-snug">
            {it}
          </li>
        ))}
      </ul>
    );
  }
  if (block.type === "callout") {
    return (
      <div
        className="my-3 rounded border-l-4 px-4 py-3 text-[13.5px]"
        style={{ ...parseStyle(CALLOUT[block.tone || "info"]), breakInside: "avoid" }}
      >
        {block.title && <span className="font-semibold">{block.title}. </span>}
        {block.text}
      </div>
    );
  }
  if (block.type === "table") {
    return (
      <table className="w-full border-collapse my-3 text-[13px]" style={{ breakInside: "avoid" }}>
        {block.columns?.length ? (
          <thead>
            <tr>
              {block.columns.map((c, i) => (
                <th
                  key={i}
                  className="text-left px-3 py-2 border-b border-gray-200 font-semibold"
                  style={{ background: "#EAF2F4" }}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {block.rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-2 border-b border-gray-200 align-top">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }
  return null;
}

function parseStyle(css: string): CSSProperties {
  const out: Record<string, string> = {};
  for (const rule of css.split(";")) {
    const [k, v] = rule.split(":");
    if (!k || !v) continue;
    const key = k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[key] = v.trim();
  }
  return out as CSSProperties;
}
