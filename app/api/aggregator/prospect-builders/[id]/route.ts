/**
 * POST /api/aggregator/prospect-builders/{id}  { action }
 *
 *   request_agreement  prospect            -> agreement_requested
 *   mark_signed        agreement_requested -> agreement_signed
 *   onboard            agreement_signed    -> onboarded  (+ active builders row)
 *   undo               one step back (not from onboarded)
 *
 * Every status write is conditional on the status the caller saw, so two staff
 * clicking at once get a 409 rather than a skipped step.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { requireAuth } from "../../../../../utils/cf-access";
import {
  isProspectAction,
  primaryContact,
  stockDomainsFor,
  transitionFor,
  type ProspectBuilder,
} from "../../../../../utils/prospect-builders";

export const dynamic = "force-dynamic";

const conflict = () =>
  NextResponse.json(
    { ok: false, error: "This prospect was updated by someone else — reload and try again." },
    { status: 409 },
  );

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const actor = auth;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body?.action;
  if (!isProspectAction(action)) {
    return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
  }

  const { data: prospect, error: loadErr } = await supabase
    .from("prospect_builders")
    .select("*")
    .eq("id", id)
    .maybeSingle<ProspectBuilder>();
  if (loadErr) return NextResponse.json({ ok: false, error: loadErr.message }, { status: 500 });
  if (!prospect) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const step = transitionFor(action, prospect.status);
  if (!step) {
    return NextResponse.json(
      { ok: false, error: `Can't ${action.replace(/_/g, " ")} from status "${prospect.status}"` },
      { status: 409 },
    );
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { status: step.to, updated_at: now };
  let builder: Record<string, unknown> | null = null;

  if (action === "request_agreement") {
    update.agreement_requested_at = now;
    update.agreement_requested_by = actor;
  } else if (action === "mark_signed") {
    update.agreement_signed_at = now;
    update.agreement_signed_by = actor;
  } else if (action === "undo" && step.clear) {
    update[`${step.clear}_at`] = null;
    update[`${step.clear}_by`] = null;
  } else if (action === "onboard") {
    const result = await upsertBuilder(prospect);
    if ("error" in result) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
    builder = result.builder;
    update.builder_id = result.builder.id;
    update.onboarded_at = now;
    update.onboarded_by = actor;
  }

  const { data: saved, error: saveErr } = await supabase
    .from("prospect_builders")
    .update(update)
    .eq("id", id)
    .eq("status", prospect.status)
    .select("*")
    .maybeSingle();
  if (saveErr) return NextResponse.json({ ok: false, error: saveErr.message }, { status: 500 });
  if (!saved) return conflict();

  return NextResponse.json({ ok: true, prospect: saved, builder });
}

/**
 * Hand the firm to the stock side: an active, non-draft builders row whose
 * sender_domains let the aggregator attribute this firm's stocklists.
 * Re-uses an existing row matched by name or domain (canonical_name is
 * UNIQUE, and the aggregator may already have auto-created one from an email).
 */
async function upsertBuilder(
  p: ProspectBuilder,
): Promise<{ builder: Record<string, unknown> & { id: string } } | { error: string }> {
  const domains = stockDomainsFor(p);
  const contact = primaryContact(p);

  let existing: (Record<string, unknown> & { id: string; sender_domains?: string[] | null }) | null = null;
  const byName = await supabase.from("builders").select("*").eq("canonical_name", p.company).maybeSingle();
  if (byName.error) return { error: byName.error.message };
  existing = byName.data;
  if (!existing && domains.length) {
    const byDomain = await supabase.from("builders").select("*").overlaps("sender_domains", domains).limit(1);
    if (byDomain.error) return { error: byDomain.error.message };
    existing = byDomain.data?.[0] ?? null;
  }

  if (existing) {
    const { data, error } = await supabase
      .from("builders")
      .update({
        active: true,
        draft: false,
        sender_domains: [...new Set([...(existing.sender_domains ?? []), ...domains])],
        contact_email: (existing.contact_email as string | null) ?? contact.email,
        contact_phone: (existing.contact_phone as string | null) ?? contact.phone,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select("*")
      .single();
    return error ? { error: error.message } : { builder: data };
  }

  const { data, error } = await supabase
    .from("builders")
    .insert({
      canonical_name: p.company,
      aliases: [],
      sender_domains: domains,
      contact_email: contact.email,
      contact_phone: contact.phone,
      active: true,
      draft: false,
    })
    .select("*")
    .single();
  return error ? { error: error.message } : { builder: data };
}
