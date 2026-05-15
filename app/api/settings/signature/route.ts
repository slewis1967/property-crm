/**
 * GET  /api/settings/signature?user_email=...   fetch a user's signature
 * PUT  /api/settings/signature
 *        Body: { user_email, ...SignatureFields }
 *      Upsert the signature for the given user. Body must include the
 *      target user_email so any logged-in user can edit any other user's
 *      signature (single-tenant CRM — both Sean and Glenn can manage each
 *      other's. Multi-tenant guardrails come with the SaaS shell.)
 *
 * The signature lives in email_user_aliases.signature (per-user JSONB).
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { getSignatureFields, type SignatureFields } from "../../../../utils/email-signature";

import { requireAuth } from "../../../../utils/cf-access";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const userEmail = url.searchParams.get("user_email") ?? undefined;
  const fields = await getSignatureFields(userEmail);
  return NextResponse.json({ ok: true, signature: fields, user_email: userEmail ?? null });
}

export async function PUT(req: Request) {
  const auth = requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const body = await req.json().catch(() => ({}));
    const userEmail: string = typeof body.user_email === "string" ? body.user_email.trim() : "";
    if (!userEmail) {
      return NextResponse.json({ ok: false, error: "user_email is required" }, { status: 400 });
    }

    const fields: SignatureFields = {
      name:       typeof body.name === "string"       ? body.name.trim()       : "",
      title:      typeof body.title === "string"      ? body.title.trim()      : "",
      email:      typeof body.email === "string"      ? body.email.trim()      : "",
      phone:      typeof body.phone === "string"      ? body.phone.trim()      : "",
      web:        typeof body.web === "string"        ? body.web.trim()        : "",
      disclaimer: typeof body.disclaimer === "string" ? body.disclaimer.trim() : "",
      logo_url:    typeof body.logo_url === "string" && body.logo_url.trim() ? body.logo_url.trim() : undefined,
      logo_height: typeof body.logo_height === "number" && body.logo_height > 0 ? Math.round(body.logo_height) : undefined,
    };

    for (const k of ["name", "title", "email", "phone", "web"] as const) {
      if (!fields[k]) {
        return NextResponse.json({ ok: false, error: `${k} is required` }, { status: 400 });
      }
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) {
      return NextResponse.json({ ok: false, error: "email is not a valid address" }, { status: 400 });
    }

    // Confirm the target user exists in email_user_aliases (single source of
    // truth for who can be a sender). Avoids accidentally writing signatures
    // for typo'd addresses.
    const { data: existing, error: lookupErr } = await supabase
      .from("email_user_aliases")
      .select("user_email")
      .eq("user_email", userEmail)
      .maybeSingle();
    if (lookupErr) {
      return NextResponse.json({ ok: false, error: lookupErr.message }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: `${userEmail} is not a registered sender — add it to email_user_aliases first` },
        { status: 404 },
      );
    }

    const { error } = await supabase
      .from("email_user_aliases")
      .update({ signature: fields })
      .eq("user_email", userEmail);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, signature: fields, user_email: userEmail });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `Unhandled: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    );
  }
}
