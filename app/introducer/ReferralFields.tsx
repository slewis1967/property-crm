"use client";

/**
 * The referral form fields, shared by the "new referral" page and the detail
 * page.
 *
 * The lock is VISIBLE here rather than only being discovered on save: a field
 * the introducer may not currently change renders as static text with a small
 * "locked" marker. Being told up front why you can't type in a box is the
 * difference between a system that feels controlled and one that feels broken.
 *
 * `editable` is computed server-side (see the GET route's `editabilityOf`) and
 * is authoritative there too — this is presentation, not enforcement.
 */
import { INTRODUCER_FIELDS, type IntroducerField } from "../../utils/introducer";

export type FieldValues = Record<string, string>;

const GROUPS: { key: IntroducerField["group"]; title: string; blurb?: string }[] = [
  { key: "client", title: "Your client" },
  {
    key: "applicant2",
    title: "Second applicant",
    blurb: "Only if they're applying with someone else.",
  },
  {
    key: "circumstances",
    title: "Their situation",
    blurb: "Rough figures are fine — we confirm everything directly with the client.",
  },
];

export default function ReferralFields({
  values,
  editable,
  onChange,
  highlight = [],
}: {
  values: FieldValues;
  /** Field keys the user may edit right now. */
  editable: string[];
  onChange: (key: string, value: string) => void;
  /** Fields to draw attention to — e.g. the ones we've just asked for. */
  highlight?: string[];
}) {
  const canEdit = new Set(editable);
  const flagged = new Set(highlight);

  return (
    <div className="space-y-7">
      {GROUPS.map((group) => {
        const fields = INTRODUCER_FIELDS.filter((f) => f.group === group.key);
        return (
          <section key={group.key}>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              {group.title}
            </h2>
            {group.blurb && <p className="mt-1 text-sm text-gray-500">{group.blurb}</p>}
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              {fields.map((field) => (
                <Field
                  key={field.key}
                  field={field}
                  value={values[field.key] ?? ""}
                  editable={canEdit.has(field.key)}
                  highlighted={flagged.has(field.key)}
                  onChange={(v) => onChange(field.key, v)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Field({
  field,
  value,
  editable,
  highlighted,
  onChange,
}: {
  field: IntroducerField;
  value: string;
  editable: boolean;
  highlighted: boolean;
  onChange: (value: string) => void;
}) {
  const wide = field.type === "textarea";
  const base =
    "mt-1 w-full rounded-lg border px-3 py-2 text-gray-900 focus:outline-none " +
    (highlighted ? "border-amber-400 bg-amber-50/40" : "border-gray-300 focus:border-gray-400");

  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <label className="flex items-center gap-2 text-sm font-medium text-gray-700" htmlFor={field.key}>
        <span>
          {field.label}
          {field.required && <span className="text-red-600"> *</span>}
        </span>
        {!editable && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-normal text-gray-500">
            locked
          </span>
        )}
      </label>

      {!editable ? (
        <p className="mt-1 min-h-[38px] whitespace-pre-wrap rounded-lg bg-gray-50 px-3 py-2 text-gray-900">
          {value || <span className="text-gray-400">—</span>}
        </p>
      ) : field.type === "select" ? (
        <select
          id={field.key}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={base}
        >
          <option value="">Select…</option>
          {(field.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : field.type === "textarea" ? (
        <textarea
          id={field.key}
          rows={3}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={base}
        />
      ) : (
        <input
          id={field.key}
          type={field.type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={base}
        />
      )}

      {field.hint && editable && <p className="mt-1 text-xs text-gray-500">{field.hint}</p>}
    </div>
  );
}
