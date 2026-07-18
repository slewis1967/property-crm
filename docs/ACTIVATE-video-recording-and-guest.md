# Activation runbook — video recording & guest join

The CRM's video-calling code for **recording** and **guest join** is already
shipped (PR #113) but inert until two external pieces are provisioned. This is
the copy-paste runbook to turn them on. Neither can be done from the repo alone —
recording needs storage + Redis; guest join needs a Cloudflare Access change.

Reference values for NextKey:

| Thing | Value |
|-------|-------|
| SFU (Fly app) | `nextkey-livekit` → `wss://nextkey-livekit.fly.dev` |
| LiveKit API key id | `APIb5199261ab47` (the secret is a Fly secret on the SFU) |
| Supabase project ref | `jzivferpxlbegrxghqpr` |
| Supabase S3 endpoint | `https://jzivferpxlbegrxghqpr.storage.supabase.co/storage/v1/s3` |

See also `deploy/livekit/README.md` (SFU) and `deploy/livekit-egress/README.md`.

---

## A. Turn on recording

### 1. Supabase storage (dashboard, ~2 min)
1. **Storage → New bucket** → name it exactly `recordings`, set **Private** → Create.
2. **Project Settings → Storage → S3 Access Keys → New access key** → copy the
   **Access key ID** + **Secret**. Note the **Region** shown (Sydney = `ap-southeast-2`).

### 2. Provision Redis (shared by SFU + egress)
```bash
fly redis create
# name: nextkey-livekit-redis   region: syd   plan: the free / no-eviction option
# copy the connection string: redis://default:<PASSWORD>@<HOST>:<PORT>
```
LiveKit needs Redis **without eviction** — pick a plan that keeps keys.

### 3. Point the SFU at Redis  (⚠️ Redis must exist and be reachable FIRST)
Edit `deploy/livekit/livekit.yaml`, uncomment the `redis:` block, fill in
host/port/password, then:
```bash
cd deploy/livekit && fly deploy --app nextkey-livekit
```
Confirm a normal call still works before continuing — if the SFU can't reach
Redis it won't boot and live calls go down.

### 4. Deploy egress
```bash
cd deploy/livekit-egress
cp egress.yaml.example egress.yaml
# Fill in egress.yaml:
#   api_key:    APIb5199261ab47
#   api_secret: <LiveKit API secret — same one the SFU uses>
#   ws_url:     wss://nextkey-livekit.fly.dev
#   redis:      same host/password as step 2
#   s3:         access_key/secret from step 1, bucket "recordings",
#               region ap-southeast-2,
#               endpoint https://jzivferpxlbegrxghqpr.storage.supabase.co/storage/v1/s3
#               force_path_style: true

fly launch --no-deploy --copy-config --name nextkey-livekit-egress
fly secrets set EGRESS_CONFIG_BODY="$(cat egress.yaml)" --app nextkey-livekit-egress
fly deploy --app nextkey-livekit-egress
rm egress.yaml   # don't leave the secret on disk
```

### 5. Verify
Start a call → **⏺ Record** → talk → **Stop**. `fly logs --app nextkey-livekit-egress`
shows the upload; the **▶ Recording** link appears in the contact's *Video calls*
panel once the `egress_ended` webhook lands and fills `recording_url`.

**Cost:** egress runs a headless Chrome per active recording (CPU/RAM heavy —
`shared-cpu-2x` handles one, scale up for concurrent) + Redis (Upstash free tier
usually enough) + Supabase storage (existing).

---

## B. Turn on guest join (Cloudflare Access bypass)

`crm.nextkey.com.au` is behind CF Access, so external guests are blocked before
Next.js runs. Add **Bypass** applications for the two public paths. CF Access
matches the *most specific* path, so these override the domain-wide login for
just those routes.

**Cloudflare dashboard → Zero Trust → Access → Applications → Add an application
→ Self-hosted**, twice:

| Application name | Subdomain / Domain | Path | Policy |
|---|---|---|---|
| CRM guest join (page) | `crm` / `nextkey.com.au` | `join` | Action **Bypass**, Include **Everyone** |
| CRM guest token (API) | `crm` / `nextkey.com.au` | `api/livekit/guest-token` | Action **Bypass**, Include **Everyone** |

(Path `join` also covers `/join/<token>`.)

**Verify:** open a 🔗 Guest link in an incognito window (no CF session) — it should
load the call, not the Access login screen.

**Security note:** bypass means anyone with the URL reaches those two endpoints —
intended and safe. `/join` only renders a page, and `/api/livekit/guest-token`
mints a LiveKit token *only* when the URL carries a valid, unexpired,
server-signed room token (`utils/guest-token.ts`). Everything else stays behind
Access.
