"use client";

import { useEffect, useMemo, useState } from "react";
import type { ClientHint } from "../../../utils/deal-packet";

/**
 * Opportunity link + AI-applied changes for a deal packet.
 *
 *  - Opportunity picker: searchable list of NEXUS leads; selecting one attaches the
 *    packet (and cascades onto already-generated reports). AI auto-attach: if the
 *    email named a client (client_hint) and the packet isn't attached, we match a
 *    single opportunity and attach automatically, flagging it for override.
 *  - Changes / extra information: free text. "Preview changes" asks the AI to turn it
 *    into concrete edits (rent / price), shown for confirmation; "Apply & regenerate"
 *    applies them, saves any residual prose as a report note, and regenerates so the
 *    figures actually move. Nothing changes until you confirm.
 */

type Opp = { id: string; label: string; email: string | null };
type Edit = { property_index: number; label: string; field: string; detail: string; apply: Record<string, unknown> };
type Violation = { law: string; severity: string; snippet: string; reason: string; fix: string };
type Compliance = { violations: Violation[]; suggestion: string };
type Proposal = { edits: Edit[]; extra_info: string };

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

  const [instruction, setInstruction] = useState(initialNotes ?? "");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [compliance, setCompliance] = useState<Compliance | null>(null);
  const [overrideMode, setOverrideMode] = useState(false);
  const [fullName, setFullName] = useState("");
  const [changesBusy, setChangesBusy] = useState(false);
  const [changesMsg, setChangesMsg] = useState<string | null>(null);

  const flagged = (compliance?.violations.length ?? 0) > 0;
  function resetChanges() {
    setProposal(null);
    setCompliance(null);
    setOverrideMode(false);
    setFullName("");
    setChangesMsg(null);
  }

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

  async function previewChanges() {
    if (!instruction.trim()) return;
    setChangesBusy(true);
    resetChanges();
    try {
      const res = await fetch("/api/deal-analyser/parse-changes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal_packet_id: packetId, instruction }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Couldn't read that");
      setProposal({ edits: j.edits ?? [], extra_info: j.extra_info ?? "" });
      setCompliance({ violations: j.compliance?.violations ?? [], suggestion: j.compliance?.suggestion ?? "" });
    } catch (e: any) {
      setChangesMsg(e.message);
    } finally {
      setChangesBusy(false);
    }
  }

  async function applyChanges() {
    if (!proposal) return;
    if (flagged && !fullName.trim()) return; // override requires a name
    setChangesBusy(true);
    setChangesMsg("Applying…");
    try {
      if (proposal.edits.length > 0) {
        const rr = await fetch("/api/deal-analyser/rent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deal_packet_id: packetId, rents: proposal.edits.map((e) => e.apply) }),
        });
        if (!rr.ok) throw new Error((await rr.json()).error || "Failed to apply changes");
      }
      const attachBody: Record<string, unknown> = { operator_notes: proposal.extra_info ?? "" };
      if (flagged) {
        attachBody.compliance_override = {
          full_name: fullName.trim(),
          flagged_text: proposal.extra_info ?? "",
          violations: compliance?.violations ?? [],
        };
      }
      await attach(attachBody);
      const gr = await fetch("/api/deal-analyser/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deal_packet_id: packetId }),
      });
      if (!gr.ok) throw new Error((await gr.json()).error || "Failed to regenerate");
      window.location.reload();
    } catch (e: any) {
      setChangesMsg(e.message);
      setChangesBusy(false);
    }
  }

  function useSuggestion() {
    if (compliance?.suggestion) setInstruction(compliance.suggestion);
    resetChanges();
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
            <a href={`/opportunities/${selected.id}`} className="text-sm font-medium px-3 py-1.5 rounded-lg border border-gray-200 hover:border-[#0F4C5C]">
              {selected.label} <span className="text-gray-400">↗</span>
            </a>
            {autoMatched && (
              <span className="text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full bg-[#0F4C5C] text-white">from email</span>
            )}
            <button onClick={() => setOpen(true)} className="text-xs text-gray-500 hover:text-gray-800">Change</button>
            <button onClick={() => pick(null)} className="text-xs text-gray-400 hover:text-red-600">Detach</button>
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
                <li className="px-3 py-2 text-xs text-gray-400">{opportunities.length === 0 ? "No opportunities loaded" : "No match"}</li>
              )}
              {filtered.map((o) => (
                <li key={o.id}>
                  <button onClick={() => pick(o)} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
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
          {changesMsg && <span className="text-xs text-gray-500">{changesMsg}</span>}
        </div>
        <p className="text-xs text-gray-500 mt-0.5 mb-2">
          Describe a change in plain English (e.g. &ldquo;rent per room to 280 on Kossuth St&rdquo;) — the AI turns it into
          a specific edit you confirm. Non-numeric info is included as a report note.
        </p>
        <textarea
          value={instruction}
          onChange={(e) => {
            setInstruction(e.target.value.slice(0, 4000));
            setProposal(null);
            setChangesMsg(null);
          }}
          rows={3}
          placeholder='e.g. "change rent per room to 280 on Kossuth St" · "client prefers Sebastopol — lead with that"'
          className="w-full rounded-lg border border-gray-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F4C5C]"
        />

        {!proposal ? (
          <button
            onClick={previewChanges}
            disabled={changesBusy || !instruction.trim()}
            className="mt-2 px-4 py-2 text-sm font-semibold text-white rounded-lg transition disabled:opacity-40"
            style={{ background: "#0F4C5C" }}
          >
            {changesBusy ? "Reading…" : "Preview changes"}
          </button>
        ) : (
          <div className="mt-3 rounded-lg border border-gray-200 p-4 space-y-3">
            {proposal.edits.length > 0 ? (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">These changes will be applied</p>
                <ul className="space-y-1">
                  {proposal.edits.map((e, i) => (
                    <li key={i} className="text-sm text-gray-800">
                      <span className="font-medium">{e.label}</span> — {e.detail}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-gray-600">No figure changes — the text will be added to the report as a note.</p>
            )}
            {proposal.extra_info && (
              <p className="text-xs text-gray-500">Report note: <span className="text-gray-700">{proposal.extra_info}</span></p>
            )}

            {/* Compliance warning */}
            {flagged && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-semibold text-amber-900">⚠ Compliance warning</p>
                <ul className="mt-2 space-y-2">
                  {compliance!.violations.map((v, i) => (
                    <li key={i} className="text-xs text-amber-900">
                      <span className="font-semibold">{v.law}{v.severity ? ` · ${v.severity}` : ""}</span>
                      {v.snippet ? <> — &ldquo;{v.snippet}&rdquo;</> : null}
                      {v.reason ? <div className="text-amber-800 mt-0.5">{v.reason}</div> : null}
                      {v.fix ? <div className="text-amber-700">Fix: {v.fix}</div> : null}
                    </li>
                  ))}
                </ul>
                {compliance!.suggestion && (
                  <div className="mt-2 text-xs">
                    <p className="font-semibold text-amber-900">Suggested wording</p>
                    <p className="text-amber-800">{compliance!.suggestion}</p>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            {flagged ? (
              overrideMode ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-xs text-red-900 leading-relaxed">
                    By typing my full name I confirm I have read the compliance warning(s) above and understand this
                    wording has been flagged as a potential breach of Australian law (including the Australian Consumer
                    Law, the National Consumer Credit Protection Act, and the Queensland Property Occupations Act 2014).
                    I choose to include it on my own authority, accept responsibility for its use in the client&apos;s
                    report, and authorise NextKey Property Strategists to proceed. This override is recorded with my
                    name and the date and time.
                  </p>
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Type your full name to authorise"
                    className="mt-2 w-full rounded-lg border border-red-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                  />
                  <div className="mt-2 flex items-center gap-3">
                    <button
                      onClick={applyChanges}
                      disabled={changesBusy || !fullName.trim()}
                      className="px-4 py-2 text-sm font-semibold text-white rounded-lg transition disabled:opacity-40"
                      style={{ background: "#B91C1C" }}
                    >
                      {changesBusy ? "Applying…" : "Confirm override & apply"}
                    </button>
                    <button onClick={() => setOverrideMode(false)} disabled={changesBusy} className="text-sm text-gray-500 hover:text-gray-800">Back</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 flex-wrap">
                  {compliance!.suggestion && (
                    <button onClick={useSuggestion} className="px-4 py-2 text-sm font-semibold text-white rounded-lg" style={{ background: "#0F4C5C" }}>
                      Use suggested wording
                    </button>
                  )}
                  <button onClick={() => setOverrideMode(true)} className="px-4 py-2 text-sm font-semibold rounded-lg border border-red-300 text-red-700 hover:bg-red-50">
                    Override &amp; continue
                  </button>
                  <button onClick={resetChanges} className="text-sm text-gray-500 hover:text-gray-800">Cancel</button>
                </div>
              )
            ) : (
              <div className="flex items-center gap-3">
                <button
                  onClick={applyChanges}
                  disabled={changesBusy}
                  className="px-4 py-2 text-sm font-semibold text-white rounded-lg transition disabled:opacity-40"
                  style={{ background: "#0F4C5C" }}
                >
                  {changesBusy ? "Applying…" : "Apply & regenerate"}
                </button>
                <button onClick={resetChanges} disabled={changesBusy} className="text-sm text-gray-500 hover:text-gray-800">Cancel</button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
