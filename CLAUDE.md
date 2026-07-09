# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## WHAT THIS IS
Next.js 15 property CRM for NextKey Property Strategists. Displays and manages property listings from Supabase. Runs on port 3000.

## CRITICAL: THIS IS A SHARED CHECKOUT — NEVER stash/reset/checkout HERE
Multiple Claude sessions work in `C:\Users\Seans GP\property-crm` at once. A
session has already **destroyed another session's uncommitted work** by running
`git stash` / `git reset --hard` / `git checkout` in this shared tree.

This is now an **enforced control, not a request.** `scripts/guard-git.sh`
installs a `git` shim that REFUSES `stash`, `reset --hard`, `checkout`,
`switch`, `restore`, and `clean -f` whenever the marker file
`.shared-checkout-guard` is present (it is, in this checkout only). You will see
a red `BLOCKED` message.

- **Need to change branches / discard / experiment?** Make your own throwaway
  worktree — the safe path is one command:
  ```bash
  bash scripts/agent-worktree.sh my-task
  # prints:  cd <scratchpad>/wt-my-task   (destructive git is fine THERE)
  ```
- **First-time activation on a machine:** `bash scripts/install-guard.sh`
- **Genuine emergency:** opt in loudly, it is logged:
  `ALLOW_DESTRUCTIVE=1 git reset --hard <ref>`

Why a shim and not a git hook: git has no pre-stash/pre-reset/pre-checkout hook,
and the only hook that fires (`reference-transaction`) fires *after* the working
tree is already clobbered — aborting it during `git stash` loses the data. The
shim is the only thing that can stop the command before it runs.

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

**Authoritative site data (`utils/planning/`).** Phase 1 of the "Archistar-style" build: instead of the AI guessing the parcel/zone from a satellite image, `resolveSite(address)` pulls verified facts from state government spatial services (ArcGIS REST) and feeds them to the model as a ground-truth block. Structure:
- `types.ts` — `SiteData` (parcel, controls, overlays, sources, coverage) + the `StateAdapter` interface.
- `arcgis.ts` — point-intersect query helper + Esri→GeoJSON + area estimator (all best-effort, never throw).
- `geocode.ts` — Nominatim address→point **and state** (state selects the adapter).
- `adapters/{nsw,vic,qld}.ts` — per-state lookups. **NSW** is full (cadastre lot 9; ePlanning feature layers zone 19 / FSR 11 / height 14 / min-lot 22 / heritage 16 → real height/FSR/min-lot). **VIC** = parcel (Vicplan `VicPlan_PropertyAndParcel/4`) + zone (`PORTAL_PlanningSchemeZones/0`); height/FSR/min-lot are scheme-text only. **QLD** = parcel + council (`LandParcelPropertyFramework/4`); no statewide zoning (per-council, Ipswich/Townsville to be wired first).
- `index.ts` — `resolveSite()` (geocode → adapter → normalised `SiteData` + `coverage` full|partial|none, cached in `parcel_lookups`) and `siteToPromptBlock()` (renders the verified-facts block the AI must not contradict).

Wired into `app/api/ai/planning-feasibility/route.ts` (both phases: grounds interview questions AND the report; the report response also returns `report.siteData`). Exposed standalone at `GET /api/planning/site?address=…` for the future site map / 3D envelope. Cache table `migrations/20260702_parcel_lookups.sql` is optional — the whole path degrades gracefully (falls back to AI-only research + satellite) if a government service is slow/unreachable or the table isn't migrated. **Deploy note:** these are AU-gov endpoints; Netlify's US functions may see higher latency or occasional geo-blocks (the 8s per-call timeout + cache cover this).

