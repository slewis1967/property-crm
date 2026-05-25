import { supabase } from "../../utils/supabase";
import type { DealPacket } from "../../utils/deal-packet";

/**
 * Deal Analyser index — every extracted deal packet, newest first, linking to its
 * hub (/deal-analyser/[id]) where the operator supplies rent + generates reports.
 *
 * This is the discoverable entry point for the feature (the sidebar "Deal Analyser"
 * link lands here). Packets arrive from NEXUS extraction of inbound builder emails.
 */
export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; cls: string; hint: string }> = {
  needs_rent_input: { label: "Needs rent", cls: "bg-amber-100 text-amber-800", hint: "Supply a rent to generate reports" },
  ready: { label: "Ready", cls: "bg-blue-100 text-blue-800", hint: "Rent in — ready to generate" },
  reports_generated: { label: "Reports generated", cls: "bg-green-100 text-green-800", hint: "Reports ready to deliver" },
  extracting: { label: "Extracting", cls: "bg-gray-100 text-gray-600", hint: "NEXUS is still reading the email" },
  failed: { label: "Failed", cls: "bg-red-100 text-red-700", hint: "Extraction could not complete" },
};

export default async function DealAnalyserIndex() {
  const { data: rows } = await supabase
    .from("deal_packets")
    .select("id, status, property_count, packet, opportunity_id, created_at")
    .order("created_at", { ascending: false });

  const packets = (rows ?? []).map((r) => {
    const packet = r.packet as DealPacket;
    const suburbs = (packet?.properties ?? [])
      .map((p) => p.suburb)
      .filter(Boolean) as string[];
    return {
      id: r.id as string,
      status: r.status as string,
      count: (r.property_count as number) ?? suburbs.length,
      title: suburbs.length ? suburbs.join(", ") : "Deal packet",
      created_at: r.created_at as string,
    };
  });

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900">Deal Analyser</h1>
        <p className="text-sm text-gray-500 mt-1 mb-6">
          Builder property packages, extracted and verified. Open one to supply any missing rent
          and generate the client PIA reports + comparison.
        </p>

        {packets.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <p className="text-gray-900 font-medium">No deal packets yet</p>
            <p className="text-sm text-gray-500 mt-1">
              Forward a builder property-package email — extraction will land it here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {packets.map((p) => {
              const s = STATUS[p.status] ?? { label: p.status, cls: "bg-gray-100 text-gray-600", hint: "" };
              return (
                <a
                  key={p.id}
                  href={`/deal-analyser/${p.id}`}
                  className="block bg-white rounded-xl border border-gray-200 p-5 hover:border-[#0F4C5C] transition"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="font-bold text-gray-900 truncate">{p.title}</h2>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {p.count} {p.count === 1 ? "property" : "properties"} · extracted{" "}
                        {new Date(p.created_at).toLocaleDateString("en-AU")}
                        {s.hint ? ` · ${s.hint}` : ""}
                      </p>
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ${s.cls}`}>
                      {s.label}
                    </span>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
