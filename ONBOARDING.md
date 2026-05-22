# NextKey CRM + NEXUS — Operator Handover

**Audience:** Hermes (multi-agent operator taking over production).
**Owner:** Sean Lewis, Co-Director, NextKey Property Strategists (Currumbin Waters, QLD, Australia).
**Business:** House-and-land package advisory, $800K+ packages, NSW/QLD/VIC/WA/ACT/Bali. Revenue = builder commission + buyer advisory fee. Buyer segments: first-home buyers, investors, SMSF, downsizers.
**Last updated:** 2026-05-22.

> Read this end-to-end before touching anything. The "Operational rules that will bite you" and "AU compliance guardrails" sections are non-negotiable. Several gotchas here have already cost real incidents.

---

## 1. The two systems

| System | Repo | Stack | Hosting | Role |
|---|---|---|---|---|
| **Property CRM** | `slewis1967/property-crm` | Next.js 15 (App Router, Turbopack), TypeScript | **Netlify** (auto-deploy on push to `master`), fronted by **Cloudflare Access** | The user-facing app: properties, contacts, opportunities, inbox, broadcasts, voice assistant |
| **NEXUS** ("Elvis") | `slewis1967/nextkey-nexus` | Python | **Fly.io** app `nextkey-nexus-api` (region `syd`) | Autonomous backend: lead scoring, email sync, sequence runner, aggregator, on-call agent, Flask API |

They are coupled: the CRM's **opportunities/leads come from the NEXUS Flask API** (DuckDB-backed), not from Supabase. Almost everything else (properties, contacts, tasks, appointments, email_log) is **Supabase**.

