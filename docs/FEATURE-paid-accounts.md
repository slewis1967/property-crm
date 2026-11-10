# Paid Accounts — register + payment-due alerts

Tracks every paid service the CRM and the business run on, and emails a single
daily digest when one needs attention. Sidebar: **System → Paid Accounts**
(`/paid-services`), with an amber badge counting accounts needing attention.

## Why it exists

The CRM depends on a dozen paid accounts (OpenRouter, Supabase, Netlify, Fly,
Brevo, ClickSend, Cloudflare, Workspace, domains…). Any one of them lapsing
takes out part of the system — an OpenRouter balance at zero silently kills every
AI feature; an expired card on Netlify or a lapsed domain takes the whole thing
down. Nothing was tracking renewal dates, so the first warning would have been an
outage.

## What counts as "needs attention"

All of it is in `utils/paid-services.ts` (pure, vitest-covered) so the panel, the
sidebar badge and the email digest can't drift apart:

| Kind | Severity | Rule |
|------|----------|------|
| `overdue` | critical | `next_due_date` is in the past |
| `due_soon` | warning (critical if ≤2 days **and** `auto_renew=false`) | due within `alert_lead_days` (default 7) |
| `trial_ending` | warning (critical once past) | `status='trial'` and `next_due_date` within the lead window |
| `card_expiring` | critical if already expired **or** it dies before `next_due_date`; warning within 60 days | from `card_expiry` (`YYYY-MM`, treated as the last day of that month — cards work through it) |
| `low_balance` | critical at ≤0, warning at ≤`low_balance_threshold` | prepaid credit accounts |
| `stale_balance` | warning if the last pull **errored**; info if merely stale (>48h) | only for rows with a `balance_source` — see *Live balance pulls* |
| `missing_billing_date` | info | active + recurring cycle but no `next_due_date` — i.e. *this account cannot be warned about* |
| `missing_cost` | info | active with no cost, so it's missing from the spend total |

`cancelled` and `paused` accounts produce nothing. `snoozed_until` (inclusive)
keeps an account visible in the panel but out of the digest.

Only **warning and critical** reach the email. `info` items are setup nags and
stay in the panel — otherwise the digest becomes noise and gets filtered.

## Live balance pulls (OpenRouter + ClickSend)

A prepaid account is the one case where a renewal date tells you nothing — the
service dies when the credit runs out, whenever that is. Both vendors expose a
readable balance, so `utils/paid-service-balances.ts` reads them instead of
relying on someone remembering:

| Source | Endpoint | Notes |
|--------|----------|-------|
| `openrouter` | `GET /api/v1/credits`, bearer `OPENROUTER_API_KEY` | Returns `total_credits` + `total_usage`; **remaining is the difference**, the API doesn't give it directly. USD. Deliberately NOT `/auth/key`, which reports usage for the calling key only — with more than one key in play it under-reports and would show a comfortable balance on a nearly-dry account. |
| `clicksend` | `GET /v3/account`, basic auth `CLICKSEND_USERNAME:CLICKSEND_API_KEY` | `data.balance` is a **string**; currency from `data._currency.currency_name_short`. Carries `auto_recharge` into meta — an account with it OFF is the one that can run out mid-send. |

- Driven by `paid_services.balance_source`, **not** by matching the service name,
  so renaming a row in the panel can't silently stop the pull.
- Runs at the start of the daily sweep (so the digest reasons about live numbers)
  and on demand via **Refresh balances** in the panel → `POST
  /api/paid-services/balances`. Read-only against the vendors: it reads a
  balance, it never spends or tops up.
- One fetch per distinct source, not per row.
- **A failed read never zeroes the balance** — that would fire a bogus "balance
  empty" critical. It stamps `balance_check_error` + `balance_checked_at`, leaves
  the last known figure visible, and the failure itself becomes a `stale_balance`
  warning: if the balance can't be read, the low-balance alert can't fire, so the
  broken pull has to be the alert.
- The parsers are pure and pinned by tests against **verbatim live payload
  captures** (`paid-service-balances.test.ts`), so a vendor contract change fails
  loudly instead of writing `NaN` over the balance an alert depends on.

Adding a third source: add it to `BALANCE_SOURCES` in `utils/paid-services.ts`
(it lives in the pure module because the client panel needs the list, and the
fetcher module imports the server-only Supabase client), write a parser + fetcher
in `paid-service-balances.ts`, and add it to `FETCHERS`.

## Alerting

- One digest per Brisbane day, listing everything that needs attention — not one
  email per problem. Silent when nothing is wrong (an "all good" email trains you
  to ignore the sender).
