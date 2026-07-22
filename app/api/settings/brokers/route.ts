/**
 * GET  /api/settings/brokers — the configurable broker list (Fact Find submission
 *   targets). Managed in Settings; selected from the Fact Find dropdown.
 * PUT  /api/settings/brokers — replace the list. Body: { brokers: [...] }.
 *
 * Storage: app_settings row key='brokers'. Mirrors property-types.
 */
import { NextResponse } from "next/server";
import { requireAuth } from "../../../../utils/cf-access";
import { loadBrokers, saveBrokers, sanitizeBrokers } from "../../../../utils/brokers";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  return NextResponse.json({ ok: true, brokers: await loadBrokers() });
}

export async function PUT(req: Request) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;

  const body = await req.json().catch(() => ({}));
  if (!Array.isArray(body?.brokers)) {
    return NextResponse.json({ ok: false, error: "body must be { brokers: [...] }" }, { status: 400 });
  }
  const cleaned = sanitizeBrokers(body.brokers, () => crypto.randomUUID());

  try {
    await saveBrokers(cleaned, auth);
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Save failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, brokers: cleaned });
}
