"use client";

import { useRef, useState } from "react";
import AIComplianceCheck from "./AIComplianceCheck";
import { errMessage } from "../../utils/errors";

type Extraction = {
  document_type: string;
  parties: string[];
  key_dates: { label: string; date: string }[];
  key_amounts: { label: string; amount: string }[];
  summary: string;
  suggested_tags: string[];
  suggested_tasks: { title: string; due_date: string | null }[];
  suggested_notes_text: string;
};

type ApplyState = {
  summary: boolean;
  tags: boolean;
  taskIndexes: Set<number>;
};

type ApplyResult = {
  taskCount: number;
  tagsAdded: number;
  summarySaved: boolean;
};

const MEDIA_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export default function AIDocumentExtract({ contactId }: { contactId: string }) {
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState("");
  const [filename, setFilename] = useState<string | null>(null);
  const [state, setState] = useState<
    | { phase: "idle" }
    | { phase: "uploading" }
    | { phase: "extracting" }
    | { phase: "ready"; extraction: Extraction; apply: ApplyState }
    | { phase: "applying" }
    | { phase: "done"; summary: ApplyResult }
    | { phase: "error"; error: string }
  >({ phase: "idle" });
  const fileRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setHint("");
    setFilename(null);
    setState({ phase: "idle" });
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = async (file: File) => {
    setFilename(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase();
    const mediaType = ext ? MEDIA_TYPES[ext] : undefined;
    if (!mediaType) {
      setState({ phase: "error", error: `Unsupported file type: .${ext}` });
      return;
    }
    if (file.size > 30 * 1024 * 1024) {
      setState({ phase: "error", error: "File too large (max 30 MB)" });
      return;
    }
    setState({ phase: "uploading" });

    let base64 = "";
    try {
      base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const r = reader.result as string;
          // strip "data:<mediatype>;base64," prefix
          resolve(r.includes(",") ? r.split(",", 2)[1] : r);
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsDataURL(file);
      });
    } catch (e) {
      setState({ phase: "error", error: errMessage(e, "Failed to read file") });
      return;
    }

    setState({ phase: "extracting" });
    try {
      const res = await fetch("/api/ai/extract-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileBase64: base64,
          mediaType,
          contactId,
          hint: hint.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!json.ok) {
        setState({ phase: "error", error: json.error || "Extraction failed" });
        return;
      }
      const { ok, ...rest } = json;
      const e = rest as Extraction;
      setState({
        phase: "ready",
        extraction: e,
        apply: {
          summary: !!e.suggested_notes_text,
          tags: e.suggested_tags.length > 0,
          taskIndexes: new Set(e.suggested_tasks.map((_, i) => i)),
        },
      });
    } catch (e) {
      setState({ phase: "error", error: errMessage(e, "Extraction failed") });
    }
  };

  const apply = async () => {
    if (state.phase !== "ready") return;
    const { extraction, apply: a } = state;
    setState({ phase: "applying" });

    // Map to the same payload shape /api/ai/quick-log-apply expects
    const payload = {
      summary: extraction.suggested_notes_text,
      tasks: extraction.suggested_tasks,
      tags: extraction.suggested_tags,
      status_change: null,
      temperature: null,
      follow_up_in_days: null,
    };

    try {
      const res = await fetch("/api/ai/quick-log-apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId,
          payload,
          applied: {
            summary: a.summary,
            tags: a.tags,
            temperature: false,
            status: false,
            followUp: false,
            taskIndexes: Array.from(a.taskIndexes),
          },
        }),
      });
      const json = await res.json();
      if (json.ok) setState({ phase: "done", summary: json.applied });
      else setState({ phase: "error", error: json.error || "Failed to apply" });
    } catch (e) {
      setState({ phase: "error", error: errMessage(e, "Failed to apply") });
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-medium hover:bg-teal-700 transition"
      >
        📄 Document Extract
      </button>
    );
  }

  const setApply = (patch: Partial<ApplyState>) =>
    setState((prev) =>
      prev.phase === "ready" ? { ...prev, apply: { ...prev.apply, ...patch } } : prev,
    );
  const toggleTaskIdx = (i: number) =>
    setState((prev) => {
      if (prev.phase !== "ready") return prev;
      const next = new Set(prev.apply.taskIndexes);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return { ...prev, apply: { ...prev.apply, taskIndexes: next } };
    });

  return (
    <div className="bg-white border border-teal-200 rounded-xl p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-teal-700">
          📄 Elvis · Document Extract
        </span>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            reset();
          }}
          className="text-xs text-gray-400 hover:text-gray-700"
        >
          close
        </button>
      </div>

      {state.phase === "idle" && (
        <>
          <p className="text-xs text-gray-500 mb-3">
            Drop a contract, ID doc, finance approval, or any PDF / image —
            Elvis pulls out parties, dates, amounts, and proposes tags + tasks.
          </p>
          <input
            type="text"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            placeholder="Optional: tell Elvis what kind of doc this is (e.g. 'contract of sale')"
            className="w-full text-sm px-3 py-2 border border-gray-200 rounded mb-3 focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) handleFile(f);
            }}
            className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center cursor-pointer hover:border-teal-400 hover:bg-teal-50/30 transition"
          >
            <p className="text-2xl mb-1">📎</p>
            <p className="text-sm font-medium text-gray-700">Drop a file or click to browse</p>
            <p className="text-xs text-gray-400 mt-1">PDF, JPG, PNG, WebP — up to 30 MB</p>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </div>
        </>
      )}

      {(state.phase === "uploading" || state.phase === "extracting") && (
        <div className="py-6 text-center">
          <p className="text-sm font-medium text-gray-700">
            {state.phase === "uploading" ? "Reading file…" : "Extracting…"}
          </p>
          {filename && <p className="text-xs text-gray-400 mt-0.5 font-mono">{filename}</p>}
          <div className="mt-4 space-y-1.5 max-w-sm mx-auto">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-2 bg-teal-100/60 rounded animate-pulse"
                style={{ width: `${85 - i * 10}%` }}
              />
            ))}
          </div>
        </div>
      )}

      {state.phase === "ready" && (
        <div className="space-y-3">
          <div className="bg-teal-50 border border-teal-100 rounded p-3">
            <div className="flex items-baseline justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-teal-700">
                {state.extraction.document_type || "Document"}
              </p>
              {filename && (
                <p className="text-[10px] text-gray-400 font-mono truncate max-w-[60%]">
                  {filename}
                </p>
              )}
            </div>
            {state.extraction.summary && (
              <p className="text-sm text-gray-800 mt-2">{state.extraction.summary}</p>
            )}
          </div>

          {state.extraction.parties.length > 0 && (
            <Block label="Parties">
              <ul className="text-sm text-gray-800 space-y-0.5">
                {state.extraction.parties.map((p, i) => (
                  <li key={i}>• {p}</li>
                ))}
              </ul>
            </Block>
          )}

          {(state.extraction.key_dates.length > 0 ||
            state.extraction.key_amounts.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {state.extraction.key_dates.length > 0 && (
                <Block label="Key dates">
                  <ul className="text-sm text-gray-800 space-y-0.5">
                    {state.extraction.key_dates.map((d, i) => (
                      <li key={i}>
                        <span className="font-medium">{d.label}:</span>{" "}
                        <span className="text-gray-600">{d.date}</span>
                      </li>
                    ))}
                  </ul>
                </Block>
              )}
              {state.extraction.key_amounts.length > 0 && (
                <Block label="Key amounts">
                  <ul className="text-sm text-gray-800 space-y-0.5">
                    {state.extraction.key_amounts.map((a, i) => (
                      <li key={i}>
                        <span className="font-medium">{a.label}:</span>{" "}
                        <span className="text-gray-600">{a.amount}</span>
                      </li>
                    ))}
                  </ul>
                </Block>
              )}
            </div>
          )}

          {state.extraction.suggested_notes_text && (
            <ApplyRow
              checked={state.apply.summary}
              onChange={(v) => setApply({ summary: v })}
              label="Append summary to contact notes"
            >
              <p className="text-sm text-gray-800 whitespace-pre-wrap">
                {state.extraction.suggested_notes_text}
              </p>
              <div className="mt-2">
                <AIComplianceCheck text={state.extraction.suggested_notes_text} />
              </div>
            </ApplyRow>
          )}

          {state.extraction.suggested_tasks.length > 0 && (
            <div className="bg-gray-50 rounded p-3 border border-gray-100">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
                Suggested tasks ({state.apply.taskIndexes.size}/
                {state.extraction.suggested_tasks.length} selected)
              </p>
              <ul className="space-y-1">
                {state.extraction.suggested_tasks.map((t, i) => (
                  <li key={i} className="text-sm text-gray-800 flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={state.apply.taskIndexes.has(i)}
                      onChange={() => toggleTaskIdx(i)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <span>{t.title}</span>
                      {t.due_date && (
                        <span className="text-xs text-gray-500 ml-2">
                          due {String(t.due_date).slice(0, 10)}
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {state.extraction.suggested_tags.length > 0 && (
            <ApplyRow
              checked={state.apply.tags}
              onChange={(v) => setApply({ tags: v })}
              label={`Add ${state.extraction.suggested_tags.length} tag${state.extraction.suggested_tags.length === 1 ? "" : "s"} to contact`}
            >
              <div className="flex flex-wrap gap-1.5">
                {state.extraction.suggested_tags.map((t, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded-full text-xs bg-blue-100 text-blue-700"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </ApplyRow>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={apply}
              className="px-3 py-1.5 bg-teal-600 text-white text-xs font-medium rounded hover:bg-teal-700"
            >
              Apply selected
            </button>
            <button
              type="button"
              onClick={reset}
              className="px-3 py-1.5 bg-white text-gray-700 text-xs font-medium rounded border border-gray-200 hover:bg-gray-50"
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {state.phase === "applying" && (
        <p className="text-sm text-gray-500 italic mt-2">Applying…</p>
      )}

      {state.phase === "done" && (
        <div className="bg-emerald-50 border border-emerald-200 rounded p-3 text-sm space-y-1">
          <p className="font-medium text-emerald-800">✓ Applied</p>
          <ul className="text-xs text-emerald-700 space-y-0.5">
            {state.summary.taskCount > 0 && (
              <li>
                • Created {state.summary.taskCount} task
                {state.summary.taskCount === 1 ? "" : "s"}
              </li>
            )}
            {state.summary.tagsAdded > 0 && (
              <li>
                • Added {state.summary.tagsAdded} tag
                {state.summary.tagsAdded === 1 ? "" : "s"} to contact
              </li>
            )}
            {state.summary.summarySaved && (
              <li>• Appended summary to contact notes</li>
            )}
          </ul>
          <button
            type="button"
            onClick={reset}
            className="mt-2 text-xs text-emerald-700 underline hover:text-emerald-900"
          >
            Process another
          </button>
        </div>
      )}

      {state.phase === "error" && (
        <div className="space-y-2 mt-2">
          <p className="text-sm text-red-700">⚠️ {state.error}</p>
          <button
            type="button"
            onClick={reset}
            className="text-xs text-gray-700 underline"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-50 rounded p-3 border border-gray-100">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
        {label}
      </p>
      {children}
    </div>
  );
}

function ApplyRow({
  checked,
  onChange,
  label,
  children,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-gray-50 rounded p-3 border border-gray-100">
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-1"
        />
        <div className="flex-1">
          <p className="text-xs font-medium text-gray-700 mb-1">{label}</p>
          {children}
        </div>
      </label>
    </div>
  );
}
