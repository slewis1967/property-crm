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

## Not built yet (deliberate)

- **Recording** — `recording_url`/`egress_id` columns exist; wiring LiveKit
  egress + storage is a follow-up.
- **Timeline UI** — events are logged; surfacing them on the contact detail
  panel (next to appointments/SMS) is a small follow-up.
- **Client-portal join** — currently the call link assumes an authed CRM user.
  A tokenised guest link for clients is a follow-up.
