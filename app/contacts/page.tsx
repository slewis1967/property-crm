import { supabase } from "../../utils/supabase";
import ContactsClient from "./ContactsClient";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  let contacts: any[] = [];
  let from = 0;
  const PAGE = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("contacts")
      .select("*")
      .order("updated_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) {
      return <div className="text-red-600 p-4">Error loading contacts: {error.message}</div>;
    }

    contacts = contacts.concat(data || []);
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }

  // Deduplicate by id — pagination on non-unique updated_at can produce overlaps
  const seen = new Set<string>();
  contacts = contacts.filter(c => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });

  return <ContactsClient initialContacts={contacts} />;
}
