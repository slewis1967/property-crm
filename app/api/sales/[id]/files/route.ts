/**
 * POST   /api/sales/<id>/files  { filename, size, mime_type?, category? }
 *   Reserve a row (status 'pending') and mint a signed upload URL. The browser
 *   PUTs the bytes straight to Supabase — Netlify functions 500 on big bodies.
 * PATCH  /api/sales/<id>/files  { file_id }   confirm the upload landed
 * DELETE /api/sales/<id>/files?file_id=<uuid>
 *
 * STAFF only. Bucket is private; downloads are 10-minute signed links from GET /api/sales/<id>.
 */
import { NextResponse } from "next/server";
import { supabase } from "../../../../../utils/supabase";
import { requireStaff, readJson } from "../../../admin/introducers/_shared";
import { MAX_SALE_FILE_BYTES, SALE_FILES_BUCKET, SALE_MIGRATION_HINT } from "../../../../../utils/sales";
import { logSaleEvent, saleColumnsMissing } from "../../_shared";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const CATEGORIES = ["sales_advice", "buyer_id", "contract", "deposit_receipt", "other"];

async function deal(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data } = await supabase.from("partner_enquiries").select("id,partner_id,client_id").eq("id", id).maybeSingle();
  return data as { id: string; partner_id: string | null; client_id: string | null } | null;
}

function cleanName(v: unknown): string {
  return typeof v === "string" ? v.replace(/[\\/\u0000-\u001f]/g, "").trim().slice(0, 200) : "";
}

export async function POST(req: Request, ctx: Ctx) {
  const auth = await requireStaff(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const d = await deal(id);
  if (!d) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const name = cleanName(body.filename);
  const size = Number(body.size);
  if (!name) return NextResponse.json({ ok: false, error: "filename required" }, { status: 400 });
  if (!Number.isFinite(size) || size <= 0) return NextResponse.json({ ok: false, error: "size must be > 0" }, { status: 400 });
  if (size > MAX_SALE_FILE_BYTES) return NextResponse.json({ ok: false, error: `"${name}" is over 50 MB.` }, { status: 400 });
  const category = CATEGORIES.includes(String(body.category)) ? String(body.category) : "other";

  const safe = name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-120);
  const path = `${d.id}/${crypto.randomUUID()}-${safe}`;

  const { data: row, error } = await supabase
    .from("deal_files")
    .insert({
      deal_id: d.id,
      name,
      storage_path: path,
      size_bytes: size,
      mime_type: typeof body.mime_type === "string" ? body.mime_type.slice(0, 100) : null,
      category,
      status: "pending",
      uploaded_by: auth,
    })
    .select("id")
    .single();
  if (saleColumnsMissing(error)) return NextResponse.json({ ok: false, error: SALE_MIGRATION_HINT }, { status: 503 });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const { data: signed, error: signErr } = await supabase.storage.from(SALE_FILES_BUCKET).createSignedUploadUrl(path);
  if (signErr || !signed) {
    await supabase.from("deal_files").delete().eq("id", row.id);
    return NextResponse.json({ ok: false, error: signErr?.message ?? "Couldn't start the upload." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, file_id: row.id, path, token: signed.token });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await requireStaff(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const body = await readJson(req);
  if (body instanceof NextResponse) return body;
  const d = await deal(id);
  if (!d) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const fileId = String(body.file_id ?? "");
  const { data: f } = await supabase
    .from("deal_files")
    .select("id,storage_path,name,category")
    .eq("id", fileId)
    .eq("deal_id", d.id)
    .maybeSingle();
  if (!f) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  // Only mark it ready if the bytes are really there.
  const dir = f.storage_path.split("/").slice(0, -1).join("/");
  const base = f.storage_path.split("/").pop();
  const { data: listed } = await supabase.storage.from(SALE_FILES_BUCKET).list(dir, { search: base });
  if (!listed?.some((o) => o.name === base)) {
    return NextResponse.json({ ok: false, error: "The upload didn't arrive. Try again." }, { status: 409 });
  }
  await supabase.from("deal_files").update({ status: "ready" }).eq("id", f.id);
  await supabase.from("partner_enquiries").update({ updated_at: new Date().toISOString() }).eq("id", d.id);
  await logSaleEvent(d, auth, "file_added", { name: f.name, category: f.category });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const auth = await requireStaff(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await ctx.params;
  const fileId = new URL(req.url).searchParams.get("file_id") ?? "";
  const d = await deal(id);
  if (!d || !/^[0-9a-f-]{36}$/i.test(fileId)) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

  const { data: f } = await supabase.from("deal_files").select("id,storage_path,name").eq("id", fileId).eq("deal_id", d.id).maybeSingle();
  if (!f) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  const { error: rmErr } = await supabase.storage.from(SALE_FILES_BUCKET).remove([f.storage_path]);
  if (rmErr) return NextResponse.json({ ok: false, error: rmErr.message }, { status: 500 });
  await supabase.from("deal_files").delete().eq("id", f.id);
  await logSaleEvent(d, auth, "file_removed", { name: f.name });
  return NextResponse.json({ ok: true });
}
