import { NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { requireAuth } from "../../../../utils/cf-access";
import { log, errInfo } from "../../../../utils/logger";
import {
  addDays,
  advanceDueDate,
  brisbaneToday,
  paidErrMessage,
  paidServicesTableMissing,
  type PaidService,
} from "../../../../utils/paid-services";
import { coerceServiceBody, MIGRATION_HINT } from "../route";

export const dynamic = "force-dynamic";

/**
 * PATCH — edit an account, or run an action on it.
 *
 * `action: "mark_paid"` is the one-click path: it stamps last_paid_on and rolls
 * next_due_date forward by the billing cycle (from the *scheduled* date, so a
 * late payment doesn't shift the anniversary). Non-periodic cycles (usage,
 * prepaid, one_off) have no next date to compute, so mark_paid only records the
 * payment date for them.
 *
 * `action: "snooze"` hides an account from alerts for N days — for the "yes I
 * know, I'm dealing with it" case, which is otherwise handled by ignoring the
 * email, and an ignored alert channel is a dead alert channel.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const b = (await req.json()) as Record<string, unknown>;
    const action = typeof b.action === "string" ? b.action : null;
    const today = brisbaneToday();
    let patch: Record<string, unknown>;

    if (action === "mark_paid" || action === "snooze") {
      const { data: current, error: readErr } = await supabase
        .from("paid_services")
        .select("*")
        .eq("id", id)
        .single();
      if (readErr) {
        if (paidServicesTableMissing(readErr)) {
          return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 501 });
        }
        throw readErr;
      }
      const svc = current as PaidService;

      if (action === "mark_paid") {
        const paidOn = typeof b.paid_on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.paid_on) ? b.paid_on : today;
        patch = { last_paid_on: paidOn };
        const next = advanceDueDate(svc.next_due_date, svc.billing_cycle, today);
        if (next) patch.next_due_date = next;
        // Paying it resolves whatever we were nagging about.
        patch.snoozed_until = null;
      } else {
        const days = typeof b.days === "number" && b.days > 0 && b.days <= 365 ? Math.round(b.days) : 7;
        // snoozed_until is inclusive, so "7 days" ends 6 days after today.
        patch = { snoozed_until: addDays(today, days - 1) };
      }
    } else {
      patch = coerceServiceBody(b, false);
      if (Object.prototype.hasOwnProperty.call(patch, "name") && !patch.name) {
        return NextResponse.json({ ok: false, error: "A service name is required" }, { status: 400 });
      }
      if (Object.keys(patch).length === 0) {
        return NextResponse.json({ ok: false, error: "Nothing to update" }, { status: 400 });
      }
    }

    patch.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("paid_services")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();
    if (error) {
      if (paidServicesTableMissing(error)) {
        return NextResponse.json({ ok: false, error: MIGRATION_HINT }, { status: 501 });
      }
      if ((error as { code?: string }).code === "23505") {
        return NextResponse.json({ ok: false, error: "Another account already has that name." }, { status: 409 });
      }
      throw error;
    }
    return NextResponse.json({ ok: true, service: data });
  } catch (e) {
    log.error("paid_services.update_failed", { detail: paidErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: paidErrMessage(e, "Update failed") }, { status: 500 });
  }
}

/** DELETE — remove an account from the register (its alert history goes with it). */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAuth(req);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const { error } = await supabase.from("paid_services").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    log.error("paid_services.delete_failed", { detail: paidErrMessage(e, ""), ...errInfo(e) });
    return NextResponse.json({ ok: false, error: paidErrMessage(e, "Delete failed") }, { status: 500 });
  }
}
