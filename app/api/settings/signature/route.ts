/**
 * GET  /api/settings/signature — fetch the resolved signature fields.
 * PUT  /api/settings/signature — update them. Body: SignatureFields shape.
 *
 * The PUT path upserts into app_settings(key='email_signature').
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { getSignatureFields, type SignatureFields } from "../../../../utils/email-signature";

export const dynamic = "force-dynamic";

export async function GET() {
  const fields = await getSignatureFields();
  return NextResponse.json({ ok: true, signature: fields });
}

export async function PUT(req: Request) {
  const body = await req.json().catch(() => ({}));
  const fields: SignatureFields = {
    name: typeof body.name === "string" ? body.name.trim() : "",
    title: typeof body.title === "string" ? body.title.trim() : "",
    email: typeof body.email === "string" ? body.email.trim() : "",
    phone: typeof body.phone === "string" ? body.phone.trim() : "",
    web: typeof body.web === "string" ? body.web.trim() : "",
    disclaimer: typeof body.disclaimer === "string" ? body.disclaimer.trim() : "",
  };

  for (const k of ["name", "title", "email", "phone", "web"] as const) {
    if (!fields[k]) {
      return NextResponse.json({ ok: false, error: `${k} is required` }, { status: 400 });
    }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email)) {
    return NextResponse.json({ ok: false, error: "email is not a valid address" }, { status: 400 });
  }

  const updatedBy =
    req.headers.get("x-user-email") ??
    req.headers.get("cf-access-authenticated-user-email") ??
    null;

  const { error } = await supabase
    .from("app_settings")
    .upsert(
      {
        key: "email_signature",
        value: fields,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      },
      { onConflict: "key" },
    );

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, signature: fields });
}
