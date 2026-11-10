import Link from "next/link";
import { supabase } from "../../../utils/supabase";
import { Header, List, Empty, LoadError, SearchBox } from "../ui";
import { tempDot } from "../data";

export const dynamic = "force-dynamic";

const LIMIT = 50;

type Row = {
  id: string;
  name: string | null;
  full_name: string | null;
  first_name: string | null;
  email: string | null;
  phone: string | null;
  temperature: string | null;
  state: string | null;
  preferred_state: string | null;
};

/**
 * PostgREST `or` filter for a contact search. Commas and brackets are the
 * filter syntax's own delimiters, so they're stripped from the term. A
 * phone-number-looking search also matches however the number was stored
 * ("0412345678" finds "0412 345 678").
 */
function searchFilter(q: string): string {
  const term = q.replace(/[%,()]/g, " ").trim();
  const like = `%${term}%`;
  const parts = ["name", "full_name", "first_name", "email", "phone"].map((c) => `${c}.ilike.${like}`);
  const digits = term.replace(/\D/g, "");
  if (digits.length >= 4 && !/[a-z]/i.test(term)) {
    parts.push(`phone.ilike.%${digits.split("").join("%")}%`);
  }
  return parts.join(",");
}

/** Contacts: the most recently updated, or a search across name/email/phone (live contacts only). */
export default async function PhoneContacts({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const term = q?.trim() ?? "";

  let query = supabase
    .from("contacts")
    .select("id,name,full_name,first_name,email,phone,temperature,state,preferred_state")
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(LIMIT);
  if (term) query = query.or(searchFilter(term));
  const { data, error } = await query;
  const rows = (data ?? []) as Row[];

  return (
    <>
      <Header title="Contacts" fullHref="/contacts" />
      <SearchBox action="/m/contacts" defaultValue={term} placeholder="Name, email or phone…" />
      <div className="px-4 pt-4">
        {error ? (
          <LoadError>Couldn&apos;t load contacts: {error.message}</LoadError>
        ) : rows.length === 0 ? (
          <Empty>{term ? `No contacts match “${term}”.` : "No contacts yet."}</Empty>
        ) : (
          <>
            <p className="mb-2 text-xs text-gray-500">
              {term ? `${rows.length}${rows.length === LIMIT ? "+" : ""} match${rows.length === 1 ? "" : "es"}` : "Recently updated"}
            </p>
            <List>
              {rows.map((c) => (
                <li key={c.id}>
                  <Link href={`/m/contacts/${c.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-gray-50">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tempDot[c.temperature ?? ""] ?? "bg-gray-300"}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium">{c.full_name || c.name || c.first_name || c.email || "(no name)"}</p>
                      <p className="truncate text-xs text-gray-500">
                        {[c.phone, c.email, c.state || c.preferred_state].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <span className="text-gray-300">›</span>
                  </Link>
                </li>
              ))}
            </List>
          </>
        )}
      </div>
    </>
  );
}
