"use client";

/**
 * Add ONE contact by hand.
 *
 * Until now the only way into the contacts table was the CSV bulk importer,
 * which is not something you can drive while someone is on the phone. This is
 * the short form: the two fields the API requires, plus the handful worth
 * capturing at first contact. Everything else is on the contact's own edit
 * modal once they exist — a long form here just delays getting them saved.
 *
 * POST /api/contacts is idempotent on email, so submitting an address that is
 * already in the CRM opens that person instead of making a second copy. The
 * modal says which of the two happened rather than reporting a create either
 * way — quietly reusing a record looks identical to creating one until you
 * notice the edits you just typed didn't stick.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { errMessage } from "../../utils/errors";

const BUYER_TYPES = ["", "Owner Occupier", "Investor", "First Home Buyer", "SDA", "SMSF", "Downsizer"];
const STATES = ["", "NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];
const TEMPERATURES = ["hot", "warm", "cold"];

export default function NewContactModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  /** Called with the contact id. Omit to navigate to the contact instead. */
  onCreated?: (contactId: string, created: boolean) => void;
}) {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [buyerType, setBuyerType] = useState("");
  const [preferredState, setPreferredState] = useState("");
  const [timeframe, setTimeframe] = useState("");
  const [temperature, setTemperature] = useState("warm");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setExisting(null);
    if (!fullName.trim() || !email.trim()) {
      setError("Name and email are both needed — email is how a contact is matched.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim().toLowerCase(),
          phone: phone.trim() || null,
          buyer_type: buyerType || null,
          preferred_state: preferredState || null,
          timeframe: timeframe.trim() || null,
          temperature,
          source: "crm_manual",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.contact_id) {
        throw new Error(data.error || `Could not save (HTTP ${res.status})`);
      }
      if (data.created === false) {
        // Tell them, then go there — the person exists, so the useful next
        // action is opening them, not being blocked with an error.
        setExisting(data.contact_id as string);
        setSaving(false);
        return;
      }
      if (onCreated) onCreated(data.contact_id as string, true);
      else router.push(`/contacts/${data.contact_id}`);
    } catch (err) {
      setError(errMessage(err, "Could not save the contact"));
      setSaving(false);
    }
  };

  const openExisting = () => {
    if (!existing) return;
    if (onCreated) onCreated(existing, false);
    else router.push(`/contacts/${existing}`);
  };

  const field = "w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent";
  const label = "block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto py-10">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">👤 New contact</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 p-1.5 rounded-lg hover:bg-gray-100 text-lg leading-none">
            ✕
          </button>
        </div>

        <form onSubmit={submit} className="px-5 py-4 space-y-3">
          <div>
            <label className={label}>Full name *</label>
            <input
              required
              autoFocus
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Jane Citizen"
              className={field}
            />
          </div>

          <div>
            <label className={label}>Email *</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="jane@example.com"
              className={field}
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Used to match this person across the CRM, so it can&apos;t be left blank.
            </p>
          </div>

          <div>
            <label className={label}>Phone</label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0400 000 000"
              className={field}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Buyer type</label>
              <select value={buyerType} onChange={(e) => setBuyerType(e.target.value)} className={field}>
                {BUYER_TYPES.map((t) => (
                  <option key={t} value={t}>{t || "—"}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Preferred state</label>
              <select
                value={preferredState}
                onChange={(e) => setPreferredState(e.target.value)}
                className={field}>
                {STATES.map((s) => (
                  <option key={s} value={s}>{s || "—"}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>Timeframe</label>
              <input
                value={timeframe}
                onChange={(e) => setTimeframe(e.target.value)}
                placeholder="e.g. 3-6 months"
                className={field}
              />
            </div>
            <div>
              <label className={label}>Temperature</label>
              <select
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                className={field}>
                {TEMPERATURES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          {existing && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
              <p className="text-xs text-amber-800">
                A contact with that email is already in the CRM — nothing was duplicated.
              </p>
              <button
                type="button"
                onClick={openExisting}
                className="mt-1.5 text-xs font-semibold text-amber-900 underline hover:no-underline">
                Open the existing contact →
              </button>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 px-4 py-2 text-sm font-semibold text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition disabled:opacity-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50">
              {saving ? "Saving…" : "Add contact"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
