import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { errMessage } from "../../../../utils/errors";
import { findHostBySlug } from "../../../../utils/scheduling-hosts";
import {
  computeAvailability,
  isSlotAvailable,
  DEFAULT_BOOKING_CONFIG,
  type Interval,
} from "../../../../utils/booking";
import { roomForContact, livekitConfigured } from "../../../../utils/livekit";
import { signGuestToken } from "../../../../utils/guest-token";
import { sendMeetingInvite } from "../../../../utils/meeting-invite";
import { sendBrevoEmail } from "../../../../utils/brevo";
import { buildAppointmentRow } from "../../../../utils/appointments";

/**
 * PUBLIC self-book endpoint — the in-house replacement for the Google Calendar
 * booking pages. No CRM login (exempted in proxy.ts + a matching Cloudflare
 * Access bypass app). A lead picks an open slot with a host; we capture them as
 * a contact, book the meeting into the CRM calendar, mint a LiveKit video link,
 * and email both the lead (invite + .ics) and the host (heads-up).
 *
 *   GET  /api/book/<slug>            → { host, days: [{date,label,slots[]}] }
 *   POST /api/book/<slug>            → { ok, video_link }
 *          body { start, name, email, phone?, notes?, website? }
 *
 * Availability is derived from the host's existing `appointments` (no external
 * calendar). `website` is a honeypot — bots fill it; we silently drop those.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function busyFor(hostEmail: string, fromMs: number, toMs: number): Promise<Interval[]> {
  const { data } = await supabase
    .from("appointments")
    .select("start_time,end_time,status")
    .eq("host_email", hostEmail)
    .gte("start_time", new Date(fromMs).toISOString())
    .lt("start_time", new Date(toMs).toISOString())
    .neq("status", "cancelled")
    .limit(1000);
  const out: Interval[] = [];
  for (const r of data ?? []) {
    const s = Date.parse(r.start_time as string);
    const e = r.end_time ? Date.parse(r.end_time as string) : s + DEFAULT_BOOKING_CONFIG.slotMinutes * 60_000;
    if (Number.isFinite(s) && Number.isFinite(e)) out.push({ startMs: s, endMs: e });
  }
  return out;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ host: string }> }) {
  const { host: slug } = await ctx.params;
  const host = findHostBySlug(slug);
  if (!host) {
    return NextResponse.json({ error: "Unknown booking page" }, { status: 404 });
  }

  const now = Date.now();
  const windowEnd = now + (DEFAULT_BOOKING_CONFIG.lookaheadDays + 1) * 86_400_000;
  let busy: Interval[] = [];
  try {
    busy = await busyFor(host.email, now, windowEnd);
  } catch {
    // Degrade to "everything open" rather than failing the page — a booking is
    // still re-validated against live busy times on POST.
    busy = [];
  }
  const days = computeAvailability(now, busy);

  return NextResponse.json({
    host: { slug: host.slug, label: host.label, displayName: host.displayName, brand: host.brand },
    days,
  });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ host: string }> }) {
  const { host: slug } = await ctx.params;
  const host = findHostBySlug(slug);
  if (!host) {
    return NextResponse.json({ error: "Unknown booking page" }, { status: 404 });
  }

  let body: {
    start?: string;
    name?: string;
    email?: string;
    phone?: string;
    notes?: string;
    website?: string; // honeypot
    timeZone?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  // Honeypot: a real person never fills the hidden `website` field. Pretend it
  // worked so the bot gets no signal, but write nothing.
  if (body.website && body.website.trim() !== "") {
    return NextResponse.json({ ok: true, video_link: null });
  }

  const name = (body.name || "").trim();
  const email = (body.email || "").trim().toLowerCase();
  const start = (body.start || "").trim();
  if (!name || name.length > 120) {
    return NextResponse.json({ error: "Please enter your name." }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  const startMs = Date.parse(start);
  if (!Number.isFinite(startMs)) {
    return NextResponse.json({ error: "Please choose a time." }, { status: 400 });
  }

  // Re-validate the slot against live busy times — never trust the client's
  // claim that a slot is free.
  const now = Date.now();
  const windowEnd = now + (DEFAULT_BOOKING_CONFIG.lookaheadDays + 1) * 86_400_000;
  const busy = await busyFor(host.email, now, windowEnd);
  if (!isSlotAvailable(start, now, busy)) {
    return NextResponse.json(
      { error: "Sorry, that time was just taken. Please pick another." },
      { status: 409 },
    );
  }

  const endMs = startMs + DEFAULT_BOOKING_CONFIG.slotMinutes * 60_000;
  const startISO = new Date(startMs).toISOString();
  const endISO = new Date(endMs).toISOString();
  const title = `Meeting with ${name}`;
  const nowIso = new Date().toISOString();

  // --- Capture the lead as a contact (find-or-create; never clobber an
  // existing contact's fields). ---
  let contactId: string | null = null;
  try {
    const { data: existing } = await supabase
      .from("contacts")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existing?.id) {
      contactId = existing.id as string;
    } else {
      const { data: created } = await supabase
        .from("contacts")
        .insert({
          full_name: name,
          name,
          first_name: name.split(" ")[0],
          email,
          phone: body.phone?.trim() || null,
          source: "self_book",
          status: "new",
          temperature: "warm",
          created_at: nowIso,
          updated_at: nowIso,
        })
        .select("id")
        .single();
      contactId = (created as { id: string } | null)?.id ?? null;
    }
  } catch {
    contactId = null; // proceed with an unlinked booking rather than fail
  }

  // --- LiveKit video link (best-effort). Needs a room key; use the contact id
  // when we have one, else a booking-scoped room. ---
  let videoLink: string | null = null;
  if (livekitConfigured()) {
    try {
      const room = contactId ? roomForContact(contactId) : `book-${startMs}`;
      const ttlHours = Math.max(24, Math.ceil((endMs - now) / 3_600_000) + 6);
      const token = await signGuestToken({ room, name, ttlHours });
      videoLink = `${req.nextUrl.origin}/join/${encodeURIComponent(token)}`;
    } catch {
      videoLink = null;
    }
  }

  // --- Book it into the CRM calendar. ---
  const { data: inserted, error: insertErr } = await supabase
    .from("appointments")
    .insert(buildAppointmentRow({
      contactId,
      contactEmail: email,
      contactName: name,
      hostEmail: host.email,
      hostName: host.displayName,
      title,
      startISO,
      endISO,
      location: videoLink,
      notes: body.notes?.trim() || null,
    }))
    .select("id")
    .single();

  if (insertErr) {
    return NextResponse.json({ error: `Could not save the booking: ${errMessage(insertErr)}` }, { status: 500 });
  }
  const apptId = (inserted as { id: string }).id;

  // --- Email the lead an invite (+ .ics) and give the host a heads-up. Both
  // best-effort: the booking is already saved. ---
  const invite = await sendMeetingInvite({
    to: { email, name },
    host,
    title,
    description: body.notes?.trim() || undefined,
    start: startISO,
    end: endISO,
    joinUrl: videoLink,
    uid: `appt-${apptId}@nextkey.com.au`,
    tz: body.timeZone,
  });

  const whenLabel = new Intl.DateTimeFormat("en-AU", {
    weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit",
    timeZone: "Australia/Brisbane",
  }).format(new Date(startMs));
  await sendBrevoEmail({
    to: [{ email: host.email, name: host.displayName }],
    subject: `New booking: ${name} — ${whenLabel}`,
    html: `<p>${name} booked a meeting via your self-book page.</p>
      <p><strong>When:</strong> ${whenLabel} (AEST)<br>
      <strong>Email:</strong> ${email}${body.phone ? `<br><strong>Phone:</strong> ${body.phone}` : ""}</p>
      ${videoLink ? `<p><a href="${videoLink}">Join the video meeting</a></p>` : ""}
      ${body.notes ? `<p><strong>Notes:</strong> ${body.notes}</p>` : ""}`,
    tags: ["self-book-notify"],
  }).catch(() => undefined);

  return NextResponse.json({
    ok: true,
    video_link: videoLink,
    invite_sent: invite.ok,
  });
}
