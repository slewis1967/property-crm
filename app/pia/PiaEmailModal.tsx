"use client";

import { useState } from "react";

export default function PiaEmailModal({
  open,
  onClose,
  defaultTo,
  defaultSubject,
  reportId,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  defaultTo: string;
  defaultSubject: string;
  reportId: string | null;
  onSent: (to: string) => void;
}) {
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function send() {
    if (!reportId) {
      setError("Save the report first, then email it.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/pia/reports/${reportId}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, message }),
      });
      const json = await res.json();
      if (!json.ok) {
        setError(json.error || "Email send failed");
      } else {
        onSent(to);
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Email send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-white rounded-xl shadow-xl w-full max-w-lg p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg">Email this PIA report</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>
        <div className="space-y-3">
          <label className="block">
            <span className="block text-xs text-gray-600 mb-1">To</span>
            <input
              type="email"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              placeholder="buyer@example.com"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-gray-600 mb-1">Subject</span>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </label>
          <label className="block">
            <span className="block text-xs text-gray-600 mb-1">Message (optional, shows above the report)</span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              placeholder="Hi Sarah — here's the analysis we discussed for the Brisbane property…"
            />
          </label>
          {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={send}
            disabled={sending || !to || !subject}
            className="px-4 py-2 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
