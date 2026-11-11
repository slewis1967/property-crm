"use client";

/**
 * SMS and Phone call buttons for client/opportunity pages. Both use Glenn's
 * work phone (0477 201 245), the number clients see on all our marketing:
 *   - SMS: sent from the handset's own SIM through the SMS gateway.
 *   - Phone call: queued to the relay, which makes the handset dial; the
 *     caller then talks on the work phone.
 */
import { useEffect, useRef, useState } from "react";

const WORK_PHONE_LABEL = "0477 201 245";

type Props = {
  phone: string;
  name?: string | null;
  contactId?: string | null;
  opportunityId?: string | null;
  className: string;
};

export function WorkPhoneSmsButton({ phone, name, contactId, className }: Props) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function close() {
    setOpen(false);
    setText("");
    setError(null);
    setSent(false);
  }

  async function send() {
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Send the phone shown on the page, so an opportunity's number is used
        // even when its contact row has a different or empty one.
        body: JSON.stringify({ phone, contactId: contactId ?? undefined, body: text, campaign: "crm-one-off", via: "work_phone" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setError(json.error || `Send failed (HTTP ${res.status})`);
        return;
      }
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className={className} title={`Text ${phone} from the work phone (${WORK_PHONE_LABEL})`}>
        💬 SMS
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={close}>
          <div className="w-full max-w-md bg-white rounded-xl shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">Text {name || phone}</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                To {phone} · from the work phone {WORK_PHONE_LABEL}
              </p>
            </div>
            <div className="p-5 space-y-3">
              {sent ? (
                <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
                  Queued on the work phone. It sends within a few seconds; replies come back to the CRM and the handset.
                </p>
              ) : (
                <>
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={5}
                    maxLength={918}
                    placeholder="Hi, it's Glenn from NextKey…"
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-600"
                  />
                  <p className="text-[11px] text-gray-400">{text.length} characters · {Math.max(1, Math.ceil(text.length / 153))} SMS</p>
                </>
              )}
              {error && <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 p-5 border-t border-gray-100">
              <button onClick={close} className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50">
                {sent ? "Close" : "Cancel"}
              </button>
              {!sent && (
                <button
                  onClick={send}
                  disabled={sending || !text.trim()}
                  className="px-4 py-2 text-sm font-semibold text-white bg-teal-700 rounded-md hover:bg-teal-800 disabled:opacity-50"
                >
                  {sending ? "Sending…" : "Send SMS"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function WorkPhoneCallButton({ phone, contactId, opportunityId, className }: Props) {
  const [state, setState] = useState<{ status: string; message: string } | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  async function dial() {
    if (timer.current) clearInterval(timer.current);
    setState({ status: "pending", message: "Sending to the work phone…" });
    try {
      const res = await fetch("/api/calls/dial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, contactId: contactId ?? undefined, opportunityId: opportunityId ?? undefined }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        setState({ status: "failed", message: json.error || `Couldn't start the call (HTTP ${res.status})` });
        return;
      }
      const id = json.id as string;
      timer.current = setInterval(async () => {
        try {
          const r = await fetch(`/api/calls/dial?id=${encodeURIComponent(id)}`);
          const j = await r.json();
          if (!j.ok) return;
          setState({ status: j.status, message: j.message });
          if (j.status !== "pending" && timer.current) {
            clearInterval(timer.current);
            timer.current = null;
            if (j.status === "dialing") setTimeout(() => setState(null), 8000);
          }
        } catch {
          // keep polling; the TTL turns a dead relay into "expired"
        }
      }, 1500);
    } catch (e) {
      setState({ status: "failed", message: e instanceof Error ? e.message : "Couldn't start the call" });
    }
  }

  const tone =
    state?.status === "failed" || state?.status === "expired"
      ? "text-red-600"
      : state?.status === "dialing"
        ? "text-green-700"
        : "text-gray-500";

  return (
    <span className="relative inline-flex items-center">
      <button
        onClick={dial}
        disabled={state?.status === "pending"}
        className={className}
        title={`Ring ${phone} from the work phone (${WORK_PHONE_LABEL})`}
      >
        📞 {state?.status === "pending" ? "Calling…" : "Phone call"}
      </button>
      {state && state.status !== "pending" && (
        <span className={`absolute top-full right-0 mt-1 w-64 z-30 bg-white border border-gray-200 rounded-lg shadow px-3 py-2 text-xs ${tone}`}>
          {state.message}
          <button onClick={() => setState(null)} className="ml-2 text-gray-400 hover:text-gray-600">✕</button>
        </span>
      )}
    </span>
  );
}
