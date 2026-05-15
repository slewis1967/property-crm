/**
 * Tailored property pitch generator.
 *
 * Takes a contact + a property and generates a pitch framed for THAT contact's
 * buyer profile (FHB story vs investor yield story vs SDA participant story
 * vs SMSF strategy etc.). Output is ready to drop into an email/SMS.
 *
 * Request:  { contactId, propertyId, channel?: "email" | "sms" }
 * Response: { ok: true, text: string }
 *
 * Not cached — pitches are user-triggered and the advisor expects fresh draft
 * on each click (same as Smart Reply).
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { aiCall } from "../../../../utils/ai";
import { stripHtml } from "../../../../utils/archive-helpers";

import { requireAuth } from "../../../../utils/cf-access";
export const dynamic = "force-dynamic";

const SYSTEM = `You're drafting a property pitch on Sean's behalf. Sean is a property advisor at NextKey Property Strategists. Match the framing to the contact's buyer profile — don't write generic copy.

Channel rules:
- "email" → 3-5 short paragraphs, AU-English greeting + sign-off ("Hi [first name]," … "Cheers, Sean"). No corporate fluff.
- "sms" → 2-3 sentences, no greeting/sign-off, mobile-natural. End with a clear next step ("happy to send the brochure?", "free for a 15-min call?").

Framing by buyer type — choose ONE that fits and lean into it:
- **First Home Buyer** → entry price, FHB rebates if relevant, build timeline, fixed-cost certainty, location liveability, schools/transport.
- **Investor** → yield, rental demand, builder track record, depreciation potential (without quoting specific savings), capital growth drivers in the suburb.
- **SMSF Buyer** → suitability for SMSF rules (separate trust, single asset, build-vs-buy considerations), positive cashflow if applicable.
- **Downsizer** → low-maintenance, single-level if relevant, lifestyle proximity, downsizer concessions.
- **NDIS / SDA** → SDA category, design features (improved liveability / robust / fully accessible / HPS), participant suitability, NDIA-funded model — but do NOT claim a participant "is approved" or "will be funded" (NDIA decides).
- **Home Buyer / general** → location, specs, value, lifestyle.

Voice rules:
- Friendly + direct. Sean writes like a knowledgeable mate, not a salesperson.
- Reference SPECIFIC facts about the property (suburb, price, beds/baths, builder) — never generic-sounding.
- If the contact's budget is below the property price, acknowledge it ("I know this is at the top end of your range, but…").
- If the contact's preferred state doesn't match the property's state, address it explicitly.
- Never invent facts. If a field isn't in the input, don't reference it.
- COMPLIANCE: never promise a guaranteed return / yield / growth. Never quote specific tax savings. Never claim regulator approval (council, NDIA, lender) is certain.

Output: just the pitch body, ready to send. No preamble, no "Here's a draft:", no explanation, no markdown headers.`;

export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await req.json();
    const contactId: string | undefined = body.contactId;
    const propertyId: string | undefined = body.propertyId;
    const channel: "email" | "sms" =
      body.channel === "sms" ? "sms" : "email";

    if (!contactId || !propertyId) {
      return NextResponse.json(
        { ok: false, error: "contactId and propertyId required" },
        { status: 400 },
      );
    }

    // Fetch contact (live first, archive fallback)
    let contact: any;
    const { data: liveContact } = await supabase
      .from("contacts")
      .select("*")
      .eq("id", contactId)
      .maybeSingle();
    if (liveContact) {
      contact = liveContact;
    } else {
      const { data: archive } = await supabase
        .from("ghl_archive_contacts")
        .select("*")
        .eq("id", contactId)
        .maybeSingle();
      if (!archive) {
        return NextResponse.json({ ok: false, error: "Contact not found" }, { status: 404 });
      }
      contact = {
        ...archive,
        name:
          archive.contact_name ||
          `${archive.first_name || ""} ${archive.last_name || ""}`.trim() ||
          null,
        preferred_state: archive.state ?? null,
      };
    }

    // Fetch property
    const { data: property } = await supabase
      .from("global_stock_pool")
      .select("*")
      .eq("id", propertyId)
      .maybeSingle();
    if (!property) {
      return NextResponse.json({ ok: false, error: "Property not found" }, { status: 404 });
    }

    const firstName =
      contact.first_name ||
      (contact.name ? String(contact.name).split(/\s+/)[0] : null) ||
      "there";

    const propPrice =
      property.total_package_price ?? property.house_price ?? null;
    const propAddress =
      property.street_address ||
      property.estate_name ||
      property.suburb ||
      "(address withheld)";

    const lines: string[] = [];
    lines.push(`CHANNEL: ${channel}`);
    lines.push("");
    lines.push("CONTACT:");
    lines.push(`- first name: ${firstName}`);
    if (contact.buyer_type) lines.push(`- buyer type: ${contact.buyer_type}`);
    if (contact.preferred_state || contact.state)
      lines.push(`- state preference: ${contact.preferred_state || contact.state}`);
    if (contact.budget_max || contact.budget)
      lines.push(`- budget: ${contact.budget_max || contact.budget}`);
    if (contact.timeframe) lines.push(`- timeframe: ${contact.timeframe}`);
    if (contact.finance_status) lines.push(`- finance: ${contact.finance_status}`);
    if (contact.temperature) lines.push(`- temperature: ${contact.temperature}`);
    if (contact.notes)
      lines.push(`- internal notes (advisor's own — for context, don't quote): ${truncate(contact.notes, 300)}`);

    lines.push("");
    lines.push("PROPERTY:");
    lines.push(`- ${propAddress}, ${property.suburb || ""} ${property.state || ""}`);
    if (propPrice) lines.push(`- total package: $${Number(propPrice).toLocaleString()}`);
    if (property.house_price)
      lines.push(`- house price: $${Number(property.house_price).toLocaleString()}`);
    if (property.land_price)
      lines.push(`- land price: $${Number(property.land_price).toLocaleString()}`);
    if (property.bedrooms != null)
      lines.push(`- bedrooms: ${property.bedrooms} · bathrooms: ${property.bathrooms ?? "?"} · car: ${property.car_spaces ?? "?"}`);
    if (property.house_size)
      lines.push(`- house size: ${property.house_size} · land size: ${property.land_size_sqm ?? property.land_size ?? "?"}`);
    if (property.builder_name) lines.push(`- builder: ${property.builder_name}`);
    if (property.estate_name && property.estate_name !== propAddress)
      lines.push(`- estate: ${property.estate_name}`);
    if (property.property_type)
      lines.push(`- type: ${property.property_type}`);
    if (property.sda_category)
      lines.push(`- SDA category: ${property.sda_category}`);
    if (property.expected_rent_weekly)
      lines.push(`- expected rent (weekly): $${property.expected_rent_weekly}`);
    if (property.rebates) lines.push(`- rebates: ${property.rebates}`);
    if (property.status) lines.push(`- status: ${property.status}`);

    const text = await aiCall({
      system: SYSTEM,
      user: lines.join("\n"),
      maxTokens: 3000,
      effort: "high",
    });

    return NextResponse.json({ ok: true, text });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to generate pitch" },
      { status: 500 },
    );
  }
}

function truncate(s: string | null | undefined, n: number) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}
