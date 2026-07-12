"use client";

/**
 * Generic edit modal for opportunity (lead) and contact records.
 * Caller passes the current record + the PATCH endpoint URL; we render
 * a form with the fields most users actually want to update, save the
 * delta back via PATCH, and call onSaved with the merged result so the
 * parent can update its local state without a refetch.
 */
import { useState } from "react";
import { errMessage } from "../../utils/errors";

type FieldDef =
  | { key: string; label: string; type: "text" | "email" | "tel" | "number" | "date" }
  | { key: string; label: string; type: "select"; options: string[] }
  | { key: string; label: string; type: "textarea" }
  | { kind: "section"; label: string };

const isField = (
  f: FieldDef,
): f is Exclude<FieldDef, { kind: "section"; label: string }> => !("kind" in f);

const STATE_OPTIONS = ["", "NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];
const MARITAL_OPTIONS = ["", "Single", "Married", "De facto", "Separated", "Divorced", "Widowed"];
const EMPLOYMENT_OPTIONS = [
  "", "Full-time", "Part-time", "Casual", "Self-employed",
  "Contract", "Retired", "Unemployed", "Other",
];

export type RecordKind = "opportunity" | "contact";

const OPP_FIELDS: FieldDef[] = [
  { kind: "section", label: "Lead" },
  { key: "full_name",   label: "Full name",   type: "text" },
  { key: "email",       label: "Email",       type: "email" },
  { key: "phone",       label: "Phone",       type: "tel" },
  { key: "buyer_type",  label: "Buyer type",  type: "select",
    options: ["", "Owner Occupier", "Investor", "First Home Buyer", "SDA", "SMSF", "Downsizer"] },
  { key: "state",       label: "State (preferred)", type: "select", options: STATE_OPTIONS },
  { key: "preferred_location", label: "Preferred buy location", type: "text" },
  { key: "budget",      label: "Budget",      type: "text" },
  { key: "timeframe",   label: "Timeframe",   type: "text" },
  { key: "temperature", label: "Temperature", type: "select",
    options: ["", "hot", "warm", "cold"] },
  { key: "score",       label: "Score",       type: "number" },
  { key: "source",      label: "Source",      type: "text" },
  { key: "segment",     label: "Segment",     type: "text" },
  { key: "message",     label: "Message",     type: "textarea" },

  { kind: "section", label: "Personal" },
  { key: "date_of_birth",    label: "Date of birth",    type: "date" },
  { key: "marital_status",   label: "Marital status",   type: "select", options: MARITAL_OPTIONS },
  { key: "dependents_count", label: "Dependents",       type: "number" },

  { kind: "section", label: "Home address" },
  { key: "home_address_street",   label: "Street",   type: "text" },
  { key: "home_address_suburb",   label: "Suburb",   type: "text" },
  { key: "home_address_state",    label: "State",    type: "select", options: STATE_OPTIONS },
  { key: "home_address_postcode", label: "Postcode", type: "text" },

  { kind: "section", label: "Employment" },
  { key: "employment_type", label: "Employment type", type: "select", options: EMPLOYMENT_OPTIONS },
  { key: "employer_name",   label: "Employer",        type: "text" },
  { key: "occupation",      label: "Occupation",      type: "text" },

  { kind: "section", label: "Financial" },
  { key: "annual_income",         label: "Annual income (gross)", type: "number" },
  { key: "partner_annual_income", label: "Partner annual income", type: "number" },
  { key: "existing_savings",      label: "Savings / deposit",     type: "number" },
  { key: "hecs_balance",          label: "HECS-HELP balance",     type: "number" },
  // Note: opportunity "notes" is a JSON-encoded entry feed maintained by
  // the notes section on the page — editing it as a textarea here would
  // clobber accumulated entries, so it's intentionally excluded.
];

const CONTACT_FIELDS: FieldDef[] = [
  { kind: "section", label: "Identity" },
  { key: "first_name",      label: "First name",         type: "text" },
  { key: "full_name",       label: "Full name",          type: "text" },
  { key: "name",            label: "Display name",       type: "text" },
  { key: "email",           label: "Email",              type: "email" },
  { key: "phone",           label: "Phone",              type: "tel" },

  { kind: "section", label: "Buyer profile" },
  { key: "buyer_type",      label: "Buyer type",         type: "select",
    options: ["", "Owner Occupier", "Investor", "First Home Buyer", "SDA", "SMSF", "Downsizer"] },
  { key: "state",           label: "State",              type: "select", options: STATE_OPTIONS },
  { key: "preferred_state", label: "Preferred buy state", type: "select", options: STATE_OPTIONS },
  { key: "budget",          label: "Budget",             type: "number" },
  { key: "budget_min",      label: "Budget (min)",       type: "number" },
  { key: "budget_max",      label: "Budget (max)",       type: "number" },
  { key: "finance_status",  label: "Finance status",     type: "select",
    options: ["", "Pre-approved", "Conditionally approved", "Not yet applied", "Declined", "Cash buyer"] },
  { key: "timeframe",       label: "Timeframe",          type: "text" },
  { key: "temperature",     label: "Temperature",        type: "select",
    options: ["", "hot", "warm", "cold"] },
  { key: "status",          label: "Status",             type: "select",
    options: ["", "active", "qualified", "matched", "won", "lost", "archived"] },
  { key: "lead_score",      label: "Lead score",         type: "number" },

  { kind: "section", label: "Personal" },
  { key: "date_of_birth",    label: "Date of birth",     type: "date" },
  { key: "marital_status",   label: "Marital status",    type: "select", options: MARITAL_OPTIONS },
  { key: "dependents_count", label: "Dependents",        type: "number" },

  { kind: "section", label: "Home address" },
  { key: "home_address_street",   label: "Street",   type: "text" },
  { key: "home_address_suburb",   label: "Suburb",   type: "text" },
  { key: "home_address_state",    label: "State",    type: "select", options: STATE_OPTIONS },
  { key: "home_address_postcode", label: "Postcode", type: "text" },

  { kind: "section", label: "Employment" },
  { key: "employment_type", label: "Employment type", type: "select", options: EMPLOYMENT_OPTIONS },
  { key: "employer_name",   label: "Employer",        type: "text" },
  { key: "occupation",      label: "Occupation",      type: "text" },

  { kind: "section", label: "Financial" },
  { key: "annual_income",         label: "Annual income (gross)", type: "number" },
  { key: "partner_annual_income", label: "Partner annual income", type: "number" },
  { key: "existing_savings",      label: "Savings / deposit",     type: "number" },
  { key: "hecs_balance",          label: "HECS-HELP balance",     type: "number" },

  { kind: "section", label: "Other" },
  { key: "segment",         label: "Segment",            type: "text" },
  { key: "source",          label: "Source",             type: "text" },
  { key: "message",         label: "Message",            type: "textarea" },
  { key: "notes",           label: "Notes",              type: "textarea" },
];

export default function EditRecordModal({
  kind,
  record,
  patchUrl,
  onClose,
  onSaved,
}: {
  kind: RecordKind;
  record: Record<string, unknown>;
  patchUrl: string;
  onClose: () => void;
  onSaved: (updated: Record<string, unknown>) => void;
}) {
  const fields = kind === "opportunity" ? OPP_FIELDS : CONTACT_FIELDS;
  const editableFields = fields.filter(isField);

  // Local form state — start from current record values
  const initial: Record<string, string | number> = {};
  for (const f of editableFields) {
    initial[f.key] = (record[f.key] ?? (f.type === "number" ? 0 : "")) as string | number;
  }
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: string, value: string | number) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    // Only send fields that actually changed; skip empty strings if the
    // record was previously null so we don't write "" over null
    const delta: Record<string, unknown> = {};
    for (const f of editableFields) {
      const current = record[f.key];
      const next = form[f.key];
      const blank = next === "" || next === null || next === undefined;
      if (blank && (current === null || current === undefined || current === "")) continue;
      if (next !== current) delta[f.key] = blank ? null : next;
    }

    if (Object.keys(delta).length === 0) {
      onClose();
      return;
    }

    try {
      const res = await fetch(patchUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(delta),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Save failed (${res.status})`);
      onSaved({ ...record, ...delta });
      onClose();
    } catch (e) {
      setError(errMessage(e, "Save failed"));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">
            Edit {kind === "opportunity" ? "opportunity" : "contact"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 transition text-lg leading-none">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
          {fields.map((f, i) => {
            if (!isField(f)) {
              return (
                <div key={`section-${i}`} className="pt-3 first:pt-0">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 border-b border-gray-100 pb-1.5 mb-2">
                    {f.label}
                  </div>
                </div>
              );
            }
            return (
              <div key={f.key}>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                  {f.label}
                </label>
                {f.type === "textarea" ? (
                  <textarea
                    value={form[f.key] ?? ""}
                    onChange={(e) => set(f.key, e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : f.type === "select" ? (
                  <select
                    value={form[f.key] ?? ""}
                    onChange={(e) => set(f.key, e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {f.options.map((o) => (
                      <option key={o} value={o}>{o || "—"}</option>
                    ))}
                  </select>
                ) : f.type === "number" ? (
                  <input
                    type="number"
                    value={form[f.key] ?? 0}
                    onChange={(e) => set(f.key, Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : f.type === "date" ? (
                  <input
                    type="date"
                    value={(form[f.key] ?? "").toString().slice(0, 10)}
                    onChange={(e) => set(f.key, e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                ) : (
                  <input
                    type={f.type}
                    value={form[f.key] ?? ""}
                    onChange={(e) => set(f.key, e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                )}
              </div>
            );
          })}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
        </form>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 disabled:opacity-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
