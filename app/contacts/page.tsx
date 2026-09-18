import { cookies } from "next/headers";
import { log, errInfo } from "../../utils/logger";
import { loadMergedContacts } from "../../utils/contacts-list";
import ContactsClient, { type Contact } from "./ContactsClient";
import { ALLOWED_PAGE_SIZES, DEFAULT_PAGE_SIZE, type PageSize } from "../../utils/pagination";

export const dynamic = "force-dynamic";

/**
 * Read the user's preferred page size from cookies so the server
 * component's first render matches the dropdown. Falls back to
 * DEFAULT_PAGE_SIZE if the cookie is missing or invalid.
 */
async function pageSizeFromCookies(): Promise<PageSize> {
  try {
    const jar = await cookies();
    const raw = jar.get("contacts_pageSize")?.value;
    if (raw) {
      const n = Number(raw);
      if ((ALLOWED_PAGE_SIZES as readonly number[]).includes(n)) return n as PageSize;
    }
  } catch {
    // cookies() throws if called outside a request context.
  }
  return DEFAULT_PAGE_SIZE;
}

export default async function ContactsPage() {
  const pageSize = await pageSizeFromCookies();

  let merged: Contact[];
  try {
    merged = await loadMergedContacts();
  } catch (e) {
    log.error("contacts.page_load_failed", errInfo(e));
    const message = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
    return <div className="text-red-600 p-4">Error loading contacts: {message}</div>;
  }

  const total = merged.length;
  const firstPage = merged.slice(0, pageSize);

  return (
    <ContactsClient
      initialContacts={firstPage}
      initialTotal={total}
      initialPageSize={pageSize}
    />
  );
}
