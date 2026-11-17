"use client";

/**
 * New assessment: address + objective → prepare (geocode) → interview (the AI
 * may ask a few questions) → report (saved, counts toward the monthly
 * allowance) → open the saved report.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };
type Question = { id: string; label: string; why?: string; placeholder?: string; suggestion?: string };

async function call(body: Record<string, unknown>) {
  const res = await fetch("/api/partner/feasibility", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const raw = await res.text();
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(res.status >= 500 ? "The server took too long. Please try again." : `Request failed (${res.status}).`);
  }
  if (!res.ok || !json.ok) throw new Error(typeof json.error === "string" ? json.error : `Request failed (${res.status}).`);
  return json;
}

export default function FeasibilityTool({ accent, remaining }: { accent: string; remaining: number | null }) {
  const router = useRouter();
  const [address, setAddress] = useState("");
  const [objective, setObjective] = useState("");
  const [stage, setStage] = useState<"form" | "working" | "questions">("form");
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [understanding, setUnderstanding] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [prepared, setPrepared] = useState<{ location: unknown } | null>(null);

  async function generate(transcript: Msg[], prep: { location: unknown } | null) {
    setStage("working");
    setStatus("Starting the report…");
    const r = await call({ phase: "report", address, objective, messages: transcript, prepared: prep ?? undefined });
    if (typeof r.id !== "string") throw new Error("Couldn't start the report. Please try again.");
    // The report is written in the background; its page waits for it.
    router.push(`/partner/feasibility/${r.id}`);
  }

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStage("working");
    try {
      setStatus("Locating the site…");
      const prep = await call({ phase: "prepare", address });
      const p = { location: prep.location ?? null };
      setPrepared(p);
      const first: Msg = {
        role: "user",
        content: `Property address: ${address}\n\nAdvisor brief / objective:\n${objective.trim() || "Assess subdivision and additional-dwelling potential."}`,
      };
      setStatus("Researching the council's planning scheme…");
      const iv = await call({ phase: "interview", address, objective, messages: [first] });
      if (iv.status === "ready" || !Array.isArray(iv.questions) || iv.questions.length === 0) {
        await generate([first], p);
        return;
      }
      // Same transcript shape as the staff tool: what was asked, then the answers.
      const qs = iv.questions as Question[];
      const understood = typeof iv.understanding === "string" ? iv.understanding : "";
      const asked =
        (understood ? `Understanding: ${understood}\n` : "") +
        "Questions:\n" +
        qs.map((q, i) => `${i + 1}. ${q.label}`).join("\n");
      setMessages([first, { role: "assistant", content: asked }]);
      setUnderstanding(understood);
      setQuestions(qs);
      setAnswers(Object.fromEntries(qs.map((q) => [q.id, q.suggestion ?? ""])));
      setStage("questions");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStage("form");
    }
  }

  async function answer(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const lines = questions.map((q) => `- ${q.label}\n  Answer: ${answers[q.id]?.trim() || "(not provided)"}`);
    const reply = `Answers:\n${lines.join("\n")}`;
    try {
      await generate([...messages, { role: "user", content: reply }], prepared);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStage("questions");
    }
  }

  const field = "mt-1 w-full rounded-xl border border-slate-300 bg-white shadow-sm px-3 py-2 text-sm";
  const outOfReports = remaining !== null && remaining <= 0;

  if (stage === "working") {
    return <div className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-8px_rgba(15,23,42,0.08)] p-6 text-sm text-slate-700">{status}</div>;
  }

  if (stage === "questions") {
    return (
      <form onSubmit={answer} className="space-y-4 rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-8px_rgba(15,23,42,0.08)] p-5">
        {understanding && <p className="text-sm text-slate-700">{understanding}</p>}
        <p className="text-sm text-slate-600">A few questions so the report is accurate. Best guesses are filled in where we found them.</p>
        {questions.map((q) => (
          <label key={q.id} className="block text-sm font-medium text-slate-700">
            {q.label}
            {q.why && <span className="block text-xs font-normal text-slate-500">{q.why}</span>}
            <input className={field} value={answers[q.id] ?? ""} placeholder={q.placeholder} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />
          </label>
        ))}
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button type="submit" className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={{ background: accent }}>
          Write the report
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={start} className="space-y-3 rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-8px_rgba(15,23,42,0.08)] p-5">
      <label className="block text-sm font-medium text-slate-700">
        Site address
        <input className={field} value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. 12 Example Street, Suburb QLD 4000" required />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        What do you want to assess? <span className="font-normal text-slate-500">(optional)</span>
        <textarea className={field} rows={3} value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="e.g. Can this block be subdivided, or take a granny flat or a duplex?" />
      </label>
      {error && <p className="text-sm text-red-700">{error}</p>}
      <button
        type="submit"
        disabled={outOfReports || address.trim().length < 8}
        className="rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        style={{ background: accent }}
      >
        Start assessment
      </button>
      {outOfReports && <p className="text-sm text-slate-600">You&apos;ve used this month&apos;s reports. Ask your NextKey contact if you need more.</p>}
    </form>
  );
}
