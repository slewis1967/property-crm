"use client";

import { useMemo, useState } from "react";

type SignatureFields = {
  name: string;
  title: string;
  email: string;
  phone: string;
  web: string;
  disclaimer: string;
};

export default function SignatureEditor({ initial }: { initial: SignatureFields }) {
  const [fields, setFields] = useState<SignatureFields>(initial);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const previewHtml = useMemo(() => renderSignatureHtml(fields), [fields]);

  const update = <K extends keyof SignatureFields>(key: K, value: SignatureFields[K]) =>
    setFields((s) => ({ ...s, [key]: value }));

  async function save() {
    setSaving(true);
    setError(null);
    setToast(null);
    try {
      const res = await fetch("/api/settings/signature", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "Save failed");
        return;
      }
      setToast("Signature saved — applies to all future outbound emails");
      setTimeout(() => setToast(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left: form */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <Field label="Name" value={fields.name} onChange={(v) => update("name", v)} placeholder="Sean Lewis" />
        <Field label="Title" value={fields.title} onChange={(v) => update("title", v)} placeholder="Director, NextKey Property Strategists" />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Email" value={fields.email} onChange={(v) => update("email", v)} placeholder="sean.l@nextkey.com.au" type="email" />
          <Field label="Phone" value={fields.phone} onChange={(v) => update("phone", v)} placeholder="0477 007 785" />
        </div>
        <Field label="Web" value={fields.web} onChange={(v) => update("web", v)} placeholder="nextkey.com.au" />
        <label className="block">
          <span className="block text-xs text-gray-600 mb-1">Disclaimer (optional)</span>
          <textarea
            value={fields.disclaimer}
            onChange={(e) => update("disclaimer", e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-sans"
            placeholder="General advice only…"
          />
          <span className="block text-[11px] text-gray-400 mt-1">
            Shown as small italic text under your details. Leave blank to omit.
          </span>
        </label>

        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>
        )}
        {toast && (
          <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">{toast}</p>
        )}

        <div className="flex justify-end pt-2">
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save signature"}
          </button>
        </div>
      </div>

      {/* Right: live preview */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <p className="text-xs uppercase font-semibold tracking-wider text-gray-500 mb-3">Preview</p>
        <div className="bg-gray-50 border border-gray-200 rounded-md p-5">
          <p className="text-sm text-gray-800 mb-3">
            Hi Sarah,
            <br /><br />
            Following on from our chat earlier, I&apos;ve put together a couple of options that fit the budget we discussed. Have a look when you get a moment and let me know what jumps out.
            <br /><br />
            Talk soon.
          </p>
          <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
        </div>
        <p className="text-[11px] text-gray-400 mt-3">
          The body above is a sample. Your actual signature is the part below the divider — it auto-appends to every email you send from the CRM.
        </p>
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-gray-600 mb-1">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
      />
    </label>
  );
}

// Mirror of utils/email-signature.ts::renderSignature, kept here so the
// preview renders client-side without a server round-trip on every keystroke.
function renderSignatureHtml(f: SignatureFields): string {
  return `
<div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:13px;color:#374151;line-height:1.5;">
  <p style="margin:0 0 4px;font-weight:600;color:#111827;">${escapeHtml(f.name)}</p>
  <p style="margin:0 0 6px;color:#6b7280;">${escapeHtml(f.title)}</p>
  <p style="margin:0;color:#6b7280;">
    <a href="mailto:${escapeHtml(f.email)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(f.email)}</a>
    &nbsp;·&nbsp;
    <a href="tel:${escapeHtml(f.phone.replace(/\s/g, ""))}" style="color:#2563eb;text-decoration:none;">${escapeHtml(f.phone)}</a>
    &nbsp;·&nbsp;
    <a href="https://${escapeHtml(f.web)}" style="color:#2563eb;text-decoration:none;">${escapeHtml(f.web)}</a>
  </p>
  ${f.disclaimer ? `<p style="margin:8px 0 0;font-size:11px;color:#9ca3af;font-style:italic;">${escapeHtml(f.disclaimer)}</p>` : ""}
</div>`.trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
