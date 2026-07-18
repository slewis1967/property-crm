# Feature: Video conferencing (self-hosted LiveKit)

Broker ↔ client video calls, embedded in the CRM, running on our **own**
LiveKit SFU (no SaaS, no per-seat cost). Calls are room-scoped per contact and
logged to the contact's timeline.

## Why LiveKit

The CRM is Next.js/React, and LiveKit is the only mature self-hosted option
with first-class React SDKs (`@livekit/components-react`) — so the call UI is a
component inside a CRM page, not an iframe. Auth reuses Cloudflare Access;
tokens are minted server-side from the logged-in user.

## Pieces

| File | Role |
|------|------|
| `utils/livekit.ts` | Server helper: mint join tokens, verify webhooks, config checks |
| `app/api/livekit/token/route.ts` | POST → room-scoped join token for the authed user |
| `app/api/livekit/webhook/route.ts` | LiveKit → CRM lifecycle events, logged to `video_call_events` |
| `app/components/VideoRoom.tsx` | Reusable conference UI (`VideoRoom`, `VideoRoomForRoom`) |
| `app/components/StartVideoCallButton.tsx` | "🎥 Video call" button for contact/opportunity pages |
| `app/video/[room]/` | Standalone shareable call page |
| `migrations/20260716_video_call_events.sql` | Call telemetry table |
| `deploy/livekit/` | The self-hosted SFU (Fly.io) — see its README |

## Data flow

1. Broker clicks **🎥 Video call** on a contact → opens `/video/contact-<id>`.
2. The call page POSTs `/api/livekit/token` → server checks Cloudflare Access,
   mints a 2h room-scoped token for `contact-<id>`.
3. Browser connects `wss://` to the SFU with that token.
4. The SFU POSTs lifecycle events to `/api/livekit/webhook` (signature
   verified) → rows in `video_call_events`, linked to the contact.

## Deploy / config

See [`deploy/livekit/README.md`](../deploy/livekit/README.md). Three CRM env
vars (`NEXT_PUBLIC_LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`) plus
one DB migration. Until those are set, the token route returns 503 and the UI
shows "video calling isn't configured" rather than erroring.

## Call timeline (contact panel)

`ContactVideoCalls` (on the contact detail) reads `/api/livekit/calls?contactId=`,
which aggregates the raw `video_call_events` into call *sessions* (grouped by
LiveKit room sid — the room *name* `contact-<id>` is reused every call). Shows
start time, duration, participants, and a **▶ Recording** link when one exists.
Renders nothing until the contact has had a call.

## Recording (LiveKit egress)

The call UI has a **⏺ Record** toggle → `/api/livekit/record` (authed) →
`startRoomRecording`/`stopRoomRecording` via the LiveKit `EgressClient`. The
finished MP4's location arrives on the `egress_ended` webhook and is stored as
`recording_url` on the call's event row.

**Needs the egress service deployed** — see
[`deploy/livekit-egress/README.md`](../deploy/livekit-egress/README.md). Its
prerequisites are (1) a **Redis** shared with the SFU and (2) **Supabase S3
storage keys** (generate a `recordings` bucket + S3 access key in the Supabase
dashboard). Until egress is up, the Record button shows "recording unavailable"
(the route 503s) — everything else keeps working.

## Scheduled meetings use the LiveKit link (not Google Meet)

When a meeting is booked via `POST /api/appointments` (the "📅 Schedule meeting"
flow), the route mints a signed guest link for the contact's room and puts it at
the top of the calendar invite body (and in the event Location when there's no
physical location). `createCalendarEvent` is called with `addGoogleMeet: false`
so attendees get **one** video link — the self-hosted LiveKit one. If LiveKit
isn't configured (or signing fails) it falls back to a Google Meet link so a
meeting always has video. The link's TTL covers the meeting time.

Same CF Access caveat as guest join: external attendees clicking the invite link
need the `/join/*` bypass (below) to get past Cloudflare Access.

## Guest join (client without a CRM login)

A broker can copy a **🔗 Guest link** on the contact. `/api/livekit/guest-link`
(authed) signs a short-lived JWT (`utils/guest-token.ts`) naming the room; the
public `/join/<token>` page redeems it at `/api/livekit/guest-token` (no auth —
trust is the signed token) for a LiveKit join token. Guests can publish +
subscribe but not record.

**Needs a Cloudflare Access bypass** — `crm.nextkey.com.au` is behind CF Access,
so external guests are blocked before Next.js runs. Add a CF Access **bypass
policy** for the paths `/join/*` and `/api/livekit/guest-token`. Until then the
code is live but guests hit the Access login wall.
