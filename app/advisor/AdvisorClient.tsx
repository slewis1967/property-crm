"use client";

import { useEffect, useState } from "react";

type Rec = {
  id: string;
  kind: string;
  title: string;
  description: string;
  rationale: string | null;
  suggested_action: string | null;
  code_refs: Array<{ file: string; lines: string; note: string }>;
  confidence: number | null;
  impact: "low" | "medium" | "high" | null;
  status: "pending" | "applied" | "dismissed" | "snoozed" | "in_progress";
  snoozed_until: string | null;
  started_at: string | null;
  started_by: string | null;
  created_at: string;
  /**
   * Optional structured action emitted by the Veteran when the recommendation
   * fits a safe-allowlist mutation (set_app_setting, deactivate/activate/
   * confirm_builder_draft, update_builder_field). Non-null = "🤖 Auto-apply"
   * button shows; one click runs it via /execute endpoint.
   */
  machine_action: Record<string, any> | null;
  /**
   * Senior Advisor's verdict on the Veteran's recommendation. Auto-Apply
   * only fires when senior_status='approved' AND risk_level!='high'.
   */
  senior_status: "pending_review" | "approved" | "rejected" | "deferred" | null;
  senior_decision_at: string | null;
  senior_decision_reason: string | null;
  senior_compliance_notes: string | null;
  risk_level: "low" | "medium" | "high" | null;
};

type Filter = "pending" | "in_progress" | "applied" | "dismissed" | "all";
const FILTER_LABELS: Record<Filter, string> = {
  pending: "Pending",
  in_progress: "In progress",
  applied: "Applied",
  dismissed: "Dismissed",
  all: "All history",
};

const IMPACT_BADGE: Record<string, string> = {
  high: "bg-red-100 text-red-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-gray-100 text-gray-700",
};

const KIND_LABEL: Record<string, string> = {
  prompt_tune: "Prompt tune",
  threshold_change: "Threshold",
  cache_change: "Cache",
  model_change: "Model",
  new_endpoint: "New endpoint",
  ux_improvement: "UX",
  data_quality: "Data quality",
  builder_ops: "Builder ops",
  other: "Other",
};

