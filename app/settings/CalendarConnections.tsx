"use client";

/**
 * Per-host Google Calendar connection panel. Lists known hosts with a
 * "Connect" / "Reconnect" button each that bounces through Google
 * OAuth. After consent, the callback stores the refresh token and
 * redirects back to /settings with a banner.
 */
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SCHEDULING_HOSTS, BRAND_LABEL } from "../../utils/scheduling-hosts";

type Connection = {
  host_email: string;
  display_name: string | null;
  scope: string;
  connected_at: string;
  updated_at: string;
};

export default function CalendarConnections() {
  const searchParams = useSearchParams();
  const justConnected = searchParams.get("calendar_connected");
  const errorMsg = searchParams.get("calendar_error");

  const [connections, setConnections] = useState<Record<string, Connection>>({});
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    try {
      const res = await fetch("/api/calendar/connections", { cache: "no-store" });
      const data = await res.json();
      const map: Record<string, Connection> = {};
      for (const c of data.connections || []) map[c.host_email.toLowerCase()] = c;
      setConnections(map);
    } finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, [justConnected]);

  const disconnect = async (email: string) => {
    if (!window.confirm(`Disconnect ${email}'s calendar from the CRM?`)) return;
    await fetch(`/api/calendar/connections?host=${encodeURIComponent(email)}`, { method: "DELETE" });
    refresh();
  };

  return (
    <div className="space-y-3">
      {justConnected && (
        <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">
          ✓ Connected {decodeURIComponent(justConnected)}
        </div>
      )}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          Failed: {decodeURIComponent(errorMsg)}
        </div>
      )}

      {SCHEDULING_HOSTS.map((h) => {
        const conn = connections[h.email.toLowerCase()];
        const connected = !!conn;
        return (
          <div
            key={h.email}
            className={`flex items-center gap-3 bg-white border rounded-xl px-4 py-3 ${
              !loading && !connected ? "border-amber-300 bg-amber-50/40" : "border-gray-200"
            }`}
          >
            <span className="text-2xl">📅</span>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-900">{h.displayName}</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-gray-100 text-gray-600">
                  {BRAND_LABEL[h.brand]}
                </span>
              </div>
              <div className="text-xs text-gray-500">
                {h.email}
                {connected && conn.connected_at && (
                  <> · connected {new Date(conn.connected_at).toLocaleDateString("en-AU")}</>
                )}
              </div>
              {!loading && !connected && (
                <div className="text-[11px] text-amber-700 mt-0.5">
                  Not connected — meetings booked with this host save to the CRM but send no invite.
                </div>
              )}
            </div>
            {loading ? (
              <span className="text-xs text-gray-400">…</span>
            ) : connected ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-green-600 font-medium">✓ Connected</span>
                <a
                  href={`/api/auth/google/connect?host=${encodeURIComponent(h.email)}`}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 transition"
                >
                  Reconnect
                </a>
                <button
                  onClick={() => disconnect(h.email)}
                  className="px-2 py-1.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 transition"
                >
                  Disconnect
                </button>
              </div>
            ) : (
              <a
                href={`/api/auth/google/connect?host=${encodeURIComponent(h.email)}`}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 transition"
              >
                Connect
              </a>
            )}
          </div>
        );
      })}
      <p className="text-[11px] text-gray-400 mt-2">
        When you click Connect, sign in to Google with the account matching the listed email.
        The CRM stores a refresh token only — no password. Used to create calendar events from
        the opportunity page on this user&rsquo;s behalf.
      </p>
    </div>
  );
}
