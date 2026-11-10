/**
 * Brokers — the configurable list of lenders/brokers a completed Fact Find can
 * be submitted to (the analog of the hardcoded YLA channel, but many + editable).
 * Managed in Settings, selected from a dropdown on the Fact Find.
 *
 * Stored as a single app_settings row (key='brokers', value={brokers:[...]}),
 * same pattern as property_types — a small config list, not a domain table.
 */
import { supabase } from "./supabase";

export type Broker = {
  id: string;
  name: string;
  email: string;
  company: string | null;
  /** A reference/comp code that goes on the submission (like YLA's COMP-8317). */
  reference: string | null;
  notes: string | null;
  active: boolean;
};

const SETTINGS_KEY = "brokers";

/** Coerce + validate an incoming list: name + valid email required; stable ids. */
export function sanitizeBrokers(incoming: unknown, genId: () => string): Broker[] {
  if (!Array.isArray(incoming)) return [];
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const seen = new Set<string>();
  const out: Broker[] = [];
  for (const raw of incoming) {
    const b = (raw ?? {}) as Record<string, unknown>;
    const name = String(b.name ?? "").trim();
    const email = String(b.email ?? "").trim();
    if (!name || !emailRe.test(email)) continue;
    const key = email.toLowerCase();
    if (seen.has(key)) continue; // dedupe by email
    seen.add(key);
    const id = typeof b.id === "string" && b.id.trim() ? b.id.trim() : genId();
    out.push({
      id,
      name,
      email,
      company: str(b.company),
      reference: str(b.reference),
      notes: str(b.notes),
      active: b.active !== false,
    });
  }
  return out;
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export async function loadBrokers(): Promise<Broker[]> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", SETTINGS_KEY).maybeSingle();
  const list = (data?.value as { brokers?: unknown } | null | undefined)?.brokers;
  return Array.isArray(list) ? (list as Broker[]) : [];
}

export async function saveBrokers(brokers: Broker[], updatedBy: string | null): Promise<void> {
  const { error } = await supabase.from("app_settings").upsert(
    { key: SETTINGS_KEY, value: { brokers }, updated_at: new Date().toISOString(), updated_by: updatedBy },
    { onConflict: "key" },
  );
  if (error) throw new Error(error.message);
}

export async function getBroker(id: string): Promise<Broker | null> {
  return (await loadBrokers()).find((b) => b.id === id) ?? null;
}
