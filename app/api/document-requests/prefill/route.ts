/**
 * GET /api/document-requests/prefill?contact_id=&opportunity_id=   (AUTHED)
 *
 * Returns the best-available second-applicant name for pre-filling a document
 * request, read from the newest Fact Find or Needs Analysis for this contact.
 * A joint deal captures applicant 2 inside those forms' `applicants[1]`, and
 * that jsonb is server-side only — hence this endpoint rather than a client read.
 *
 * Response: { ok, applicant2_name, applicant_count, source }
 *   applicant2_name: string | null   (null when no second applicant is on file)
 *   applicant_count: 1 | 2
 *   source: "fact_find" | "needs_analysis" | null
 *
 * Static segment "prefill" resolves ahead of the sibling dynamic [id] route.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Applicant = Record<string, unknown>;

/** Join the name parts a form uses. Fact Find: given_names + family_name.
 *  Needs Analysis: given_names + surname. Tolerant of either shape. */
function applicantName(a: Applicant | undefined): string {
  if (!a || typeof a !== "object") return "";
  const given = String(a.given_names ?? a.first_name ?? "").trim();
  const family = String(a.family_name ?? a.surname ?? a.last_name ?? "").trim();
  return `${given} ${family}`.trim();
}

function applicantEmail(a: Applicant | undefined): string {
  if (!a || typeof a !== "object") return "";
  return String(a.email ?? "").trim();
}

/** newest row's { data, created_at } for a table filtered by contact_id */
async function newest(table: string, contactId: string) {
  const { data } = await supabase
    .from(table)
    .select("data,created_at")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { data: { applicants?: Applicant[] } | null; created_at: string } | null;
}

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const contactId = new URL(req.url).searchParams.get("contact_id");
  if (!contactId) {
    return NextResponse.json({ ok: true, applicant2_name: null, applicant2_email: null, applicant_count: 1, source: null });
  }

  // Read both forms; take whichever is newer and actually names a second applicant.
  // Missing tables (older deployments) just yield null — never error the caller.
  const [ff, na] = await Promise.all([
    newest("borrower_fact_finds", contactId).catch(() => null),
    newest("nccp_needs_analyses", contactId).catch(() => null),
  ]);

  const candidates = [
    ff ? { source: "fact_find" as const, ...ff } : null,
    na ? { source: "needs_analysis" as const, ...na } : null,
  ]
    .filter(Boolean)
    .sort((a, b) => new Date(b!.created_at).getTime() - new Date(a!.created_at).getTime());

  for (const c of candidates) {
    const a2 = c!.data?.applicants?.[1];
    const name2 = applicantName(a2);
    if (name2) {
      return NextResponse.json({
        ok: true,
        applicant2_name: name2,
        applicant2_email: applicantEmail(a2) || null,
        applicant_count: 2,
        source: c!.source,
      });
    }
  }

  return NextResponse.json({ ok: true, applicant2_name: null, applicant2_email: null, applicant_count: 1, source: null });
}
