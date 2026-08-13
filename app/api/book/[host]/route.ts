import { NextRequest, NextResponse } from "next/server";
import { supabase } from "../../../../utils/supabase";
import { errMessage } from "../../../../utils/errors";
import { findHostBySlug, bookingNotifyRecipients } from "../../../../utils/scheduling-hosts";
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
import { enforceRateLimit } from "../../../../utils/rate-limit";
import { clientIp } from "../../sign/_shared";
import { findOrCreateContactByEmail } from "../../../../utils/contacts-create";

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

  // This endpoint is PUBLIC (no Cloudflare Access) and each call sends a Brevo
  // invite to a caller-supplied address, writes a calendar appointment, and can
  // create a contact — so unthrottled it's an email-amplification + calendar-
  // flood primitive behind only the honeypot. Per-IP limit. In-memory, so it's
  // per-instance (a distributed attacker isn't fully stopped) — cheap insurance
  // against the single-source loop, not a complete control.
  const limited = enforceRateLimit(req, {
    windowMs: 60_000,
    max: 5,
    keyFn: () => `book:${clientIp(req)}`,
  });
  if (limited) return limited;

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

  // --- Capture the lead as a contact (find-or-create; never clobber an
  // existing contact's fields). A failure here must not lose the booking, so
  // we proceed unlinked rather than erroring out. ---
  const contactResult = await findOrCreateContactByEmail({
    full_name: name,
    email,
    phone: body.phone,
    source: "self_book",
  });
  const contactId: string | null = contactResult.ok ? contactResult.id : null;

  // --- LiveKit video link (best-effort). Needs a room key; use the contact id
  // when we have one, else a booking-scoped room. ---
  let videoLink: string | null = null;
  // Where the HOST joins: the authed room page, not the guest link. The guest
  // link carries the lead's name, so a host clicking it joins labelled as the
  // lead. Staff are behind Cloudflare Access anyway, so /video/<room> is the
  // right door for them.
  let hostVideoLink: string | null = null;
  if (livekitConfigured()) {
    try {
      const room = contactId ? roomForContact(contactId) : `book-${startMs}`;
      const ttlHours = Math.max(24, Math.ceil((endMs - now) / 3_600_000) + 6);
      const token = await signGuestToken({ room, name, ttlHours });
      videoLink = `${req.nextUrl.origin}/join/${encodeURIComponent(token)}`;
      hostVideoLink = `${req.nextUrl.origin}/video/${encodeURIComponent(room)}`;
    } catch {
      videoLink = null;
      hostVideoLink = null;
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
    // Don't echo the raw DB error to an unauthenticated caller (leaks column/
    // constraint names). Log server-side, return a generic message.
    console.error("[book] appointment insert failed:", errMessage(insertErr));
    return NextResponse.json({ error: "Could not save the booking. Please try again." }, { status: 500 });
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
    to: bookingNotifyRecipients(host).map((email) => ({
      email,
      name: email === host.email ? host.displayName : email,
    })),
    subject: `New booking: ${name} — ${whenLabel}`,
    html: `<p>${name} booked a meeting via your self-book page.</p>
      <p><strong>When:</strong> ${whenLabel} (AEST)<br>
      <strong>Email:</strong> ${email}${body.phone ? `<br><strong>Phone:</strong> ${body.phone}` : ""}</p>
      ${hostVideoLink ? `<p><a href="${hostVideoLink}">Join the video meeting</a></p>` : ""}
      ${body.notes ? `<p><strong>Notes:</strong> ${body.notes}</p>` : ""}`,
    tags: ["self-book-notify"],
  }).catch(() => undefined);

  return NextResponse.json({
    ok: true,
    video_link: videoLink,
    invite_sent: invite.ok,
  });
}