Local paths (Sean's machine, WSL2 Ubuntu on Windows 11):
- CRM: `/mnt/c/Users/Seans GP/property-crm/` (Windows: `C:\Users\Seans GP\property-crm`)
- NEXUS: `/mnt/c/NEXUS-Memory/` — has its own `CLAUDE.md`, read it.

---

## 2. Property CRM — architecture

Authoritative architecture detail lives in `CLAUDE.md` at the repo root — **read it**. Highlights:

- **Data source:** Supabase. Server components fetch via `utils/supabase.ts` (service-key client, **server-only — never import into a `"use client"` component**; the key isn't in the browser bundle and it bypasses RLS).
- **Opportunities** (`/opportunities`, `/opportunities/[id]`) are proxied from NEXUS via `utils/nexus-api.ts` → `NEXUS_API_BASE` (defaults `http://localhost:8765`; prod points at the Fly tunnel with a Cloudflare Access service token).
- **Outbound email:** Brevo (`utils/brevo.ts`, v3 REST API).
- **Outbound SMS:** ClickSend.
- **Inbound email:** synced by NEXUS `elvis_email_inbound.py` (cron) into Supabase `email_log`; CRM `/inbox` reads that.
- **AI:** Anthropic (voice assistant Haiku loop in `app/api/voice/converse`, broadcast compliance review in `utils/compliance-review.ts`, the `app/api/ai/*` brief routes).
- **Calendar:** Google OAuth (`utils/google-oauth.ts`); refresh tokens in Supabase `calendar_credentials`. **Currently NOT provisioned** — see Known Issues.
- **Auth:** Cloudflare Access JWT, enforced in `proxy.ts` (compiled to a Netlify Edge Function). `requireAuth()` / `userEmailFromRequest()` in `utils/cf-access.ts`.

Key features added recently (this session):
- **New Opportunity modal** (`app/opportunities/NewOpportunityModal.tsx`) has optional "+ Schedule appointment" and "+ Schedule task" sections.
- **Opportunity detail page** (`app/opportunities/[id]/`) has "📅 Schedule meeting" (now writes to Google Cal **and** Supabase `appointments` via `/api/appointments`) and "✅ Add task".
- **`/compare`** property comparison page + `/api/properties/compare`.
- API routes added: `app/api/appointments/route.ts`, `app/api/tasks/route.ts`.

---

## 3. NEXUS — architecture

Read `/mnt/c/NEXUS-Memory/CLAUDE.md`. Key services (all under `/mnt/c/NEXUS-Memory/projects/`):

| Script | What | Schedule |
|---|---|---|
| `nexus_api.py` | Flask API on :8765 — serves leads/opportunities to the CRM | supervisord daemon |
| `elvis_email_inbound.py` | Gmail → Supabase `email_log` (the CRM inbox). **Now also ingests attachments.** | cron */5 |
| `elvis_email_monitor.py` | Legacy: extracts properties from emails into DuckDB | cron */15 |
| `nextkey_aggregator.py` | Stocklist PDF ingestion (Gemini → Sonnet escalation) → `global_stock_pool` + `property_review_queue` | hourly, Mon-Sat 9-7 Sydney |
| `sequence_runner.py` | Outbound email/SMS sequence engine (Brevo/Twilio); powers `/broadcast` | cron */5 |
| `oncall_agent.py` | Scans logs, classifies errors, Telegram alerts (Haiku for unknowns) | cron */5 |

**Deploy model is filesystem-based**: cron/supervisord run scripts directly from `/opt/projects/` in the Fly container. Editing a file + `fly deploy` ships it. There is no separate build step for the Python scripts.

---

## 4. Deploy + git workflow (BOTH repos)

### Property CRM (Netlify)
- **No deploy config in the repo.** Build settings + prod env vars live in the **Netlify dashboard** (site slug `crmnex`). The `.netlify/` dir is gitignored build output. There is no `netlify.toml` at repo root, no GitHub Actions, no Vercel/Wrangler — this is normal.
- **Shipping = merge to `master`.** Netlify's GitHub app auto-builds on push and builds a **deploy preview** per PR.
- **`master` is branch-protected** (ruleset): PR required (0 approvals), **`netlify/crmnex/deploy-preview` status check must pass**, **linear history** (squash/rebase only — no merge commits), no force-push, no deletion.
  - ⚠️ Only require the **`netlify/crmnex/deploy-preview`** check. The bare **`netlify`** check name never posts → hangs every PR forever in "Expected". (Already hit once.)
- **Merge via Squash** (the only sane option under linear-history).
- **Cloudflare Access** (`nextkeycrm.cloudflareaccess.com`) is the auth gate in front of the Netlify origin — it hosts nothing.

### NEXUS (Fly.io)
- **No branch protection.** History shows direct-to-master pushes.
- **The remote URL has a GitHub PAT embedded** → `git push` works from anywhere (including WSL). (Security smell; Sean has chosen not to rotate.)
- **`flyctl secrets set/import` re-rolls the LAST-released image — it does NOT rebuild from current code.** To ship new code you must `flyctl deploy`. To check what's actually deployed, decode the ULID in `flyctl status`'s image tag (first 10 chars = Crockford-base32 ms-since-epoch).
- Fly app: `nextkey-nexus-api`, region `syd`, public `nextkey-nexus-api.fly.dev` (gated by CF Access at the edge; `/health` is open).

---

## 5. Operational rules that will bite you

1. **WSL / Turbopack file-watch is broken.** After editing a CRM file from WSL, `next dev` won't hot-reload — you must restart `next dev` **from a Windows terminal** (`cd "C:\Users\Seans GP\property-crm" && npm run dev`). Symptom: correct source, stale runtime behaviour.
2. **`AUTH_MODE` in `.env.local` must be `local`** for local dev or the CF Access gate blocks the browser with *"Unauthenticated — this CRM is only reachable through the NextKey Cloudflare tunnel."* Production stays `tunnel` (Netlify dashboard) and fail-closes regardless.
3. **Verify with `next build`, not just `tsc`.** RSC-boundary errors (missing `"use client"`, importing the server Supabase client into a client component) are build-time-only. `tsc --noEmit` will pass while the build fails. This caused the `8a24cad` incident (a feature commit truncated `PropertyGrid.tsx` and was never built).
4. **Pushing the property-crm repo requires GitHub auth** that a sandboxed/WSL agent may not have (`gh` absent, no credential helper, no SSH key). If push fails, hand the exact commands to Sean's Windows terminal. **NEXUS pushes work** (PAT in remote URL).
5. **Long shell commands wrap in Sean's terminal and silently break** (newline inserted mid-string/mid-flag). Keep commands < ~90 chars per line or use a variable / heredoc.

---

## 6. Secrets + environment

- CRM: `/mnt/c/Users/Seans GP/property-crm/.env.local` (gitignored). Documented template: `.env.example` (committed). Prod values live in the **Netlify dashboard**.
- NEXUS: `/mnt/c/NEXUS-Memory/.env`. Prod values are **Fly secrets** (`flyctl secrets list -a nextkey-nexus-api`).

**Secret gotchas already hit:**
- **Brevo** key must be the **`xkeysib-`** v3 API key (Brevo dashboard → SMTP & API → **API Keys** tab). The SMTP-tab **`xsmtpsib-`** key returns `401` against the v3 API used by `utils/brevo.ts`.
- **Gmail inbound** needs `GMAIL_INBOUND_CLIENT_ID/SECRET/REFRESH_TOKEN` (Sean's mailbox) — **distinct** from `GMAIL_*` (the stocklist mailbox for the aggregator). These were missing from Fly secrets and that's why inbox sync silently died May 7→20. They're in NEXUS `.env`; sync them with `grep "^GMAIL_INBOUND_" .env | flyctl secrets import -a nextkey-nexus-api`.
- `BROADCAST_REVIEW_SECRET` (CRM) — set to a dedicated random value so it doesn't fall back to `SUPABASE_SERVICE_KEY` for HMAC signing.
- Supabase keys are the **new** `sb_publishable_` / `sb_secret_` format (not legacy JWT). Service key bypasses RLS — treat as god-mode.

**Do not paste production secrets into agent chat transcripts** — they transit to the model provider. Edit `.env` files directly or use `flyctl secrets`. (Sean's standing preference: state the risk once, then proceed if he says so.)

---

## 7. Supabase schema quirks (these have caused bugs)

- **`tasks`** uses **`created_at`**, NOT `date_added`. (`date_added` is the `ghl_archive_tasks` convention.) Columns: `id, contact_id, title, body, due_date, completed, source, created_at, updated_at`. A few `app/api/ai/*` routes still SELECT `date_added` from `tasks` and silently return nothing — clean up if you touch them.
- **`appointments`** has **two parallel column conventions** that different read paths use:
  - `title` + `appointment_status` — read by `/appointments`, contact & opp detail pages.
  - `event_title` + `status` — read by `OpportunityAppointments` (the panel under the opp summary; Cal.com-shaped).
  - **Any writer must populate BOTH** or rows go invisible to half the UI. `/api/appointments` does this correctly — mirror it.
- **`email_attachments`** shape (both inbound + outbound writers use it): `{ email_id, email_kind, filename, mime_type, size_bytes, storage_path }`. Storage bucket: **`mail-attachments`**, path layout `mail/{owner}/{draft|inbound}/{email_id}/{name}`.
- **Always verify columns before writing:** `curl "$URL/rest/v1/<table>?select=*&limit=1" -H "apikey: $KEY" -H "Authorization: Bearer $KEY"`.

---

## 8. AU compliance guardrails (HARD RULES)

Any marketing copy, email, SMS, or AI-generated text MUST conform. Enforced by `utils/compliance-review.ts` (Haiku review on `/broadcast`) and the Senior Advisor agent on the NEXUS side. The standard applies to anything any agent writes here.

- **ACL s.18 / s.29** — no misleading or deceptive conduct; no false/unsubstantiated claims (returns, capital growth, "guaranteed", etc.).
- **NCCP** — NextKey is **not** a licensed credit provider / mortgage broker. No credit assistance or specific loan recommendations.
- **Privacy Act** — handle personal info lawfully.
- **Spam Act** — every bulk email needs sender identity + physical address + functional unsubscribe (the sequence runner appends this footer). SMS needs STOP-to-opt-out.
- **QLD Property Occupations Act 2014** — NextKey is not a real estate agent.
- **Financial-planning boundary** — "general advice only"; NextKey is not a licensed financial planner / tax agent / solicitor.
- Brand defaults: primary teal `#0F4C5C`, gold accent `#FFB627`, AU English, `en-AU`.

`.claude/product-marketing-context.md` (loaded by the marketing skills) encodes the approved-phrasing table and these rules in full.

---

## 9. Known issues / outstanding work (as of 2026-05-22)

1. **Google OAuth not provisioned.** `GOOGLE_OAUTH_CLIENT_ID/SECRET` are not set. So: the opp detail "Schedule meeting" + New-Opportunity "+ Schedule appointment" flows fall back to **CRM-only** (Supabase row written, but no real Google Calendar event / invite, with a `calendar_warning` surfaced). To enable: set those env vars (CRM `.env.local` + Netlify) and connect a calendar at `/settings` → which writes `calendar_credentials`. No code change needed after that.
2. **Email attachment backfill is pending.** `elvis_email_inbound.py` now ingests attachments (committed `fede21a`, pushed) — but it's **forward-only**. Emails synced before that deploy (incl. the May-7→22 backlog) are text-only. **Verify the Fly deploy actually ran** (`flyctl deploy` from `/mnt/c/NEXUS-Memory` — `secrets import` alone doesn't ship code). A one-shot backfill that re-walks recent `email_log` rows via their stored `gmail:<id>` tag is the clean fix if Sean wants the backlog's attachments.
3. **Local property-crm `master` has diverged** (ahead 6 of origin, with leftover merge/stash artifacts `85c02ad`, `d5c3149`, `dd69daa`). origin/master is authoritative (has all PRs #2–#6). Recommend: `git fetch origin && git checkout master && git reset --hard origin/master` to clean up before further work. Confirm with Sean first (destroys local commits — but they're already on origin via the PRs).
4. **Five merged branches to delete** (local + remote): `chore/env-example-scaffold`, `feat/opp-detail-tasks-appts`, `feat/opportunity-appointment`, `fix/propertygrid-restore-8a24cad`, `fix/tasks-route-created-at`.
5. **Uncommitted local cruft to leave alone unless intentional:** `package-lock.json` (modified, never committed this session); NEXUS `projects/elvis_youtube_*.py` + `nexus_api.py` (modified) and untracked `README.md`, `duckdb/`, `meta_client.py` etc. Don't sweep these into unrelated commits.
6. **Older AI routes** (`contact-brief`, `diagnose-opportunity`, `suggest-action`) SELECT the non-existent `tasks.date_added` → silently return no task data. Low priority.

---

## 10. Command cheat-sheet

```bash
# CRM — local dev (run from WINDOWS terminal, not WSL)
cd "C:\Users\Seans GP\property-crm" && npm run dev      # port 3000 (or next free)
npx tsc --noEmit                                         # typecheck
npx next build                                           # REAL gate — run before declaring done

# CRM — ship: branch → commit → push (from Windows) → PR → wait netlify check → squash-merge
git push -u origin <branch>
# PR: https://github.com/slewis1967/property-crm/pull/new/<branch>

# NEXUS — flyctl from WSL (Windows binary)
alias flyctl="/mnt/c/Users/Seans\ GP/.fly/bin/flyctl.exe"
flyctl status  -a nextkey-nexus-api
flyctl logs    -a nextkey-nexus-api --no-tail | grep -i email_inbound
flyctl deploy  --config fly/fly.toml -a nextkey-nexus-api    # ships new Python code
flyctl secrets list -a nextkey-nexus-api                      # NB: does NOT rebuild code

# NEXUS — ship code: edit → git add <file> → commit → git push origin master → flyctl deploy

# Supabase quick query (load creds from .env.local first; don't echo the keys)
cd "/mnt/c/Users/Seans GP/property-crm" && set -a && . ./.env.local && set +a
URL="$NEXT_PUBLIC_SUPABASE_URL/rest/v1/<table>?select=*&limit=1"
curl -s "$URL" -H "apikey: $SUPABASE_SERVICE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_KEY"
```

---

## 11. Where to look first

- CRM architecture + routes + schema → `CLAUDE.md` (repo root).
- NEXUS architecture + services → `/mnt/c/NEXUS-Memory/CLAUDE.md`.
- Env var inventory → `.env.example`.
- Compliance + brand → `.claude/product-marketing-context.md`.
- Mail migration plan (Google Workspace → Postmark/Brevo) → `docs/MAIL_MIGRATION.md`.
- Aggregator runbook → `docs/AGGREGATOR_RUNBOOK.md`.

**Golden rule:** verify current state before trusting any doc (including this one). Schema, deploy timestamps, and branch state drift. Query/inspect, then act.
