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
- `search_stock` — **read-only** — search the `global_stock_pool` aggregator feed by suburb/state/price/beds/builder (no confirm)
- `list_tasks` — **read-only** — the open (`completed=false`) `tasks`, optional `due` window (today/overdue/all); no owner scoping (table has none)
- `lead_status` — **read-only** — resolve a lead by name/email against the NEXUS API (`/api/leads` + `/api/pipelines`) and report pipeline + stage
- `send_sms` — ClickSend, requires `confirmed=true`
- `send_email` — Brevo, requires `confirmed=true`

The three lookup tools (`search_stock`, `list_tasks`, `lead_status`) are read-only — they query and return data for the assistant to speak, take no `confirmed` flag, and never touch the send-confirm guard.

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

### Paid Accounts (`app/paid-services/` + `app/api/paid-services/` + `utils/paid-services.ts`)
Register of every paid service the CRM/business runs on, plus a daily email digest when one needs attention. Sidebar link **Paid Accounts** under System, badged with the count needing attention. Full write-up: `docs/FEATURE-paid-accounts.md`.
- `utils/paid-services.ts` — pure + vitest-tested (`paid-services.test.ts`): the `PaidService` shape, enums, and `attentionFor()` — the single definition of "needs attention" (overdue / due within `alert_lead_days` / trial ending / card expiring / prepaid balance low / no renewal date recorded / no cost recorded). Also `summarise()` (spend **totalled per currency** — no FX guessing) and `advanceDueDate()`.
- Dates are plain `'YYYY-MM-DD'` strings compared in **Australia/Brisbane** (`brisbaneToday()`), never `new Date(col)` vs `Date.now()` — a `date` column has no time, and UTC drift there turns "due today" into "overdue yesterday". `card_expiry` is `'YYYY-MM'` and resolves to the **last** day of that month (cards work through it).
- The rules live in that one module *because* three consumers read them — the panel, the sidebar badge (`getSidebarCounts` in `layout.tsx` reads rows and counts in code, deliberately NOT a `count(*)`, since re-expressing date arithmetic in SQL is how the badge and the email start disagreeing) and the email digest.
- `utils/paid-service-alerts.ts` — the sweep. ONE digest per Brisbane day listing everything (not one email per problem), silent when nothing is wrong, and `info`-severity items never email. Gated on `PAID_ALERTS_ENABLED=true`; recipient is env-fixed (`PAID_ALERTS_TO`), never request-supplied. Driven by `POST /api/cron/run?job=accounts` from `.github/workflows/paid-account-alerts.yml` (daily 21:00 UTC = 07:00 Brisbane), separate from `crm-sweeps.yml` so it can't queue behind the AI-heavy client sweeps.
- **Every run writes a `kind='run'` heartbeat** to `paid_service_alerts` — dry, empty or real — and the panel shows "Daily check: last ran X ago". A payment alerter you trust that has silently stopped is worse than none; this is the YLA-sweep lesson (looked healthy, returned 0 for weeks).
- Routes `app/api/paid-services/` (GET register + computed attention, POST create) / `[id]` (PATCH edit, `action:"mark_paid"` rolls the due date forward by the cycle **from the scheduled date** so a late payment doesn't shift the anniversary, `action:"snooze"`) / `alerts` (GET dry-run preview, POST send now — an authenticated operator click, so it overrides both the gate and the daily dedupe). All degrade gracefully when `migrations/20260725_paid_services.sql` hasn't been applied.
- **Live prepaid balances** (`utils/paid-service-balances.ts`): OpenRouter (`GET /api/v1/credits` — remaining is `total_credits - total_usage`, USD; NOT `/auth/key`, which only sees the calling key's usage and would under-report) and ClickSend (`GET /v3/account` — `data.balance` is a **string**, currency in `data._currency`). Driven by `paid_services.balance_source`, not by name-matching, so a rename can't stop the pull. Runs at the start of the sweep + on demand (`POST /api/paid-services/balances`). A failed read **never zeroes the balance** (that would fire a false "empty" critical) — it stamps `balance_check_error` and the failure itself becomes a `stale_balance` warning, because if the balance can't be read the low-balance alert can't fire. Parsers are pure and pinned to verbatim live payload captures in `paid-service-balances.test.ts`. `BALANCE_SOURCES` lives in `paid-services.ts` (the pure module) because the client panel needs the list and the fetcher module imports the server-only Supabase client.
- Renewal dates and amounts are manual — no vendor here exposes "next invoice due X", and the panel says so out loud. Never store card numbers or passwords here (`payment_method` is a label like "Amex ••1234").

### Borrower Fact Find (`app/fact-find/` + `app/api/fact-finds/` + `utils/factfind.ts`)
A digital rebuild of the seven-page paper "Generic Borrower Fact Finder Form", section for section: applicants → companies/trusts → advisors → loan required → security offered → personal financial statements → disclosures → declarations → privacy consent. Sidebar link **Fact Find** under CRM.
- `utils/factfind.ts` — the single source of truth for the document: `FactFindData` shape, enums, `emptyFactFind()`, `hydrateFactFind()` (merges a stored blob over the current template so older rows still open), `computeTotals()` (liabilities/assets/surplus/monthly commitments), `formatMoney()`, `outstandingSections()` (advisory completeness check — never blocks a save). Pure + vitest-tested (`utils/factfind.test.ts`).
- **Servicing fields are NOT on the paper form.** `Applicant.annual_income` / `.has_hecs` / `.hecs_balance` and `financials.servicing` (dependents, monthly living expenses) were added so the fact find can drive the borrowing-capacity engine. Anything added here must also be defaulted in `emptyFactFind()` and backfilled in `hydrateFactFind()`, or rows saved earlier will open with `undefined` and crash the form.
- `app/api/fact-finds/route.ts` (GET list, POST create) + `app/api/fact-finds/[id]/route.ts` (GET one, PATCH, DELETE) — `requireAuth`, service-key Supabase, graceful when the table is absent. The list route selects explicit columns, never `*`, because `data` holds borrower PII (DOB, licence number, income).
- `FactFindForm.tsx` — one form; PATCH sends the whole `data` blob (the denormalised columns are re-derived server-side so they can't drift). "Export PDF" prints the form itself: an `@media print` block flattens inputs to underlined text and swaps each money `<input type=number>` for a formatted twin (`$400,000`, not `400000`), so there is no separate print view to keep in sync. The privacy notice is a scroll box on screen and is explicitly unclipped for print — without that, the page the applicant signs shows only the first screenful of a legally required notice.

**Fact find → capacity bridge (`utils/factfind-capacity.ts`).** `factFindToCapacityInputs(data, overrides)` maps the document onto `CapacityInputs` and returns `{inputs, missing, notes}`; `app/fact-find/[id]/CapacityPanel.tsx` renders it (read-only, `no-print` — an indicative estimate must not appear in a signed document). It's a separate module on purpose: `utils/finance/` and `utils/factfind.ts` don't know about each other, and only the bridge depends on both. The mapping is lossy in named ways and every lossy step fails **conservatively**: a credit card's `balance` is its *limit* on this form (which is what the engine assesses); mortgages pair to owned securities **positionally**, and surplus mortgage rows become ordinary debt rather than invented properties — so they still hit servicing and DTI but earn no negative-gearing deduction. Existing mortgage rate/term aren't recorded, so 6.5% / 25yr is assumed and surfaced in `notes`. Without an applicant income the panel refuses to show a number at all (`capacityIsMeaningful`).

**Table is `borrower_fact_finds`, NOT `fact_finds`** (`migrations/20260709_borrower_fact_finds.sql`). An unrelated `fact_finds` table already exists in this Supabase project (`lead_id` → `smart_leads.id`, `financial_data`, `verified_capacity`, `ai_verification_status`) — `create table if not exists fact_finds` would silently no-op against it and leave the feature broken.

**`factFindsTableMissing()` is deliberately narrow.** The obvious guard — testing the error message for `schema cache` or `does not exist` — also matches *column*-level errors (PGRST204 / 42703), so a schema mismatch reports itself as "run the migration" for a migration you have already run. Match the table-level codes (`42P01` / `PGRST205`) instead. Any other table-missing guard added to this repo should do the same.

### AML/CTF compliance (`app/aml/` + `app/api/aml/` + `utils/aml.ts`)
Customer Due Diligence, screening and AUSTRAC reporting for the Tranche-2 real-estate AML/CTF obligations (in force **1 July 2026**). Sidebar group **Compliance**: **CDD Cases** (`/aml`), **AUSTRAC Reports** (`/aml/reports`), **Program & Enrolment** (`/aml/program`). **Not legal advice** — the field set encodes AUSTRAC's stated obligations; scope (whether NextKey is a captured reporting entity) must be confirmed with a compliance adviser.
- `utils/aml.ts` — single source of truth (pure, vitest-tested `utils/aml.test.ts`): the `AmlCaseData` CDD blob (entity-type aware: individual/company/trust/SMSF + 25%+ beneficial owners, source of funds, verification + screening summary, risk factors), the `AmlProgramData` governance/enrolment/enterprise-risk-assessment shape, the screening list vocabulary (DFAT/UN/OFAC/EU/UK HMT/PEP/adverse-media), the SMR/TTR/IFTI report model, and the pure helpers — `cddCompleteness`, `deriveRiskRating`/`needsEnhancedDd`, `reportDueDate` (business-day math: SMR 3bd / 24h terrorism, TTR & IFTI 10bd), `retentionUntil` (7-year record keeping), `hydrateAmlCase`/`hydrateProgram`, `amlTableMissing`.
- **A CDD case IS a `ComplianceDocType` (`aml_case`)** — it reuses `utils/compliance-audit.ts` for the sign-lock (terminal status **"Cleared"** = read-only until reopened) and the append-only audit trail (`compliance_document_audit`), so 7-year record keeping + history come for free. `aml_case` is deliberately excluded from the e-signature flow (`SIGN_DOC_TYPES` / `isSignDocType` stay the three signable docs); the inert `aml_case` entries in `utils/signatures.ts` `DOC_TYPE_LABEL` and `utils/sign-doc-render.ts` `TABLE` only satisfy the exhaustive `Record`.
- **Screening + verification go through a provider seam** (`utils/aml-provider.ts`, mirrors `utils/brevo.ts`): First AML when `FIRST_AML_API_KEY` is set, else a **manual** fallback that fails soft (the officer records outcomes themselves) — never blocks. A confirmed sanctions match folds back into the case as status **"Blocked"** (cease to act + consider an SMR); a potential match → **"Enhanced DD"**.
- **Tipping-off:** SMRs are stored `confidential` and flagged in the UI — never tell a client an SMR exists (criminal offence). **Lodged reports are immutable** (no edit/delete) for record keeping.
- Routes (all `requireAuth` + service key + graceful table-missing): `app/api/aml/cases/` (+`[id]`, `[id]/history`), `screenings/`, `reports/` (+`[id]`), `program/` (singleton, GET/PUT), `training/`. Table DDL: `migrations/20260715_aml.sql` (`aml_cases`, `aml_screenings`, `aml_reports`, `aml_program`, `aml_training` — RLS on/default-deny, PII in `data` jsonb, `contact_id`/`deal_id`/`lead_id` soft FKs). Also apply `migrations/20260712_compliance_audit.sql` for the audit trail.

### Expression of Interest (`app/eoi/` + `app/api/eois/` + `utils/eoi.ts`)
A digital rebuild of NextKey's two-page paper EOI (Buyer/s → Solicitor → Property → Deposit → Finance → Notes), prepopulated from property + opportunity/contact data, sent for e-signing, with a **driver's licence uploaded on the signing page**. Sidebar link **Expressions of Interest** under CRM; "Create EOI" buttons on `/properties/[id]` and the `/opportunities/[id]` doc-button row.
- `utils/eoi.ts` — single source of truth (pure, vitest-tested `utils/eoi.test.ts`): `EoiData` (buyers[] structured so each is a signer, purchasingEntity, SMSF flags, ACN/ABN, solicitor, property, deposit, finance terms, notes/broker), `EOI_TERMINAL_STATUS = "Signed"`, `emptyEoi`/`hydrateEoi`, the free-text line reconstructors (`buyerNamesLine`/`buyerEmailsLine`/`buyerMobilesLine` — the paper form has free-text lines; we store structured buyers and rebuild them for the PDF), `eoiSummary`, `eoiProposedSigners`, `eoiPrefill({property, contact, broker})`, `eoiErrMessage`/`eoisTableMissing`.
- **EOI IS a signable `ComplianceDocType` (`eoi`)** — unlike `aml_case` it has REAL entries everywhere in the sign flow: `SIGN_DOC_TYPES` + `DOC_TYPE_LABEL` (utils/signatures.ts), `TABLE` + a `loadDoc` branch (utils/sign-doc-render.ts → `renderEoiHtml` + `eoiProposedSigners`), `LOCKED_STATUS` (utils/compliance-audit.ts), the `documentLabel()` case in the signature-requests route, and the `SigningPanel` docType union. The print/PDF renderer is `utils/pdf/eoiPdf.tsx` + `app/eoi/[id]/EoiPrintDocument.tsx` (self-styled `.eoi-*`, buyer-signature table indexed by signer_index-1), mirroring the Fact Find PDF. Sending for signature reuses the whole `/api/signature-requests` + `/sign/[token]` machinery unchanged.
- **Driver's licence upload** — the public signing page (`app/sign/[token]/SignClient.tsx`) shows a licence step ONLY when `doc_type === 'eoi'`; the file is downscaled client-side and POSTed to `app/api/sign/[token]/licence/route.ts` (token-auth), stored in the private `signing-uploads` bucket, referenced on the signer's `signature_requests` row + mirrored onto the EOI. `canSign` gates on `hasLicence` for EOIs.
- **AML tie-in** — `app/api/eois/[id]/start-cdd/route.ts` (POST) creates an `aml_cases` CDD case seeded from the EOI buyer data (entity type inferred from purchasingEntity/SMSF flag, buyers → beneficial owners) and links it back via `eois.aml_case_id`; the "Start CDD from this EOI" button on the form drives it — so the licence collected at signing doubles as the CDD identity document.
- Routes via the `compliance-doc-route` factories (mirror `app/api/fact-finds/`): `app/api/eois/route.ts` (+`[id]`, `[id]/history`, `[id]/start-cdd`). Migration `migrations/20260715_eois.sql` — `eois` table (RLS default-deny, `data` jsonb, `property_id`/`opportunity_id`/`contact_id`/`deal_id`/`aml_case_id` soft FKs, `licence_file_path`), **plus it widens the `compliance_document_audit` AND `signature_requests` doc_type CHECK constraints to accept `'eoi'`, adds licence columns to `signature_requests`, and creates the `signing-uploads` bucket**. Also needs `20260712_compliance_audit.sql` + `20260713_signature_requests.sql` applied.

### Calendar & meetings — own calendar, LiveKit video, Brevo invites (`app/calendar/`, `app/api/appointments/`, `utils/ics.ts`, `utils/meeting-invite.ts`)
The CRM is its own calendar — **no Google**. Google Calendar/OAuth was removed from the meeting flow (2026-07); the `appointments` Supabase table is the system of record.
- **Scheduling** (`ScheduleMeetingModal` on an opportunity → `POST /api/appointments`): (1) mints a self-hosted **LiveKit** video link (`/join/<guest-token>`, reusing the contact's room so scheduled meetings and ad-hoc "Video call" clicks share it); (2) inserts the `appointments` row (writes BOTH column conventions — `title`+`appointment_status` AND `event_title`+`status` — so every read path sees it); (3) emails the attendee a branded invite via **Brevo** with the join link + an **.ics attachment**, so it lands in whatever calendar they use (Outlook/Apple/phone). The invite is best-effort but **reported** — a failed send never loses the booking, and the modal says the attendee wasn't notified so it can be followed up. Sender identity is brand-aware (`SchedulingHost.brand` → NextKey vs Springboard validated Brevo sender).
- **`utils/ics.ts`** — pure, dependency-free VEVENT/`METHOD:REQUEST` builder with RFC 5545 text escaping + 75-octet line folding (vitest-tested `utils/ics.test.ts`); `icsBase64()` for the Brevo inline attachment. `utils/brevo.ts` `attachments` now accepts `{name, content}` (base64 inline) in addition to `{name, url}`.
- **`GET /api/appointments?from=&to=[&contact_id=]`** — lists meetings in a date range (required, capped 100 days) for the calendar grid.
- **`/calendar`** (`CalendarClient.tsx`) — month grid + week agenda over that endpoint, prev/next/today nav, click a meeting → detail popover with the LiveKit join link. Sidebar link **Calendar** under CRM (the older list view stays at **Appointments**).

**In-house self-book (`app/book/[host]/`, `app/api/book/[host]/`, `utils/booking.ts`) — replaced the Google booking pages.** A **public** page at `/book/<host-slug>` (Sean/Glenn/Springboard, `SchedulingHost.slug`) lets a lead pick an open slot with no CRM login. `utils/booking.ts` is a pure, vitest-tested availability engine: business hours (Mon–Fri 09:00–17:00) minus the host's existing `appointments`, in **AEST/UTC+10** (QLD has no DST, so slot instants are built from `…+10:00` strings — no tz lib). `GET /api/book/<slug>` returns open days/slots; `POST` re-validates the slot against live busy times (never trusts the client), **captures the lead as a `contacts` row** (find-or-create by email), books the meeting (LiveKit link + `appointments` row), and emails the lead an invite (+.ics) and the host a heads-up. A hidden `website` **honeypot** drops bots. The opportunity page's **"Self-book link"** dropdown copies `<origin>/book/<slug>` to send the lead.
- **Public-route plumbing (mirrors the guest-video model):** `proxy.ts` `isPublicBookingRoute` exempts `/book/*` + `/api/book/*` from the CF Access gate, and `AppShell` renders `/book/*` chromeless. **Reachability also needs a Cloudflare Access *bypass* app** for `crm.nextkey.com.au/book/*` + `/api/book/*` (dashboard, same as `/join/*`) — until that's added, external leads hit the Access login wall.

### Borrowing capacity engine (`utils/finance/`)
Pure, tax-year-aware servicing model behind the War Room **Borrowing capacity** card (`app/components/WarRoomCalculators.tsx`) and the opportunity **Calculations** section. The component is a thin UI over it; all arithmetic lives here and is vitest-tested (`tax.test.ts`, `capacity.test.ts`).
- `tax.ts` — `incomeTax`/`marginalTaxRate` (bracket tables per `TaxYear`), `lito`, `medicareLevy` (**household**: singles vs family thresholds + per-child steps — never call it per applicant), `hecsRepayment` (marginal bands **plus** a flat 10%-of-total band above the top threshold), `standardDeduction`, `personalTax` (returns `netBeforeMedicare` on purpose).
- `stampDuty.ts` — `standardDuty` / `fhbDuty` / `dutyPayable` by state, moved out of the component so `capacity.ts` can net duty off the deposit without importing a client component.
- `capacity.ts` — `computeCapacity`, `assessProperty`, `autoAnnualCosts`, `solvePurchasePrice`, `negativeGearingAllowed`.

**Three tax years are live** (`TaxYear` = `2025-26 | 2026-27 | 2027-28`, default `CURRENT_TAX_YEAR`), because two reform packages are law: the lowest marginal rate steps 16c → 15c (1 Jul 2026) → 14c (1 Jul 2027); the $1,000 standard work-expense deduction starts 2026-27; and **negative gearing is limited to new builds from 1 Jul 2027**, with property held at 7:30pm AEST 12 May 2026 grandfathered. Hence `ExistingProperty.heldBeforeNgCutoff` / `.isNewBuild` and `CapacityInputs.newPropertyIsNewBuild`. Changing `taxYear` legitimately changes the answer — that is not a bug.

**Two fixed points, both deliberate.** (1) Stamp duty depends on the purchase price, which depends on the duty-reduced deposit — `solvePurchasePrice` iterates (duty's ~5% marginal rate makes it a contraction). (2) The new property's rental loss depends on its interest, which depends on the loan being solved for — `computeCapacity` iterates and reports `converged`.

**Gotchas.** A rental loss is applied as a *deduction inside `personalTax`*, not as a separate income add-back: the cash drag is already in `portfolioNetMonthly`, so adding it again would double-count. It IS added back for HELP repayment income (net investment losses), so gearing never discounts HECS. Losses are attributed to the higher earner. DTI counts *balances* (mortgages, card limits at face value, `consumerDebtBalance`) while servicing counts *repayments* — a consumer balance must move `maxLoanByDti` and leave `maxLoanByServicing` untouched. The 2026-27 Medicare thresholds aren't published yet, so 2025-26 figures are carried forward. Depreciation and capital works are not modelled, so the negative-gearing benefit is understated.

### Feedback AI pipeline (`app/feedback/` + `app/api/feedback/` + `utils/feedback*.ts`)
User-filed bugs / ideas that a triage AI + an autonomous cloud agent act on. Sidebar link **💡 Feedback & issues**.
- **Table `feedback`** — base cols in `migrations/20260714_feedback.sql`; the AI/agent cols in `migrations/20260714_feedback_ai.sql` (`ai_kind/ai_genuine/ai_severity/ai_risk_class/ai_summary/ai_analysis/ai_confidence`, `agent_stage`, `pr_url`, `plan`, `signoff*`, `agent_error`, `triaged_at/processed_at`). All routes tolerate the AI migration being absent (fall back to `FEEDBACK_COLUMNS_BASE` via `feedbackAiColumnsMissing`), so the feature keeps working before it's applied.
- **Triage** (`utils/feedback-triage.ts`, `triageFeedback`) runs on submit in `POST /api/feedback` (best-effort; failures leave the item `pending` for the routine to retry). Classifies bug/feature/other, genuine?, severity, and **`riskClass`**.
- **`agent_stage` state machine**: `pending → triaged → working → (shipped | built | awaiting_signoff | skipped | error)`. Defs + UI badges in `AGENT_STAGES` (`utils/feedback.ts`).
- **The autonomous agent is a Claude Code cloud routine** (every ~15 min) that reads the table and acts. **Hard rules the routine MUST follow:** (1) genuine low-risk **bug** → fix on a branch, run CI, and **auto-merge only if CI is green** → `shipped`. (2) **`ai_risk_class` items are NEVER auto-shipped** — anything touching auth/access/delete/payments/outbound sending is built into a PR and left `awaiting_signoff`. (3) **feature** → research + write a `plan`, set `awaiting_signoff`; on `signoff='approved'` build it into a PR (`built`), don't auto-merge. (4) not-genuine → `skipped` with the reason in `ai_analysis`. Sign-off is driven from the feedback page (Approve/Reject → `PATCH /api/feedback/[id]` `{signoff}`).

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
- `contacts/` — **Supabase directly** (`utils/supabase.ts`): `contacts/[id]` PATCH/DELETE hit the live `contacts` table; `contacts/list` merges live `contacts` with the `ghl_archive_contacts` snapshot. Not a GHL proxy.
- `opportunities/`, `pipelines/` — proxy to the **NEXUS API** (`utils/nexus-api.ts` → Flask app on `localhost:8765` / `api.nextkey.com.au`, DuckDB-backed) at `/api/leads` + `/api/pipelines`. "GHL" here is legacy naming only — GoHighLevel was decommissioned; this is NextKey's own nexus-api. (There is no separate `app/api/duckdb/` route; the DuckDB backend is reached through these proxies and the suburbs/appointments pages.)
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
| `/opportunities` | Opportunities Kanban — live leads + pipelines from the **NEXUS API** (`/api/leads`, `/api/pipelines`), plus a read-only `ghl_archive_opportunities` snapshot below the board ("GHL" = legacy naming) |
| `/opportunities/[id]` | Opportunity detail |
| `/leads` | **Lead Intake** — the inbound/AI-triage inbox over Supabase `property_leads`. One flow with `/opportunities`: a **Promote** action (`POST /api/leads/promote`) creates a NEXUS opportunity from the lead and stamps `promoted_at`/`promoted_opportunity_id` so it drops off the inbox. `/opportunities` (NEXUS DuckDB) is the working pipeline. `property_leads` is intake+triage; the NEXUS pipeline is the deal board — deliberately two layers, not merged. (`migrations/20260714_property_leads_promote.sql`; promote falls back gracefully before it's applied.) |
| `/eoi` | Expressions of Interest — list. `?property=`/`?contact=`/`?opportunity=` auto-creates a prefilled EOI and opens it |
| `/eoi/[id]` | EOI form — matches the paper EOI; send for e-signing (licence attached at signing) + "Start CDD from this EOI" |
| `/fact-find` | Borrower Fact Find — list of fact finds |
| `/fact-find/[id]` | Borrower Fact Find — the form (print to PDF for signing) |
| `/contacts` | Contacts — Supabase `contacts` (live) merged with the `ghl_archive_contacts` snapshot (client-side tag filter dropdown on `ContactsClient.tsx`) |
| `/contacts/[id]` | Contact detail |
| `/calendar` | Calendar — month/week grid over the CRM's own `appointments` table (no Google). Meetings carry a LiveKit link + emailed .ics invite. See *Calendar & meetings* |
| `/appointments` | Appointments — list view (upcoming/past/cancelled) + GHL archive |
| `/inbox` | Email inbox |
| `/inbox/compose` | Compose / reply — thin server wrapper around `ComposeClient`; reads `?draft=` / `?reply=` from `searchParams` and passes them down |
| `/broadcast` | Bulk email composer — runs through compliance review, then writes a one-step sequence + enrolments. See *Broadcast* in ARCHITECTURE |

**Archive** — read-only history from the decommissioned GoHighLevel CRM. Every
page here is sourced from a `ghl_archive_*` table and nothing writes back, which
is why they sit in their own collapsed nav group rather than in CRM. Pages that
merely READ an archive table *alongside* live data — Contacts, Opportunities,
Appointments — are live tools and stay in CRM.
| Route | Description |
|-------|-------------|
| `/conversations` | Conversations archive — read-only `ghl_archive_conversations` snapshot (a frozen GoHighLevel export, not a live GHL connection) |
| `/notes` | Notes archive — read-only `ghl_archive_notes` snapshot (new notes go via Quick Log on the contact detail page) |
| `/tasks` | Tasks archive — read-only `ghl_archive_tasks`. ⚠️ It does NOT show the LIVE `tasks` table (voice assistant, Quick Log, "Add task"): those surface on the War Room and the opportunity detail page, and have no list view of their own |
| `/media` | Media library — read-only `ghl_archive_media_files` |

**Compliance (AML/CTF)**
| Route | Description |
|-------|-------------|
| `/aml` | CDD case list + compliance-status header (enrolment / officer / notify due) |
| `/aml/[id]` | CDD case form — entity-aware identity, beneficial owners, source of funds, risk, screening, audit trail |
| `/aml/reports` | AUSTRAC SMR/TTR/IFTI reports — statutory due dates, lodgement, tipping-off warning. Sidebar badge = reports not yet lodged |
| `/aml/program` | AML/CTF program & AUSTRAC enrolment, compliance officer, enterprise risk assessment, staff training register |

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
| `/paid-services` | Paid Accounts — register of paid services + what needs attention (payment due, card expiring, prepaid balance dry). Sidebar badge = accounts needing attention. See *Paid Accounts* in ARCHITECTURE |
| `/settings` | Settings |

**Elvis**
| Route | Description |
|-------|-------------|
| `/approvals` | Telegram approval queue |
| `/social` | Social History |
| `/sequences` | Email / SMS sequences |

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
- `OPENROUTER_MODEL_EXTRACT` (optional — model for uploaded-document extraction in `/api/ai/extract-document`; defaults to `OPENROUTER_MODEL_SMART`. Set to a cheaper slug to trade contract/ID reading accuracy for cost)
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

## EMAIL SENDERS (Brevo) — validated-sender requirement
Outbound email goes through Brevo (`utils/brevo.ts` → `sendBrevoEmail`; per-identity
overrides via `utils/mailIdentities.ts`). A Brevo send is REJECTED unless the `sender`
is a *validated* sender in the Brevo account behind `BREVO_API_KEY`.
- **Signing emails** (`/api/signature-requests`, `/api/sign/[token]/complete`) send from
  the **Springboard** identity `hello@springboardhomes.com.au` (validated) — these docs go
  to Springboard leads.
- **NextKey** default sender is `sean.l@nextkey.com.au` (validated). `hello@nextkey.com.au`
  is NOT yet validated — revert the default once it is (Brevo → Senders, verify or
  authenticate the domain).
- **Netlify `BREVO_API_KEY` must match the Brevo account where those senders are validated.**
  A per-context mismatch silently fails sends (the route surfaces it as "Could not send").
