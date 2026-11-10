import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { userEmailFromRequest, isUnauthenticated, requireAuth } from "../../../../utils/cf-access";
import { validateDeletionInput, recordDeletion } from "../../../../utils/deletion-log";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id: contactId } = await params;
  const body = await req.json();
  const allowed = [
    "notes", "status", "temperature", "tags", "buyer_type",
    // Identity
    "name", "first_name", "full_name", "email", "phone",
    // Profile
    "preferred_state", "state",
    "budget", "budget_min", "budget_max",
    "finance_status", "timeframe",
    "lead_score", "segment", "source", "message",
    // Personal
    "date_of_birth", "marital_status", "dependents_count",
    // Home address
    "home_address_street", "home_address_suburb",
    "home_address_state", "home_address_postcode",
    // Employment
    "employment_type", "employer_name", "occupation",
    // Financial — feeds borrowing calculator
    "annual_income", "partner_annual_income",
    "existing_savings", "hecs_balance",
  ];
  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "no valid fields" }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  const { error } = await supabase.from("contacts").update(update).eq("id", contactId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id: contactId } = await params;

  // Gate: a client deletion requires a reason + the user's name.
  const body = await req.json().catch(() => ({}));
  const valid = validateDeletionInput(body);
  if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 });
  const { reason, deleterName } = valid.value;

  const email = await userEmailFromRequest(req);
  const deleterEmail = isUnauthenticated(email) ? null : email;

  // Snapshot the contact BEFORE deleting so the audit row is recoverable.
  const { data: snapshot } = await supabase
    .from("contacts")
    .select("*")
    .eq("id", contactId)
    .maybeSingle();
  const label = snapshot
    ? (snapshot.full_name || snapshot.name || snapshot.email || contactId)
    : contactId;

  // Fail-open audit write (never blocks the delete).
  await recordDeletion({
    entityType: "contact",
    entityId: contactId,
    entityLabel: label,
    reason,
    deleterName,
    deleterEmail,
    snapshot,
  });

  const { error } = await supabase.from("contacts").delete().eq("id", contactId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