- **Civil hours only** (07:00–19:00 Brisbane) for the automatic send. `job=all` on
  the 2-hourly client sweep also runs this job, and the Brisbane day rolls over at
  14:00 UTC — so without a window the first sweep after the rollover claims the
  day's one digest and the email lands at 00:30 or 05:39 Brisbane. Outside the
  window the run holds (and logs that it held); the next in-window run sends, so
  nothing is lost. "Send digest now" ignores the window.
- **Gated**: nothing sends unless `PAID_ALERTS_ENABLED=true`. Until then every run
  is a dry run that records what it *would* have sent. Recipient is
  `PAID_ALERTS_TO` (falls back to `OWNER_EMAIL`, then `sean.l@nextkey.com.au`).
  The request body can't redirect it.
- **"Send digest now"** in the panel is an authenticated operator action and
  deliberately overrides both the gate and the once-a-day dedupe.
- Sent via Brevo (`utils/brevo.ts`), same as the other CRM mail.

### Schedule

`.github/workflows/paid-account-alerts.yml` — daily at 21:00 UTC (07:00
Brisbane), hitting `POST /api/cron/run?job=accounts` on the Netlify origin with
`Authorization: Bearer $CRON_SECRET`. Separate workflow from `crm-sweeps.yml` so
it lands at a predictable hour and doesn't queue behind the AI-heavy YLA/reminder
sweeps. `job=all` includes it too.

Netlify scheduled functions are NOT used — they stopped executing, which is why
the external-cron pattern exists (see PR #164).

### The dead-checker problem

A payment alerter you trust but that has silently stopped running is worse than
none. Every run — dry, empty, or real — writes a `kind='run'` heartbeat to
`paid_service_alerts`, and the panel shows **"Daily check: last ran X ago"**, or a
warning when it has never reported in. Same failure mode as the YLA sweep that
looked healthy while returning zero for weeks.

## Files

| File | Role |
|------|------|
| `migrations/20260725_paid_services.sql` | `paid_services` + `paid_service_alerts`, plus a seed of the ~18 services we actually use (costs/dates left NULL on purpose) |
| `utils/paid-services.ts` | types, the attention rules, spend maths, date helpers (pure) |
| `utils/paid-services.test.ts` | vitest — 30 cases over the rules and the date arithmetic |
| `utils/paid-service-alerts.ts` | the sweep: assess → dedupe → Brevo digest → log |
| `app/api/paid-services/route.ts` | GET register + computed attention/summary; POST create |
| `app/api/paid-services/[id]/route.ts` | PATCH (edit, `action:"mark_paid"`, `action:"snooze"`), DELETE |
| `app/api/paid-services/alerts/route.ts` | GET dry-run preview, POST send now |
| `app/paid-services/*` | the panel |
| `app/api/cron/run/route.ts` | `job=accounts` |

## Setup (in order)

1. Run `migrations/20260725_paid_services.sql` in the Supabase SQL editor. Until
   then the panel shows a "storage not set up" notice, the API returns an empty
   register, and the sweep reports skipped — nothing crashes, but nothing works
   either.
2. Open `/paid-services` and fill in the seeded rows: **cost, billing cycle, next
   due date, payment method, card expiry**. Accounts with no due date can't be
   alerted on, and the panel lists them as such.
3. OpenRouter and ClickSend balances arrive automatically (seeded with
   `balance_source` + starting thresholds of USD 40 / AUD 20 — tune in the panel).
   Any other prepaid account (e.g. Higgsfield credits) is manual: set
   `balance_remaining` + `low_balance_threshold` by hand.
4. Set `PAID_ALERTS_ENABLED=true` (and optionally `PAID_ALERTS_TO`) in the Netlify
   env once the dates are in.
5. Confirm the schedule ran: the panel's "Daily check" line should show a recent
   timestamp within a day.

## Deliberate limits

- **Renewal dates and amounts are manual.** Only the two prepaid *balances* are
  read live; no vendor here exposes "your next invoice is due on X". A date is
  only as good as the last person to update it, so `Mark paid` rolls
  `next_due_date` forward by the cycle (from the scheduled date, so a late
  payment doesn't move the anniversary) to keep it current with one click.
- **No FX conversion.** Spend is totalled per currency; a USD row is never
  silently added to an AUD total.
- **No credentials.** `payment_method` is a label ("Amex ••1234"), `account_ref`
  is an identifier. Card numbers and passwords must never go in here.
- Email only. Telegram (`@elvsnextkey_bot`) would be a reasonable second channel
  — the sender is Python-side in NEXUS (`nexus_notify.py`), so it wasn't wired in.
