"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ClientHint } from "../../../utils/deal-packet";

/**
 * Opportunity link + operator notes for a deal packet.
 *
 *  - Opportunity picker: searchable list of NEXUS leads; selecting one attaches
 *    the packet (and cascades onto any already-generated reports) so they surface
 *    inside the opportunity.
 *  - AI auto-attach: if the email named a client (client_hint) and the packet
 *    isn't attached yet, we match it to a single opportunity and attach automatically,
 *    flagging it so the operator can override.
 *  - Changes / extra info: free text saved to the packet and included in the reports
 *    (baked in at the next generate).
 *
 * Saves go through POST /api/deal-analyser/attach.
 */

type Opp = { id: string; label: string; email: string | null };

/** Single confident match (email exact, else name exact, else unique name contains). */
function matchOpportunity(hint: ClientHint | null, opps: Opp[]): Opp | null {
  if (!hint) return null;
  const email = hint.email?.trim().toLowerCase();
  if (email) {
    const byEmail = opps.filter((o) => o.email?.trim().toLowerCase() === email);
    if (byEmail.length === 1) return byEmail[0];
    if (byEmail.length > 1) return null;
  }
  const name = hint.name?.trim().toLowerCase();
  if (name) {
    const exact = opps.filter((o) => o.label.trim().toLowerCase() === name);
    if (exact.length === 1) return exact[0];
    const contains = opps.filter((o) => o.label.toLowerCase().includes(name));
    if (contains.length === 1) return contains[0];
  }
  return null;
}

export default function PacketLinkPanel({
  packetId,
  initialOpportunityId,
  clientHint,
  initialNotes,
  opportunities,
}: {
  packetId: string;
  initialOpportunityId: string | null;
  clientHint: ClientHint | null;
  initialNotes: string | null;
  opportunities: Opp[];
}) {
  const initialOpp = opportunities.find((o) => o.id === initialOpportunityId) ?? null;
  const [selected, setSelected] = useState<Opp | null>(initialOpp);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [autoMatched, setAutoMatched] = useState(false);
  const [linkMsg, setLinkMsg] = useState<string | null>(null);

  const [notes, setNotes] = useState(initialNotes ?? "");
  const [notesMsg, setNotesMsg] = useState<string | null>(null);
  const savedNotes = useRef(initialNotes ?? "");

  async function attach(body: Record<string, unknown>) {
    const res = await fetch("/api/deal-analyser/attach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deal_packet_id: packetId, ...body }),
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || "Failed");
    return j;
  }

  // AI auto-attach: only when nothing's attached yet and the email named a client.
  useEffect(() => {
    if (initialOpportunityId || !clientHint) return;
    const m = matchOpportunity(clientHint, opportunities);
    if (!m) return;
    setSelected(m);
    setAutoMatched(true);
    attach({ opportunity_id: m.id })
      .then((j) => setLinkMsg(`Auto-attached from email${j.reports_updated ? ` · ${j.reports_updated} report(s) linked` : ""}`))
      .catch((e) => setLinkMsg(e.message));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? opportunities.filter((o) => o.label.toLowerCase().includes(q)) : opportunities;
    return list.slice(0, 50);
  }, [query, opportunities]);

  async function pick(o: Opp | null) {
    setSelected(o);
    setOpen(false);
    setQuery("");
    setAutoMatched(false);
    setLinkMsg("Saving…");
    try {
      const j = await attach({ opportunity_id: o?.id ?? null });
      setLinkMsg(o ? `Attached${j.reports_updated ? ` · ${j.reports_updated} report(s) linked` : ""}` : "Detached");
    } catch (e: any) {
      setLinkMsg(e.message);
    }
  }

  async function saveNotes() {
    if (notes === savedNotes.current) return;
    setNotesMsg("Saving…");
    try {
      await attach({ operator_notes: notes });
      savedNotes.current = notes;
      setNotesMsg("Saved");
    } catch (e: any) {
      setNotesMsg(e.message);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-5">
      {/* Opportunity */}
      <div>
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-gray-700">Opportunity</label>
          {linkMsg && <span className="text-xs text-gray-500">{linkMsg}</span>}
        </div>

        {selected ? (
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <a
              href={`/opportunities/${selected.id}`}
              className="text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-200 hover:border-[#0F4C5C]"
            >
              {selected.label} <span className="text-gray-400">↗</span>
            </a>
            {autoMatched && (
              <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-[#0F4C5C] text-white">
                from email
              </span>
            )}
            <button onClick={() => setOpen(true)} className="text-xs text-gray-500 hover:text-gray-800">
              Change
            </button>
            <button onClick={() => pick(null)} className="text-xs text-gray-400 hover:text-red-600">
              Detach
            </button>
          </div>
        ) : (
          <button onClick={() => setOpen(true)} className="mt-2 text-sm text-[#0F4C5C] font-medium hover:underline">
            + Attach to an opportunity
          </button>
        )}

        {clientHint?.name && !selected && (
          <p className="text-xs text-amber-700 mt-2">
            Email names &ldquo;{clientHint.name}&rdquo; but no single match was found — pick one below.
          </p>
        )}

        {open && (
          <div className="mt-3">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search opportunities by name or email…"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F4C5C]"
            />
            <ul className="mt-1 max-h-56 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-50">
              {filtered.length === 0 && (
                <li className="px-3 py-2 text-xs text-gray-400">
                  {opportunities.length === 0 ? "No opportunities loaded" : "No match"}
                </li>
              )}
              {filtered.map((o) => (
                <li key={o.id}>
                  <button
                    onClick={() => pick(o)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                  >
                    {o.label}
                    {o.email && <span className="text-gray-400 text-xs ml-2">{o.email}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Changes / extra information */}
      <div>
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold text-gray-700">Changes or extra information</label>
          {notesMsg && <span className="text-xs text-gray-500">{notesMsg}</span>}
        </div>
        <p className="text-xs text-gray-500 mt-0.5 mb-2">
          Anything to correct or add for the client&apos;s reports. Included in each report at generation.
        </p>
        <textarea
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value.slice(0, 4000));
            setNotesMsg(null);
          }}
          onBlur={saveNotes}
          rows={3}
          placeholder='e.g. "Client prefers the Sebastopol home — lead with that." or "Note the fixed-price build contract."'
          className="w-full rounded-lg border border-gray-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F4C5C]"
        />
      </div>
    </div>
  );
}
