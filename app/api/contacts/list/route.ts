/**
 * GET /api/contacts/list?page=N&pageSize=M
 *
 * Paginated list of live + archive contacts.
 *
 * Why this exists:
 *   The contacts page used to load every row from `contacts` and
 *   `ghl_archive_contacts` (up to ~13.5k rows combined) in the
 *   server component and ship them all to the browser. Cold starts
 *   were tipping past Netlify's 10s budget. This endpoint serves
 *   the first page from the server component and the rest via
 *   "Load more" calls.
 *
 * Page numbers start at 1. Page size is pinned to 25/50/75/100.
 * The list keeps the same live+archive merge + dedup logic the
 * page component used to run, so the UI can't tell the difference
 * between "initial render" and "load more" rows.
 *
 * Auth: sentinel pattern (same as /api/properties/list). Unauth
 * callers get a 401, not a leaked page of contacts.
 */
import { NextResponse } from "next/server";
import { userEmailFromRequest } from "../../../../utils/cf-access";
import { withObservability } from "../../../../utils/observability";
import {
  coercePage,
  coercePageSize,
  paginate,
  type PageSize,
} from "../../../../utils/pagination";
import { loadContactsPage } from "../../../../utils/contacts-list";

export const dynamic = "force-dynamic";

async function handler(req: Request) {
  const sender = await userEmailFromRequest(req);
  if (sender === "__unauthenticated__@invalid") {
    return NextResponse.json({ ok: false, error: "Unauthenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const page = coercePage(url.searchParams.get("page"));
  const pageSize = coercePageSize(url.searchParams.get("pageSize")) as PageSize;

  const { rows, total } = await loadContactsPage(page, pageSize);

  return NextResponse.json(paginate(rows, page, pageSize, total));
}

export const GET = withObservability("GET /api/contacts/list", handler);
