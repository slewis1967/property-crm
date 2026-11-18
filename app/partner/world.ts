/**
 * Everything the dashboard, the AI Studio and their APIs read about a firm:
 * the masked stock book plus the firm's own clients and deals. Server-only.
 *
 * Stock is loaded WITHOUT fees (showFees: false). None of these surfaces shows
 * a referral fee, and what isn't loaded can't drift into an AI prompt.
 */
import type { PartnerIdentity } from "../../utils/partner-auth";
import type { PartnerLot } from "../../utils/partner";
import { loadPartnerStock } from "../../utils/partner-stock";
import { listOwnClients, listOwnDeals } from "../api/partner/_shared";
import { has } from "./session";
import type { WeekClient } from "../../utils/partner-week";

export type PartnerWorld = {
  lots: PartnerLot[];
  clients: WeekClient[];
  deals: { stage: string }[];
};

export async function loadPartnerWorld(identity: PartnerIdentity): Promise<PartnerWorld> {
  const [lots, clientRows, dealRows] = await Promise.all([
    has(identity, "stock") ? loadPartnerStock({ showFees: false }) : Promise.resolve([] as PartnerLot[]),
    has(identity, "clients") ? listOwnClients(identity) : Promise.resolve([]),
    has(identity, "deals") ? listOwnDeals(identity) : Promise.resolve([]),
  ]);
  return {
    lots,
    clients: clientRows.map((c) => ({
      id: c.id,
      firstName: c.first_name,
      state: c.state,
      budgetMax: c.budget_max === null ? null : Number(c.budget_max),
      status: c.status,
      updatedAt: c.updated_at,
    })),
    deals: dealRows.map((d) => ({ stage: d.stage })),
  };
}

/** First name for greetings and the sign-off on drafted messages. */
export function firstNameOf(identity: PartnerIdentity): string {
  return (identity.fullName ?? "").trim().split(/\s+/)[0] || "there";
}