**Feasibility / yield engine (`utils/feasibility/`).** Phase 2: a deterministic, state-agnostic engine that turns the authoritative `SiteData` into an envelope + yield + indicative financials — the arithmetic is done in code so the LLM never has to (it only narrates the numbers). Structure:
- `types.ts` — `FeasibilityAssumptions`, `EnvelopeEstimate`, `Scenario`, `Financials`, `FeasibilityResult`.
- `assumptions.ts` — `inferDensity(controls)` (low/medium/high/rural/commercial from zone text) + per-density defaults (coverage, dwelling size, build $/m², sale $/m² — conservative AU-2026 **placeholders**, all overridable).
- `engine.ts` — `computeFeasibility(site, overrides)`: storeys = floor(height / 3.1); footprint = area × coverage; GFA = footprint × storeys × efficiency, **capped by FSR** when present; scenarios = subdivision (area ÷ min-lot), dual occupancy (≥ dualOccMin), multi-dwelling (GFA ÷ avg dwelling — **gated to medium/high zones**, since low-density/rural can't do attached housing); financials (construction/fees/contingency/GRV net-of-GST/margin — margin `null` unless a land cost is supplied, never fabricated).
- `index.ts` — re-exports + `feasibilityToPromptBlock()` (the "use these numbers verbatim" block).

Wired into the report phase of `planning-feasibility/route.ts` (adds no latency — pure/sync; sets `report.feasibility`). Standalone `POST /api/planning/feasibility` `{ address, assumptions? }` → `{ site, feasibility }` powers the future interactive yield panel where the advisor tunes build cost / sale rate / land cost. The feasibility engine's numeric envelope is a coverage-ratio approximation; the geometric 3D envelope is Phase 3.

**3D envelope / massing (`utils/envelope/` + `app/feasibility/MassingViewer.tsx`).** Phase 3: the visual "Archistar" massing. `utils/envelope/geometry.ts` is pure/tested (`utils/envelope/geometry.test.ts`, vitest): projects the real parcel polygon (`report.siteData.parcel.geometry`) to local metres → convex hull → **minimum-area oriented rectangle** (rotating calipers) → **setback inset** (`insetRect`, front/rear on the depth axis, side on the frontage edges; clamps to a nominal central footprint when setbacks exceed the lot) → `buildMassing()` returns an extrudable `MassingModel`. Setbacks default by density (`setbacks.ts`, overridable). Working from the lot's oriented rectangle (not a negative polygon buffer) keeps the footprint always valid.
`MassingViewer.tsx` (three.js, `"use client"`) renders the parcel as a ground pad + the envelope extruded to the height limit + per-storey floor outlines, with orbit controls and a WebGL-absent fallback. Deps added: `three` + `@types/three`.

**Massing option sweep (`utils/envelope/sweep.ts` + `app/feasibility/MassingExplorer.tsx`).** Phase 4: the honest "hundreds of schemes". `generateMassingOptions()` (pure, vitest-tested `sweep.test.ts`) is a bounded generate-and-rank over storey count (up to the height limit) × setback stance (standard/minimum), filtered by zone density (low/rural → house/duplex only; medium/high → townhouses/apartments), each option scored by objective (`yield` | `gfa` | `margin`), deduped and returned top-N. Financial maths shared with the engine via `utils/feasibility/finance.ts` (extracted from `engine.ts`). `MassingExplorer.tsx` (client, loaded via `next/dynamic({ssr:false})`) runs the sweep, shows ranked option chips (top badged), a yield/floor-area re-rank toggle, and drives `MassingViewer` for the selected option — all client-side, no server round-trip. Replaces the single-massing card in the report; still `no-print`, captioned as an envelope/yield explorer, not compliant designs.

### Borrowing capacity engine (`utils/finance/`)
Pure, tax-year-aware servicing model behind the War Room **Borrowing capacity** card (`app/components/WarRoomCalculators.tsx`) and the opportunity **Calculations** section. The component is a thin UI over it; all arithmetic lives here and is vitest-tested (`tax.test.ts`, `capacity.test.ts`).
- `tax.ts` — `incomeTax`/`marginalTaxRate` (bracket tables per `TaxYear`), `lito`, `medicareLevy` (**household**: singles vs family thresholds + per-child steps — never call it per applicant), `hecsRepayment` (marginal bands **plus** a flat 10%-of-total band above the top threshold), `standardDeduction`, `personalTax` (returns `netBeforeMedicare` on purpose).
- `stampDuty.ts` — `standardDuty` / `fhbDuty` / `dutyPayable` by state, moved out of the component so `capacity.ts` can net duty off the deposit without importing a client component.
- `capacity.ts` — `computeCapacity`, `assessProperty`, `autoAnnualCosts`, `solvePurchasePrice`, `negativeGearingAllowed`.

**Three tax years are live** (`TaxYear` = `2025-26 | 2026-27 | 2027-28`, default `CURRENT_TAX_YEAR`), because two reform packages are law: the lowest marginal rate steps 16c → 15c (1 Jul 2026) → 14c (1 Jul 2027); the $1,000 standard work-expense deduction starts 2026-27; and **negative gearing is limited to new builds from 1 Jul 2027**, with property held at 7:30pm AEST 12 May 2026 grandfathered. Hence `ExistingProperty.heldBeforeNgCutoff` / `.isNewBuild` and `CapacityInputs.newPropertyIsNewBuild`. Changing `taxYear` legitimately changes the answer — that is not a bug.

**Two fixed points, both deliberate.** (1) Stamp duty depends on the purchase price, which depends on the duty-reduced deposit — `solvePurchasePrice` iterates (duty's ~5% marginal rate makes it a contraction). (2) The new property's rental loss depends on its interest, which depends on the loan being solved for — `computeCapacity` iterates and reports `converged`.

**Gotchas.** A rental loss is applied as a *deduction inside `personalTax`*, not as a separate income add-back: the cash drag is already in `portfolioNetMonthly`, so adding it again would double-count. It IS added back for HELP repayment income (net investment losses), so gearing never discounts HECS. Losses are attributed to the higher earner. DTI counts *balances* (mortgages, card limits at face value, `consumerDebtBalance`) while servicing counts *repayments* — a consumer balance must move `maxLoanByDti` and leave `maxLoanByServicing` untouched. The 2026-27 Medicare thresholds aren't published yet, so 2025-26 figures are carried forward. Depreciation and capital works are not modelled, so the negative-gearing benefit is understated.
### Borrower Fact Find (`app/fact-find/` + `app/api/fact-finds/` + `utils/factfind.ts`)
A digital rebuild of the seven-page paper "Generic Borrower Fact Finder Form", section for section: applicants → companies/trusts → advisors → loan required → security offered → personal financial statements → disclosures → declarations → privacy consent. Sidebar link **Fact Find** under CRM.
- `utils/factfind.ts` — the single source of truth for the document: `FactFindData` shape, enums, `emptyFactFind()`, `hydrateFactFind()` (merges a stored blob over the current template so older rows still open), `computeTotals()` (liabilities/assets/surplus/monthly commitments), `outstandingSections()` (advisory completeness check — never blocks a save). Pure + vitest-tested (`utils/factfind.test.ts`).
- **Servicing fields are NOT on the paper form.** `Applicant.annual_income` / `.has_hecs` / `.hecs_balance` and `financials.servicing` (dependents, monthly living expenses) were added so the fact find can drive the borrowing-capacity engine. Anything added here must also be defaulted in `emptyFactFind()` and backfilled in `hydrateFactFind()`, or rows saved earlier will open with `undefined` and crash the form.

**Fact find → capacity bridge (`utils/factfind-capacity.ts`).** `factFindToCapacityInputs(data, overrides)` maps the document onto `CapacityInputs` and returns `{inputs, missing, notes}`; `app/fact-find/[id]/CapacityPanel.tsx` renders it (read-only, `no-print` — an indicative estimate must not appear in a signed document). It's a separate module on purpose: `utils/finance/` and `utils/factfind.ts` don't know about each other, and only the bridge depends on both. The mapping is lossy in named ways and every lossy step fails **conservatively**: a credit card's `balance` is its *limit* on this form (which is what the engine assesses); mortgages pair to owned securities **positionally**, and surplus mortgage rows become ordinary debt rather than invented properties — so they still hit servicing and DTI but earn no negative-gearing deduction. Existing mortgage rate/term aren't recorded, so 6.5% / 25yr is assumed and surfaced in `notes`. Without an applicant income the panel refuses to show a number at all (`capacityIsMeaningful`).
- `app/api/fact-finds/route.ts` (GET list, POST create) + `app/api/fact-finds/[id]/route.ts` (GET one, PATCH, DELETE) — `requireAuth`, service-key Supabase, graceful when the table is absent. The list route selects explicit columns, never `*`, because `data` holds borrower PII (DOB, licence number, income).
- `FactFindForm.tsx` — one form; PATCH sends the whole `data` blob (the denormalised columns are re-derived server-side so they can't drift). "Export PDF" prints the form itself: an `@media print` block flattens inputs to underlined text, so there is no separate print view to keep in sync.

**Table is `borrower_fact_finds`, NOT `fact_finds`** (`migrations/20260709_borrower_fact_finds.sql`). An unrelated `fact_finds` table already exists in this Supabase project (`lead_id` → `smart_leads.id`, `financial_data`, `verified_capacity`, `ai_verification_status`) — `create table if not exists fact_finds` would silently no-op against it. Relatedly, `factFindsTableMissing()` is deliberately narrower than `dealsTableMissing()`: the latter's loose `schema cache` / `does not exist` substring test also matches *column*-level errors (PGRST204 / 42703), which would tell the operator to re-run a migration they'd already run.

### Region Prospecting (`app/prospecting/` + `utils/prospecting/` + `app/api/prospecting/`)
Comb a whole region for parcels with subdivision headroom, then hand any candidate to the feasibility tool. Sidebar link under **Command**. NSW-only (minimum lot size — needed to test subdivision — is the one subdivision control published statewide as queryable data).
- `utils/prospecting/geocodeRegion.ts` — region name → bounding box (Nominatim `boundingbox`), clamped to a ~27 km window (`MAX_SPAN_DEG`) so a scan can't pull a whole state.
- `utils/prospecting/nsw.ts` `scanNSW(bbox)` — **bulk** `queryEnvelope` (in `planning/arcgis.ts`) for (1) parcels in an area band (`planlotarea BETWEEN min..max`, ordered largest-first — the upper bound excludes broadacre that would crowd out residential splitters and blow the payload/timeout), (2) all min-lot-size polygons, (3) all zoning polygons; then **local point-in-polygon** (`envelope/geometry.ts`: `largestRingCentroid`, `pointInRings`, with a per-feature bbox pre-check) to attach each parcel's min-lot + zone. Keeps residential (R1–R5) parcels where `floor(area / minLot) ≥ 2`, ranked by net new lots. **Excludes already-developed parcels** via plan type — Strata (SP) and Community/Precinct (CP/CD/CN) plans are existing unit/townhouse/community schemes with no subdivision potential, so only ordinary Torrens Deposited Plans (DP) survive (`isAlreadyDeveloped`; excluded count surfaced in notes). Handles the min-lot layer's **hectare** units (R5/rural express `LOT_SIZE` in ha) + a single retry for the SIX cadastre's intermittent empty response.
- `utils/prospecting/index.ts` `scanRegion(region)` — geocode → dispatch (non-NSW returns `supported:false` + note).
- `app/api/prospecting/scan` (POST region → `ScanResult`, persists to optional `prospecting_runs`) and `app/api/prospecting/resolve` (POST lat/lng → reverse-geocoded address, server-side to dodge the CSP; called only when a candidate is picked).
- `ProspectingClient.tsx` — region input + min-area select → ranked table (Lot/Plan, area, zone, min-lot, est lots, net-new, council) → **"Prepare feaso"** reverse-geocodes the centroid and deep-links `/feasibility?address=…&auto=1`, plus **"☆ Save"** to the watchlist. Estimated lots are an upper bound (before access handles/roads/servicing) — a screen, not an approval.

### Development Watchlist (`app/deals/` + `app/api/deals/` + `utils/deals.ts`)
The "lead loop" — captured site opportunities tracked through a deal pipeline (Supabase `dev_opportunities`, migration `20260702_dev_opportunities.sql`; degrades gracefully if unmigrated). Deliberately **self-contained in property-crm + Supabase**, NOT routed through the buyer-centric NEXUS `/api/leads` opportunities schema (a subdivision site isn't a buyer lead) — a NEXUS-opportunity mirror is a possible follow-up. Sidebar link **Dev Watchlist** under Command.
- `utils/deals.ts` — `DEAL_STAGES` (Identified → Researching → Feasibility done → Owner contact → Pursuing → Won/Passed) + shared `tableMissing`/`errMessage` helpers.
- `app/api/deals/route.ts` (GET list, POST create) + `app/api/deals/[id]/route.ts` (PATCH stage/notes, DELETE) — `requireAuth`, service-key Supabase, graceful when the table is absent.
- Added from **both** entry points: "☆ Save" on each Region Prospecting row (`source:'prospecting'`), and "☆ Add to watchlist" on the Feasibility report toolbar (`source:'feasibility'`, stage `Feasibility done`, optional `feasibility_report_id` link).
- `DealsClient.tsx` — stage-filter chips + per-card inline stage `<select>` + notes textarea (optimistic PATCH) + "Open feaso" deep-link back into the tool + Map/Delete.

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
