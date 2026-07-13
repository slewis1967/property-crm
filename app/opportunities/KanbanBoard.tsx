"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import NewOpportunityModal from "./NewOpportunityModal";
import NewPipelineModal from "./NewPipelineModal";
import { log, errInfo } from "../../utils/logger";
import { errMessage } from "../../utils/errors";

// ── Types ────────────────────────────────────────────────────────────────────

export type Pipeline = {
  id: string;
  name: string;
  stages: string[];
  color: string;
  created_at: string;
};

export type Lead = {
  lead_id: string;
  full_name: string | null;
  email: string | null;
  buyer_type: string | null;
  state: string | null;
  budget: string | null;
  score: number | null;
  temperature: string | null;
  ghl_stage: string | null;
  match_status: string | null;
  top_match_name: string | null;
  top_match_price: string | null;
  created_at: string | null;
  pipeline_id: string | null;
  tags: string | null;
  _stage?: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const STAGE_PALETTE = [
  { color: "bg-gray-100",   accent: "border-gray-400",   dot: "bg-gray-400"   },
  { color: "bg-blue-50",    accent: "border-blue-400",   dot: "bg-blue-400"   },
  { color: "bg-purple-50",  accent: "border-purple-400", dot: "bg-purple-400" },
  { color: "bg-yellow-50",  accent: "border-yellow-400", dot: "bg-yellow-400" },
  { color: "bg-orange-50",  accent: "border-orange-400", dot: "bg-orange-400" },
  { color: "bg-pink-50",    accent: "border-pink-400",   dot: "bg-pink-400"   },
  { color: "bg-green-50",   accent: "border-green-500",  dot: "bg-green-500"  },
  { color: "bg-red-50",     accent: "border-red-400",    dot: "bg-red-400"    },
  { color: "bg-teal-50",    accent: "border-teal-400",   dot: "bg-teal-400"   },
  { color: "bg-indigo-50",  accent: "border-indigo-400", dot: "bg-indigo-400" },
];

function buildStages(names: string[]) {
  return names.map((name, i) => ({
    id: name,
    label: name,
    ...STAGE_PALETTE[i % STAGE_PALETTE.length],
  }));
}

function normaliseStage(raw: string | null, stages: string[]): string {
  if (!raw) return stages[0] || "New Lead";
  // Exact match first
  if (stages.includes(raw)) return raw;
  // Fuzzy fallback for legacy data
  const s = raw.toLowerCase();
  if (s.includes("won"))      return stages.find(x => x.toLowerCase().includes("won"))  || stages[stages.length - 2] || stages[0];
  if (s.includes("lost"))     return stages.find(x => x.toLowerCase().includes("lost")) || stages[stages.length - 1] || stages[0];
  if (s.includes("qualif"))   return stages.find(x => x.toLowerCase().includes("qualif")) || stages[1] || stages[0];
  if (s.includes("match"))    return stages.find(x => x.toLowerCase().includes("match")) || stages[0];
  if (s.includes("contact"))  return stages.find(x => x.toLowerCase().includes("contact")) || stages[0];
  if (s.includes("proposal") || s.includes("sent")) return stages.find(x => x.toLowerCase().includes("proposal") || x.toLowerCase().includes("sent")) || stages[0];
  if (s.includes("negotiat")) return stages.find(x => x.toLowerCase().includes("negotiat")) || stages[0];
  return stages[0];
}

const tempBadge = (t: string | null) => {
  if (t === "hot")  return "bg-red-100 text-red-700";
  if (t === "warm") return "bg-yellow-100 text-yellow-700";
  return "bg-blue-100 text-blue-700";
};

const TAG_COLORS = [
  "bg-blue-100 text-blue-700", "bg-violet-100 text-violet-700",
  "bg-emerald-100 text-emerald-700", "bg-amber-100 text-amber-700",
  "bg-pink-100 text-pink-700", "bg-cyan-100 text-cyan-700",
  "bg-orange-100 text-orange-700", "bg-indigo-100 text-indigo-700",
];
const tagColor = (tag: string) => TAG_COLORS[Math.abs(tag.split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % TAG_COLORS.length];

function parseTags(raw: string | null): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function KanbanBoard({
  initialLeads,
  initialPipelines,
}: {
  initialLeads: Lead[];
  initialPipelines: Pipeline[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Pipelines
  const [pipelines, setPipelines] = useState<Pipeline[]>(initialPipelines);
  // The active pipeline is URL-addressable via ?pipeline=<id> so a deep link
  // (e.g. the back button on an opportunity card) opens the right pipeline and
  // survives refresh. Fall back to the first pipeline when the param is absent
  // or points at a pipeline we don't have.
  const [activePipelineId, setActivePipelineId] = useState<string>(() => {
    const param = searchParams.get("pipeline");
    if (param && initialPipelines.some((p) => p.id === param)) return param;
    return initialPipelines[0]?.id || "";
  });
  const [showNewPipeline, setShowNewPipeline] = useState(false);
  const [deletingPipelineId, setDeletingPipelineId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Switch the active pipeline and mirror it into the URL (?pipeline=<id>) with
  // replaceState so the view is shareable, survives refresh, and doesn't spam
  // the history stack. An empty id clears the param.
  const selectPipeline = useCallback((id: string) => {
    setActivePipelineId(id);
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (id) params.set("pipeline", id);
    else params.delete("pipeline");
    const qs = params.toString();
    router.replace(qs ? `/opportunities?${qs}` : "/opportunities", { scroll: false });
  }, [router, searchParams]);

  const deletePipeline = async (pipelineId: string) => {
    setDeletingPipelineId(pipelineId);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/pipelines/${pipelineId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { setDeleteError(data.error || "Failed to delete"); return; }
      const remaining = pipelines.filter(p => p.id !== pipelineId);
      setPipelines(remaining);
      if (activePipelineId === pipelineId) selectPipeline(remaining[0]?.id || "");
    } finally {
      setDeletingPipelineId(null);
    }
  };

  const activePipeline = pipelines.find(p => p.id === activePipelineId) || pipelines[0];
  // No fallback to hardcoded stages — if the pipelines list is empty we render
  // an explicit empty state below. A phantom column set used to appear here
  // when the SSR fetch failed silently and dropped us into a fake kanban.
  const stages = activePipeline ? buildStages(activePipeline.stages) : [];

  // Leads
  const normalise = useCallback((leads: Lead[]) =>
    leads.map(l => ({
      ...l,
      _stage: normaliseStage(l.ghl_stage, activePipeline?.stages || ["New Lead"]),
    })),
  [activePipeline]);

  const [leads, setLeads] = useState(() => normalise(initialLeads));
  const [showModal, setShowModal] = useState(false);

  // Re-normalise when pipeline changes
  useEffect(() => {
    queueMicrotask(() => setLeads(prev => prev.map(l => ({ ...l, _stage: normaliseStage(l.ghl_stage, activePipeline?.stages || ["New Lead"]) }))));
  }, [activePipelineId]);

  // Tags
  const allTags = Array.from(new Set(leads.flatMap(l => parseTags(l.tags))));
  const [tagFilter, setTagFilter] = useState<string | null>(null);

  // Drag
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [autoMoved, setAutoMoved] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [lastSync, setLastSync] = useState<Date>(new Date());
  const prevStagesRef = useRef<Record<string, string>>({});

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const toggleSelect = (leadId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(leadId)) next.delete(leadId); else next.add(leadId);
      return next;
    });
  };

  const clearSelection = () => setSelected(new Set());

  // Add new stage (column) to the active pipeline
  const [addingStage, setAddingStage] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  // Insert position is an index in the resulting stages array — 0 = first column
  const [newStagePosition, setNewStagePosition] = useState<number | null>(null);
  const [stageError, setStageError] = useState<string | null>(null);

  // Default position to end whenever the form opens or the pipeline changes
  useEffect(() => {
    if (addingStage) {
      const v = activePipeline?.stages.length ?? 0;
      queueMicrotask(() => setNewStagePosition(v));
    }
  }, [addingStage, activePipelineId, activePipeline?.stages.length]);

  // Delete a stage (column) from the active pipeline. Only allowed when the
  // column is empty — UI guards on cards.length === 0 below.
  const [deletingStage, setDeletingStage] = useState<string | null>(null);

  const deleteStage = async (stageName: string) => {
    if (!activePipeline) return;
    if (activePipeline.stages.length <= 1) {
      setStageError("A pipeline needs at least one stage");
      return;
    }
    if (!window.confirm(`Delete the "${stageName}" column from this pipeline?`)) return;
    const nextStages = activePipeline.stages.filter(s => s !== stageName);
    const prev = pipelines;
    setDeletingStage(stageName);
    setStageError(null);
    setPipelines(p => p.map(pl => pl.id === activePipeline.id ? { ...pl, stages: nextStages } : pl));
    try {
      const res = await fetch(`/api/pipelines/${activePipeline.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stages: nextStages }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete stage");
      }
    } catch (e) {
      setPipelines(prev);
      setStageError(errMessage(e, "Failed to delete stage"));
    } finally {
      setDeletingStage(null);
    }
  };

  const addStage = async () => {
    const name = newStageName.trim();
    if (!name || !activePipeline) return;
    if (activePipeline.stages.includes(name)) {
      setStageError(`A stage called "${name}" already exists in this pipeline`);
      return;
    }
    const pos = newStagePosition ?? activePipeline.stages.length;
    const nextStages = [
      ...activePipeline.stages.slice(0, pos),
      name,
      ...activePipeline.stages.slice(pos),
    ];
    const prev = pipelines;
    // Optimistic update
    setPipelines(p => p.map(pl => pl.id === activePipeline.id ? { ...pl, stages: nextStages } : pl));
    setNewStageName("");
    setAddingStage(false);
    setStageError(null);
    try {
      const res = await fetch(`/api/pipelines/${activePipeline.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stages: nextStages }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save stage");
      }
    } catch (e) {
      setPipelines(prev);
      setStageError(errMessage(e, "Failed to save stage"));
    }
  };

  const bulkDelete = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!window.confirm(`Delete ${ids.length} opportunit${ids.length === 1 ? "y" : "ies"}? This can't be undone.`)) return;
    setBulkDeleting(true);
    setBulkError(null);
    setBulkProgress({ done: 0, total: ids.length });
    const failed: string[] = [];
    let done = 0;
    await Promise.all(ids.map(async id => {
      try {
        const res = await fetch(`/api/opportunities/${id}`, { method: "DELETE" });
        if (!res.ok) failed.push(id);
      } catch { failed.push(id); }
      done += 1;
      setBulkProgress({ done, total: ids.length });
    }));
    const succeeded = new Set(ids.filter(id => !failed.includes(id)));
    setLeads(prev => prev.filter(l => !succeeded.has(l.lead_id)));
    setSelected(new Set(failed));
    setBulkDeleting(false);
    setBulkProgress(null);
    if (failed.length > 0) setBulkError(`${failed.length} of ${ids.length} failed to delete — they're still selected.`);
  };

  useEffect(() => {
    const map: Record<string, string> = {};
    leads.forEach(l => { map[l.lead_id] = l._stage || ""; });
    prevStagesRef.current = map;
  }, [leads]);

  // Poll 8s
  const poll = useCallback(async () => {
    try {
      const res = await fetch("/api/opportunities/poll", { cache: "no-store" });
      if (!res.ok) return;
      const { leads: fresh }: { leads: Lead[] } = await res.json();
      const freshNorm = fresh.map(l => ({ ...l, _stage: normaliseStage(l.ghl_stage, activePipeline?.stages || ["New Lead"]) }));
      const prev = prevStagesRef.current;
      const movedIds = new Set<string>();
      freshNorm.forEach(l => { if (prev[l.lead_id] && prev[l.lead_id] !== l._stage) movedIds.add(l.lead_id); });
      if (movedIds.size > 0) {
        setLeads(freshNorm);
        setAutoMoved(movedIds);
        setTimeout(() => setAutoMoved(new Set()), 3000);
      }
      setLastSync(new Date());
    } catch (e) {
      log.warn("kanban.poll_failed", errInfo(e));
    }
  }, [activePipeline]);

  useEffect(() => {
    const t = setInterval(poll, 8000);
    return () => clearInterval(t);
  }, [poll]);

  // Drag handlers
  const onDragStart = (e: React.DragEvent, id: string) => { setDragId(id); e.dataTransfer.effectAllowed = "move"; };
  const onDragOver  = (e: React.DragEvent, stageId: string) => { e.preventDefault(); setDragOverStage(stageId); };
  const onDragLeave = () => setDragOverStage(null);
  const onDragEnd   = () => { setDragId(null); setDragOverStage(null); };

  const onDrop = async (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    setDragOverStage(null);
    if (!dragId) return;
    const lead = leads.find(l => l.lead_id === dragId);
    if (!lead || lead._stage === stageId) { setDragId(null); return; }
    setLeads(prev => prev.map(l => l.lead_id === dragId ? { ...l, _stage: stageId, ghl_stage: stageId } : l));
    setSaving(s => new Set(s).add(dragId));
    setDragId(null);
    try {
      const res = await fetch(`/api/opportunities/${dragId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage: stageId }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setLeads(prev => prev.map(l => l.lead_id === dragId ? { ...l, _stage: lead._stage, ghl_stage: lead.ghl_stage } : l));
    } finally {
      setSaving(s => { const n = new Set(s); n.delete(dragId!); return n; });
    }
  };

  // Filtered leads for current pipeline + tag
  const visibleLeads = leads.filter(l => {
    const inPipeline = activePipeline
      ? (l.pipeline_id === activePipeline.id || (!l.pipeline_id && pipelines.indexOf(activePipeline) === 0))
      : true;
    const hasTag = tagFilter ? parseTags(l.tags).includes(tagFilter) : true;
    return inPipeline && hasTag;
  });

  const byStage = (stageId: string) => visibleLeads.filter(l => l._stage === stageId);

  const totalValue = visibleLeads
    .filter(l => !l._stage?.toLowerCase().includes("lost"))
    .reduce((sum, l) => {
      const n = l.budget?.replace(/[^0-9]/g, "");
      return sum + (n ? parseInt(n) : 0);
    }, 0);

  // Empty state — no pipelines loaded (either API failed, or genuinely no
  // pipelines yet). Show a CTA instead of the phantom 4-column kanban.
  if (pipelines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="bg-white border border-gray-200 rounded-2xl px-8 py-10 shadow-sm max-w-md">
          <h2 className="text-lg font-bold text-gray-900 mb-2">No pipelines yet</h2>
          <p className="text-sm text-gray-500 mb-5">
            Create your first pipeline to start tracking opportunities. The Sales Pipeline auto-creates
            on first contact with the API — if you&apos;re seeing this and the API is up, try a hard refresh.
          </p>
          <button
            onClick={() => setShowNewPipeline(true)}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition shadow-sm"
          >
            ＋ New Pipeline
          </button>
        </div>

        {showNewPipeline && (
          <NewPipelineModal
            onClose={() => setShowNewPipeline(false)}
            onCreated={(p) => {
              setPipelines(prev => [...prev, { ...p, created_at: new Date().toISOString() }]);
              selectPipeline(p.id);
              setShowNewPipeline(false);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">

      {/* Pipeline tabs */}
      <div className="flex items-center gap-1 mb-3 flex-wrap">
        {pipelines.map(p => {
          const count = leads.filter(l => l.pipeline_id === p.id || (!l.pipeline_id && pipelines.indexOf(p) === 0)).length;
          const isEmpty = count === 0;
          const isActive = activePipelineId === p.id;
          const isDeleting = deletingPipelineId === p.id;
          return (
            <div key={p.id} className="flex items-center gap-1">
              <button
                onClick={() => selectPipeline(p.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition border ${
                  isActive
                    ? "bg-white border-gray-300 text-gray-900 shadow-sm"
                    : "border-transparent text-gray-500 hover:text-gray-700 hover:bg-white"
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: p.color }} />
                {p.name}
                <span className="text-xs text-gray-400 font-normal">{count}</span>
              </button>
              {/* Delete — always visible when pipeline is empty, never on last pipeline */}
              {isEmpty && pipelines.length > 1 && (
                <button
                  onClick={() => deletePipeline(p.id)}
                  disabled={isDeleting}
                  title="Delete empty pipeline"
                  className="w-6 h-6 rounded-full bg-red-100 text-red-500 hover:bg-red-500 hover:text-white text-xs font-bold flex items-center justify-center transition disabled:opacity-50"
                >
                  {isDeleting ? "…" : "✕"}
                </button>
              )}
            </div>
          );
        })}
        <button
          onClick={() => setShowNewPipeline(true)}
          className="px-3 py-2 rounded-xl text-sm font-semibold text-gray-400 hover:text-blue-600 hover:bg-white border border-transparent hover:border-gray-200 transition"
        >
          ＋ New Pipeline
        </button>
      </div>

      {/* Delete error toast */}
      {deleteError && (
        <div className="mb-3 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 flex items-center justify-between text-sm text-red-700">
          <span>{deleteError}</span>
          <button onClick={() => setDeleteError(null)} className="text-red-400 hover:text-red-600 ml-4">✕</button>
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="sticky top-0 z-20 mb-3 bg-blue-600 text-white rounded-xl px-4 py-2.5 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-3 text-sm">
            <span className="font-semibold">
              {selected.size} selected
            </span>
            {bulkProgress && (
              <span className="text-blue-100 text-xs">
                Deleting {bulkProgress.done} / {bulkProgress.total}…
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={clearSelection}
              disabled={bulkDeleting}
              className="px-3 py-1 rounded-lg text-sm font-medium text-blue-100 hover:bg-blue-700 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={bulkDelete}
              disabled={bulkDeleting}
              className="px-3 py-1 rounded-lg text-sm font-semibold bg-red-500 hover:bg-red-600 text-white transition disabled:opacity-50"
            >
              {bulkDeleting ? "Deleting…" : `Delete ${selected.size}`}
            </button>
          </div>
        </div>
      )}

      {/* Bulk error toast */}
      {bulkError && (
        <div className="mb-3 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 flex items-center justify-between text-sm text-red-700">
          <span>{bulkError}</span>
          <button onClick={() => setBulkError(null)} className="text-red-400 hover:text-red-600 ml-4">✕</button>
        </div>
      )}

      {/* Stage error toast (visible when add form closed, e.g. after a failed delete) */}
      {stageError && !addingStage && (
        <div className="mb-3 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 flex items-center justify-between text-sm text-red-700">
          <span>{stageError}</span>
          <button onClick={() => setStageError(null)} className="text-red-400 hover:text-red-600 ml-4">✕</button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap text-sm text-gray-500">
          <span>{visibleLeads.length} opportunities</span>
          {totalValue > 0 && (
            <span className="font-medium text-gray-700">
              Pipeline: ${(totalValue / 1_000_000).toFixed(1)}M
            </span>
          )}
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            Synced {lastSync.toLocaleTimeString("en-AU", { timeStyle: "short" })}
          </span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Tag filter chips */}
          {allTags.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {tagFilter && (
                <button onClick={() => setTagFilter(null)}
                  className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-600 hover:bg-gray-300 transition">
                  ✕ Clear
                </button>
              )}
              {allTags.map(tag => (
                <button key={tag} onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
                  className={`px-2.5 py-0.5 rounded-full text-xs font-semibold transition ${tagFilter === tag ? tagColor(tag) + " ring-2 ring-offset-1 ring-gray-300" : tagColor(tag) + " opacity-70 hover:opacity-100"}`}>
                  {tag}
                </button>
              ))}
            </div>
          )}

          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition shadow-sm"
          >
            <span className="text-base leading-none">＋</span> New Opportunity
          </button>
        </div>
      </div>

      {/* Modals */}
      {showModal && (
        <NewOpportunityModal
          onClose={() => setShowModal(false)}
          pipelines={pipelines}
          defaultPipelineId={activePipelineId}
          onCreated={(lead) => {
            const newLead: Lead & { _stage: string } = {
              lead_id:       lead.lead_id || lead.id || "",
              full_name:     lead.full_name || null,
              email:         lead.email || null,
              buyer_type:    lead.buyer_type || null,
              state:         lead.state || null,
              budget:        lead.budget || null,
              score:         lead.score ?? null,
              temperature:   lead.temperature || null,
              ghl_stage:     lead._stage || "New Lead",
              match_status:  lead.match_status || "pending",
              top_match_name:  lead.top_match_name || null,
              top_match_price: lead.top_match_price || null,
              created_at:    lead.created_at || new Date().toISOString(),
              pipeline_id:   lead.pipeline_id || activePipelineId,
              tags:          lead.tags || null,
              _stage:        lead._stage || stages[0]?.id || "New Lead",
            };
            setLeads(prev => [newLead, ...prev]);
            setShowModal(false);
          }}
        />
      )}

      {showNewPipeline && (
        <NewPipelineModal
          onClose={() => setShowNewPipeline(false)}
          onCreated={(p) => {
            setPipelines(prev => [...prev, { ...p, created_at: new Date().toISOString() }]);
            setActivePipelineId(p.id);
            setShowNewPipeline(false);
          }}
        />
      )}

      {/* Board */}
      <div className="flex gap-3 overflow-x-auto pb-4 flex-1 items-start">
        {stages.map(stage => {
          const cards = byStage(stage.id);
          const isOver = dragOverStage === stage.id;

          return (
            <div
              key={stage.id}
              className={`flex-shrink-0 w-64 rounded-xl border-2 transition-colors ${isOver ? stage.accent + " " + stage.color : "border-transparent bg-gray-100"}`}
              onDragOver={e => onDragOver(e, stage.id)}
              onDrop={e => onDrop(e, stage.id)}
              onDragLeave={onDragLeave}
            >
              {/* Column header */}
              <div className="px-3 pt-3 pb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${stage.dot}`} />
                  <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">{stage.label}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  {cards.length > 0 && (
                    <button
                      onClick={() => {
                        const allIds = cards.map(c => c.lead_id);
                        const allSelected = allIds.every(id => selected.has(id));
                        setSelected(prev => {
                          const next = new Set(prev);
                          if (allSelected) allIds.forEach(id => next.delete(id));
                          else allIds.forEach(id => next.add(id));
                          return next;
                        });
                      }}
                      title={cards.every(c => selected.has(c.lead_id)) ? "Deselect all in stage" : "Select all in stage"}
                      className="text-[10px] font-medium text-gray-400 hover:text-gray-700 transition px-1.5 py-0.5 rounded hover:bg-white"
                    >
                      {cards.every(c => selected.has(c.lead_id)) ? "none" : "all"}
                    </button>
                  )}
                  {cards.length === 0 && (activePipeline?.stages.length ?? 0) > 1 && (
                    <button
                      onClick={() => deleteStage(stage.id)}
                      disabled={deletingStage === stage.id}
                      title="Delete empty column"
                      className="w-5 h-5 rounded-full text-red-400 hover:bg-red-500 hover:text-white text-[11px] font-bold flex items-center justify-center transition disabled:opacity-50"
                    >
                      {deletingStage === stage.id ? "…" : "✕"}
                    </button>
                  )}
                  <span className="text-xs font-semibold text-gray-400 bg-white rounded-full px-2 py-0.5 shadow-sm">
                    {cards.length}
                  </span>
                </div>
              </div>

              {/* Cards */}
              <div className="px-2 pb-3 space-y-2 min-h-[80px]">
                {cards.map(lead => {
                  const isAutoMoved = autoMoved.has(lead.lead_id);
                  const isSaving    = saving.has(lead.lead_id);
                  const isDragging  = dragId === lead.lead_id;
                  const tags        = parseTags(lead.tags);

                  const isSelected = selected.has(lead.lead_id);
                  return (
                    <div
                      key={lead.lead_id}
                      draggable
                      onDragStart={e => onDragStart(e, lead.lead_id)}
                      onDragEnd={onDragEnd}
                      onClick={(e) => {
                        if (dragId) return;
                        // If any cards are selected, treat clicks as toggle selection
                        // instead of navigation. Lets the user multi-select without
                        // accidentally opening detail pages.
                        if (selected.size > 0) {
                          e.stopPropagation();
                          toggleSelect(lead.lead_id);
                          return;
                        }
                        router.push(`/opportunities/${lead.lead_id}`);
                      }}
                      className={`
                        relative bg-white rounded-lg border shadow-sm p-3 cursor-pointer select-none
                        transition-all duration-300 group
                        ${isDragging ? "opacity-40 scale-95" : "opacity-100"}
                        ${isAutoMoved ? "ring-2 ring-purple-400 ring-offset-1 animate-pulse" : ""}
                        ${isSaving ? "opacity-60" : ""}
                        ${isSelected ? "ring-2 ring-blue-500 border-blue-300" : ""}
                        hover:shadow-md hover:border-blue-200
                      `}
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleSelect(lead.lead_id); }}
                        title={isSelected ? "Deselect" : "Select"}
                        className={`
                          absolute top-1.5 left-1.5 w-4 h-4 rounded border-2 flex items-center justify-center
                          transition
                          ${isSelected
                            ? "bg-blue-600 border-blue-600 text-white"
                            : "bg-white border-gray-300 opacity-0 group-hover:opacity-100 hover:border-blue-400"}
                        `}
                      >
                        {isSelected && (
                          <svg viewBox="0 0 12 12" className="w-3 h-3 fill-current">
                            <path d="M4.5 8.5L2 6l1-1 1.5 1.5L8 3l1 1z" />
                          </svg>
                        )}
                      </button>
                      <div className="flex justify-between items-start mb-2 pl-5">
                        <p className="text-sm font-semibold text-gray-900 leading-tight pr-1">
                          {lead.full_name || "Unknown"}
                        </p>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          {lead.temperature && (
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium capitalize ${tempBadge(lead.temperature)}`}>
                              {lead.temperature}
                            </span>
                          )}
                          {lead.score != null && (
                            <span className="text-xs font-bold text-gray-400">#{lead.score}</span>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1 text-xs text-gray-500">
                        {lead.email && <p className="truncate">{lead.email}</p>}
                        <div className="flex gap-2 flex-wrap">
                          {lead.buyer_type && <span className="capitalize font-medium">{lead.buyer_type}</span>}
                          {lead.state && <span>{lead.state}</span>}
                          {lead.budget && <span className="text-green-700 font-medium">{lead.budget}</span>}
                        </div>
                        {lead.top_match_name && (
                          <p className="text-purple-600 font-medium truncate">
                            🏘 {lead.top_match_name}{lead.top_match_price && ` · ${lead.top_match_price}`}
                          </p>
                        )}
                        {/* Tags */}
                        {tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-1">
                            {tags.map(tag => (
                              <span key={tag} className={`px-1.5 py-0.5 rounded text-xs font-medium ${tagColor(tag)}`}>
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="mt-2 pt-2 border-t border-gray-50 flex justify-between items-center">
                        {isAutoMoved  && <span className="text-xs text-purple-500 font-medium">⚡ Auto-moved</span>}
                        {isSaving     && <span className="text-xs text-gray-400">Saving…</span>}
                        {lead.created_at && !isAutoMoved && !isSaving && (
                          <span className="text-xs text-gray-300">
                            {new Date(lead.created_at).toLocaleDateString("en-AU")}
                          </span>
                        )}
                        {lead.match_status === "matched" && !isAutoMoved && (
                          <span className="text-xs text-green-500 ml-auto">✓ matched</span>
                        )}
                      </div>
                    </div>
                  );
                })}

                {isOver && dragId && !cards.find(c => c.lead_id === dragId) && (
                  <div className={`border-2 border-dashed ${stage.accent} rounded-lg h-20 opacity-60`} />
                )}
              </div>
            </div>
          );
        })}

        {/* Add-stage placeholder column */}
        {activePipeline && (
          <div className="flex-shrink-0 w-64">
            {addingStage ? (
              <div className="rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 p-3">
                <input
                  autoFocus
                  type="text"
                  value={newStageName}
                  onChange={(e) => { setNewStageName(e.target.value); setStageError(null); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") addStage();
                    if (e.key === "Escape") { setAddingStage(false); setNewStageName(""); setStageError(null); }
                  }}
                  placeholder="Stage name"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                <label className="block mt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                  Position
                </label>
                <select
                  value={newStagePosition ?? activePipeline.stages.length}
                  onChange={(e) => setNewStagePosition(Number(e.target.value))}
                  className="mt-1 w-full px-2 py-1.5 text-sm rounded-lg border border-gray-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                >
                  <option value={0}>At the start</option>
                  {activePipeline.stages.map((s, i) => (
                    <option key={s} value={i + 1}>After “{s}”</option>
                  ))}
                </select>
                {stageError && <p className="text-xs text-red-600 mt-2">{stageError}</p>}
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={addStage}
                    disabled={!newStageName.trim()}
                    className="flex-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => { setAddingStage(false); setNewStageName(""); setStageError(null); }}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 hover:bg-white transition"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAddingStage(true)}
                className="w-full rounded-xl border-2 border-dashed border-gray-300 bg-transparent hover:border-blue-300 hover:bg-blue-50 text-sm text-gray-400 hover:text-blue-600 font-medium py-3 transition"
              >
                ＋ Add stage
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
