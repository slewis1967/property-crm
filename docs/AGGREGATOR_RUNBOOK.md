# NextKey Aggregator v2 — Runbook

Last updated: 2026-05-01

The aggregator ingests property stocklists from builder emails into the CRM.
This document covers how to operate it, debug failures, and add new builders.

## Architecture (one-pager)

```
Builder email → sean.l@nextkey.com.au
        ↓ Gmail filter (auto-forward on subject/sender keywords)
stocklist@nextkeypropertyinvest.com (dedicated mailbox)
        ↓ cron */15 min
/mnt/c/NEXUS-Memory/projects/nextkey_aggregator.py
        ↓
  ┌─────────────────────────────────────────────┐
  │  1. Fetch unprocessed emails (idempotent     │
  │     via ingestion_run.email_id)              │
  │  2. Resolve builder (auto-detect from sender │
  │     domain or original-sender of forwards)   │
  │  3. Collect artifacts:                       │
  │       • body (text + HTML)                   │
  │       • attachments (xlsx, pdf, csv, images) │
  │       • cloud links (Dropbox/Drive folders   │
  │         + recursive PDF link following)      │
  │  4. Classify each (Claude Haiku 4.5):        │
  │     stocklist | brochure | noise             │
  │  5. Extract properties from stocklists       │
  │     with confidence scoring                  │
  │  6. Confidence gate:                         │
  │     ≥ 0.75 → auto-publish                    │
  │     0.5-0.75 → publish as pending_review     │
  │     < 0.5 → property_review_queue            │
  │  7. Per-builder merge:                       │
  │     match by (builder, estate, lot)          │
  │     update existing OR insert new            │
  │     properties not in this run → withdrawn   │
  │  8. Process brochures (vision-match to       │
  │     property, upload media to Storage)       │
  │  9. Telegram digest + audit row              │
  └─────────────────────────────────────────────┘
        ↓
  Supabase tables:
    global_stock_pool (the CRM /properties grid)
    property_media (floor plans, facades, brochure PDFs)
    property_review_queue (low-confidence items)
    ingestion_run (per-email audit)
    builders (auto-detected, editable in /aggregator/builders)
```

## Daily operations

### CRM pages

- **`/properties`** — main grid, shows `pipeline_status='active'` rows. Yellow badge for `pending_review`.
- **`/aggregator/review`** — items needing approval. Edit + Approve / Reject.
- **`/aggregator/runs`** — recent ingestion runs with cost + counts.
- **`/aggregator/builders`** — list of auto-detected builders. Confirm drafts, edit aliases.

### Telegram alerts

- 📥 **per-run digest** when a builder email is processed:
  `+12 added, ~5 updated, -3 withdrawn, 1 review` from {builder}
- 🆕 **new builder draft** when an unrecognised sender appears
- 🚨 **pipeline stalled** daily 9am AEST if no ingestion in 48h (separate `elvis_aggregator_health.py` cron)

### Adding a new builder

The aggregator auto-creates a draft builder on first sighting (sender domain resolution, or extracted from forwarded-email body). You'll get a Telegram alert.

To finalize:
1. Open `/aggregator/builders`
2. Click the row marked **DRAFT — needs review**
3. Set canonical name (drop the " (draft)" suffix)
4. Add aliases (other names this builder uses, e.g. "SPM" alongside "Select Project Marketing")
5. Confirm sender domains
6. Save

Future emails from those domains route to this canonical builder.

### Reviewing low-confidence extractions

When Claude can't be sure (price missing, ambiguous lot number, atypical layout), the property goes to `/aggregator/review`. The CRM shows:

- Confidence percentage
- Reasons (e.g., "no suburb", "no price information")
- Editable form with all 19 property fields
- Raw AI extraction (read-only, for debugging)

Click **Approve & publish** to send to `/properties` with `pipeline_status='active'`.
Click **Reject** to discard with a reason recorded.

## Debugging

### "Pipeline stalled" alert fired

Run the health check manually:
```
ssh into the host running NEXUS, then:
/mnt/c/NEXUS-Memory/venv/bin/python3 /mnt/c/NEXUS-Memory/projects/elvis_aggregator_health.py
```

This checks:
1. Last `email_monitor_log` 'processed' timestamp (in DuckDB, not Supabase)
2. Last `global_stock_pool.updated_at` in Supabase
3. Last `propmarket_listings.scraped_at` in DuckDB

If `global_stock_pool` is stale but emails are arriving in stocklist@:
1. Check `/mnt/c/NEXUS-Memory/logs/aggregator_v2_cron.log` for errors
2. Check `/aggregator/runs` — failed runs show error in the table
3. Common causes: Anthropic credit balance low (top up at console.anthropic.com), Supabase RLS issue, expired Gmail OAuth

