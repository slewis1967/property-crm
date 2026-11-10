"use client";

import { useState, useRef } from "react";
import { errMessage } from "../../utils/errors";

const CRM_FIELDS = [
  { key: "full_name",       label: "Full Name" },
  { key: "first_name",      label: "First Name" },
  { key: "last_name",       label: "Last Name" },
  { key: "email",           label: "Email" },
  { key: "phone",           label: "Phone" },
  { key: "buyer_type",      label: "Buyer Type" },
  { key: "preferred_state", label: "State" },
  { key: "budget_max",      label: "Budget (max)" },
  { key: "timeframe",       label: "Timeframe" },
  { key: "temperature",     label: "Temperature" },
  { key: "source",          label: "Source" },
  { key: "skip",            label: "— Skip column —" },
];

type Props = {
  onClose: () => void;
  onUploaded: (count: number) => void;
};

type Step = "upload" | "mapping" | "preview" | "done";

type RawRow = Record<string, string>;

const CONTACT_TYPES = [
  { key: "Investor",         label: "Investor",         icon: "📈" },
  { key: "First Home Buyer", label: "First Home Buyer", icon: "🏠" },
  { key: "Home Buyer",       label: "Home Buyer",       icon: "🏡" },
  { key: "SMSF Buyer",       label: "SMSF Buyer",       icon: "🏦" },
  { key: "Downsizer",        label: "Downsizer",        icon: "📦" },
  { key: "NDIS",             label: "NDIS",             icon: "♿" },
  { key: "Other",            label: "Other",            icon: "👤" },
  { key: "Business Contact", label: "Business Contact", icon: "💼" },
];

const TEMPLATE_CSV = `first_name,last_name,email,phone,buyer_type,state,budget_max,timeframe,temperature,source
Jordan,Blake,jordan@example.com,0412345678,Investor,QLD,650000,3-6 months,warm,referral
Alex,Smith,alex@example.com,0498765432,First Home Buyer,NSW,550000,ASAP,hot,facebook`;

/**
 * vCard 3.0/4.0 parser tuned for iCloud / Apple Contacts exports. Returns
 * rows with stable headers (Name, First, Last, Email, Phone, Org, State,
 * Country, Notes) so they slot into the existing CSV mapping flow.
 *
 * Handles: line folding, basic property params (TYPE=...), quoted-printable
 * decoding for Latin-1, multiple emails/phones (we keep the first preferred),
 * structured N + ADR fields. Skips PHOTO/X-APPLE-* and other binary blobs.
 */