export default function AdvisorClient() {
  const [filter, setFilter] = useState<Filter>("pending");
  const [items, setItems] = useState<Rec[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Deep-link from Telegram alerts: /advisor?id=<uuid> auto-expands that rec
  // so Sean lands directly on the high-impact thing without scrolling.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const linkedId = params.get("id");
    if (linkedId) setExpandedId(linkedId);
  }, []);

  const load = async () => {
    setItems(null);
    setError(null);
    try {
      const res = await fetch(`/api/advisor/recommendations?status=${filter}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setItems(json.items ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Load failed");
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const action = async (id: string, body: any) => {
    setBusy(id);
    try {
      const res = await fetch(`/api/advisor/recommendations/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      await load();
    } catch (e: any) {
      alert(e?.message ?? "Action failed");
    } finally {
      setBusy(null);
    }
  };

  /**
   * One-click auto-apply for recommendations that have a machine_action.
   * Hits /execute which validates the action against the allowlist, runs
   * the SQL/upsert, marks the rec applied, and audit-logs the result.
   */
  const autoApply = async (r: Rec) => {
    const summary = describeAction(r.machine_action);
    if (!confirm(`Auto-apply this action?\n\n${summary}\n\nThis runs immediately and is recorded in the audit log.`)) return;
    setBusy(r.id);
    try {
      const res = await fetch(`/api/advisor/recommendations/${r.id}/execute`, {
        method: "POST",
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      await load();
    } catch (e: any) {
      alert(`Auto-apply failed: ${e?.message ?? e}`);
    } finally {
      setBusy(null);
    }
  };

  if (error) return <div className="text-red-600 p-4">⚠ {error}</div>;
  if (items === null) return <div className="text-gray-500 p-4 italic">Loading…</div>;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {(["pending", "in_progress", "applied", "dismissed", "all"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              filter === f
                ? "bg-gray-900 text-white"
                : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            }`}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
        <span className="text-xs text-gray-500 ml-2">{items.length} item{items.length === 1 ? "" : "s"}</span>
      </div>

      {items.length === 0 && (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center">
          <p className="text-gray-500 font-medium mb-2">Nothing to action.</p>
          <p className="text-sm text-gray-400">
            The Veteran runs every Friday morning Brisbane time. Recommendations land here.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {items.map((r) => {
          const isOpen = expandedId === r.id;
          const isBusy = busy === r.id;
          const impactBadge = IMPACT_BADGE[r.impact ?? "medium"] ?? IMPACT_BADGE.medium;
          const isPending = r.status === "pending" || r.status === "snoozed";
          const isInProgress = r.status === "in_progress";
          // How long has this been in flight? Useful pressure on stale work.
          const inFlightDays = isInProgress && r.started_at
            ? Math.floor((Date.now() - new Date(r.started_at).getTime()) / (1000 * 60 * 60 * 24))
            : null;
          // Auto-Apply only when Senior approved AND risk isn't high.
          const autoApplyAllowed =
            !!r.machine_action &&
            r.senior_status === "approved" &&
            r.risk_level !== "high";

          return (
            <div
              key={r.id}
              className={`bg-white border rounded-xl shadow-sm transition ${
                r.status === "applied"
                  ? "border-emerald-200 opacity-75"
                  : r.status === "dismissed"
                  ? "border-gray-200 opacity-50"
                  : r.status === "in_progress"
                  ? "border-blue-300 ring-1 ring-blue-100"
                  : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <button
                type="button"
                onClick={() => setExpandedId(isOpen ? null : r.id)}
                className="w-full text-left p-4 flex items-start gap-4"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${impactBadge}`}>
                      {(r.impact ?? "medium").toUpperCase()}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-800">
                      {KIND_LABEL[r.kind] ?? r.kind}
                    </span>
                    {r.confidence != null && (
                      <span className="text-[10px] text-gray-500">
                        confidence {(r.confidence * 100).toFixed(0)}%
                      </span>
                    )}
                    {r.status === "applied" && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-800">
                        ✓ applied
                      </span>
                    )}
                    {r.status === "dismissed" && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-200 text-gray-700">
                        dismissed
                      </span>
                    )}
                    {r.status === "snoozed" && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-800">
                        💤 snoozed until {r.snoozed_until?.slice(0, 10)}
                      </span>
                    )}
                    {r.status === "in_progress" && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-800">
                        🔧 in progress
                        {inFlightDays != null && (
                          <span className="ml-1 text-blue-600">
                            ({inFlightDays === 0 ? "today" : `${inFlightDays}d`})
                          </span>
                        )}
                      </span>
                    )}
                    {/* Senior Advisor verdict */}
                    {r.senior_status === "pending_review" && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-600">
                        ⏳ senior reviewing
                      </span>
                    )}
                    {r.senior_status === "approved" && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700">
                        🎩 senior approved
                      </span>
                    )}
                    {r.senior_status === "rejected" && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700">
                        🎩 senior rejected
                      </span>
                    )}
                    {r.senior_status === "deferred" && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-800">
                        🎩 deferred to Sean
                      </span>
                    )}
                    {r.risk_level === "high" && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-200 text-red-800 border border-red-300">
                        ⚠ HIGH RISK
                      </span>
                    )}
                  </div>
                  <h3 className="text-base font-semibold text-gray-800">{r.title}</h3>
                  <p className="text-sm text-gray-600 mt-1">{r.description}</p>
                </div>
                <span className="text-gray-400 text-xs mt-1">{isOpen ? "▼" : "▶"}</span>
              </button>

              {isOpen && (
                <div className="border-t border-gray-100 p-4 bg-gray-50/50 space-y-3">
                  {r.rationale && (
                    <Detail label="Why">
                      <p className="text-sm text-gray-700">{r.rationale}</p>
                    </Detail>
                  )}
                  {r.suggested_action && (
                    <Detail label="Suggested action">
                      <p className="text-sm text-gray-700">{r.suggested_action}</p>
                    </Detail>
                  )}
                  {(r.code_refs ?? []).length > 0 && (
                    <Detail label="Code references">
                      <ul className="text-xs text-gray-700 space-y-1">
                        {r.code_refs.map((cr, i) => (
                          <li key={i} className="font-mono">
                            <span className="text-blue-700">{cr.file}</span>
                            {cr.lines && cr.lines !== "N/A" && (
                              <span className="text-gray-500"> · {cr.lines}</span>
                            )}
                            {cr.note && <span className="text-gray-600"> — {cr.note}</span>}
                          </li>
                        ))}
                      </ul>
                    </Detail>
                  )}
                  {(r.senior_decision_reason || r.senior_compliance_notes) && (
                    <Detail label="🎩 Senior Advisor verdict">
                      {r.senior_decision_reason && (
                        <p className="text-sm text-gray-700">{r.senior_decision_reason}</p>
                      )}
                      {r.senior_compliance_notes && (
                        <p className="text-xs text-amber-700 mt-1">
                          <span className="font-medium">AU compliance:</span>{" "}
                          {r.senior_compliance_notes}
                        </p>
                      )}
                      {r.risk_level && (
                        <p className="text-[11px] text-gray-500 mt-1">
                          Risk level: <strong>{r.risk_level}</strong>
                        </p>
                      )}
                    </Detail>
                  )}
                  {r.machine_action && (
                    <Detail label="🤖 Machine action available">
                      <p className="text-xs text-gray-700">
                        {describeAction(r.machine_action)}
                      </p>
                      <p className="text-[11px] text-gray-500 mt-1">
                        Auto-Apply runs this immediately and records it in the audit log.
                        {!autoApplyAllowed && r.machine_action && (
                          <span className="block text-amber-700 mt-1">
                            {r.senior_status === "pending_review" &&
                              "⏳ Auto-Apply locked until Senior reviews (next Friday 9:30am AEST)."}
                            {r.senior_status === "rejected" &&
                              "✗ Auto-Apply blocked — Senior rejected this recommendation."}
                            {r.senior_status === "deferred" &&
                              "⏸ Auto-Apply requires your call — use Mark applied if you accept."}
                            {r.senior_status === "approved" && r.risk_level === "high" &&
                              "⚠ Auto-Apply blocked — high-risk action requires your manual review."}
                          </span>
                        )}
                      </p>
                    </Detail>
                  )}
                  {isPending && (
                    <div className="flex gap-2 pt-2 flex-wrap">
                      {r.machine_action && autoApplyAllowed && (
                        <button
                          type="button"
                          onClick={() => autoApply(r)}
                          disabled={isBusy}
                          className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 disabled:opacity-50"
                          title="Run the structured action server-side and mark applied"
                        >
                          🤖 Auto-Apply
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => action(r.id, { action: "start" })}
                        disabled={isBusy}
                        className="px-3 py-1.5 bg-blue-100 text-blue-800 text-xs font-medium rounded border border-blue-200 hover:bg-blue-200 disabled:opacity-50"
                        title="Move to In Progress — actively working on it, not done yet"
                      >
                        🔧 Start
                      </button>
                      <button
                        type="button"
                        onClick={() => action(r.id, { action: "apply" })}
                        disabled={isBusy}
                        className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded hover:bg-emerald-700 disabled:opacity-50"
                        title="Mark applied (you'll do the actual change manually)"
                      >
                        ✓ Mark applied
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const reason = prompt("Why dismissing? (helps the agent learn)");
                          if (reason !== null) action(r.id, { action: "dismiss", reason });
                        }}
                        disabled={isBusy}
                        className="px-3 py-1.5 bg-white text-gray-700 text-xs font-medium rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                      >
                        ✗ Dismiss
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const days = prompt("Snooze for how many days?", "7");
                          const n = parseInt(days ?? "", 10);
                          if (n > 0) action(r.id, { action: "snooze", snooze_days: n });
                        }}
                        disabled={isBusy}
                        className="px-3 py-1.5 bg-white text-gray-700 text-xs font-medium rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                      >
                        💤 Snooze
                      </button>
                    </div>
                  )}
                  {isInProgress && (
                    <div className="flex gap-2 pt-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => action(r.id, { action: "complete" })}
                        disabled={isBusy}
                        className="px-3 py-1.5 bg-emerald-600 text-white text-xs font-medium rounded hover:bg-emerald-700 disabled:opacity-50"
                        title="Mark complete — moves to Applied"
                      >
                        ✓ Complete
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm("Move back to Pending? Your in-flight work won't be saved as applied.")) {
                            action(r.id, { action: "reopen" });
                          }
                        }}
                        disabled={isBusy}
                        className="px-3 py-1.5 bg-white text-gray-700 text-xs font-medium rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                        title="Give up — back to Pending queue"
                      >
                        ↩ Back to pending
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">{label}</p>
      {children}
    </div>
  );
}

function describeAction(a: Record<string, any> | null): string {
  if (!a) return "(no machine action)";
  switch (a.kind) {
    case "set_app_setting":
      return `Set app_settings[${a.key}] = ${JSON.stringify(a.value)}`;
    case "deactivate_builder":
      return `Mark builder ${(a.builder_id || "").slice(0, 8)}… as inactive`;
    case "activate_builder":
      return `Mark builder ${(a.builder_id || "").slice(0, 8)}… as active`;
    case "confirm_builder_draft":
      return `Confirm builder ${(a.builder_id || "").slice(0, 8)}… (clear draft flag)`;
    case "update_builder_field":
      return `Update ${a.field} on builder ${(a.builder_id || "").slice(0, 8)}… → ${JSON.stringify(a.value)}`;
    default:
      return `Unknown action: ${a.kind}`;
  }
}
