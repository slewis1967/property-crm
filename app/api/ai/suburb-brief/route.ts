import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { aiCall } from "../../../../utils/ai";
import { getCachedOrGenerate } from "../../../../utils/ai-cache";
import { nexusApi } from "../../../../utils/nexus-api";

import { requireAuth } from "../../../../utils/cf-access";
export const dynamic = "force-dynamic";

const SYSTEM = `You write a concise market briefing for a property advisor about a single suburb. Sean uses these to sound knowledgeable on calls and tailor pitches per area.

Format STRICTLY (use ** for bold labels, • for bullets, plain prose otherwise):

**Snapshot:** <one-paragraph (3-4 sentences) market read — price level, recent growth direction, population, demographic flavour. Anchor in the data shown.>

**What we have here:** <one paragraph (2-3 sentences) — how Sean's current stock fits this market: number of listings, price-positioning vs median, who they suit (investor / FHB / SDA / etc.). If no listings, say so.>

**Talking points:** <3-4 short bullets — specific, advisor-useful angles for conversations. Mention infrastructure projects by name if known, growth drivers, lifestyle pull, NDIS suitability where relevant.>

**Watch for:** <0-2 bullets if there's a real risk worth flagging (overpriced segment, infrastructure delays, oversupply). Skip if none.>

Total under 200 words. Plain text. No preamble, no closer.`;

export async function POST(req: Request) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const { suburb, state } = await req.json();
    if (!suburb || !state) {
      return NextResponse.json(
        { ok: false, error: "suburb and state required" },
        { status: 400 },
      );
    }

    // Pull suburb data from NEXUS API
    let suburbData: any = null;
    try {
      const res = await nexusApi("/api/suburbs", { cache: "no-store" });
      if (res.ok) {
        const json = await res.json();
        const list = json.suburbs || [];
        suburbData =
          list.find(
            (s: any) =>
              String(s.suburb || "").toLowerCase() === String(suburb).toLowerCase() &&
              String(s.state || "").toUpperCase() === String(state).toUpperCase(),
          ) || null;
      }
    } catch {}

    // Pull stock currently in this suburb
    const { data: stock } = await supabase
      .from("global_stock_pool")
      .select(
        "id,builder_name,street_address,suburb,state,total_package_price,house_price,bedrooms,bathrooms,land_size,house_size,property_type,sda_category,status",
      )
      .ilike("suburb", suburb)
      .ilike("state", state)
      .limit(20);

    // Pull leads/contacts who prefer this state — useful colour for the brief
    const { data: interestedContacts, count: interestedCount } = await supabase
      .from("contacts")
      .select("buyer_type", { count: "exact", head: false })
      .ilike("preferred_state", state)
      .limit(0);

    const stockCount = stock?.length ?? 0;
    const stockPrices = (stock ?? [])
      .map((p: any) => Number(p.total_package_price ?? p.house_price ?? 0))
      .filter((n: number) => n > 0);
    const stockMedian =
      stockPrices.length > 0
        ? Math.round(
            stockPrices.slice().sort((a, b) => a - b)[Math.floor(stockPrices.length / 2)],
          )
        : null;

    let infraList: string[] = [];
    if (suburbData?.key_infrastructure) {
      try {
        const parsed = JSON.parse(suburbData.key_infrastructure);
        if (Array.isArray(parsed)) infraList = parsed.slice(0, 8);
      } catch {}
    }

    const userPrompt = [
      `SUBURB: ${suburb}, ${state}`,
      "",
      "MARKET DATA:",
      suburbData
        ? [
            `median price: ${suburbData.median_price ? "$" + Number(suburbData.median_price).toLocaleString() : "?"}`,
            `price growth: ${suburbData.price_growth_pct != null ? suburbData.price_growth_pct + "%" : "?"}`,
            `population: ${suburbData.population ? Number(suburbData.population).toLocaleString() : "?"}`,
            `last updated: ${suburbData.last_updated || "?"}`,
            suburbData.demographics ? `demographics: ${truncate(suburbData.demographics, 400)}` : "",
            suburbData.summary ? `summary: ${truncate(suburbData.summary, 400)}` : "",
          ]
            .filter(Boolean)
            .join("\n")
        : "(no NEXUS suburb data available)",
      "",
      infraList.length > 0
        ? "KEY INFRASTRUCTURE:\n" + infraList.map((i) => "- " + i).join("\n")
        : "",
      "",
      "OUR CURRENT STOCK IN THIS SUBURB:",
      `count: ${stockCount}`,
      stockMedian ? `median listing: $${stockMedian.toLocaleString()}` : "",
      ...((stock ?? []).slice(0, 8).map((p: any) => {
        const price = Number(p.total_package_price ?? p.house_price ?? 0);
        return `- ${p.street_address || "?"} · $${price.toLocaleString()} · ${p.bedrooms ?? "?"}br · ${p.builder_name || "?"} · ${p.property_type || "?"}${p.sda_category ? ` (${p.sda_category})` : ""} · ${p.status || "?"}`;
      })),
      "",
      `INTERESTED CONTACTS in ${state}: ${interestedCount ?? 0}`,
    ]
      .filter(Boolean)
      .join("\n");

    const fingerprintInput = {
      v: 1,
      suburb,
      state,
      market_updated: suburbData?.last_updated ?? null,
      stock_count: stockCount,
      stock_median: stockMedian,
      week_bucket: weekBucket(),
    };

    try {
      const result = await getCachedOrGenerate({
        kind: "suburb-brief",
        refId: `${state}:${suburb}`.toLowerCase(),
        fingerprintInput,
        maxAgeMs: 7 * 24 * 60 * 60 * 1000, // 7 days
        generate: () =>
          aiCall({
            system: SYSTEM,
            user: userPrompt,
            maxTokens: 2500,
            effort: "medium",
          }),
      });
      return NextResponse.json({ ok: true, text: result.text, cached: result.cached });
    } catch (e: any) {
      return NextResponse.json(
        { ok: false, error: e?.message ?? "AI request failed" },
        { status: 500 },
      );
    }
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Failed to build suburb brief" },
      { status: 500 },
    );
  }
}

function truncate(s: string | null | undefined, n: number) {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}
function weekBucket(): string {
  const d = new Date();
  // ISO week-stamp — caches refresh weekly
  const onejan = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - onejan.getTime()) / 86400000 + onejan.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${week}`;
}
