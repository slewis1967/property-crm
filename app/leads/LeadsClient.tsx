"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export type LeadRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  buyer_type: string | null;
  state: string | null;
  budget: string | number | null;
  triage_score: string | number | null;
  match_status: string | null;
  top_match_name: string | null;
  source: string | null;
  created_at: string | null;
  promoted_at?: string | null;
  promoted_opportunity_id?: string | null;
};

type Pipeline = { id: string; name: string; stages?: { id?: string; name?: string }[] };

const TEAL = "#0F4C5C";

const matchColor = (s: string | null) => {
  if (s === "matched") return "bg-green-100 text-green-700";
  if (s === "pending") return "bg-yellow-100 text-yellow-700";
  return "bg-gray-100 text-gray-600";
};

export default function LeadsClient({ initialLeads }: { initialLeads: LeadRow[] }) {
  const [leads, setLeads] = useState<LeadRow[]>(initialLeads);
  const [filter, setFilter] = useState<"inbox" | "all">("inbox");
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelineId, setPipelineId] = useState<string>("");
  const [promoting, setPromoting] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; bad?: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/pipelines", { cache: "no-store" });
        const json = await res.json();
        if (!cancelled && Array.isArray(json.pipelines)) {
          setPipelines(json.pipelines);
          if (json.pipelines[0]?.id) setPipelineId(String(json.pipelines[0].id));
        }
      } catch { /* pipelines optional; promote falls back to NEXUS default */ }
    })();
    return () => { cancelled = true; };
  }, []);

  function flash(msg: string, bad?: boolean) {
    setToast({ msg, bad });
    setTimeout(() => setToast(null), 4500);
  }

  async function promote(lead: LeadRow) {
    if (promoting) return;
    setPromoting(lead.id);
    const pipeline = pipelines.find((p) => String(p.id) === pipelineId);
    const stage = pipeline?.stages?.[0];
    try {
      const res = await fetch("/api/leads/promote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: lead.id,
          pipeline_id: pipelineId || undefined,
          stage: (stage?.id ?? stage?.name) || undefined,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        flash(json.error || "Could not promote the lead.", true);
      } else {
        setLeads((list) => list.map((l) => (l.id === lead.id ? { ...l, promoted_at: new Date().toISOString(), promoted_opportunity_id: json.opportunityId } : l)));
        flash(json.marked ? `Promoted “${lead.name || lead.email}” to the pipeline.` : "Opportunity created — run the migration to hide promoted leads here.");
      }
    } catch {
      flash("Could not reach the server.", true);
    }
    setPromoting(null);
  }

  const promotedCount = leads.filter((l) => l.promoted_at).length;
  const matchedCount = leads.filter((l) => l.match_status === "matched").length;
  const visible = filter === "inbox" ? leads.filter((l) => !l.promoted_at) : leads;

  return (
    <div>
      <div className="flex justify-between items-start mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold">Lead Intake</h1>
          <p className="text-gray-500 text-sm mt-1">Inbound leads triaged by Elvis AI — promote a lead to move it into the working pipeline.</p>
        </div>
        <Link href="/opportunities" className="text-sm font-semibold rounded-lg border px-3.5 py-2" style={{ borderColor: TEAL, color: TEAL }}>
          Working pipeline →
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-5 sm:gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500 uppercase font-semibold">To triage</p>
          <p className="text-2xl font-bold mt-1">{leads.length - promotedCount}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500 uppercase font-semibold">Matched</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{matchedCount}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
          <p className="text-xs text-gray-500 uppercase font-semibold">Promoted</p>
          <p className="text-2xl font-bold mt-1" style={{ color: TEAL }}>{promotedCount}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex gap-1 text-xs">
          {(["inbox", "all"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md font-medium ${filter === f ? "text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
              style={filter === f ? { backgroundColor: TEAL } : undefined}>
              {f === "inbox" ? "To triage" : "All leads"}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-500">
          Promote into:
          <select value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}
            className="rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm bg-white">
            {pipelines.length === 0 && <option value="">Default pipeline</option>}
            {pipelines.map((p) => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
          </select>
        </label>
      </div>

      {toast && (
        <div className={`mb-3 rounded-lg px-4 py-2.5 text-sm ${toast.bad ? "bg-rose-50 text-rose-700 border border-rose-200" : "bg-green-50 text-green-700 border border-green-200"}`}>{toast.msg}</div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {visible.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr className="text-left text-gray-500">
                  {["Name", "Email", "Type", "State", "Budget", "Score", "Match", "Top Match", "Source", "Date", ""].map((h) => (
                    <th key={h} className="px-4 py-3 font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((l) => (
                  <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-medium whitespace-nowrap">{l.name || "—"}</td>
                    <td className="px-4 py-3 text-gray-500">{l.email || "—"}</td>
                    <td className="px-4 py-3 capitalize">{l.buyer_type || "—"}</td>
                    <td className="px-4 py-3">{l.state || "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{l.budget || "—"}</td>
                    <td className="px-4 py-3 font-semibold">{l.triage_score ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${matchColor(l.match_status)}`}>{l.match_status || "unmatched"}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-[170px] truncate" title={l.top_match_name || ""}>{l.top_match_name || "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 capitalize">{l.source || "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{l.created_at ? new Date(l.created_at).toLocaleDateString("en-AU") : "—"}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      {l.promoted_at ? (
                        <Link href="/opportunities" className="text-xs font-medium text-green-600 hover:underline">✓ In pipeline</Link>
                      ) : (
                        <button onClick={() => promote(l)} disabled={promoting === l.id}
                          className="text-xs font-semibold rounded-lg px-3 py-1.5 text-white disabled:opacity-50" style={{ backgroundColor: TEAL }}>
                          {promoting === l.id ? "Promoting…" : "→ Promote"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center">
            <p className="text-gray-500 font-medium mb-1">{filter === "inbox" ? "Inbox clear — every lead has been promoted or triaged." : "No leads yet."}</p>
            <p className="text-gray-400 text-sm">New inbound leads land here from the Springboard funnel and Facebook forms.</p>
          </div>
        )}
      </div>
    </div>
  );
}
