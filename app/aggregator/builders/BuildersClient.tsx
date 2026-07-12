"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "../../../utils/supabase-browser";
import { errMessage } from "../../../utils/errors";

type Builder = {
  id: string;
  canonical_name: string;
  aliases: string[];
  sender_domains: string[];
  contact_email: string | null;
  contact_phone: string | null;
  active: boolean;
  draft: boolean;
  auto_outreach_enabled?: boolean;
  last_contact_at?: string | null;
  consecutive_no_replies?: number | null;
  outreach_paused_until?: string | null;
  created_at: string;
  // Per-builder extraction context — see migration 20260507
  extraction_notes?: string | null;
  sample_pdf_url?: string | null;
  sample_pdf_text?: string | null;
  sample_pdf_uploaded_at?: string | null;
};

export default function BuildersClient() {
  const [builders, setBuilders] = useState<Builder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Partial<Builder>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const load = async () => {
    setBuilders(null);
    setError(null);
    try {
      const res = await fetch("/api/aggregator/builders");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setBuilders(json.items ?? []);
    } catch (e) {
      setError(errMessage(e, "Load failed"));
    }
  };

  useEffect(() => {
    queueMicrotask(() => load());
  }, []);

  const startEdit = (b: Builder) => {
    setEditingId(b.id);
    setEdit({ ...b });
  };

  const save = async () => {
    if (!editingId) return;
    setBusy(editingId);
    try {
      const res = await fetch(`/api/aggregator/builders/${editingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canonical_name: edit.canonical_name,
          aliases: edit.aliases ?? [],
          sender_domains: edit.sender_domains ?? [],
          contact_email: edit.contact_email,
          contact_phone: edit.contact_phone,
          active: edit.active ?? true,
          draft: false,
          extraction_notes: edit.extraction_notes ?? null,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setEditingId(null);
      await load();
    } catch (e) {
      alert(`Save failed: ${errMessage(e)}`);
    } finally {
      setBusy(null);
    }
  };

  /**
   * Browser → Supabase Storage direct upload of a sample PDF (or XLSX),
   * then PATCH the builder row with the resulting public URL.
   * Aggregator picks it up on next cron run, extracts text via
   * pdfplumber, and caches in sample_pdf_text.
   */
  const uploadSamplePdf = async (builderId: string, file: File) => {
    setBusy(builderId);
    try {
      // 1. Sign upload URL
      const signRes = await fetch(
        `/api/aggregator/builders/${builderId}/sample-pdf`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mime: file.type, size: file.size }),
        },
      );
      const sign = await signRes.json();
      if (!sign.ok) throw new Error(sign.error || "Could not sign upload URL");

      // 2. Direct browser upload
      const { error: upErr } = await supabaseBrowser.storage
        .from("ingestion")
        .uploadToSignedUrl(sign.path, sign.token, file, {
          contentType: file.type,
          upsert: false,
        });
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`);

      // 3. Persist URL on builder row + clear cached text so aggregator
      //    re-extracts on next cron run
      const patchRes = await fetch(`/api/aggregator/builders/${builderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sample_pdf_url: sign.publicUrl,
          sample_pdf_text: null,
          sample_pdf_uploaded_at: new Date().toISOString(),
        }),
      });
      const patch = await patchRes.json();
      if (!patch.ok) throw new Error(patch.error || "Save failed after upload");
      await load();
    } catch (e) {
      alert(`Sample PDF upload failed: ${errMessage(e)}`);
    } finally {
      setBusy(null);
    }
  };

  const removeSamplePdf = async (builderId: string) => {
    if (!confirm("Remove this builder's sample PDF? Aggregator will fall back to no per-builder context.")) return;
    setBusy(builderId);
    try {
      await fetch(`/api/aggregator/builders/${builderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sample_pdf_url: null,
          sample_pdf_text: null,
          sample_pdf_uploaded_at: null,
        }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const toggleActive = async (b: Builder) => {
    setBusy(b.id);
    try {
      await fetch(`/api/aggregator/builders/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !b.active }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const toggleOutreach = async (b: Builder) => {
    setBusy(b.id);
    try {
      await fetch(`/api/aggregator/builders/${b.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auto_outreach_enabled: !b.auto_outreach_enabled }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const fmtRelative = (iso: string | null | undefined) => {
    if (!iso) return "never";
    const days = (now - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
    if (days < 1) return "today";
    if (days < 2) return "yesterday";
    if (days < 31) return `${Math.floor(days)}d ago`;
    return `${Math.floor(days / 7)}w ago`;
  };

  if (error) return <div className="text-red-600 p-4">⚠ {error}</div>;
  if (builders === null) return <div className="text-gray-500 p-4 italic">Loading…</div>;

  return (
    <div className="space-y-4">
      {builders.length === 0 && (
        <div className="bg-white border border-dashed border-gray-300 rounded-xl p-12 text-center text-gray-500">
          No builders detected yet. They get auto-created when emails arrive at the stocklist@ inbox.
        </div>
      )}

      {builders.map((b) => {
        const isEditing = editingId === b.id;
        const isBusy = busy === b.id;
        return (
          <div
            key={b.id}
            className={`bg-white border rounded-xl p-4 shadow-sm ${b.draft ? "border-amber-300" : "border-gray-200"}`}
          >
            {!isEditing ? (
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="text-lg font-bold text-gray-800">
                      {b.canonical_name}
                    </h3>
                    {b.draft && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800 font-medium">
                        DRAFT — needs review
                      </span>
                    )}
                    {!b.active && (
                      <span className="px-2 py-0.5 rounded-full text-xs bg-gray-200 text-gray-700">
                        inactive
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-gray-500 uppercase font-semibold">Sender domains</p>
                      <p className="text-gray-700 font-mono">
                        {(b.sender_domains ?? []).join(", ") || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase font-semibold">Aliases</p>
                      <p className="text-gray-700">
                        {(b.aliases ?? []).join(", ") || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase font-semibold">Contact email</p>
                      <p className="text-gray-700">{b.contact_email ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase font-semibold">Contact phone</p>
                      <p className="text-gray-700">{b.contact_phone ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase font-semibold">Last stocklist received</p>
                      <p className="text-gray-700">{fmtRelative(b.last_contact_at)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500 uppercase font-semibold">Auto-outreach</p>
                      <p className="text-gray-700">
                        {b.auto_outreach_enabled !== false ? (
                          <span className="text-emerald-700">enabled</span>
                        ) : (
                          <span className="text-gray-500">paused</span>
                        )}
                        {(b.consecutive_no_replies ?? 0) > 0 && (
                          <span className="ml-2 text-xs text-amber-700">
                            ({b.consecutive_no_replies} unanswered)
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => startEdit(b)}
                    className="px-3 py-1.5 bg-gray-900 text-white text-xs font-medium rounded hover:bg-gray-800"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleActive(b)}
                    disabled={isBusy}
                    className="px-3 py-1.5 bg-white text-gray-700 text-xs font-medium rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {b.active ? "Deactivate" : "Activate"}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleOutreach(b)}
                    disabled={isBusy || b.draft}
                    title={b.draft ? "Confirm builder draft first" : ""}
                    className="px-3 py-1.5 bg-white text-gray-700 text-xs font-medium rounded border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {b.auto_outreach_enabled !== false ? "Pause auto-emails" : "Resume auto-emails"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    label="Canonical name"
                    value={edit.canonical_name ?? ""}
                    onChange={(v) => setEdit({ ...edit, canonical_name: v })}
                  />
                  <Field
                    label="Contact email"
                    value={edit.contact_email ?? ""}
                    onChange={(v) => setEdit({ ...edit, contact_email: v })}
                  />
                  <Field
                    label="Sender domains (comma-separated)"
                    value={(edit.sender_domains ?? []).join(", ")}
                    onChange={(v) =>
                      setEdit({
                        ...edit,
                        sender_domains: v.split(",").map((s) => s.trim()).filter(Boolean),
                      })
                    }
                  />
                  <Field
                    label="Aliases (comma-separated)"
                    value={(edit.aliases ?? []).join(", ")}
                    onChange={(v) =>
                      setEdit({
                        ...edit,
                        aliases: v.split(",").map((s) => s.trim()).filter(Boolean),
                      })
                    }
                  />
                  <Field
                    label="Contact phone"
                    value={edit.contact_phone ?? ""}
                    onChange={(v) => setEdit({ ...edit, contact_phone: v })}
                  />
                  <label className="flex items-center gap-2 mt-5">
                    <input
                      type="checkbox"
                      checked={edit.active ?? true}
                      onChange={(e) => setEdit({ ...edit, active: e.target.checked })}
                    />
                    <span className="text-sm text-gray-700">Active</span>
                  </label>
                </div>

                {/* Extraction context — given to Claude when extracting
                    properties from this builder's stocklists. Notes are
                    direct instructions; sample PDF gives format reference. */}
                <div className="border-t border-gray-100 pt-3 mt-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                    Extraction context (AI hints)
                  </h4>
                  <label className="block text-xs">
                    <span className="font-medium text-gray-600 mb-0.5 block">
                      Notes for the extractor
                      <span className="text-gray-400 font-normal ml-2">
                        — e.g. &quot;lot # in column 2&quot;, &quot;ignore Display Home rows&quot;, &quot;pricing is in $1,000s&quot;
                      </span>
                    </span>
                    <textarea
                      value={edit.extraction_notes ?? ""}
                      onChange={(e) => setEdit({ ...edit, extraction_notes: e.target.value })}
                      rows={3}
                      className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Anything Claude should know about this builder's stocklist format…"
                    />
                  </label>

                  <div className="mt-3">
                    <p className="text-xs font-medium text-gray-600 mb-1">
                      Sample PDF / Excel
                      <span className="text-gray-400 font-normal ml-1">— page 1 text excerpt is sent as format reference to the extractor</span>
                    </p>
                    {b.sample_pdf_url ? (
                      <div className="flex items-center gap-2 px-3 py-2 bg-emerald-50 border border-emerald-200 rounded">
                        <span className="text-xs text-emerald-800 font-medium flex-1">
                          ✓ Sample uploaded
                          {b.sample_pdf_uploaded_at && (
                            <span className="ml-1 text-emerald-600">
                              ({new Date(b.sample_pdf_uploaded_at).toLocaleDateString("en-AU")})
                            </span>
                          )}
                          {b.sample_pdf_text == null && (
                            <span className="ml-2 text-amber-600">
                              · text extraction queued for next cron run
                            </span>
                          )}
                          {b.sample_pdf_text && (
                            <span className="ml-2 text-emerald-600">
                              · {b.sample_pdf_text.length.toLocaleString()} chars cached
                            </span>
                          )}
                        </span>
                        <a
                          href={b.sample_pdf_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-emerald-700 hover:underline"
                        >
                          View
                        </a>
                        <button
                          type="button"
                          onClick={() => removeSamplePdf(b.id)}
                          disabled={isBusy}
                          className="text-xs text-red-600 hover:bg-red-50 rounded px-2 py-0.5 disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <label className="inline-flex items-center gap-2 cursor-pointer">
                        <input
                          type="file"
                          accept=".pdf,.xlsx,.xls,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                          className="hidden"
                          disabled={isBusy}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) uploadSamplePdf(b.id, f);
                            e.target.value = "";
                          }}
                        />
                        <span className="px-3 py-1.5 bg-white text-gray-700 text-xs font-medium rounded border border-gray-300 hover:bg-gray-50">
                          {isBusy ? "Uploading…" : "Upload sample"}
                        </span>
                      </label>
                    )}
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    type="button"
                    onClick={save}
                    disabled={isBusy}
                    className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {isBusy ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded border border-gray-300 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block text-xs">
      <span className="font-medium text-gray-600 mb-0.5 block">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </label>
  );
}
