#!/usr/bin/env python3
"""
Aggregator v2 — 7-day Health Check
Run from WSL or Windows (anywhere with outbound Supabase access):
    python3 scripts/aggregator_health_check.py
"""

import json
import sys
import urllib.request
import urllib.error
from collections import Counter
from datetime import datetime, timezone

SUPABASE_URL = "https://jzivferpxlbegrxghqpr.supabase.co"
SERVICE_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp6aXZmZXJweGxiZWdyeGdocXByIiwicm9sZSI"
    "6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTk5OTEzMiwiZXhwIjoyMDg3NTc1MTMyfQ"
    ".lsr1kBNHlQIi9BcK4uV_Ifral14aR40LUjUDPsPPgQo"
)
HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
}
DEPLOY_DATE = "2026-05-01T00:00:00Z"
TODAY = "2026-05-08"


# ── helpers ──────────────────────────────────────────────────────────────────

def get(path: str, params: dict | None = None) -> list:
    qs = ""
    if params:
        from urllib.parse import urlencode
        qs = "?" + urlencode(params)
    url = f"{SUPABASE_URL}/rest/v1{path}{qs}"
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"HTTP {e.code} for {url}: {body}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Request failed for {url}: {e}", file=sys.stderr)
        sys.exit(1)


def get_count(path: str, params: dict | None = None) -> int:
    """Return exact row count using Prefer: count=exact header."""
    qs = ""
    if params:
        from urllib.parse import urlencode
        qs = "?" + urlencode({**params, "select": "id", "limit": "1"})
    url = f"{SUPABASE_URL}/rest/v1{path}{qs}"
    req = urllib.request.Request(url, headers={**HEADERS, "Prefer": "count=exact"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            cr = resp.headers.get("Content-Range", "")
            # Content-Range: 0-0/149
            if "/" in cr:
                return int(cr.split("/")[1])
            return len(json.loads(resp.read()))
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"HTTP {e.code} for {url}: {body}", file=sys.stderr)
        return -1


def age_hours(ts: str) -> float:
    dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    return (datetime.now(timezone.utc) - dt).total_seconds() / 3600


def fmt_cost(v) -> str:
    try:
        return f"${float(v):.4f}"
    except (TypeError, ValueError):
        return "$0.0000"


# ── 1. ingestion_run ─────────────────────────────────────────────────────────

print("Querying ingestion_run ...", file=sys.stderr)
runs = get("/ingestion_run", {
    "select": "*",
    "started_at": f"gte.{DEPLOY_DATE}",
    "order": "started_at.desc",
    "limit": "500",
})

status_counts: Counter = Counter()
builder_stats: dict[str, dict] = {}
total_cost = 0.0
failed_errors: list[dict] = []

for r in runs:
    status_counts[r.get("status", "unknown")] += 1
    bn = r.get("builder_name") or "Unknown"
    if bn not in builder_stats:
        builder_stats[bn] = {"added": 0, "updated": 0, "withdrawn": 0, "to_review": 0, "runs": 0}
    s = builder_stats[bn]
    s["runs"] += 1
    s["added"] += r.get("props_added") or 0
    s["updated"] += r.get("props_updated") or 0
    s["withdrawn"] += r.get("props_withdrawn") or 0
    s["to_review"] += r.get("props_to_review") or 0
    total_cost += float(r.get("ai_cost_usd") or 0)
    if r.get("status") == "failed" and r.get("error"):
        failed_errors.append({"builder": bn, "started_at": r.get("started_at"), "error": r.get("error")})

# ── 2. global_stock_pool ─────────────────────────────────────────────────────

print("Querying global_stock_pool (aggregator rows) ...", file=sys.stderr)
agg_rows = get("/global_stock_pool", {
    "select": "pipeline_status,source,builder_name,suburb,lot_number,total_package_price,house_price,confidence_score",
    "or": "(source.eq.aggregator_v2,source.eq.aggregator_v2_reviewed)",
    "limit": "2000",
})

pipeline_status_counts: Counter = Counter()
hallucination_count = 0
sample_rows = []

for row in agg_rows:
    pipeline_status_counts[row.get("pipeline_status") or "null"] += 1
    no_price = (row.get("total_package_price") is None and row.get("house_price") is None)
    no_suburb = row.get("suburb") is None
    no_builder = row.get("builder_name") is None
    if no_price or no_suburb or no_builder:
        hallucination_count += 1
    if len(sample_rows) < 5:
        sample_rows.append(row)

legacy_count = get_count("/global_stock_pool", {"source": "eq.legacy_2026_04_22_import"})

# ── 3. property_review_queue ─────────────────────────────────────────────────

print("Querying property_review_queue ...", file=sys.stderr)
pending_items = get("/property_review_queue", {
    "select": "id,reasons,created_at,builder_name,confidence_score",
    "status": "eq.pending",
    "limit": "500",
})

reason_counter: Counter = Counter()
oldest_hours = 0.0

for item in pending_items:
    reasons = item.get("reasons") or []
    for r in reasons:
        reason_counter[r] += 1
    if item.get("created_at"):
        h = age_hours(item["created_at"])
        if h > oldest_hours:
            oldest_hours = h

# ── 4. property_media orphan brochures ───────────────────────────────────────

print("Querying property_media (orphan_brochure) ...", file=sys.stderr)
orphans = get("/property_media", {
    "select": "id,storage_path,created_at",
    "kind": "eq.orphan_brochure",
    "limit": "200",
})

# ── 5. builders draft=true ───────────────────────────────────────────────────

print("Querying builders (draft=true) ...", file=sys.stderr)
drafts = get("/builders", {
    "select": "canonical_name,sender_domains,created_at",
    "draft": "eq.true",
    "limit": "50",
})

# ── Report ────────────────────────────────────────────────────────────────────

total_runs = len(runs)
total_new = sum(s["added"] for s in builder_stats.values())
total_pending = len(pending_items)
weekly_cost = total_cost
monthly_proj = weekly_cost * 4.3

# TL;DR sentence
if total_runs == 0:
    tldr = "Pipeline has NOT fired since deployment — zero ingestion_run rows since 2026-05-01; check cron, Gmail OAuth, and stocklist@ inbox."
elif status_counts.get("failed", 0) == total_runs:
    tldr = f"Pipeline has fired {total_runs}x but ALL runs failed — check error details below."
elif hallucination_count > 0 or total_pending > 20:
    issues = []
    if hallucination_count > 0:
        issues.append(f"{hallucination_count} hallucinated rows")
    if total_pending > 20:
        issues.append(f"{total_pending} review-queue items pending")
    tldr = f"Pipeline active: {total_runs} runs, {total_new} new properties, but issues detected: {', '.join(issues)}."
else:
    tldr = f"Pipeline healthy: {total_runs} emails processed, {total_new} new properties added, {total_pending} review-queue items pending."

out = []
a = out.append

a(f"# Aggregator v2 — 7-day Health Check ({TODAY})")
a("")
a("## TL;DR")
a("")
a(tldr)
a("")

# ── Section 1 ─────────────────────────────────────────────────────────────────
a("## Pipeline activity")
a("")
if total_runs == 0:
    a("**Zero ingestion runs recorded since 2026-05-01.** The pipeline has not fired.")
    a("")
    a("Possible causes (in order of likelihood):")
    a("1. No builder emails have arrived at stocklist@nextkeypropertyinvest.com yet")
    a("2. Gmail filter on sean.l@ is not forwarding (check Gmail filters)")
    a("3. Cron is not running — check `/mnt/c/NEXUS-Memory/logs/aggregator_v2_cron.log`")
    a("4. Orchestrator crashing before writing the audit row — check `aggregator_v2.log`")
else:
    a(f"**{total_runs} ingestion run(s)** since 2026-05-01.")
    a("")
    a("### Status breakdown")
    a("")
    a("| Status | Count |")
    a("|--------|------:|")
    for status, count in sorted(status_counts.items()):
        a(f"| {status} | {count} |")
    a("")
    a("### Per-builder breakdown")
    a("")
    a("| Builder | Runs | +Added | ~Updated | -Withdrawn | ?Review |")
    a("|---------|-----:|-------:|---------:|-----------:|--------:|")
    for bn, s in sorted(builder_stats.items(), key=lambda x: -x[1]["runs"]):
        a(f"| {bn} | {s['runs']} | {s['added']} | {s['updated']} | {s['withdrawn']} | {s['to_review']} |")
    a("")
    if failed_errors:
        a("### Failed run errors")
        a("")
        for fe in failed_errors:
            a(f"- **{fe['builder']}** @ {fe['started_at']}: `{fe['error']}`")
        a("")
    else:
        a("No failed runs.")
        a("")

# ── Section 2 ─────────────────────────────────────────────────────────────────
a("## Property output")
a("")
total_agg = len(agg_rows)
if total_agg == 0:
    a("**Zero aggregator_v2 rows in global_stock_pool.** No properties have been written by the pipeline yet.")
else:
    a(f"**{total_agg} total aggregator-sourced rows** in global_stock_pool.")
    a("")
    a("### Counts by pipeline_status")
    a("")
    a("| pipeline_status | Count |")
    a("|-----------------|------:|")
    for ps, cnt in sorted(pipeline_status_counts.items()):
        a(f"| {ps} | {cnt} |")
    a("")
    a("### Sample rows (up to 5)")
    a("")
    a("| Builder | Suburb | Lot | Price | Confidence |")
    a("|---------|--------|-----|------:|-----------:|")
    for row in sample_rows:
        price = row.get("total_package_price") or row.get("house_price") or "—"
        conf = row.get("confidence_score")
        conf_str = f"{float(conf):.2f}" if conf is not None else "—"
        a(f"| {row.get('builder_name') or '—'} | {row.get('suburb') or '—'} | {row.get('lot_number') or '—'} | {price} | {conf_str} |")
    a("")
    a("### Quality / hallucination check")
    a("")
    if hallucination_count == 0:
        a("No rows with missing price+suburb or missing builder_name. Extraction quality looks good.")
    else:
        a(f"**{hallucination_count} row(s) with missing critical fields** (no price AND/OR no suburb AND/OR no builder_name). Flag as potential hallucinations.")
        a("")
        a("Recommended action: raise `THRESH_AUTO` in `nextkey_aggregator.py` from 0.75 → 0.80, and set `pipeline_status='archived'` on affected rows.")
    a("")

if legacy_count >= 0:
    a(f"**Legacy rows remaining:** {legacy_count} rows still have `source='legacy_2026_04_22_import'`.")
    if total_agg > 0:
        a("These should decrease over time as new builder stocklists supersede them.")
    else:
        a("No aggregator_v2 data has landed yet to supersede them.")
else:
    a("_(Could not count legacy rows)_")
a("")

# ── Section 3 ─────────────────────────────────────────────────────────────────
a("## Review queue")
a("")
if total_pending == 0:
    a("Review queue is empty — no items awaiting human approval.")
else:
    oldest_days = oldest_hours / 24
    a(f"**{total_pending} item(s)** pending in property_review_queue.")
    a(f"Oldest item: **{oldest_hours:.1f} hours** ({oldest_days:.1f} days) old.")
    a("")
    if reason_counter:
        a("### Top reasons (frequency)")
        a("")
        a("| Reason | Count |")
        a("|--------|------:|")
        for reason, cnt in reason_counter.most_common(5):
            a(f"| {reason} | {cnt} |")
        a("")
    if total_pending > 20 and oldest_hours > 72:
        a(f"> **Action needed:** {total_pending} items have been waiting up to {oldest_days:.0f} days.")
        a("> Triage at `/aggregator/review` — approve or reject to prevent queue backlog.")
    elif total_pending > 20:
        a("> Queue is growing. Consider triaging at `/aggregator/review`.")
a("")

# ── Section 4 ─────────────────────────────────────────────────────────────────
a("## Orphan brochures")
a("")
if not orphans:
    a("No orphan brochures — property_media has no unlinked `kind='orphan_brochure'` rows. Matching logic is working correctly.")
else:
    a(f"**{len(orphans)} orphan brochure(s)** awaiting property linkage:")
    a("")
    a("| storage_path | Created |")
    a("|-------------|---------|")
    for o in orphans[:20]:
        created = (o.get("created_at") or "")[:16]
        a(f"| `{o.get('storage_path', '—')}` | {created} |")
    if len(orphans) > 20:
        a(f"_(+ {len(orphans) - 20} more)_")
    a("")
    if len(orphans) > 10:
        a("> High orphan count may indicate the vision-match / brochure-linking step is misfiring.")
        a("> Check `nextkey_aggregator.py` brochure matching logic.")
a("")

# ── Section 5 ─────────────────────────────────────────────────────────────────
a("## Builder drafts awaiting confirmation")
a("")
if not drafts:
    a("No draft builders — all detected sender domains have been confirmed.")
else:
    a(f"**{len(drafts)} draft builder(s)** need confirmation at `/aggregator/builders`:")
    a("")
    a("| Canonical name (draft) | Sender domains | First seen |")
    a("|------------------------|----------------|------------|")
    for d in drafts:
        domains = ", ".join(d.get("sender_domains") or []) or "_(none detected)_"
        first = (d.get("created_at") or "")[:10]
        a(f"| {d.get('canonical_name', '—')} | {domains} | {first} |")
    a("")
    a("Go to `/aggregator/builders`, click each DRAFT row, confirm the canonical name and sender domains, then save.")
a("")

# ── Section 6 (cost) ─────────────────────────────────────────────────────────
a("## Cost")
a("")
a(f"7-day AI spend: **${weekly_cost:.4f}** | Projected monthly: **${monthly_proj:.2f}**")
a("")
if total_runs > 0:
    avg_per_run = weekly_cost / total_runs
    a(f"Average per run: ${avg_per_run:.4f}  (expected: $0.05–$0.15 per runbook)")
    if avg_per_run > 0.20:
        a(f"> **Above-normal cost per run** (${avg_per_run:.4f} > $0.15). Check if large PDF attachments or Drive folders are inflating token counts.")
a("")
a("Manual check required: [console.anthropic.com/settings/billing](https://console.anthropic.com/settings/billing)")
a("Confirm Anthropic credit balance > $5. If near zero, the pipeline will silently fail on next run.")
a("")

# ── Recommendations ───────────────────────────────────────────────────────────
a("## Recommendations")
a("")
recs = []

if total_runs == 0:
    recs.append("**Pipeline has not fired** — check the cron job and stocklist@ inbox before anything else. Run `tail -50 /mnt/c/NEXUS-Memory/logs/aggregator_v2_cron.log` from WSL.")

if failed_errors:
    recs.append(f"**{len(failed_errors)} failed run(s)** — review error messages above. Common causes: expired Gmail OAuth, Supabase RLS, low Anthropic credit.")

if hallucination_count > 0:
    recs.append(f"**Raise THRESH_AUTO** from 0.75 → 0.80 in `nextkey_aggregator.py` — {hallucination_count} row(s) with missing critical fields detected. Also set `pipeline_status='archived'` on affected rows via `/aggregator/review`.")

if total_pending > 20 and oldest_hours > 72:
    recs.append(f"**Triage review queue** — {total_pending} items waiting up to {oldest_hours/24:.0f} days. Visit `/aggregator/review` to approve or reject.")

if drafts:
    draft_names = ", ".join(d.get("canonical_name", "?") for d in drafts)
    recs.append(f"**Confirm builder drafts** at `/aggregator/builders`: {draft_names}.")

if len(orphans) > 10:
    recs.append(f"**{len(orphans)} orphan brochures** — inspect brochure-matching logic in `nextkey_aggregator.py`.")

if not recs:
    recs.append("No action needed — pipeline is operating within expected parameters.")

for i, rec in enumerate(recs, 1):
    a(f"{i}. {rec}")

a("")
a("---")
a(f"_Report generated: {TODAY} | Source: Supabase live query_")

print("\n".join(out))
