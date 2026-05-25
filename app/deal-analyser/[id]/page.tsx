import { supabase } from "../../../utils/supabase";
import { notFound } from "next/navigation";
import DealPacketClient from "./DealPacketClient";
import type { DealPacket } from "../../../utils/deal-packet";

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
  }));

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
        <DealPacketClient packetId={dp.id} status={dp.status} properties={properties} />
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