function parseVCard(text: string): { headers: string[]; rows: RawRow[] } {
  // Unfold continuation lines (a CRLF followed by space/tab joins to previous)
  const unfolded = text.replace(/\r?\n[ \t]/g, "");
  const lines = unfolded.split(/\r?\n/);

  type VCard = Record<string, string[]>;
  const cards: VCard[] = [];
  let current: VCard | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^BEGIN:VCARD$/i.test(line)) { current = {}; continue; }
    if (/^END:VCARD$/i.test(line)) {
      if (current) cards.push(current);
      current = null;
      continue;
    }
    if (!current) continue;

    // Parse "PROPERTY[;PARAM=VAL...]:VALUE"
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const left = line.slice(0, idx);
    let value = line.slice(idx + 1);

    const segments = left.split(";");
    // Apple iCloud groups related properties with an "itemN." prefix:
    //   item1.TEL;type=CELL:+61400000000
    //   item1.X-ABLabel:_$!<Mobile>!$_
    // Strip the prefix so TEL/EMAIL/ADR show up under their canonical names.
    const propRaw = segments[0].toUpperCase().replace(/^ITEM\d+\./, "");
    const types: string[] = [];
    const params: Record<string, string> = {};
    for (let i = 1; i < segments.length; i++) {
      const eq = segments[i].indexOf("=");
      if (eq === -1) {
        // Bare type indicator (vCard 2.1 / older Apple)
        types.push(segments[i].toUpperCase());
      } else {
        const k = segments[i].slice(0, eq).toUpperCase();
        const v = segments[i].slice(eq + 1);
        if (k === "TYPE") {
          // type=CELL,VOICE,pref or repeated type=CELL;type=VOICE — both land here
          v.split(",").forEach((t) => {
            const cleaned = t.replace(/^"|"$/g, "").toUpperCase().trim();
            if (cleaned) types.push(cleaned);
          });
        } else {
          params[k] = v;
        }
      }
    }

    if (params["ENCODING"]?.toUpperCase() === "QUOTED-PRINTABLE") {
      value = value.replace(/=([0-9A-F]{2})/gi, (_, h) =>
        String.fromCharCode(parseInt(h, 16))
      );
    }

    if (propRaw === "PHOTO" || propRaw.startsWith("X-")) continue;

    // Always store under the bare property name so a no-type fallback works.
    if (!current[propRaw]) current[propRaw] = [];
    current[propRaw].push(value);
    // Plus one entry per individual TYPE so pickFirst(vc, "TEL;CELL") works.
    for (const t of types) {
      const k = `${propRaw};${t}`;
      if (!current[k]) current[k] = [];
      current[k].push(value);
    }
  }

  const headers = ["Name", "First", "Last", "Email", "Phone", "Org", "State", "Country", "Notes"];
  const pickFirst = (vc: VCard, ...keys: string[]): string => {
    for (const k of keys) {
      const v = vc[k]?.[0];
      if (v && v.trim()) return v.trim();
    }
    return "";
  };

  const rows: RawRow[] = cards.map((vc) => {
    const fn = pickFirst(vc, "FN");
    const n = pickFirst(vc, "N"); // "Last;First;Middle;Prefix;Suffix"
    const [last = "", first = ""] = n.split(";");
    const email = pickFirst(vc, "EMAIL;HOME", "EMAIL;WORK", "EMAIL;INTERNET", "EMAIL");
    // Phone preference: CELL > HOME > WORK > any
    const phone = pickFirst(
      vc,
      "TEL;CELL", "TEL;CELLVOICE", "TEL;IPHONE", "TEL;MOBILE",
      "TEL;HOME", "TEL;WORK", "TEL"
    );
    const org = pickFirst(vc, "ORG").split(";")[0]; // ORG can be "Company;Dept"
    const adr = pickFirst(vc, "ADR;HOME", "ADR;WORK", "ADR");
    // ADR = "PO;Extended;Street;City;State;Postal;Country"
    const [, , , , state = "", , country = ""] = adr.split(";");
    const notes = pickFirst(vc, "NOTE");

    return {
      Name: fn || `${first} ${last}`.trim(),
      First: first.trim(),
      Last: last.trim(),
      Email: email,
      Phone: phone,
      Org: org.trim(),
      State: state.trim(),
      Country: country.trim(),
      Notes: notes,
    };
  });

  // Keep only rows with at least a name
  return { headers, rows: rows.filter((r) => r.Name) };
}

function parseCSV(text: string): { headers: string[]; rows: RawRow[] } {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
  const rows = lines.slice(1).map(line => {
    const vals: string[] = [];
    let cur = "", inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; continue; }
      if (ch === "," && !inQ) { vals.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    vals.push(cur.trim());
    const row: RawRow = {};
    headers.forEach((h, i) => { row[h] = vals[i] || ""; });
    return row;
  });
  return { headers, rows };
}

function applyMapping(rows: RawRow[], mapping: Record<string, string>): Record<string, string | null>[] {
  return rows.map(row => {
    const out: Record<string, string> = {};

    for (const [csvCol, crmField] of Object.entries(mapping)) {
      if (crmField === "skip" || !row[csvCol]) continue;
      const val = row[csvCol].trim();
      if (!out[crmField]) out[crmField] = val;
    }

    // Derive a display full_name for preview/validation (not sent to API if first+last present)
    if (!out.full_name && (out.first_name || out.last_name)) {
      out.full_name = [out.first_name, out.last_name].filter(Boolean).join(" ");
    }

    // Validate — only name is required; email and phone are both optional
    const errors: string[] = [];
    if (!out.full_name) errors.push("Missing name");
    if (out.email && !out.email.includes("@")) errors.push("Invalid email");

    return { ...out, _error: errors.join(", ") || null };
  });
}

