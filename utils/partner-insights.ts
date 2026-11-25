/**
 * The partner dashboard's numbers and insights. Pure: the dashboard page, the
 * insights API and the tests all call the same functions.
 *
 * Inputs are already masked (PartnerLot) and the firm's own clients and deals.
 * Insights name suburbs and states only, and count clients without naming them,
 * so the same objects can go to Claude for rewording without leaking anything.
 *
 * The deterministic insights are the product, not a stopgap: Claude only
 * rephrases and ranks them (utils/partner-ai.ts), and when it fails, these are
 * what the partner sees.
 */
import type { PartnerLot } from "./partner";

export type InsightClient = { state: string | null; budgetMax: number | null; status: string };
export type InsightDeal = { stage: string };

export type DashboardStats = {
  available: number;
  newThisWeek: number;
  suburbs: number;
  states: number;
  clients: number;
  activeHolds: number;
};

export type InsightIcon = "sparkle" | "users" | "pin" | "chart" | "handshake" | "home";

export type Insight = {
  id: string;
  icon: InsightIcon;
  title: string;
  detail: string;
  /** Link into the portal, e.g. a filtered stock search. */
  href?: string;
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const HOLD_STAGES = new Set(["requested", "hold", "eoi", "contract_issued", "unconditional"]);

export function isNewThisWeek(lot: Pick<PartnerLot, "listedAt">, now: Date): boolean {
  if (!lot.listedAt) return false;
  const t = Date.parse(lot.listedAt);
  return Number.isFinite(t) && now.getTime() - t <= WEEK_MS && t <= now.getTime() + 60_000;
}

/** $650k / $1.2m. Rounds to keep it readable. */
export function compactAud(n: number): string {
  if (n >= 1_000_000) {
    const m = Math.round(n / 100_000) / 10;
    return `$${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}m`;
  }
  return `$${Math.round(n / 1000)}k`;
}

function place(l: Pick<PartnerLot, "suburb" | "state">): string {
  return [l.suburb, l.state].filter(Boolean).join(" ");
}

function countBy<T>(items: T[], key: (t: T) => string | null): Map<string, number> {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = key(it);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

function top(m: Map<string, number>): [string, number] | null {
  let best: [string, number] | null = null;
  for (const [k, v] of m) if (!best || v > best[1] || (v === best[1] && k < best[0])) best = [k, v];
  return best;
}

export function dashboardStats(
  lots: PartnerLot[],
  clients: InsightClient[],
  deals: InsightDeal[],
  now: Date,
): DashboardStats {
  const listable = lots.filter((l) => l.availability !== "unavailable");
  const available = listable.filter((l) => l.availability === "available");
  return {
    available: available.length,
    newThisWeek: listable.filter((l) => isNewThisWeek(l, now)).length,
    suburbs: new Set(listable.map((l) => place(l)).filter(Boolean)).size,
    states: new Set(listable.map((l) => l.state).filter(Boolean)).size,
    clients: clients.filter((c) => c.status !== "archived").length,
    activeHolds: deals.filter((d) => HOLD_STAGES.has(d.stage)).length,
  };
}

/** Lots a client could buy: available, in their state if they gave one, within budget. */
export function lotsForClient(client: InsightClient, lots: PartnerLot[]): PartnerLot[] {
  if (!client.budgetMax) return [];
  return lots.filter(
    (l) =>
      l.availability === "available" &&
      l.price !== null &&
      l.price <= client.budgetMax! &&
      (!client.state || l.state?.toUpperCase() === client.state.toUpperCase()),
  );
}

function stockHref(params: Record<string, string | number | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") q.set(k, String(v));
  const s = q.toString();
  return `/partner/stock${s ? `?${s}` : ""}`;
}

/**
 * Up to five insights, most useful first. Every number is computed here; none
 * is estimated.
 */
export function buildInsights(
  lots: PartnerLot[],
  clients: InsightClient[],
  deals: InsightDeal[],
  now: Date,
): Insight[] {
  const out: Insight[] = [];
  const available = lots.filter((l) => l.availability === "available");

  // 1. Fresh stock: the biggest new-this-week cluster by state and bedrooms.
  const fresh = available.filter((l) => isNewThisWeek(l, now) && l.price !== null && l.state);
  if (fresh.length) {
    const byState = top(countBy(fresh, (l) => l.state));
    if (byState) {
      const inState = fresh.filter((l) => l.state === byState[0]);
      const bed = top(countBy(inState, (l) => (l.bedrooms ? String(l.bedrooms) : null)));
      const pool = bed ? inState.filter((l) => String(l.bedrooms) === bed[0]) : inState;
      const prices = pool.map((l) => l.price as number).sort((a, b) => a - b);
      const ceiling = Math.ceil(prices[Math.floor((prices.length - 1) * 0.75)] / 50_000) * 50_000;
      const n = pool.filter((l) => (l.price as number) <= ceiling).length;
      const beds = bed ? `${bed[0]}-bed ` : "";
      out.push({
        id: "fresh",
        icon: "sparkle",
        title: `${n} new ${beds}${n === 1 ? "lot" : "lots"} under ${compactAud(ceiling)} in ${byState[0]} this week`,
        detail: `Added to the stock book in the last 7 days. ${fresh.length} new available ${fresh.length === 1 ? "lot" : "lots"} in total.`,
        href: stockHref({ state: byState[0], minBeds: bed?.[0], maxPrice: ceiling, available: 1 }),
      });
    }
  }

  // 2. Client matches.
  const active = clients.filter((c) => c.status !== "archived");
  const matched = active.map((c) => lotsForClient(c, available)).filter((m) => m.length > 0);
  if (matched.length) {
    const suburb = top(countBy(matched.flat(), (l) => l.suburb));
    const total = new Set(matched.flat().map((l) => l.id)).size;
    out.push({
      id: "matches",
      icon: "users",
      title: `${matched.length} of your clients ${matched.length === 1 ? "matches" : "match"} lots${suburb ? ` in ${suburb[0]}` : ""}`,
      detail: `${total} available ${total === 1 ? "lot fits" : "lots fit"} their state and budget right now.`,
      href: "/partner/clients",
    });
  } else if (active.length === 0) {
    out.push({
      id: "matches",
      icon: "users",
      title: "Add a client and we'll match them to stock",
      detail: "Give a buyer's state and budget and every new lot that fits shows up here.",
      href: "/partner/clients/new",
    });
  }

  // 3. Deepest choice: the suburb with the most available lots.
  const deepest = top(countBy(available, (l) => (l.suburb ? `${l.suburb}|${l.state ?? ""}` : null)));
  if (deepest && deepest[1] > 1) {
    const [suburb, state] = deepest[0].split("|");
    out.push({
      id: "deepest",
      icon: "pin",
      title: `${[suburb, state].filter(Boolean).join(" ")} has ${deepest[1]} available lots`,
      detail: "The widest choice of any suburb in the stock book today.",
      href: stockHref({ q: suburb, state: state || undefined, available: 1 }),
    });
  }

  // 4. Entry point: the lowest-priced available house-and-land style lot (3+ bed).
  const family = available.filter((l) => l.price !== null && (l.bedrooms ?? 0) >= 3 && l.suburb);
  if (family.length) {
    const cheapest = family.reduce((a, b) => ((a.price as number) <= (b.price as number) ? a : b));
    out.push({
      id: "entry",
      icon: "home",
      title: `3+ bed homes from ${compactAud(cheapest.price as number)} in ${place(cheapest)}`,
      detail: "The lowest price for a family-sized home in the book today.",
      href: stockHref({ sort: "price_asc", minBeds: 3, available: 1 }),
    });
  }

  // 5. Holds in progress.
  const holds = deals.filter((d) => HOLD_STAGES.has(d.stage)).length;
  if (holds) {
    out.push({
      id: "holds",
      icon: "handshake",
      title: `${holds} ${holds === 1 ? "deal" : "deals"} in progress`,
      detail: "Track each hold, EOI and contract on your deals board.",
      href: "/partner/deals",
    });
  }

  return out.slice(0, 5);
}

/**
 * Newest available lots for the dashboard's "fresh stock" strip, one per
 * suburb first so a single big stocklist doesn't fill the strip with one place.
 */
export function freshLots(lots: PartnerLot[], n: number): PartnerLot[] {
  const sorted = lots
    .filter((l) => l.availability === "available")
    .sort((a, b) => (b.listedAt ?? b.updatedAt ?? "").localeCompare(a.listedAt ?? a.updatedAt ?? ""));
  const seen = new Set<string>();
  const first: PartnerLot[] = [];
  const rest: PartnerLot[] = [];
  for (const l of sorted) {
    const k = `${l.suburb}|${l.state}`;
    (seen.has(k) ? rest : first).push(l);
    seen.add(k);
  }
  return [...first, ...rest].slice(0, n);
}