### A real builder email arrived but wasn't ingested

1. Check stocklist@nextkeypropertyinvest.com inbox — did the Gmail filter forward it?
2. If not in stocklist@: Sean's Gmail filter on sean.l@ doesn't match the subject/sender. Add domain to the filter.
3. If in stocklist@: check `/aggregator/runs` — should show a run for that email's id. If missing, run `nextkey_aggregator.py --email <gmail_msg_id> --dry-run` to test manually.
4. If run shows status='failed': read the `error` column for the failure reason.

### Wrong builder assigned

Forwarded emails: the aggregator extracts the original sender from the body (`From:` line in the quoted forward). If it picks the wrong one:

1. Open `/aggregator/builders` — find the bogus entry
2. Either fix sender_domains to point to the right canonical builder, or merge by deactivating the bogus one and editing the right one

### Hallucinated properties (Gemini-style false data)

This shouldn't happen — Claude Haiku 4.5 is conservative and will return `{"properties": []}` or low confidence when content is sparse. If you see hallucinations:

1. Check confidence_score on the bad row (`select * from global_stock_pool where pipeline_status != 'legacy' order by created_at desc limit 5`)
2. If confidence > 0.75 but data is bogus, raise the threshold in `nextkey_aggregator.py` (THRESH_AUTO)
3. Set `pipeline_status='archived'` on the bad row to remove from CRM

### Re-running a specific email

```
python3 /mnt/c/NEXUS-Memory/projects/nextkey_aggregator.py --email <gmail_msg_id> --dry-run
# Inspect output, if good:
python3 /mnt/c/NEXUS-Memory/projects/nextkey_aggregator.py --email <gmail_msg_id>
```

If a previous run produced bad data and you want to re-process:
```sql
delete from ingestion_run where email_id = '<gmail_msg_id>';
delete from global_stock_pool where source_email_id = '<gmail_msg_id>';
delete from property_review_queue where ingestion_run_id in (
  select id from ingestion_run where email_id = '<gmail_msg_id>'
);
```

Then re-run the orchestrator.

## Cost monitoring

Each ingestion_run row records `ai_input_tokens`, `ai_output_tokens`, `ai_cost_usd`.

`/aggregator/runs` shows totals across last 100 runs.

Expected cost: ~$0.05-0.15 per builder email (depends on attachment size + brochure count). At 10 emails/week = ~$5/week = ~$260/year.

If Anthropic credit drops to ~$5, top up at https://console.anthropic.com/settings/billing.

## File map

| Concern | Location |
|---|---|
| Orchestrator | `/mnt/c/NEXUS-Memory/projects/nextkey_aggregator.py` |
| Health check | `/mnt/c/NEXUS-Memory/projects/elvis_aggregator_health.py` |
| Cron logs | `/mnt/c/NEXUS-Memory/logs/aggregator_v2_cron.log` |
| Pipeline log | `/mnt/c/NEXUS-Memory/logs/aggregator_v2.log` |
| Health log | `/mnt/c/NEXUS-Memory/logs/aggregator_health.log` |
| Migration | `migrations/20260501_aggregator_v2.sql` |
| CRM review queue | `app/aggregator/review/` |
| CRM runs viewer | `app/aggregator/runs/` |
| CRM builders admin | `app/aggregator/builders/` |
| Review queue API | `app/api/aggregator/review-queue/` |
| Builders API | `app/api/aggregator/builders/` |

## Schema reference

### global_stock_pool extensions (added 2026-05-01)

| Column | Purpose |
|---|---|
| `pipeline_status` | active \| pending_review \| withdrawn \| sold \| legacy \| archived |
| `confidence_score` | 0-1 from Claude extraction. 1.0 if human-approved. |
| `last_seen_at` | When this property last appeared in a builder's stocklist |
| `withdrawn_at` | When property dropped off stocklist (active for 30 days then archived) |
| `source_email_id` | Gmail msg id of the email that produced this row |
| `ingestion_run_id` | FK to the run that wrote this row |
| `source` | aggregator_v2 \| aggregator_v2_reviewed \| legacy_2026_04_22_import |
| `builder_id` | FK to builders table (canonical) |

### Status lifecycle

```
new email → extract → confidence ≥ 0.75 → 'active'
                    → 0.5 ≤ conf < 0.75 → 'pending_review' (visible with badge)
                    → conf < 0.5         → review_queue → human approves → 'active'
                                                       → human rejects → discarded

active property not in next stocklist → 'withdrawn' (visible greyed for 30 days)
                                      → 30 days later → 'archived' (hidden)
```
