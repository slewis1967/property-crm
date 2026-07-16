# Self-hosted LiveKit SFU (CRM video calling)

The CRM embeds broker ↔ client video calls using **LiveKit**, self-hosted on
Fly.io. This folder deploys the media server. The CRM app (Next.js) only needs
three env vars to talk to it — see [Wiring the CRM](#wiring-the-crm).

```
Browser ──wss:// (443)──▶  LiveKit SFU (Fly)  ──webhook──▶  CRM /api/livekit/webhook
  ▲                                                              │
  └── join token ◀── CRM /api/livekit/token ◀── logs to ── video_call_events
```

## 1. Generate an API key/secret

LiveKit uses a single key/secret pair for both token minting and webhook
signing. Generate a random pair (any high-entropy strings):

```bash
# key: any short id, secret: 32+ random bytes base64
echo "API$(openssl rand -hex 6)"
openssl rand -base64 32
```

Keep these — they become `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` in the CRM
**and** `LIVEKIT_KEYS` on the server.

## 2. Deploy the server

```bash
cd deploy/livekit
fly launch --no-deploy --copy-config --name nextkey-livekit

# Dedicated IPv4 — REQUIRED for the UDP media service to work reliably.
fly ips allocate-v4

# Secrets (server side):
fly secrets set \
  LIVEKIT_KEYS="APIxxxxxx: <the-secret-from-step-1>" \
  LIVEKIT_WEBHOOK_API_KEY="APIxxxxxx"

fly deploy
```

The server is now reachable at `wss://nextkey-livekit.fly.dev` (or a custom
subdomain, e.g. `wss://rtc.nextkey.com.au` — add it via `fly certs`).

### Why a dedicated IP?

WebRTC media is UDP. Fly's **shared** IPv4 doesn't forward arbitrary UDP well;
a **dedicated** v4 (`fly ips allocate-v4`) does. Without it, calls fall back to
the TCP path (7881) which works but adds latency. Budget ~$2/mo for the IP.

## 3. Wiring the CRM

Set these in the CRM's environment (Netlify → Site settings → Environment, and
`.env.local` for dev). They are documented in the repo's `.env.example`.

| Var | Value | Exposed to browser? |
|-----|-------|---------------------|
| `NEXT_PUBLIC_LIVEKIT_URL` | `wss://nextkey-livekit.fly.dev` | ✅ yes (safe, no secret) |
| `LIVEKIT_API_KEY` | the API key from step 1 | ❌ server only |
| `LIVEKIT_API_SECRET` | the API secret from step 1 | ❌ server only |

Then apply the DB migration once:

```bash
psql "$SUPABASE_DB_URL" -f migrations/20260716_video_call_events.sql
```

## 4. Verify

1. Open `https://crm.nextkey.com.au/video/test-room` in two browsers → both
   should join and see each other.
2. Leave the call → a `room_finished` row appears in `video_call_events`.
3. From a contact page, the **🎥 Video call** button opens
   `/video/contact-<id>` and logs against that contact.

## Scaling notes

- One `shared-cpu-2x` handles a handful of concurrent small calls. Media is
  CPU/bandwidth bound — scale the VM or add regions (`fly scale`) as usage grows.
- For large webinars, enable LiveKit's distributed mode (multiple nodes + Redis).
- Recording (egress) needs the LiveKit **egress** service — add it later if you
  want call recordings written to storage; the `recording_url` column is ready.
