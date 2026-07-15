import { NextResponse } from "next/server";
import { supabase } from "@/utils/supabase";

export const dynamic = "force-dynamic";

/**
 * GET /api/opportunities/no-response
 *
 * Read-only. Finds contacts who've had 3+ outbound SMS attempts (sms_log)
 * with no inbound email reply (email_log, direction='inbound') since the
 * last attempt — the "no response" cohort described in feedback item
 * "NO RESPONSE". Cross-referenced against opportunities client-side via
 * each lead's `primary_contact_id` (KanbanBoard.tsx), since NEXUS leads
 * aren't in this Supabase project.
 *
 * Known gap: there's no inbound-SMS reply tracking in this codebase today
 * (sms_opt_outs only records STOP replies, not ordinary replies), so a
 * contact who replied by text rather than email will still show here.
 * Flagged in the feedback plan as something to confirm with Sean before
 * this cohort is used for anything more than a manual review tab.
 */

const PAGE = 1000;
const MIN_ATTEMPTS = 3;

type SmsRow = { contact_id: string; sent_at: string };
type EmailRow = { contact_id: string; created_at: string };

async function fetchAllSms(): Promise<SmsRow[]> {
  const out: SmsRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("sms_log")
      .select("contact_id,sent_at")
      .not("contact_id", "is", null)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`sms_log page ${from}: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...(data as SmsRow[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

async function fetchInboundEmails(contactIds: string[]): Promise<EmailRow[]> {
  if (contactIds.length === 0) return [];
  const out: EmailRow[] = [];
  const CHUNK = 200; // keep the `.in()` filter list reasonable
  for (let i = 0; i < contactIds.length; i += CHUNK) {
    const slice = contactIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("email_log")
      .select("contact_id,created_at")
      .eq("direction", "inbound")
      .in("contact_id", slice);
    if (error) throw new Error(`email_log chunk ${i}: ${error.message}`);
    out.push(...((data as EmailRow[]) || []));
  }
  return out;
}

export async function GET() {
  try {
    const smsRows = await fetchAllSms();

    const attempts = new Map<string, number>();
    const lastSms = new Map<string, string>();
    for (const row of smsRows) {
      attempts.set(row.contact_id, (attempts.get(row.contact_id) || 0) + 1);
      const prev = lastSms.get(row.contact_id);
      if (!prev || row.sent_at > prev) lastSms.set(row.contact_id, row.sent_at);
    }

    const candidateIds = Array.from(attempts.entries())
      .filter(([, count]) => count >= MIN_ATTEMPTS)
      .map(([contactId]) => contactId);

    const inboundEmails = await fetchInboundEmails(candidateIds);
    const lastReply = new Map<string, string>();
    for (const row of inboundEmails) {
      const prev = lastReply.get(row.contact_id);
      if (!prev || row.created_at > prev) lastReply.set(row.contact_id, row.created_at);
    }

    const contacts = candidateIds
      .filter((contactId) => {
        const reply = lastReply.get(contactId);
        const last = lastSms.get(contactId)!;
        return !reply || reply < last;
      })
      .map((contactId) => ({
        contact_id: contactId,
        attempts: attempts.get(contactId)!,
        last_sms_at: lastSms.get(contactId)!,
      }));

    return NextResponse.json({ contacts });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
