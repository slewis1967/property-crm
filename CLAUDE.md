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

### Pages
| Route | Description |
|-------|-------------|
| `/` | Dashboard |
| `/properties` | Aggregator Feed — main listing grid (PropertyGrid) |
| `/leads` | Inbound leads |
| `/contacts` | GHL contacts |
| `/opportunities` | GHL pipeline |
| `/analytics` | Charts/stats |
| `/suburbs` | Suburb research |
| `/social` | Social media queue |
| `/activity` | Activity log |
| `/approvals` | Telegram approval queue |

## KEY FILES
- `utils/supabase.ts` — Supabase client (uses `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- `app/properties/page.tsx` — fetches global_stock_pool, normalises fields
- `app/properties/PropertyGrid.tsx` — card grid, War Room panel, PDF export, delete
- `app/layout.tsx` — sidebar nav

## SUPABASE SCHEMA (`global_stock_pool` key columns)
`id`, `builder_name`, `street_address`, `suburb`, `state`, `total_package_price`, `house_price`, `bedrooms`, `bathrooms`, `car_spaces`, `land_size`, `house_size`, `status`, `brochure_url`, `category`, `created_at`, `updated_at`

## IMAGE ENRICHMENT
`brochure_url` is populated by running (from WSL):
```bash
python3 /mnt/c/NEXUS-Memory/projects/enrich_images.py
```
This scrapes PropMarket for estate images and fuzzy-matches to `builder_name`. ~7 of 149 properties currently have images; 25 builders are unmatched (not on PropMarket — came via email stocklists).

## ENV VARS
Stored in `.env.local` at project root:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## MARKETING SKILLS + AU COMPLIANCE GUARDRAILS
`.claude/skills/` holds 10 curated marketing skills (copywriting,
copy-editing, cold-email, email-sequence, seo-audit, ad-creative,
page-cro, popup-cro, schema-markup, marketing-psychology) from the
public coreyhaines31/marketingskills repo.

`.claude/product-marketing-context.md` is loaded by every skill before
it asks the user questions. It encodes NextKey's AU compliance hard
rules (ACL s.18/s.29, NCCP, Privacy Act, Spam Act, QLD POA 2014) and
the approved-phrasing table. Any marketing copy generated in this
repo must conform — Senior Advisor flags violations on the recs side
and the same standard applies to anything Claude writes here.
