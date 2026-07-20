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

## Migration status — COMPLETE

Every NEXUS script that sends to `@elvsnextkey_bot` now routes through
`nexus_notify`. **32 modules migrated**, verified by compile + import + a grep
for residual `api.telegram.org` URL construction.

To re-check after any change:

```bash
grep -rln "api.telegram.org" --include="*.py" /mnt/c/NEXUS-Memory/projects \
  | grep -vE "nexus_notify|kogan_agent"
```

That should return only `elvis_approval_handler.py` (see exceptions below).

### Two deliberate exceptions

**`elvis_approval_handler.py`** keeps its raw `api()` helper. It is the one
place in NEXUS that *consumes* the update stream — a 30s `getUpdates` long
poll. Telegram permits only one `getUpdates` consumer per bot; a second caller
gets a 409 and the two fight, silently breaking the approve/reject buttons. It
is also not a send, so there is nothing to record. Its `send()` **is**
migrated. **Do not route `api()` through `nexus_notify`.**

This daemon is also why the CRM must never poll this bot. It was dormant when
this feature was built (no lockfile, not in crontab), which is why a `getUpdates`
probe came back clean rather than 409 — that measured the daemon being *off*,
not the stream being free. Starting it after wiring CRM polling would break
approvals.

**`kogan_agent/`** is a different bot entirely — `KOGANNextKey_bot`, token
`KOGAN_TELEGRAM_BOT_TOKEN`. Routing it through `nexus_notify` would send Kogan
alerts from the NextKey bot. If you want Kogan on `/health` too, generalise
`nexus_notify` to take a token + bot label rather than pointing it at this one.

### Migration recipe (for anything new)

Delete the hand-rolled `urlopen`/`requests.post` body and call
`nexus_notify.notify(text, source="<script>", severity=...)`. Rules:

- **Preserve `parse_mode`.** Dropping it silently changes how the message
  renders; keeping it is what makes `parse_error` failures visible. Both
  Markdown and HTML fail the same way (400 "can't parse entities").
- **Check the return contract.** `nexus_notify.notify` returns the parsed
  response or `None`. `elvis_content_pipeline` needed `or {}` because its
  caller does `result.get("ok")`.
- **Use `nexus_notify.call(method, payload)`** for non-`sendMessage` methods
  or generic helpers (see `elvis_linkedin._tg_request`).
- **Delete raw-API fallbacks.** Several scripts had "try the helper, fall back
  to a direct API call" blocks. `nexus_notify` never raises, so those were
  unreachable — and being direct calls, they were the one path `/health`
  could not see.

### Note on side effects when testing

`instagram_diagnostic.py` runs its whole diagnostic at import time (no
`if __name__ == "__main__"` guard). Importing it to verify a change will hit the
Facebook API and send a real Telegram alert. Verify that one with
`py_compile` and grep instead.

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
