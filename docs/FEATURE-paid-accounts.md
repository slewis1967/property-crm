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
| `missing_billing_date` | info | active + recurring cycle but no `next_due_date` — i.e. *this account cannot be warned about* |
| `missing_cost` | info | active with no cost, so it's missing from the spend total |

`cancelled` and `paused` accounts produce nothing. `snoozed_until` (inclusive)
keeps an account visible in the panel but out of the digest.

Only **warning and critical** reach the email. `info` items are setup nags and
stay in the panel — otherwise the digest becomes noise and gets filtered.

## Alerting

- One digest per Brisbane day, listing everything that needs attention — not one
  email per problem. Silent when nothing is wrong (an "all good" email trains you
  to ignore the sender).
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
3. For prepaid accounts (OpenRouter, ClickSend, Higgsfield) set
   `balance_remaining` + `low_balance_threshold`. These are manual — nothing reads
   the vendors' APIs.
4. Set `PAID_ALERTS_ENABLED=true` (and optionally `PAID_ALERTS_TO`) in the Netlify
   env once the dates are in.
5. Confirm the schedule ran: the panel's "Daily check" line should show a recent
   timestamp within a day.

## Deliberate limits

- **Nothing reads the vendors' billing systems.** A date is only as good as the
  last person to update it. `Mark paid` rolls `next_due_date` forward by the
  cycle (from the scheduled date, so a late payment doesn't move the
  anniversary), which keeps it current with one click.
- **No FX conversion.** Spend is totalled per currency; a USD row is never
  silently added to an AUD total.
- **No credentials.** `payment_method` is a label ("Amex ••1234"), `account_ref`
  is an identifier. Card numbers and passwords must never go in here.
- Email only. Telegram (`@elvsnextkey_bot`) would be a reasonable second channel
  — the sender is Python-side in NEXUS (`nexus_notify.py`), so it wasn't wired in.
