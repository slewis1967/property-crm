# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## WHAT THIS IS
Next.js 15 property CRM for NextKey Property Strategists. Displays and manages property listings from Supabase. Runs on port 3000.

## CRITICAL: WSL / TURBOPACK FILE-WATCH ISSUE
Turbopack's file watcher does not detect changes made from WSL. **After editing any CRM file from WSL, you must restart `next dev` from the Windows terminal** — otherwise the browser serves stale compiled chunks. The symptom is correct source code but wrong runtime behaviour (old field names, missing UI changes).

To restart from WSL, ask the user to run in their Windows terminal:
```
cd "C:\Users\Seans GP\property-crm" && npm run dev
```
Or use the `! cmd.exe /c ...` approach if available.

## RUN COMMANDS
```bash
# Development (run from Windows terminal, NOT WSL)
npm run dev          # starts on port 3000

# Type check
npx tsc --noEmit

# Build
npm run build
```
CRM is accessed at `http://172.21.51.163:3000` from WSL browser (WSL2 host IP).

## ARCHITECTURE

### Data source
All property data comes from **Supabase `global_stock_pool`** — not DuckDB. The server component fetches directly using the Supabase client in `utils/supabase.ts`.

### Server vs Client components
- `app/properties/page.tsx` — **Server Component**: fetches Supabase data, normalises field names, passes to PropertyGrid
- `app/properties/PropertyGrid.tsx` — **Client Component** (`"use client"`): renders cards, handles War Room panel, PDF generation, delete

### Mobile / PWA shell (`app/components/AppShell.tsx`)
`app/layout.tsx` wraps every page in `AppShell` + mounts a global `VoiceAssistant`. AppShell renders the existing left sidebar at `lg`+ and collapses it to a hamburger drawer below `lg` (~1024px). The drawer auto-closes on route change (via `usePathname`) and locks body scroll while open so iOS doesn't bleed-scroll the page behind it. The sidebar JSX (with live `pendingReview` + `draftBuilders` count badges) is passed in as the `sidebar` prop so the data fetch stays at the server-layout level — AppShell itself is presentational.

PWA basics live in `public/manifest.json` + the `metadata`/`viewport` exports in `app/layout.tsx`: standalone display, theme/background `#0F4C5C` (brand teal), `en-AU`, `appleWebApp.capable`, and the favicon/android-chrome/apple-touch icon set wired through `metadata.icons`. The OG/Twitter cards are also declared there.

