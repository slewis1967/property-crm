# LiveKit Egress — call recording

Records CRM video calls server-side and uploads the MP4 to storage. This is an
**optional add-on** to the SFU (`deploy/livekit/`). The CRM's Record button and
`/api/livekit/record` already ship; until egress is deployed they just return
503 ("recording unavailable"), so nothing breaks without it.

```
CRM Record btn → /api/livekit/record → SFU ⇄ Redis ⇄ Egress → Chrome composite → S3 (Supabase)
                                                                         │
   recording_url on video_call_events ◀── egress_ended webhook ◀────────┘
```

## Prerequisites (the two things only you can provision)

1. **Redis** shared by the SFU and egress. Provision once:
   ```bash
   fly redis create      # Upstash-backed; note the connection URL/password
   ```
2. **Supabase S3 storage** for the files:
   - Dashboard → Storage → **create a private bucket** named `recordings`
   - Dashboard → Project Settings → Storage → **S3 Access Keys** → generate a key
   - Note the access key id, secret, region, and the S3 endpoint
     `https://<PROJECT_REF>.storage.supabase.co/storage/v1/s3`

## 1. Point the SFU at Redis (one-time, careful)

Egress and the SFU coordinate over Redis, so the **SFU must also use it**. Edit
`deploy/livekit/livekit.yaml`, uncomment the `redis:` block, fill it in, then
redeploy the SFU:

```bash
cd deploy/livekit && fly deploy --app nextkey-livekit
```

> ⚠️ Deploy Redis FIRST. If the SFU boots with a `redis:` block it can't reach,
> it will fail to start and take live calls down. Verify Redis is reachable
> before redeploying the SFU.

## 2. Deploy egress

```bash
cd deploy/livekit-egress
cp egress.yaml.example egress.yaml     # fill in api_secret, redis, s3
fly launch --no-deploy --copy-config --name nextkey-livekit-egress
fly secrets set EGRESS_CONFIG_BODY="$(cat egress.yaml)" --app nextkey-livekit-egress
fly deploy --app nextkey-livekit-egress
rm egress.yaml                          # don't leave secrets on disk
```

## 3. Verify

1. Start a call from a contact, click **⏺ Record**, talk, then **Stop**.
2. `fly logs --app nextkey-livekit-egress` shows the egress job + upload.
3. An `egress_ended` webhook lands and the `recording_url` column on the call's
   `video_call_events` row fills in — the **▶ Recording** link then appears in the
   contact's *Video calls* panel.

## Cost / scaling

- Egress runs headless Chrome per active recording — CPU/RAM heavy. `shared-cpu-2x`
  handles one recording; use `performance-*` and/or scale for concurrent calls.
- Redis (Upstash free tier is usually enough) + Supabase storage (existing).
