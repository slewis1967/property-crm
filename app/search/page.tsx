"use client";

import { useState } from "react";
import Link from "next/link";

type Result = { contact_id: string; name: string; rationale: string };

const EXAMPLE_QUERIES = [
  "FHB warm leads in QLD under $700k",
  "NDIS buyers in NSW",
  "investors not contacted in 30 days",
  "hot contacts in WA with finance pre-approved",
  "anyone tagged getahome with budget over 500k",
];

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [state, setState] = useState<
    | { phase: "idle" }
    | { phase: "loading" }
    | {
        phase: "ready";
        results: Result[];
        filters_applied: Record<string, any>;
        candidate_count: number;
      }
    | { phase: "error"; error: string }
  >({ phase: "idle" });

  const search = async () => {
    if (!query.trim()) return;
    setState({ phase: "loading" });
    try {
      const res = await fetch("/api/ai/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const json = await res.json();
      if (json.ok)
        setState({
          phase: "ready",
          results: json.results || [],
          filters_applied: json.filters_applied || {},
          candidate_count: json.candidate_count || 0,
        });
      else setState({ phase: "error", error: json.error || "Search failed" });
    } catch (e: any) {
      setState({ phase: "error", error: e?.message ?? "Search failed" });
    }
  };

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Search</h1>
        <p className="text-gray-500 text-sm mt-1">
          Plain English. Elvis parses what you mean and ranks the best matches.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="e.g. FHB warm leads in QLD under $700k"
            className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="button"
            onClick={search}
            disabled={state.phase === "loading" || !query.trim()}
            className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50"
          >
            {state.phase === "loading" ? "Thinking…" : "Search"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {EXAMPLE_QUERIES.map((eq) => (
            <button
              key={eq}
              type="button"
              onClick={() => {
                setQuery(eq);
              }}
              className="px-2.5 py-1 rounded-full text-xs bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100"
            >
              {eq}
            </button>
          ))}
        </div>
      </div>

      {state.phase === "loading" && (
        <div className="space-y-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-14 bg-gray-50 rounded-xl animate-pulse" />
          ))}
        </div>
      )}

      {state.phase === "ready" && (
        <>
          <div className="text-xs text-gray-500 mb-3 flex items-center gap-2 flex-wrap">
            <span>
              {state.results.length} match{state.results.length === 1 ? "" : "es"} from{" "}
              {state.candidate_count} candidate
              {state.candidate_count === 1 ? "" : "s"}
            </span>
            <span className="text-gray-300">·</span>
            <FilterChips filters={state.filters_applied} />
          </div>

          {state.results.length === 0 ? (
            <div className="bg-white rounded-xl border border-dashed border-gray-300 p-8 text-center text-gray-400 text-sm">
              No clear matches. Try rephrasing or relaxing the criteria.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {state.results.map((r) => (
                <Link
                  key={r.contact_id}
                  href={`/contacts/${r.contact_id}`}
                  className="block px-4 py-3 hover:bg-gray-50 transition"
                >
                  <p className="text-sm font-semibold text-blue-600 hover:underline">
                    {r.name}
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">{r.rationale}</p>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {state.phase === "error" && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          ⚠️ {state.error}
        </div>
      )}
    </div>
  );
}

function FilterChips({ filters }: { filters: Record<string, any> }) {
  const chips: string[] = [];
  if (filters.state) chips.push(`state: ${filters.state}`);
  if (filters.buyer_type) chips.push(`type: ${filters.buyer_type}`);
  if (filters.temperature) chips.push(`temp: ${filters.temperature}`);
  if (filters.budget_min || filters.budget_max)
    chips.push(`budget: ${filters.budget_min ?? "?"} – ${filters.budget_max ?? "?"}`);
  if (Array.isArray(filters.tags_any) && filters.tags_any.length > 0)
    chips.push(`tags any: ${filters.tags_any.join(", ")}`);
  if (Array.isArray(filters.tags_all) && filters.tags_all.length > 0)
    chips.push(`tags all: ${filters.tags_all.join(", ")}`);
  if (filters.min_days_since_contact)
    chips.push(`stale ${filters.min_days_since_contact}d+`);
  if (filters.max_days_since_contact)
    chips.push(`recent ≤${filters.max_days_since_contact}d`);
  if (filters.free_text) chips.push(`text: ${filters.free_text}`);
  if (chips.length === 0) return <span className="text-gray-400 italic">no filters parsed</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {chips.map((c, i) => (
        <span
          key={i}
          className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-medium border border-indigo-100"
        >
          {c}
        </span>
      ))}
    </span>
  );
}
