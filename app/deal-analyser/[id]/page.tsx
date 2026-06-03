import { supabase } from "../../../utils/supabase";
import { nexusApi } from "@/utils/nexus-api";
import { notFound } from "next/navigation";
import DealPacketClient from "./DealPacketClient";
import PacketLinkPanel from "./PacketLinkPanel";
import { resolvePiaInputs } from "../../../utils/deal-packet-to-pia";
import type { DealPacket } from "../../../utils/deal-packet";

export const dynamic = "force-dynamic";

/**
 * Deal-packet hub (operator-facing, internal). Shows the extracted properties and,
 * when a (co-living) property has no usable rent, prompts the operator to supply
 * the per-room / weekly figure — then generates the PIA reports + comparison.
 *
 * This is the bridge between the NEXUS-extracted packet (deal_packets row) and the
 * client-facing reports. Auto-generate, manual-deliver: the operator confirms the
 * inputs and triggers generation; a human still sends reports to a client.
 */

export default async function DealPacketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: dp } = await supabase
    .from("deal_packets")
    .select("id, status, opportunity_id, property_count, packet, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!dp) return notFound();

  const packet = dp.packet as DealPacket;

  // Opportunities (NEXUS leads) for the picker + AI auto-match. Non-fatal if NEXUS
  // is unreachable — the panel just falls back to a manual id with no options.
  let opportunities: { id: string; label: string; email: string | null }[] = [];
  try {
    const res = await nexusApi("/api/leads", { cache: "no-store" });
    if (res.ok) {
      const leads = ((await res.json()).leads ?? []) as any[];
      opportunities = leads.map((l) => ({
        id: l.lead_id,
        label: l.full_name || l.email || l.lead_id,
        email: l.email ?? null,
      }));
    }
  } catch { /* picker shows empty; not fatal */ }

  const properties = (packet.properties ?? []).map((p, i) => ({
    index: i,
    suburb: p.suburb,
    address: p.address,
    is_co_living: p.specs?.is_co_living ?? false,
    per_room: p.rent_basis.per_room,
    rooms: p.rent_basis.rooms ?? p.specs?.bedrooms ?? null,
    weekly_rent: p.rent_basis.weekly_rent,
    room_rent: p.rent_basis.room_rent ?? null,
    source: p.rent_basis.source,
    price: p.specs?.total_price ?? null,
    bedrooms: p.specs?.bedrooms ?? null,
    bathrooms: p.specs?.bathrooms ?? null,
    land: p.specs?.land_size_m2 ?? null,
    contract_type: p.contract_type ?? "single",
    property_type: p.property_type ?? (p.specs?.is_co_living ? "Co-living" : "House & Land"),
    land_price: p.specs?.land_price ?? null,
    state: p.specs?.state ?? null,
    pia: resolvePiaInputs(p),
    sources: p.pia_sources ?? [],
  }));

  // Current reports for this packet (so the hub always links to the live set,
  // and re-renders to the new set after a regenerate via router.refresh()).
  const { data: repRows } = await supabase
    .from("pia_reports")
    .select("id, results")
    .eq("results->>deal_packet_id", dp.id)
    .order("generated_at", { ascending: false });
  const existingReports = (repRows ?? []).map((r) => {
    const res = (r.results ?? {}) as any;
    return {
      id: r.id as string,
      kind: (res.kind as string) ?? "deal_analyser_pia",
      label: res.kind === "comparison" ? "Comparison (rating + best pick)" : `PIA — ${res.suburb ?? res.address ?? "Property"}`,
    };
  });

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold text-gray-900">Deal packet</h1>
          <StatusBadge status={dp.status} />
        </div>
        <p className="text-sm text-gray-500 mb-6">
          {properties.length} {properties.length === 1 ? "property" : "properties"} · extracted{" "}
          {new Date(dp.created_at).toLocaleDateString("en-AU")}
        </p>
        <div className="mb-4">
          <PacketLinkPanel
            packetId={dp.id}
            initialOpportunityId={dp.opportunity_id ?? null}
            clientHint={packet.client_hint ?? null}
            initialNotes={packet.operator_notes ?? null}
            opportunities={opportunities}
          />
        </div>
        <DealPacketClient packetId={dp.id} status={dp.status} properties={properties} existingReports={existingReports} />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    needs_rent_input: { label: "Needs rent", cls: "bg-amber-100 text-amber-800" },
    ready: { label: "Ready", cls: "bg-blue-100 text-blue-800" },
    reports_generated: { label: "Reports generated", cls: "bg-green-100 text-green-800" },
    extracting: { label: "Extracting", cls: "bg-gray-100 text-gray-600" },
    failed: { label: "Failed", cls: "bg-red-100 text-red-700" },
  };
  const s = map[status] ?? { label: status, cls: "bg-gray-100 text-gray-600" };
  return <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${s.cls}`}>{s.label}</span>;
}
