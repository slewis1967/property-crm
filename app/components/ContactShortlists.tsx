"use client";

/**
 * Property shortlists sent to this contact, and what they said about each
 * property. Reads GET /api/property-shortlists?contact_id= (authed).
 *
 * The client's link itself can't be shown again — only its hash is stored — so
 * this panel offers "Send properties" (a new shortlist) and "Revoke" (kill a
 * link that was sent to the wrong person or has served its purpose).
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatDateTime } from "../../utils/datetime";

type Item = {
  id: string;
  property_id: string;
  ref: string | null;
  label: string | null;
  price: number | null;
  client_response: string | null;
  client_note: string | null;
  responded_at: string | null;
};

type Shortlist = {
  id: string;
  title: string | null;
  client_email: string | null;
  status: string;
  usable: boolean;
  expires_at: string;
  view_count: number;
  last_viewed_at: string | null;
  created_by: string;
  created_at: string;
  items: Item[];
};

const money = (n: number | null) => (n ? `$${Math.round(n).toLocaleString("en-AU")}` : "—");

export default function ContactShortlists({ contactId }: { contactId: string }) {
  const [shortlists, setShortlists] = useState<Shortlist[] | null>(null);
  const [tableMissing, setTableMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/property-shortlists?contact_id=${encodeURIComponent(contactId)}`, { cache: "no-store" });
        const json = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !json.ok) {
          setError(json.error || `Couldn't load shortlists (${res.status})`);
          return;
        }
        setShortlists(json.shortlists ?? []);
        setTableMissing(Boolean(json.tableMissing));
      } catch {
        if (!cancelled) setError("Couldn't load shortlists.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contactId, reloadKey]);

  const revoke = useCallback(async (id: string) => {
    setConfirmRevoke(null);
    const res = await fetch(`/api/property-shortlists/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "revoke" }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) setError(json.error || "Couldn't revoke that link.");
    setReloadKey((k) => k + 1);
  }, []);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700">🏘️ Property shortlists</h2>
        <Link
          href={`/properties?send_to=${encodeURIComponent(contactId)}`}
          title="Tick properties in the Aggregator Feed, then press Send to client"
          className="px-3 py-1.5 text-xs font-semibold bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-700"
        >
          📨 Send properties
        </Link>
      </div>

      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      {tableMissing && (
        <p className="text-xs text-amber-700">Shortlists aren&apos;t set up yet — run migrations/20260914_property_shortlists.sql.</p>
      )}
      {shortlists === null && !error && <p className="text-xs text-gray-400">Loading…</p>}
      {shortlists?.length === 0 && !tableMissing && (
        <p className="text-xs text-gray-400">
          Nothing sent yet. Tick properties in the Aggregator Feed and press <strong>📨 Send to client</strong>.
        </p>
      )}

      <div className="space-y-3">
        {shortlists?.map((s) => {
          const interested = s.items.filter((i) => i.client_response === "interested").length;
          return (
            <div key={s.id} className="border border-gray-100 rounded-lg p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {s.title || `${s.items.length} ${s.items.length === 1 ? "property" : "properties"}`}
                  </p>
                  <p className="text-xs text-gray-500">
                    Sent {formatDateTime(s.created_at)} by {s.created_by.split("@")[0]}
                    {" · "}
                    {s.view_count > 0
                      ? `viewed ${s.view_count}× (last ${formatDateTime(s.last_viewed_at!)})`
                      : "not opened yet"}
                    {interested > 0 && ` · ${interested} interested`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                      s.usable ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {s.status === "revoked" ? "Revoked" : s.usable ? `Live until ${new Date(s.expires_at).toLocaleDateString("en-AU", { timeZone: "Australia/Brisbane" })}` : "Expired"}
                  </span>
                  {s.usable &&
                    (confirmRevoke === s.id ? (
                      <>
                        <button type="button" onClick={() => revoke(s.id)} className="text-[11px] font-semibold text-red-600">
                          Confirm revoke
                        </button>
                        <button type="button" onClick={() => setConfirmRevoke(null)} className="text-[11px] text-gray-500">
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button type="button" onClick={() => setConfirmRevoke(s.id)} className="text-[11px] text-gray-500 hover:text-red-600">
                        Revoke link
                      </button>
                    ))}
                </div>
              </div>
              <ul className="mt-2 divide-y divide-gray-50">
                {s.items.map((i) => (
                  <li key={i.id} className="py-1.5 text-xs flex flex-wrap items-center gap-x-2">
                    <Link href={`/properties/${i.property_id}`} className="font-medium text-blue-700 hover:underline">
                      {i.ref ?? "Property"}
                    </Link>
                    <span className="text-gray-600">{i.label}</span>
                    <span className="text-gray-400">{money(i.price)}</span>
                    {i.client_response === "interested" && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold">👍 Interested</span>
                    )}
                    {i.client_response === "not_for_me" && (
                      <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-semibold">Not for me</span>
                    )}
                    {i.client_note && <span className="basis-full text-gray-600 italic">&ldquo;{i.client_note}&rdquo;</span>}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
