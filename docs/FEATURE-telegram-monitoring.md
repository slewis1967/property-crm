# Telegram bot monitoring — `@elvsnextkey_bot` → CRM `/health`

## What this is

`elvsnextkey_bot` is not a side bot. Its token is `TELEGRAM_BOT_TOKEN` in
`/mnt/c/NEXUS-Memory/.env`, and **35 NEXUS scripts alert through it** — the
on-call agent, aggregator health, the Director/Veteran/Senior advisor chain, the
FB/IG/SEO crons, approvals. Those alerts went to Sean's phone and nowhere else.

This feature gives the CRM a record of that stream: what the bot sent, and what
Telegram refused to deliver.

## The constraint that shapes the whole design

**A Telegram bot cannot read back its own outbound messages.** `getUpdates`
returns only messages sent *to* a bot. There is no API to list what a bot has
sent. And a rejected send (bad `chat_id`, unescaped Markdown, a 429) exists only
as the HTTP response inside the sending process.

So this cannot be built by polling from the CRM. **Capture has to happen at the
send site.** That's why the data flows:

```
NEXUS script → nexus_notify.py → Telegram API
                     ↓ (tee, best-effort)
              Supabase telegram_events
                     ↓
              CRM /health (read-only)
```

The CRM never writes to `telegram_events` and there is deliberately no ingest
endpoint. NEXUS already holds `SUPABASE_SERVICE_KEY` and writes directly, the
same way `elvis_email_inbound.py` fills `email_log` and `seo_team.py` fills
`recommendation_log`. A CRM endpoint would need a second auth path — this host
is behind Cloudflare Access, which NEXUS has no service token for — for no gain.

## The bug this fixed on the way through

`elvis_telegram.send()` previously did:

```python
except Exception as e:
    print(f"[Telegram ERROR] {e}")
    return None
```

It swallowed the API response entirely. Every delivery failure since that code
was written printed to a cron log nobody reads and returned `None`, which is
indistinguishable from success to most callers. Delivery failures were already
invisible — the monitoring didn't reveal a new problem so much as make an
existing one visible.

## Pieces

| Piece | Path |
|---|---|
| Table | `migrations/20260720_telegram_events.sql` |
| Sender / tee | NEXUS `projects/nexus_notify.py` |
| Analysis (pure, tested) | `utils/telegram-health.ts` + `.test.ts` |
| Page | `app/health/page.tsx` (sidebar: **Bot Health**) |
| API | `app/api/telegram/events/route.ts` (GET only) |

## Design rule for `nexus_notify.py`

**Nothing in it may break a send.** Supabase being down, slow, or unmigrated
must never stop an alert reaching Sean and must never raise into a caller. Every
failure path degrades to a printed warning. The tee has a 5s timeout so a slow
Supabase can't stall a cron.

## Health verdict logic

A *delivery* failure outranks an alarming *message*. A critical-severity alert
that reached Sean is the system working — he knows. A send Telegram rejected
means an alert reached nobody, which is the thing this feature exists to catch.
So `ok = false` drives "critical"; message severity alone can only reach
"degraded". Asserted in `telegram-health.test.ts`.

Silence is treated as weak evidence. A healthy NEXUS is legitimately quiet for
long stretches because most senders only fire on a problem, so the staleness
threshold is a generous 24h without any successful send.

## Migration status — IMPORTANT

Only scripts routed through `nexus_notify` appear on `/health`. Anything still
calling `api.telegram.org` directly is invisible to the CRM **by construction**.

**Migrated (9):**

- `elvis_telegram.py` — the shared helper, so its 8 importers
  (`elvis_facebook`, `elvis_fhb_tracker`, `elvis_ghl_automation`,
  `elvis_instagram`, `elvis_interest_rate_agent`, `elvis_youtube_content`,
  `elvis_youtube_learning`, `elvis_youtube_pipeline`) are covered without edits
- `oncall_agent.py` — threads its own severity classification through
- `elvis_aggregator_health.py`
- `director_agent.py`
- `elvis_fb_health.py`
- `elvis_fb_token_refresh.py`
- `elvis_email_inbound.py`
- `veteran_advisor.py`
- `senior_advisor.py`

**Not yet migrated (~27)** — each still inlines its own `sendMessage`. Find them
with:

```bash
grep -rln "api.telegram.org" --include="*.py" /mnt/c/NEXUS-Memory/projects \
  | grep -v nexus_notify
```

Migrating one is mechanical: delete the hand-rolled `urlopen` body and call
`nexus_notify.notify(text, source="<script>", severity=...)`. Preserve any
`parse_mode` the original used — dropping it silently changes how the message
renders; keeping it is also what makes `parse_error` failures visible.

## Deliberate non-goals

- **No inbound polling.** `getUpdates` has a single-consumer rule: whoever calls
  second steals the updates. As of 2026-07-20 the bot has no webhook and no
  poller, so the stream is free — but wiring the CRM to it would permanently
  claim it, and would break any future OpenClaw/n8n integration on this bot.
  Liveness is derived from `telegram_events` instead, which needs no token in
  the CRM and can't conflict with anything.
- **No Claude classification yet.** Categories are derived from Telegram's own
  error codes, which are precise and free. `oncall_agent.py` already runs a
  Claude classifier for unknown *log* errors; duplicating it here would spend
  tokens re-deriving what a 400 already told us.