export default function BulkUploadModal({ onClose, onUploaded }: Props) {
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [mappingMethod, setMappingMethod] = useState<"ai" | "heuristic" | null>(null);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [previewRows, setPreviewRows] = useState<Record<string, string | null>[]>([]);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [assignType, setAssignType] = useState<string>("");
  const [tagsInput, setTagsInput] = useState<string>("getahome");
  const [sourceLabel, setSourceLabel] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setFileName(file.name);

    let h: string[] = [];
    let rows: RawRow[] = [];

    const isVcard = /\.vcf$/i.test(file.name);
    const isExcel = /\.(xlsx|xls)$/i.test(file.name);
    if (isVcard) {
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target!.result as string);
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsText(file);
      });
      ({ headers: h, rows } = parseVCard(text));
      // Auto-tag the source so it's distinguishable in the CRM
      if (!sourceLabel) setSourceLabel("icloud");
    } else if (isExcel) {
      const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target!.result as ArrayBuffer);
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsArrayBuffer(file);
      });
      const XLSX = await import("xlsx");
      const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
      if (data.length < 2) return;
      h = (data[0] as unknown[]).map(v => String(v).trim()).filter(Boolean);
      rows = data.slice(1).map(row => {
        const r: RawRow = {};
        h.forEach((col, i) => { r[col] = String(row[i] ?? "").trim(); });
        return r;
      }).filter(r => Object.values(r).some(v => v));
    } else {
      const buffer = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target!.result as string);
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsText(file);
      });
      ({ headers: h, rows } = parseCSV(buffer));
    }

    if (!h.length) return;
    setHeaders(h);
    setRawRows(rows);

    // Call AI mapping
    setMappingLoading(true);
    setStep("mapping");
    try {
      const res = await fetch("/api/contacts/map-fields", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          headers: h,
          sampleRows: rows.slice(0, 3),
        }),
      });
      const data = await res.json();
      setMapping(data.mapping || {});
      setMappingMethod(data.method || "heuristic");
    } catch {
      // Fallback: map everything to skip
      const fallback: Record<string, string> = {};
      h.forEach(col => { fallback[col] = "skip"; });
      setMapping(fallback);
    } finally {
      setMappingLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && /\.(csv|xlsx|xls|vcf)$/i.test(file.name)) handleFile(file);
  };

  const applyAndPreview = () => {
    const mapped = applyMapping(rawRows, mapping);
    setPreviewRows(mapped);
    setStep("preview");
  };

  const validRows = previewRows.filter(r => !r._error);
  const invalidRows = previewRows.filter(r => r._error);

  const handleUpload = async () => {
    setUploading(true);
    setErrors([]);
    let done = 0;
    const errs: string[] = [];
    const BATCH = 100;

    const prepared = validRows.map(row => ({
      full_name:       row.full_name || null,
      first_name:      row.first_name || null,
      email:           row.email?.toLowerCase(),
      buyer_type:      assignType || row.buyer_type || null,
      phone:           row.phone || null,
      preferred_state: row.preferred_state || null,
      budget_max:      row.budget_max ? parseInt(String(row.budget_max).replace(/[^0-9]/g, "")) || null : null,
      timeframe:       row.timeframe || null,
      temperature:     row.temperature || "warm",
      source:          row.source || sourceLabel || "csv_import",
      status:          "new",
    }));

    const defaultTags = tagsInput
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    for (let i = 0; i < prepared.length; i += BATCH) {
      const batch = prepared.slice(i, i + BATCH);
      try {
        const res = await fetch("/api/contacts/bulk-insert", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contacts: batch,
            default_tags: defaultTags,
            default_source: sourceLabel || undefined,
          }),
        });
        const d = await res.json();
        if (!res.ok) {
          errs.push(`Batch ${Math.floor(i / BATCH) + 1}: ${d.error}`);
        } else {
          done += d.inserted;
        }
      } catch (e) {
        errs.push(`Batch ${Math.floor(i / BATCH) + 1}: ${errMessage(e)}`);
      }
      setProgress(Math.round(Math.min(i + BATCH, prepared.length) / prepared.length * 100));
    }

    setErrors(errs);
    setUploading(false);
    setStep("done");
    if (done > 0) onUploaded(done);
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "contacts-template.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const fieldLabel = (key: string) => CRM_FIELDS.find(f => f.key === key)?.label || key;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Bulk Upload Contacts</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {step === "upload"  && "Upload a CSV file"}
              {step === "mapping" && (mappingLoading ? "AI is mapping your columns…" : `${mappingMethod === "ai" ? "✨ AI mapped" : "Auto-mapped"} — review and adjust`)}
              {step === "preview" && `${previewRows.length} rows · ${validRows.length} valid · ${invalidRows.length} skipped${assignType ? ` · ${assignType}` : ""}`}
              {step === "done"    && "Import complete"}
            </p>
          </div>
          {/* Step indicator */}
          <div className="flex items-center gap-2 mr-4">
            {(["upload","mapping","preview","done"] as Step[]).map((s, i) => (
              <div key={s} className={`w-2 h-2 rounded-full transition ${step === s ? "bg-blue-600" : i < (["upload","mapping","preview","done"] as Step[]).indexOf(step) ? "bg-blue-200" : "bg-gray-200"}`} />
            ))}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition text-lg leading-none">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* ── UPLOAD ── */}
          {step === "upload" && (
            <>
              <div
                onDrop={handleDrop} onDragOver={e => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition group"
              >
                <div className="text-4xl mb-3">📂</div>
                <p className="text-sm font-semibold text-gray-700 group-hover:text-blue-700">Drop a file here or click to browse</p>
                <p className="text-xs text-gray-400 mt-1">Supported: .csv, .xlsx, .xls, .vcf — AI maps columns automatically</p>
                <p className="text-[11px] text-gray-400 mt-1">Export from iCloud Contacts as .vcf for one-click iPhone/Mac import</p>
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.vcf" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </div>

              {/* Tags / source overrides applied to every imported contact */}
              <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                <p className="text-sm font-semibold text-gray-700 mb-2">
                  Tag every imported contact with{" "}
                  <span className="text-gray-400 font-normal">(comma-separated)</span>
                </p>
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="getahome, imported-from-icloud"
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  These tags get applied to every contact on import — useful for grouping (e.g.{" "}
                  <code>getahome</code>) or marking the source (e.g. <code>imported-from-icloud</code>).
                </p>
              </div>

              {sourceLabel && (
                <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-2 text-xs text-purple-800">
                  <span className="font-semibold">Source:</span> {sourceLabel} (auto-detected)
                </div>
              )}

              <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-3">
                <span className="text-xl mt-0.5">✨</span>
                <div>
                  <p className="text-sm font-semibold text-blue-800">AI-powered column mapping</p>
                  <p className="text-xs text-blue-600 mt-0.5">Upload any CSV — AI will automatically match your columns to the right CRM fields, even with unusual names.</p>
                </div>
              </div>

              {/* Contact type assignment */}
              <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
                <p className="text-sm font-semibold text-gray-700 mb-2">Assign Contact Type <span className="text-gray-400 font-normal">(optional)</span></p>
                <p className="text-xs text-gray-400 mb-3">All contacts from this upload will be assigned this type. Leave blank to keep existing type from CSV.</p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setAssignType("")}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border transition ${!assignType ? "bg-gray-900 text-white border-gray-900" : "bg-white text-gray-500 border-gray-200 hover:border-gray-400"}`}
                  >
                    No override
                  </button>
                  {CONTACT_TYPES.map(ct => (
                    <button key={ct.key}
                      onClick={() => setAssignType(ct.key)}
                      className={`px-3 py-2 rounded-lg text-xs font-medium border transition flex items-center gap-1.5 ${assignType === ct.key ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300 hover:text-indigo-600"}`}
                    >
                      <span>{ct.icon}</span> {ct.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-700">Need a template?</p>
                  <p className="text-xs text-gray-400 mt-0.5">Download sample CSV with standard column headers</p>
                </div>
                <button onClick={downloadTemplate} className="text-xs font-semibold text-blue-600 hover:text-blue-800 px-3 py-1.5 border border-blue-200 rounded-lg hover:bg-blue-50 transition">
                  Download Template
                </button>
              </div>
            </>
          )}

          {/* ── MAPPING ── */}
          {step === "mapping" && (
            <>
              {mappingLoading ? (
                <div className="py-10 text-center">
                  <div className="text-4xl mb-4 animate-pulse">✨</div>
                  <p className="text-sm font-semibold text-gray-700">AI is analysing your columns…</p>
                  <p className="text-xs text-gray-400 mt-1">Mapping {headers.length} columns from <span className="font-mono">{fileName}</span></p>
                </div>
              ) : (
                <>
                  <div className={`px-4 py-2.5 rounded-xl text-xs font-medium flex items-center gap-2 ${mappingMethod === "ai" ? "bg-blue-50 text-blue-700 border border-blue-200" : "bg-gray-50 text-gray-600 border border-gray-200"}`}>
                    {mappingMethod === "ai" ? "✨ AI mapped your columns" : "⚙️ Auto-mapped using column names"} — review below and adjust if needed
                  </div>

                  <div className="rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-1/3">Your Column</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-1/4">Sample Data</th>
                          <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Maps To</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {headers.map(col => {
                          const sample = rawRows.slice(0, 2).map(r => r[col]).filter(Boolean).join(", ");
                          const mapped = mapping[col] || "skip";
                          const isSkip = mapped === "skip";
                          return (
                            <tr key={col} className={isSkip ? "bg-gray-50 opacity-60" : ""}>
                              <td className="px-4 py-3 font-mono text-xs text-gray-700">{col}</td>
                              <td className="px-4 py-3 text-xs text-gray-400 truncate max-w-[120px]">{sample || "—"}</td>
                              <td className="px-4 py-3">
                                <select
                                  value={mapped}
                                  onChange={e => setMapping(prev => ({ ...prev, [col]: e.target.value }))}
                                  className={`w-full text-xs px-2 py-1.5 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${isSkip ? "border-gray-200 bg-gray-100 text-gray-400" : "border-blue-200 bg-blue-50 text-blue-700 font-medium"}`}
                                >
                                  {CRM_FIELDS.map(f => (
                                    <option key={f.key} value={f.key}>{f.label}</option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <p className="text-xs text-gray-400">
                    {Object.values(mapping).filter(v => v !== "skip").length} of {headers.length} columns will be imported
                  </p>
                </>
              )}
            </>
          )}

          {/* ── PREVIEW ── */}
          {step === "preview" && (
            <>
              {invalidRows.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <p className="text-xs font-semibold text-amber-700 mb-1">{invalidRows.length} row{invalidRows.length > 1 ? "s" : ""} will be skipped</p>
                  {invalidRows.slice(0, 3).map((r, i) => (
                    <p key={i} className="text-xs text-amber-600">{r.full_name || "(no name)"} — {r._error}</p>
                  ))}
                  {invalidRows.length > 3 && <p className="text-xs text-amber-500">…and {invalidRows.length - 3} more</p>}
                </div>
              )}

              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {["Name","Email","Phone","Type","State","Budget","Temp"].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {validRows.slice(0, 50).map((r, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-900 truncate max-w-[120px]">{r.full_name}</td>
                        <td className="px-3 py-2 text-gray-500 truncate max-w-[140px]">{r.email}</td>
                        <td className="px-3 py-2 text-gray-500">{r.phone || "—"}</td>
                        <td className="px-3 py-2 text-gray-500 capitalize">{r.buyer_type || "—"}</td>
                        <td className="px-3 py-2 text-gray-500">{r.preferred_state || "—"}</td>
                        <td className="px-3 py-2 text-gray-500">{r.budget_max ? `$${Number(r.budget_max).toLocaleString()}` : "—"}</td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${r.temperature === "hot" ? "bg-red-100 text-red-700" : r.temperature === "warm" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>
                            {r.temperature || "warm"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {validRows.length > 50 && (
                  <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-400">
                    Showing first 50 of {validRows.length} rows
                  </div>
                )}
              </div>

              {uploading && (
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>Importing…</span><span>{progress}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── DONE ── */}
          {step === "done" && (
            <div className="text-center py-6">
              <div className="text-5xl mb-4">{errors.length === 0 ? "✅" : "⚠️"}</div>
              <p className="text-lg font-bold text-gray-900 mb-1">
                {validRows.length - errors.length} contact{validRows.length - errors.length !== 1 ? "s" : ""} imported
              </p>
              {errors.length > 0 && (
                <div className="mt-4 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-left">
                  <p className="text-xs font-semibold text-red-700 mb-2">{errors.length} failed:</p>
                  {errors.map((e, i) => <p key={i} className="text-xs text-red-600">{e}</p>)}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button type="button" onClick={onClose}
            className="flex-1 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition">
            {step === "done" ? "Close" : "Cancel"}
          </button>

          {step === "upload" && (
            <button onClick={() => fileRef.current?.click()}
              className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition">
              Choose File
            </button>
          )}

          {step === "mapping" && !mappingLoading && (
            <button onClick={applyAndPreview}
              disabled={Object.values(mapping).filter(v => v !== "skip").length === 0}
              className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition">
              Preview Import →
            </button>
          )}

          {step === "preview" && (
            <>
              <button onClick={() => setStep("mapping")}
                className="px-4 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 transition">
                ← Edit Mapping
              </button>
              <button onClick={handleUpload} disabled={uploading || validRows.length === 0}
                className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition">
                {uploading ? `Importing… ${progress}%` : `Import ${validRows.length} Contact${validRows.length !== 1 ? "s" : ""}`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