### Voice Assistant (`app/components/VoiceAssistant.tsx` + `app/api/voice/converse/route.ts`)
Floating push-to-talk button mounted from `layout.tsx` (so it's available on every page). The client transcribes speech and POSTs `{ transcript, history }` to `/api/voice/converse`; the route runs a `FAST`-model (Claude Haiku via OpenRouter) tool-use loop (max `MAX_TOOL_ITERATIONS = 6`) and returns `{ ok, reply, history, side_effects }`. The client speaks `reply` via `speechSynthesis` and surfaces `side_effects` as visual confirmation.

Tool inventory (MVP):
- `find_contact` — lookup by name/phone/email, returns top match (must be called before any contact-scoped tool)
- `log_call` — append a dated note to a contact (low-risk, no confirm)
- `create_task` — add to `tasks` table, optional `contact_id` + `due_date`
- `send_sms` — ClickSend, requires `confirmed=true`
- `send_email` — Brevo, requires `confirmed=true`

**Confirm-before-send rule:** `send_*` tools take a `confirmed` boolean. Claude is instructed to call with `confirmed=false` first (which only DRAFTS), then re-call with `confirmed=true` after the user says yes. The server enforces this — `confirmed=false` never actually fires. Don't bypass this server-side check; it's the only thing standing between "voice misheard 'send to mum'" and an outbound SMS.

### Broadcast — bulk email to all/tagged contacts (`app/broadcast/` + `app/api/broadcast/route.ts`)
One-off bulk email send. Reuses the existing **NEXUS sequence engine** (`/mnt/c/NEXUS-Memory/projects/sequence_runner.py`) — a broadcast is just a one-step sequence with auto-enrolment of the target audience. Compliance + unsubscribe filtering + Spam Act footer happen in the runner, not in the CRM, so the CRM-side code is small.

Two-phase POST flow on `/api/broadcast`:
1. **Phase 1 — review**: with `acknowledge_violations=false` (default), the route calls `utils/compliance-review.ts` which sends the subject + body to **Claude Haiku** with an AU-compliance system prompt (ACL s.18/29, NCCP, QLD POA 2014, Privacy Act, Spam Act, financial-planning boundary). If violations come back, the route responds `{status: "review_required", violations}` and no DB writes happen.
2. **Phase 2 — send**: with `acknowledge_violations=true` (operator ticked "send anyway"), the route writes one row to `sequences`, one to `sequence_steps` (`step_type=send_email`, `position=1`, `delay_hours=0`, `payload={subject, html_body, text_body}`), and bulk-inserts `sequence_enrollments` (500/chunk) for every eligible contact. The cron runner picks up within 5 min.

**Eligibility filter** (mirrors what the runner enforces): `contacts.email IS NOT NULL`, optional `tags @> [tag]`, exclude any `email` in `unsubscribes` where `channel IN ('email', 'all')`. Runner does its own `is_unsubscribed()` check on every send too — defence in depth, so a stale filter here can't accidentally email an opted-out contact.

**Compliance reviewer** (`utils/compliance-review.ts`) is purpose-built — does NOT call `senior_advisor.py`. Senior Advisor is a scheduled batch agent reviewing recommendations from a Veteran Advisor, not a generic copy reviewer. The reviewer here borrows Senior's AU-law lens but with a `(subject, body) → {violations: [...]}` interface tailored to broadcast copy.

**Override path**: if Phase 1 returns violations, the UI shows them in a card with a "I've read these warnings and want to send anyway" checkbox. Ticking it enables an "Override and send" button that re-POSTs with `acknowledge_violations=true`. If the review itself fails (OpenRouter/model outage), the UI offers the same override under a softer warning.

### Planning Feasibility (`app/feasibility/` + `app/api/ai/planning-feasibility/route.ts`)
AI-led, Australia-wide development-feasibility tool. The advisor describes a property + objective; the tool **interviews** them (a small batch of targeted questions, grounded in the council planning scheme via OpenRouter web search and pre-filled with best-guesses), then **generates** a comprehensive preliminary report. The route runs `orText` (`MODELS.smart`, `web:true`) over a shared `messages` transcript in two phases:
- `phase:"interview"` → returns `{ status:"questions"|"ready", understanding, questions[] }`
- `phase:"report"` → returns `{ report }` as structured JSON (`title/subtitle/meta/keyStats/sections[blocks]/disclaimer`)

`FeasibilityClient.tsx` renders the report in the **NextKey letterhead** and exports to PDF via `window.print()` with a print-isolation `@media print` block (only `#feasibility-report` is visible). The model adapts to the correct **state** planning framework (QLD RaL/code-vs-impact, NSW LEP/DA, VIC ResCode/VicSmart, etc.) and is prompted to mark unverified figures as "to be confirmed with Council" — it's preliminary planning info, **not** legal/financial/certified advice. Entry points: the **Command** sidebar link and a **Planning Feasibility** button on `/properties/[id]`.

**Auto-research + satellite (from a property).** The property-detail button deep-links `?address=…&auto=1&property=<id>`. With `auto=1` the tool skips the interview, researches everything from the address itself, and generates the report. The report phase also geocodes the address (OSM Nominatim) and fetches a current satellite tile (Esri World Imagery, keyless) which it (a) feeds to the vision model so the AI reads the actual site and (b) embeds in the report (CSP allows external `<img>`, not iframes) with a live Google Maps link. All satellite steps are best-effort — failure degrades to web-search-only.

**Persistence** (`app/api/feasibility/reports/` + `migrations/20260701_feasibility_reports.sql`). "Save to CRM" in the report toolbar POSTs the report + transcript to `feasibility_reports` (jsonb, `created_by`, optional `property_id`); the start screen lists saved reports (GET) with open/delete. The routes degrade gracefully if the table doesn't exist yet (list returns empty; save returns a "run the migration" message), so the code is safe to deploy before the SQL is applied in the Supabase editor.

### Borrower Fact Find (`app/fact-find/` + `app/api/fact-finds/` + `utils/factfind.ts`)
A digital rebuild of the seven-page paper "Generic Borrower Fact Finder Form", section for section: applicants → companies/trusts → advisors → loan required → security offered → personal financial statements → disclosures → declarations → privacy consent. Sidebar link **Fact Find** under CRM.
- `utils/factfind.ts` — the single source of truth for the document: `FactFindData` shape, enums, `emptyFactFind()`, `hydrateFactFind()` (merges a stored blob over the current template so older rows still open), `computeTotals()` (liabilities/assets/surplus/monthly commitments), `formatMoney()`, `outstandingSections()` (advisory completeness check — never blocks a save). Pure + vitest-tested (`utils/factfind.test.ts`).
- `app/api/fact-finds/route.ts` (GET list, POST create) + `app/api/fact-finds/[id]/route.ts` (GET one, PATCH, DELETE) — `requireAuth`, service-key Supabase, graceful when the table is absent. The list route selects explicit columns, never `*`, because `data` holds borrower PII (DOB, licence number, income).
- `FactFindForm.tsx` — one form; PATCH sends the whole `data` blob (the denormalised columns are re-derived server-side so they can't drift). "Export PDF" prints the form itself: an `@media print` block flattens inputs to underlined text and swaps each money `<input type=number>` for a formatted twin (`$400,000`, not `400000`), so there is no separate print view to keep in sync. The privacy notice is a scroll box on screen and is explicitly unclipped for print — without that, the page the applicant signs shows only the first screenful of a legally required notice.

**Table is `borrower_fact_finds`, NOT `fact_finds`** (`migrations/20260709_borrower_fact_finds.sql`). An unrelated `fact_finds` table already exists in this Supabase project (`lead_id` → `smart_leads.id`, `financial_data`, `verified_capacity`, `ai_verification_status`) — `create table if not exists fact_finds` would silently no-op against it and leave the feature broken.

**`factFindsTableMissing()` is deliberately narrow.** The obvious guard — testing the error message for `schema cache` or `does not exist` — also matches *column*-level errors (PGRST204 / 42703), so a schema mismatch reports itself as "run the migration" for a migration you have already run. Match the table-level codes (`42P01` / `PGRST205`) instead. Any other table-missing guard added to this repo should do the same.

### Field normalisation (in `page.tsx`)
Supabase columns are mapped to stable aliases before passing to PropertyGrid:
```ts
price_total    ← total_package_price ?? house_price
address_street ← street_address
address_suburb ← suburb
address_state  ← state
image_url      ← brochure_url
```
PropertyGrid uses both the normalised aliases AND the raw Supabase column names (e.g. `property.brochure_url` for images) — don't break either.

### API routes (`app/api/`)
- `properties/delete` — DELETE from Supabase by ID array
- `duckdb/` — queries to NEXUS DuckDB via port 8765 API
- `contacts/`, `opportunities/`, `pipelines/` — GHL CRM proxy
- `voice/converse` — voice assistant brain (Claude Haiku tool loop, see *Voice Assistant* above)
- `broadcast` — two-phase bulk-email send: Phase 1 compliance review (Haiku), Phase 2 sequence + enrolment writes (see *Broadcast* above)

### Pages
Grouped to match the sidebar in `app/layout.tsx`. Detail routes (`[id]`) sit under their parent.

**Command**
| Route | Description |
|-------|-------------|
| `/` | War Room — dashboard / landing |
| `/advisor` | Advisor view |
| `/search` | Smart Search |
| `/analytics` | Charts / stats |
| `/activity` | Activity log |
| `/pia` | PIA Modeller (Property Investment Analysis) |
| `/feasibility` | Planning Feasibility — AI-led, Australia-wide development feasibility (interview → report). Accepts `?address=` to prefill from a property |

**CRM**
| Route | Description |
|-------|-------------|
| `/opportunities` | GHL pipeline |
| `/opportunities/[id]` | Opportunity detail |
| `/leads` | Inbound leads pipeline |
| `/fact-find` | Borrower Fact Find — list of fact finds |
| `/fact-find/[id]` | Borrower Fact Find — the form (print to PDF for signing) |
| `/contacts` | GHL contacts (client-side tag filter dropdown on `ContactsClient.tsx`) |
| `/contacts/[id]` | Contact detail |
| `/appointments` | Appointments |
| `/inbox` | Email inbox |
| `/inbox/compose` | Compose / reply — thin server wrapper around `ComposeClient`; reads `?draft=` / `?reply=` from `searchParams` and passes them down |
| `/broadcast` | Bulk email composer — runs through compliance review, then writes a one-step sequence + enrolments. See *Broadcast* in ARCHITECTURE |
| `/conversations` | Conversations archive (GHL historical, read-only) |
| `/notes` | Notes archive (GHL historical, read-only) |
| `/tasks` | Tasks list |
| `/media` | Media library |

**Stock / Aggregator**
| Route | Description |
|-------|-------------|
| `/properties` | Aggregator Feed — main listing grid (PropertyGrid) |
| `/properties/[id]` | Property detail |
| `/aggregator/review` | Review queue — sidebar shows count badge from `property_review_queue` where `status='pending'` |
| `/aggregator/runs` | Ingestion runs log |
| `/aggregator/builders` | Builders list — sidebar shows count badge for `builders` where `draft=true AND active=true` (each blocks future ingestion runs from that sender) |
| `/suburbs` | Suburb Intelligence |

**System**
| Route | Description |
|-------|-------------|
| `/settings` | Settings |

**Elvis**
| Route | Description |
|-------|-------------|
| `/approvals` | Telegram approval queue |
| `/social` | Social History |
| `/sequences` | Email / SMS sequences |

**Unlisted in sidebar**
| Route | Description |
|-------|-------------|
| `/forms` | GHL archive — forms + submissions + funnels (read-only, reads `ghl_archive_forms` / `ghl_archive_form_submissions` / `ghl_archive_funnels`) |

## KEY FILES
- `utils/supabase.ts` — **server-side** Supabase client (uses `SUPABASE_SERVICE_KEY`, bypasses RLS; never import from `"use client"` components — the env var isn't in the browser bundle)
- `utils/compliance-review.ts` — Claude Haiku AU-compliance reviewer used by `/broadcast`
- `app/properties/page.tsx` — fetches global_stock_pool, normalises fields
- `app/properties/PropertyGrid.tsx` — card grid, War Room panel, PDF export, delete
- `app/broadcast/page.tsx` — broadcast audience snapshot server page
- `app/broadcast/BroadcastClient.tsx` — compose form, audience picker, violations workflow
- `app/api/broadcast/route.ts` — two-phase compliance-review-then-send handler
- `app/layout.tsx` — server-side sidebar data fetch + PWA metadata, mounts `AppShell` + `VoiceAssistant`
- `app/components/AppShell.tsx` — responsive chrome: desktop sidebar / mobile hamburger drawer
- `app/components/VoiceAssistant.tsx` — push-to-talk floating button (client)
- `app/api/voice/converse/route.ts` — Haiku tool-use loop with confirm-before-send guard
- `public/manifest.json` — PWA manifest (standalone, brand teal, AU locale, icon set)

## SUPABASE SCHEMA (`global_stock_pool` key columns)
`id`, `builder_name`, `street_address`, `suburb`, `state`, `total_package_price`, `house_price`, `bedrooms`, `bathrooms`, `car_spaces`, `land_size`, `house_size`, `status`, `brochure_url`, `category`, `created_at`, `updated_at`

## IMAGE ENRICHMENT
`brochure_url` is populated by running (from WSL):
```bash
python3 /mnt/c/NEXUS-Memory/projects/enrich_images.py
```
This scrapes PropMarket for estate images and fuzzy-matches to `builder_name`. ~7 of 149 properties currently have images; 25 builders are unmatched (not on PropMarket — came via email stocklists).

## AI PROVIDER (OpenRouter)
All server-side AI goes through **OpenRouter** (OpenAI-compatible API), via the
shared client in `utils/openrouter.ts` — not the Anthropic SDK directly. Models
are env-driven: `OPENROUTER_MODEL_SMART` (advisor text + document extraction,
default `anthropic/claude-sonnet-4`) and `OPENROUTER_MODEL_FAST` (voice loop,
compliance, deal-analyser parse/research, CSV mapping, default
`anthropic/claude-haiku-4.5`). Web search uses OpenRouter's `:online` suffix, not
Anthropic's `web_search` tool. References to "Claude Haiku/Opus" below mean the
`FAST`/`SMART` models routed through OpenRouter (the defaults are Claude, but
either can be repointed at any OpenRouter slug — e.g. `openai/gpt-4o-mini`).

## ENV VARS
Stored in `.env.local` at project root:
- `OPENROUTER_API_KEY` (required — all AI features; app fails env validation without it)
- `OPENROUTER_MODEL_SMART` / `OPENROUTER_MODEL_FAST` (optional — override default model slugs)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## MARKETING SKILLS + AU COMPLIANCE GUARDRAILS
`.claude/skills/` holds 10 curated marketing skills (copywriting,
copy-editing, cold-email, email-sequence, seo-audit, ad-creative,
page-cro, popup-cro, schema-markup, marketing-psychology) from the
public coreyhaines31/marketingskills repo, plus `web-asset-generator`
for favicons, app icons, and Open Graph card images (local Pillow,
no API cost).

`.claude/product-marketing-context.md` is loaded by every skill before
it asks the user questions. It encodes NextKey's AU compliance hard
rules (ACL s.18/s.29, NCCP, Privacy Act, Spam Act, QLD POA 2014), the
approved-phrasing table, and brand defaults (primary `#0F4C5C` teal,
gold accent `#FFB627`). Any marketing copy or asset generated in this
repo must conform — Senior Advisor flags violations on the recs side
and the same standard applies to anything Claude writes here.

`web-asset-generator` requires `pip install Pillow Pilmoji` on the
machine running Claude Code before first use.
