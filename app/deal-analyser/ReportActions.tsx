"use client";

import { useState } from "react";
import { errMessage } from "../../utils/errors";

/**
 * Toolbar actions for a generated report. "Update" jumps back to the packet hub;
 * "Email" sends the report to a client (the logged-in user's signature is appended
 * server-side); "Delete" removes the report. Not printed.
 */
export default function ReportActions({ reportId, dealPacketId }: { reportId: string; dealPacketId: string | null }) {
  const [busy, setBusy] = useState(false);
  const hubHref = dealPacketId ? `/deal-analyser/${dealPacketId}` : "/deal-analyser";

  const [emailOpen, setEmailOpen] = useState(false);
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("Your NextKey investment analysis");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<{ ok: boolean; msg: string } | null>(null);

  async function del() {
    if (!confirm("Delete this report? This can't be undone.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/pia/reports/${reportId}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error || "Delete failed");
      window.location.href = hubHref;
    } catch (e) {
      alert(errMessage(e));
      setBusy(false);
    }
  }

  async function sendEmail() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())) {
      setSent({ ok: false, msg: "Enter a valid email address" });
      return;
    }
    setSending(true);
    setSent(null);
    try {
      const res = await fetch(`/api/pia/reports/${reportId}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: to.trim(), subject, message }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || "Send failed");
      setSent({ ok: true, msg: `Sent to ${to.trim()}` });
    } catch (e) {
      setSent({ ok: false, msg: errMessage(e) });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="relative flex items-center gap-2">
      <a href={hubHref} className="px-3 py-2 text-sm font-semibold border border-gray-300 rounded-lg hover:bg-gray-50">
        Update
      </a>
      <button
        onClick={() => { setEmailOpen((o) => !o); setSent(null); }}
        className="px-3 py-2 text-sm font-semibold border border-gray-300 rounded-lg hover:bg-gray-50"
      >
        Email
      </button>
      <button
        onClick={del}
        disabled={busy}
        className="px-3 py-2 text-sm font-semibold border border-red-300 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-40"
      >
        {busy ? "Deleting…" : "Delete"}
      </button>

      {emailOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-200 rounded-xl shadow-lg p-4 z-20 text-left">
          <p className="text-sm font-semibold text-gray-800 mb-2">Email this report</p>
          <input
            type="email"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="client@email.com"
            className="w-full mb-2 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F4C5C]"
          />
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className="w-full mb-2 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F4C5C]"
          />
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="Optional message to the client…"
            className="w-full mb-1 rounded-lg border border-gray-300 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F4C5C]"
          />
          <p className="text-[11px] text-gray-400 mb-2">Your email signature is added automatically.</p>
          {sent && <p className={`text-xs mb-2 ${sent.ok ? "text-green-600" : "text-red-600"}`}>{sent.msg}</p>}
          <div className="flex items-center gap-3">
            <button
              onClick={sendEmail}
              disabled={sending}
              className="px-4 py-2 text-sm font-semibold text-white rounded-lg transition disabled:opacity-40"
              style={{ background: "#0F4C5C" }}
            >
              {sending ? "Sending…" : "Send"}
            </button>
            <button onClick={() => setEmailOpen(false)} className="text-sm text-gray-500 hover:text-gray-800">Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
