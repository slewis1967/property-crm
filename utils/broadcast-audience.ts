import { supabase } from "./supabase";

/**
 * Shared audience helpers for /broadcast.
 *
 * Why this exists: Supabase REST caps any single query at 1000 rows by default
 * (PostgREST `max-rows`). With ~6.8k contacts in the table, a plain
 * `.select(...)` truncates silently — both the per-page audience snapshot AND
 * the per-send enrolment list would only see the first 1000.
 *
 * fetchEligibleContacts() paginates underneath and applies the same
 * "has-email && not-in-unsubscribes-for-email-or-all" filter the
 * sequence_runner.py enforces on every send. The runner re-checks
 * unsubscribes per-send too — this filter is a friendly pre-check so the
 * UI can show an accurate count and we don't bulk-enrol opted-out contacts.
 */

const PAGE = 1000;

export interface EligibleContact {
  id: string;
  email: string;
  tags: string[];
}

async function fetchOptedOutEmails(): Promise<Set<string>> {
  const optedOut = new Set<string>();
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("unsubscribes")
      .select("email")
      .in("channel", ["email", "all"])
      .not("email", "is", null)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`unsubscribes page ${from}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const u of data as { email: string | null }[]) {
      if (u.email) optedOut.add(u.email.toLowerCase());
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return optedOut;
}

/** Eligible = `contacts.email` non-empty AND not in `unsubscribes` for
 *  channel ∈ {email, all}. Optionally narrowed by tag (jsonb contains). */
export async function fetchEligibleContacts(
  tag: string | null = null,
): Promise<EligibleContact[]> {
  const optedOut = await fetchOptedOutEmails();
  const out: EligibleContact[] = [];
  let from = 0;
  while (true) {
    let q = supabase
      .from("contacts")
      .select("id,email,tags")
      .not("email", "is", null)
      .neq("email", "");
    if (tag) q = q.contains("tags", [tag]);
    q = q.range(from, from + PAGE - 1);

    const { data, error } = await q;
    if (error) throw new Error(`contacts page ${from}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const c of data as EligibleContact[]) {
      if (c.email && !optedOut.has(c.email.toLowerCase())) {
        out.push(c);
      }
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

export async function countOptedOut(): Promise<number> {
  const set = await fetchOptedOutEmails();
  return set.size;
}
