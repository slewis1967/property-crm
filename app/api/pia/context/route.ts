/**
 * GET /api/pia/context?opportunity_id=X&contact_id=Y&property_id=Z
 *   Returns the linked records used to autofill the PIA form. Any of the
 *   three IDs is optional. Falls through gracefully when a record isn't found.
 *
 * Response shape:
 *   {
 *     ok: true,
 *     opportunity?: { id, name, monetary_value, contact_id },
 *     contact?:     { id, name, email },
 *     property?:    { id, label, total_package_price, expected_rent_weekly, state, suburb, ... }
 *   }
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { nexusApi } from "../../../../utils/nexus-api";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const opportunityId = url.searchParams.get("opportunity_id");
  let contactId = url.searchParams.get("contact_id");
  const propertyId = url.searchParams.get("property_id");

  const out: Record<string, unknown> = { ok: true };

  if (opportunityId) {
    // Try NEXUS lead first (the /opportunities/[id] page is keyed off this).
    // Fall back to the GHL archive opportunities table on miss.
    let resolved = false;
    try {
      const r = await nexusApi(`/api/leads/${encodeURIComponent(opportunityId)}`);
      if (r.ok) {
        const lead = await r.json();
        if (lead && !lead.error) {
          out.opportunity = {
            id: lead.id ?? opportunityId,
            name: lead.full_name || lead.name || lead.email || "(unnamed lead)",
            monetary_value: Number(lead.deal_value ?? lead.monetary_value ?? 0) || null,
            status: lead.status ?? null,
            contact_id: lead.contact_id ?? null,
            email: lead.email ?? null,
          };
          if (!contactId && lead.contact_id) contactId = lead.contact_id;
          resolved = true;
        }
      }
    } catch {
      // NEXUS unreachable — fall through to archive lookup
    }
    if (!resolved) {
      const { data: opp } = await supabase
        .from("ghl_archive_opportunities")
        .select("id,name,monetary_value,contact_id,status")
        .eq("id", opportunityId)
        .maybeSingle();
      if (opp) {
        out.opportunity = opp;
        if (!contactId && opp.contact_id) contactId = opp.contact_id;
      }
    }
  }

  if (contactId) {
    // Try live contacts first, fall back to GHL archive
    const { data: liveContact } = await supabase
      .from("contacts")
      .select("id,name,email,phone,buyer_type,preferred_state")
      .eq("id", contactId)
      .maybeSingle();
    if (liveContact) {
      out.contact = liveContact;
    } else {
      const { data: archiveContact } = await supabase
        .from("ghl_archive_contacts")
        .select("id,contact_name,first_name,last_name,email,phone")
        .eq("id", contactId)
        .maybeSingle();
      if (archiveContact) {
        out.contact = {
          id: archiveContact.id,
          name:
            archiveContact.contact_name ||
            `${archiveContact.first_name ?? ""} ${archiveContact.last_name ?? ""}`.trim() ||
            "(unnamed)",
          email: archiveContact.email,
          phone: archiveContact.phone,
        };
      }
    }
  }

  if (propertyId) {
    const { data: prop } = await supabase
      .from("global_stock_pool")
      .select(
        "id,builder_name,estate_name,lot_number,street_address,suburb,state,total_package_price,land_price,build_price,house_price,expected_rent_weekly,bedrooms,bathrooms,car_spaces,land_size_sqm",
      )
      .eq("id", propertyId)
      .maybeSingle();
    if (prop) {
      const label = [
        prop.street_address,
        prop.estate_name,
        prop.lot_number ? `Lot ${prop.lot_number}` : null,
        prop.suburb,
        prop.state,
      ]
        .filter(Boolean)
        .join(" · ");
      out.property = { ...prop, label };
    }
  }

  return NextResponse.json(out);
}
