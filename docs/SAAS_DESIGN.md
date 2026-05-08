# SaaS Design — PropMarketer (working title)

**Status:** draft, awaiting Sean's sign-off before any code work starts
**Date:** 2026-05-08
**Strategic decision:** Path B from `project_saas_strategic.md` — keep `nextkey-property-crm` single-tenant for NextKey's own use, build a forked multi-tenant codebase as the SaaS product. NextKey becomes the first paying customer of its own product.

This doc captures the plan from foundation through Phase 4. Read it once, mark up disagreements, then we cut Phase 0 → Phase 1 work tickets.

---

## 1. Topology

```
                     ┌──────────────────────────────┐
                     │ propmarketer-app (new repo)  │
                     │  Next.js, multi-tenant       │
                     └──────────────────────────────┘
                              │
                              ▼
     ┌────────────────────────────────────────────────────┐
     │ Supabase (new)                                     │
     │  - tenants, tenant_users, tenant_branding          │
     │  - tenant_subscription, tenant_audit_log           │
     │  - private operational data (contacts, leads,      │
     │    sequences, calc, etc.) all keyed on tenant_id   │
     │  - SHARED catalogue: global_stock_pool, builders,  │
     │    ingestion_run, property_review_queue            │
     │    (admin-only writes; Pro+ tenants read-only)     │
     │  - Auth, Storage                                   │
     └────────────────────────────────────────────────────┘
              ▲                       ▲
              │ per-tenant scope      │ admin-only ingestion
              │                       │ (NextKey runs centrally)
     ┌────────────────┐      ┌──────────────────────────┐
     │ Stripe         │      │ NEXUS API on Fly         │
     │  Solo / Growth │      │  - central aggregator    │
     │  / Pro / Agency│      │  - sequence_runner (per-  │
     │                │      │    tenant via tenant_id) │
     └────────────────┘      │  - email pipeline (per-  │
                             │    tenant inbox routing) │
                             └──────────────────────────┘
```

**Catalogue model — centralised, not user-contributed:**

The property `global_stock_pool` is NextKey's product moat. NextKey owns the builder agreements, NextKey's ingestion service processes the stocklists, NextKey publishes the curated catalogue. Pro+ tenants are **read-only consumers** of that catalogue — they don't forward their own builder emails into the system, they don't run their own aggregator pipeline. The value prop on Pro = "live national property catalogue from our builder partner network, AI-matched to your clients."

This means `/aggregator/builders`, `/aggregator/runs`, `/aggregator/review` are **super-admin only** in the SaaS app. Tenant users don't see them at all. They see the resulting `/properties` feed (Pro+ only).

**Bring-Your-Own-Builder (Agency tier exception):** Agency tier tenants can ingest from their own private builder relationships into a tenant-scoped catalogue (rows tagged with their `tenant_id`). RLS policy: a tenant sees `WHERE tenant_id IS NULL OR tenant_id = current_tenant_id` — public NextKey rows + their own private rows. Their private rows are NOT visible to other tenants. See §13 for BYOB details.

**Three new infrastructure pieces** (don't reuse NextKey's):

- **New repo** `propmarketer-app`. Forked from `property-crm` at the current SHA so we inherit the work but evolve independently. NextKey's repo continues unchanged.
- **New Supabase project** — separate from `nextkey-property-crm`. Fresh schema with `tenant_id` baked in from day 1. Easier to reason about than back-filling tenant_id into a populated DB.
- **New Netlify site** — `propmarketer.app` or similar. Custom domains for white-label tenants attach here.

**Existing pieces that stay shared:**

- **NEXUS API on Fly** — central aggregator stays as it is for NextKey's (now SaaS's) builder pipeline. Sequence runner + email pipeline get per-tenant scope: every cron pass loops tenants and runs each one in isolation.
- **Stripe** — new account dedicated to PropMarketer revenue (decision §10 Q3 = new account, confirmed 2026-05-08).

## 2. Multi-tenancy data model

Every table in the operational schema gets a `tenant_id UUID NOT NULL` column. RLS policies enforce that authenticated users only see rows where `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid`.

Tables that need it (current count):

| Table                    | Notes                                           |
|--------------------------|-------------------------------------------------|
| `tenants`                | NEW — one row per customer org. `kind` ENUM ('broker' | 'builder'). |
| `tenant_users`           | NEW — joins users to tenants with role         |
| `contacts`               | + tenant_id                                     |
| `property_leads`         | + tenant_id                                     |
| `pipelines`              | + tenant_id                                     |
| `appointments`           | + tenant_id                                     |
| `pia_reports`            | + tenant_id                                     |
| `email_log`              | + tenant_id                                     |
| `email_inbound`          | + tenant_id                                     |
| `sequence_enrollments`   | + tenant_id                                     |
| `sequence_step_runs`     | + tenant_id                                     |
| `sms_log`                | + tenant_id                                     |
| `app_settings`           | + tenant_id (per-tenant signature, types, etc.) |
| `calendar_credentials`   | + tenant_id                                     |
| `opportunity_calculations` | + tenant_id                                   |
| `tasks`                  | + tenant_id                                     |
| `unsubscribes`           | + tenant_id                                     |
| `recommendation_log`     | + tenant_id                                     |
| `global_stock_pool`      | **shared** + nullable tenant_id (BYOB)          |
| `builders`               | **shared** + nullable tenant_id (BYOB)          |
| `ingestion_run`          | **shared** + nullable tenant_id (BYOB)          |
| `property_review_queue`  | **shared** + nullable tenant_id (BYOB)          |
| `ghl_archive_*`          | NextKey-only, doesn't migrate                   |
| `client_users`           | NEW — end-clients of tenants                    |
| `client_sessions`        | NEW — magic-link tokens                         |
| `tenant_subscription`    | NEW — Stripe state                              |
| `tenant_branding`        | NEW — logo, colors, custom domain               |
| `tenant_audit_log`       | NEW — who-did-what for super admin              |
| `property_eoi`           | NEW — broker EOI on a builder's property        |
| `property_eoi_messages`  | NEW — threaded comments on an EOI               |
| `property_view`          | NEW — view tracking for builder analytics       |
| `property_publishing`    | NEW — builder draft/review/published state per row |

**Shared tables** (`global_stock_pool`, `builders`, `ingestion_run`, `property_review_queue`): three provenance modes coexist:

- `tenant_id IS NULL` → **NextKey-curated** (legacy email aggregator, see §14 — kept running indefinitely as a fallback). Public to all Pro+ broker tenants.
- `tenant_id = builder.id` AND `visibility = 'public'` → **builder-self-published** via the Builder Portal (§14). Public to all Pro+ broker tenants.
- `tenant_id = broker.id` AND `visibility = 'private'` → **BYOB** Agency-tier broker private scope (§13). Visible only to that broker tenant.

RLS read policy on these tables:

```sql
USING (
  CASE current_tenant_kind()
    WHEN 'broker' THEN
      visibility = 'public'                        -- NextKey + all builder uploads
      OR tenant_id = current_tenant_id()           -- own BYOB
    WHEN 'builder' THEN
      tenant_id = current_tenant_id()              -- own listings only
    ELSE FALSE                                     -- shouldn't happen; super admin bypasses RLS
  END
)
-- Write policy: super_admin OR (tenant_id = current_tenant_id())
```

`current_tenant_kind()` and `current_tenant_id()` are SQL functions reading from `auth.jwt()` claims set during login (claims include both fields).

**Q1 cancel resolution** (decided 2026-05-08, supersedes earlier §10):

- Catalogue access: revoked immediately on `subscription.deleted` webhook. Their dashboard's `/properties` page now shows the upgrade prompt.
- Their private data (contacts, opportunities, settings, calendar, sequences): read-only export window for 30 days post-cancel; hard delete after 60 days unless they re-subscribe.
- Their BYOB rows (Agency tenants only): stay visible to them during the 30-day read-only window, deleted at the 60-day hard cutoff.

## 3. Auth

- **App users** (broker/planner staff): Supabase Auth, email + password. Each user can be a member of multiple tenants via `tenant_users`. Active tenant stored in JWT app metadata. RLS policies read it.
- **Super admin** (Sean + team): hardcoded email allowlist. Same Supabase Auth, but `app_metadata.is_super_admin = true` flag set manually in DB. Super admin sees a `/admin` route plus an "Impersonate" action that swaps their `tenant_id` claim.
- **Client users** (end-buyers of a tenant's services): magic-link only, no password. Scoped to a single tenant + a list of opportunities/contacts they're allowed to see. RLS policy: `client_user.tenant_id = row.tenant_id AND row.id IN (allowed_ids)`.

Cloudflare Access stays only on `crm.nextkey.com.au` (the legacy NextKey CRM). It does not gate `propmarketer.app`.

## 4. Tier matrix

PropMarketer is a **two-sided marketplace**:

- **Broker side** (consumers of the catalogue) — 4 tiers: Solo / Growth / Pro / Agency. Pay to access the curated property catalogue + CRM workflow tools.
- **Builder side** (suppliers of the catalogue) — 2 tiers: Free / Pro. Self-publish properties into the catalogue, get distribution to the broker network, manage inbound EOIs.

Tenants are typed by `tenants.kind` ENUM (`'broker'` | `'builder'`). A user can theoretically belong to both kinds via separate tenant memberships, but the typical case is one or the other. Subscription tier is independent per tenant.

### Broker tiers

Pricing per `project_saas_strategic.md` — confirmed §10.

| Feature                          | Solo $149 | Growth $449 | Pro $1,199 | Agency $2,999+ |
|----------------------------------|:---------:|:-----------:|:----------:|:---------------:|
| **Contacts**                     | 1,000     | 10,000      | unlimited  | unlimited       |
| **Active opportunities**         | 50        | 500         | unlimited  | unlimited       |
| **Users per tenant**             | 1         | 3           | 10         | unlimited       |
| **Pipelines**                    | 1         | 5           | unlimited  | unlimited       |
| **Email sending (Brevo)**        | 500/mo    | 5,000/mo    | 25,000/mo  | unmetered       |
| **AI requests** (matchmaker, scoring, drafts) | 50/mo | 500/mo | 2,000/mo | 10,000/mo + overage |
| **Email sequences**              | ✗         | ✓           | ✓          | ✓               |
| **Calendar booking integration** | ✗         | ✓           | ✓          | ✓               |
| **Borrowing + stamp duty calcs** | ✓         | ✓           | ✓          | ✓               |
| **AI lead scoring + matchmaker** | ✗         | ✓           | ✓          | ✓               |
| **Branded PDF reports**          | ✗         | ✓           | ✓          | ✓               |
| **Property aggregator feed** (NextKey curated)   | ✗ | ✗ | ✓          | ✓               |
| **Bring-your-own-builder** (private scope)        | ✗ | ✗ | ✗          | ✓               |
| **AI document extraction**       | ✗         | ✗           | ✓          | ✓               |
| **AI smart reply / pitch**       | ✗         | ✗           | ✓          | ✓               |
| **Document e-signing**           | ✗         | ✗           | ✓          | ✓               |
| **Client portal**                | ✗         | ✗           | basic      | full            |
| **White label** (logo, colors)   | ✗         | ✗           | partial    | full            |
| **Custom domain**                | ✗         | ✗           | ✗          | ✓               |
| **Multi-user roles + permissions** | ✗       | ✗           | ✗          | ✓               |
| **API access**                   | ✗         | ✗           | ✗          | ✓               |
| **Webhooks**                     | ✗         | ✗           | ✗          | ✓               |
| **Commission tracking**          | ✗         | ✗           | ✗          | ✓               |
| **Compliance / disclosure tools**| ✗         | ✗           | ✗          | ✓               |
| **Audit log**                    | ✗         | ✗           | ✗          | ✓               |
| **SLA support**                  | community | email       | email + chat| dedicated CSM  |
| **Free trial**                   | 14 days   | 14 days     | 14 days    | custom          |

### Builder tiers

Builder side is the **supply** of the marketplace — pricing is deliberately low / free to seed the catalogue. Brokers' subscription revenue is the primary monetisation; builder Pro is a complementary upgrade path for engaged builders who want analytics + branded placement.

| Feature                                      | Builder Free | Builder Pro $299 |
|----------------------------------------------|:------------:|:----------------:|
| Active property listings                     | up to 100    | unlimited        |
| Users (sales team)                           | 1            | 10               |
| Publishing workflow (draft → review → live)  | ✓            | ✓                |
| Bulk upload (CSV / XLSX)                     | ✓            | ✓                |
| Lead inbox (broker EOIs)                     | ✓            | ✓                |
| EOI alerts                                   | email digest | real-time email + SMS |
| Analytics (views, matches, EOIs)             | weekly digest| real-time dashboard |
| Branded property cards (logo, colors)        | ✗            | ✓                |
| Featured-placement queue                     | ✗            | ✓ (slots rationed) |
| API access (inventory sync)                  | ✗            | ✓                |
| Multi-estate hierarchy                       | ✗            | ✓                |
| Co-branded marketing kits                    | ✗            | ✓                |
| Support                                      | community    | email + chat     |
| Free trial                                   | always free  | 30 days          |

**No transaction fees** in v1 — subscription-only revenue model, both sides. Marketplace fees on closed deals deferred until subscription revenue's proven and plumbing exists. Adding them later without breaking trust requires careful ToS handling.

## 5. Stripe structure

One Product per tier with one monthly Price each. Annual prices added later (typical 2-month discount). Webhook handler in `propmarketer-app/api/stripe/webhook` listens for:

- `customer.subscription.created` / `.updated` / `.deleted` → write tenant.tier + tenant_subscription row
- `invoice.payment_succeeded` → reset usage counters for the new period
- `invoice.payment_failed` → flag tenant.payment_status, surface a banner in-app, freeze writes after 7 days

Customer Portal handles upgrades, downgrades, cards, cancellations. We do NOT roll our own billing UI for v1.

**Usage metering** (for AI requests, email sends): increment `tenant_usage` counters on each call; check before allowing a write; surface in-app at 80%, hard-stop at 100% with upsell modal. Overages on Agency only.

## 6. Provisioning flow

Marketing site has two CTAs above the fold: "I'm a broker / agent / planner" and "I'm a builder / developer". Each routes to its own signup variant; the schema branches on `tenants.kind`.

**Broker signup:**

```
/signup/broker (email, password, business name, tier picker → Solo trial default) →
  create supabase.auth user →
  create tenants row { kind: 'broker', tier: chosen } →
  tenant_users row (user as 'owner') →
  Stripe customer + 14-day trial subscription on chosen tier →
  seed defaults (default pipeline, property_types from app_settings) →
  /onboarding/broker (3-step: import contacts, connect calendar, invite team) →
  /dashboard
```

**Builder signup:**

```
/signup/builder (email, password, company name, ABN, contact phone) →
  create supabase.auth user →
  create tenants row { kind: 'builder', tier: 'builder_free' } →
  tenant_users row (user as 'owner') →
  Stripe customer (no subscription — Free tier; upgrade flow lives in /billing) →
  seed defaults (one default estate placeholder) →
  /onboarding/builder (3-step: company profile + logo, add first 5 properties OR bulk-upload, set notification prefs) →
  /builder
```

Both flows share `supabase.auth` so a user with one email can theoretically belong to multiple tenants (broker + builder), with a tenant-switcher in the nav. Edge case, not Phase 1 priority.

## 7. Super admin panel

`/admin` route. Renders only when `app_metadata.is_super_admin === true`.

- **Tenants** list — all tenants, search, filter by tier/status, MRR/ARR roll-up
- **Tenant detail** — usage stats, billing state, audit log, "Impersonate" button (swaps your active tenant for theirs, banner shows "Impersonating XYZ — return to admin")
- **Billing** — list of failed invoices, refund actions
- **Health** — cross-tenant: stuck sequence enrollments, broken cron, AI cost roll-up
- **Feature flags** — beta-gate new features per-tenant before broad rollout
- **Suspend / Restore** — mark tenant inactive (RLS denies writes; reads still work for export)

Impersonation writes to `tenant_audit_log` with `actor_user_id`, `acted_as_tenant_id`, `action`, timestamp.

## 8. White label + custom domain

- **Pro tier** — partial: tenant uploads a logo + picks 2 colors; logo replaces "PropMarketer" in nav; emails sent from CRM use their logo; PDFs use their logo. URL stays `propmarketer.app/[tenant-slug]/...`.
- **Agency tier** — full: tenant points their CNAME (`crm.theirfirm.com`) at our edge, we add a Netlify Custom Domain, TLS auto-provisions. The whole app loads on their domain. "Powered by PropMarketer" footer, removable on highest plan.

Per-tenant theme stored in `tenant_branding`. Loaded once per session, applied via CSS variables.

## 9. Client portal

Separate sub-app under `/client` (or a custom subdomain on Agency tier — `clients.theirfirm.com`).

- **Auth**: magic link to client's email. Token in `client_sessions` rows. No passwords.
- **Pages**:
  - **Their opportunities** — what's been opened for them, current stage, next steps
  - **Their properties** — properties their broker has matched to them, with a "Like / Pass / Want to see" reaction
  - **Their documents** — anything the broker uploaded (proposals, contracts via e-signing service)
  - **Their meetings** — upcoming + past, with notes if shared
  - **Messages** — basic threaded inbox to their broker (delivers as email on the broker side)

RLS policy ensures a client can only see rows where they're listed in `linked_contact_ids` or `primary_contact_id` and the tenant matches.

## 10. Decisions log (resolved 2026-05-08)

1. **Q1 — Cancel flow**: catalogue access revoked immediately. Private data read-only 30 days, hard delete 60. BYOB rows follow private-data timeline. (See §2 cancel resolution.)
2. **Q2 — Repo name**: `propmarketer-app`. Domain TBD — assume `propmarketer.app`; register before Phase 1 starts.
3. **Q3 — Stripe**: new dedicated PropMarketer Stripe account.
4. **Q4 — Pricing**: confirmed $149/$449/$1199/$2999+ Solo/Growth/Pro/Agency. Annual discount + free tier deferred to launch-prep.
5. **Q5 — Beta launch**: yes — 5–10 friendly brokers/planners on free Pro for 60 days, in exchange for testimonials + feedback. Recruitment list to be drawn during Phase 2.
6. **Q6 — AI cost**: metered overage billing. Each tier has an included monthly bucket (per §4); overage is metered + visible in the in-app billing page; threshold-based throttle (50%/80%/100% banners). Stripe handles overage as a separate metered Price.
7. **Q7 — NextKey on PropMarketer**: yes, eventually migrate NextKey onto PropMarketer once it's production-stable (drink own champagne). NextKey becomes a special tenant — likely Agency tier — with BYOB enabled for their direct builder relationships. Existing `crm.nextkey.com.au` data migrates over; old codebase deprecates.

**Catalogue model decisions** (added 2026-05-08, see §1 + §13):

8. **Q-A — Catalogue scope**: universal. Every Pro+ tenant sees the entire NextKey-curated catalogue. No geo-filter or per-tenant curated packs at launch. Easier to reason about, easier to sell.
9. **Q-B — Bring-your-own-builder**: yes, Agency-tier exclusive. Private scope (rows visible only to the contributing tenant + super admin). See §13 for design. Alternative interpretation (tenant submits builder + NextKey reviews + publishes centrally) is **NOT** the chosen model — flag this if it should be.

**Builder side decisions** (added 2026-05-08, see §4 + §14):

10. **B-Q1 — Free tier on builder side**: yes. Marketplace dynamics demand supply seeding before broker subscriptions can carry the model.
11. **B-Q2 — Two builder tiers** (Free + Pro $299) rather than one. Free entry, premium upgrade path.
12. **B-Q3 — No marketplace transaction fees** in v1. Subscription revenue both sides only.
13. **B-Q4 — Email aggregator pipeline** (legacy NextKey ingestion) keeps running indefinitely. Builder Portal is additive, not a replacement.
14. **B-Q5 — EOI flow**: full broker name + buyer summary + contact info delivered to builder on submission. No anonymous-until-accepted phase.

## 11. Phase plan + estimated effort

| Phase | Scope | Estimate |
|-------|-------|----------|
| 0 | This doc + tier confirmations + repo/domain naming | done after sign-off |
| 1 | Fork repo. Schema rewrite (tenant_id + RLS everywhere). Supabase Auth. Basic provisioning flow. Stripe products + webhooks. End-state: 2 test tenants share infra cleanly. | 3-4 weeks |
| 2 | Tier gating middleware. Super admin panel (cross-tenant view, impersonate, suspend). | 2 weeks |
| 3 | White label (theme + logo). Custom domain (Agency tier). Client portal MVP (3 pages). | 3-4 weeks |
| 4 | Marketability features. Pick 3-5 from the list below per quarter. | ongoing |

**Phase 4 backlog of marketability features** (not exhaustive):

- Mobile PWA (responsive existing UI properly)
- Native iOS/Android wrapper (Capacitor) — once PWA solid
- WhatsApp / Twilio integration for sequences
- MailChimp / native Brevo bring-your-own (some agencies want their own ESP)
- GHL / HubSpot / Salesforce import wizards
- Public property listings page per tenant (SEO play — broker's own site)
- Embeddable lead-capture forms (script tag for their existing site)
- Slack notifications
- Advanced analytics dashboard (deal velocity, source ROI, conversion funnels)
- Commission tracking + payout reports
- Compliance — Australian Credit Licence disclosure tracking, Best Interests Duty workflow
- Tenant-level audit log + export
- Public API + webhooks
- Marketplace of integrations (Zapier-equivalent)

## 12. Things explicitly NOT in scope for the SaaS

- Multi-tenanting NextKey's existing `crm.nextkey.com.au` in-place — that stays single-tenant. NextKey eventually migrates *onto* PropMarketer (Q7) but the legacy CRM is not modified.
- The `nextkey-nexus` repo (NEXUS API on Fly) — extending to be tenant-aware is part of Phase 1, but the repo itself stays where it is.
- Tenant-uploaded property listings outside the BYOB-builder model. Tenants can't manually CRUD `global_stock_pool` rows — that's super-admin / pipeline-only.

## 13. Bring-your-own-builder (BYOB) — Agency tier

Agency tier tenants can ingest from their own builder relationships into a private scope. Implementation:

**Schema:** the four shared aggregator tables (`global_stock_pool`, `builders`, `ingestion_run`, `property_review_queue`) get a nullable `tenant_id`. NULL = public NextKey-curated; non-NULL = private to that tenant.

**Intake address routing:** rather than per-tenant Gmail inboxes, use Gmail sub-addressing on a single shared SaaS intake account:

```
intake+t<tenant_short_id>@propmarketer.app   →  routes to a single inbox
```

The aggregator parses the recipient from each message's `Delivered-To` / `To` header. `+t<short_id>` → tenant-scoped ingestion. No suffix → public catalogue (NextKey).

**Tenant-side setup:** Agency tenant configures a Gmail filter on their own account auto-forwarding builder emails to `intake+t<their-id>@propmarketer.app`. The pattern is the same one NextKey uses today; the only difference is the recipient address embeds tenant identity.

**UI:** Agency-tier tenants see a tenant-scoped `/aggregator/builders` page (same component as super admin's, but RLS limits visibility to their own rows). They can add builders, set `extraction_notes`, upload sample PDFs — same UX as NextKey's. Super admin retains a separate cross-tenant view at `/admin/aggregator`.

**Cost passthrough:** AI extraction costs for BYOB rows count against the Agency tenant's monthly AI bucket (Q6 — metered overage). Public-catalogue extraction is on NextKey's tab (it's the product).

**Migration story for NextKey** (Q7): NextKey's existing `global_stock_pool` rows enter PropMarketer as `tenant_id = NULL` (public). NextKey's tenant row uses Agency tier with BYOB enabled — but doesn't *need* BYOB because it's the source of the public catalogue.

## 14. Builder/Developer Portal

The supply side of the marketplace. Builders self-publish properties into the catalogue, manage inbound EOIs, and track distribution analytics.

### Why a builder portal exists alongside the email aggregator

The legacy email aggregator (NEXUS API on Fly, see `project_aggregator_v2.md`) keeps running indefinitely (Q-B4). It's the right tool for builders who don't want to log in to a portal — they email a stocklist, NextKey processes it, properties land in the catalogue tagged `tenant_id = NULL`.

The **portal** is additive. Builders who want richer features (analytics, branded cards, EOI inbox, real-time alerts) sign up, claim their builder identity, and self-publish from there on. Their portal-published rows are tagged `tenant_id = builder.id` AND `visibility = 'public'`. From a broker's perspective the catalogue looks unified — they don't see the provenance distinction.

### Pages (all under `/builder` after login)

- `/builder` — dashboard: active listings count, recent EOIs, weekly view + match stats
- `/builder/properties` — list view with publishing-state filter (draft / pending review / live / withdrawn / sold)
- `/builder/properties/new` — create form (single property)
- `/builder/properties/import` — bulk upload CSV/XLSX with column-mapping wizard
- `/builder/properties/[id]` — edit single property
- `/builder/leads` — EOI inbox: each row shows broker, contact summary, status, last activity
- `/builder/leads/[id]` — EOI detail: full buyer summary, broker contact, threaded messages, status changer (new → viewed → accepted/declined → closed)
- `/builder/analytics` — Pro tier only: views over time, top-viewed properties, conversion to EOI, broker-tenant heatmap (which broker tenants are matching most)
- `/builder/team` — Pro tier only: invite users, role assignment (admin / sales / viewer)
- `/builder/branding` — Pro tier only: company logo, primary/accent colors, optional company description shown on property cards
- `/builder/settings` — billing portal link, notification prefs, API keys (Pro), webhooks (Pro)

### EOI flow (broker → builder)

1. Broker is on `/properties` (broker app). Clicks a property → property detail page → "Express interest on behalf of <client>" button.
2. Modal opens: pick which contact (their buyer), write a buyer summary (income, family situation, what they want, urgency), confirm broker contact info that the builder will see.
3. Submit creates `property_eoi { property_id, broker_tenant_id, builder_tenant_id, broker_contact_id, broker_user_id, buyer_summary, status='new' }`.
4. Builder receives notification (email digest on Free, instant email + SMS on Pro). Property's analytics counter ticks +1 EOI.
5. Builder logs in, sees EOI in `/builder/leads`. They can mark `viewed` (auto on first open), then `accepted` / `declined`. They can post messages on the EOI thread.
6. Broker sees status changes + messages back in their copy of the EOI on the property detail page.
7. Either side can mark `closed` with a reason (sold to this buyer / sold to other / lost / withdrawn).

Closed-as-sold EOIs feed builder analytics (conversion rate) and broker analytics (deal velocity by builder).

### Schema additions (already listed in §2 table)

```
property_eoi:
  id uuid pk
  property_id uuid (global_stock_pool.id)
  broker_tenant_id uuid (tenants.id where kind='broker')
  builder_tenant_id uuid (tenants.id where kind='builder')
  broker_contact_id uuid (contacts.id) — the buyer
  broker_user_id uuid — submitter
  buyer_summary text
  status enum: 'new' | 'viewed' | 'accepted' | 'declined' | 'closed_sold' | 'closed_lost'
  created_at, updated_at, viewed_at, closed_at, close_reason

property_eoi_messages:
  id uuid pk
  eoi_id uuid (property_eoi.id)
  sender_user_id uuid
  body text
  created_at

property_view:
  id uuid pk
  property_id uuid
  broker_tenant_id uuid
  broker_user_id uuid
  viewed_at timestamptz
  -- Lightweight tracking row inserted by the broker app on property detail page open
  -- Aggregated nightly into property_analytics (materialised view) for fast dashboard reads

property_publishing:
  id uuid pk
  property_id uuid (global_stock_pool.id)
  state enum: 'draft' | 'pending_review' | 'live' | 'withdrawn' | 'sold'
  changed_by uuid (user)
  changed_at timestamptz
  reason text  -- e.g. "withdrawn — under contract"
```

### RLS for EOI tables

- A broker tenant sees `property_eoi` rows where `broker_tenant_id = current_tenant_id()`.
- A builder tenant sees rows where `builder_tenant_id = current_tenant_id()`.
- A broker can write a row with `broker_tenant_id = current_tenant_id()` and `broker_user_id = current_user_id()`. Status defaults to 'new'; only the **builder** can advance it to `viewed`/`accepted`/`declined` (CHECK + trigger). Both sides can mark `closed_*`.
- Messages: anyone whose tenant_id matches either side of the EOI can read or write.

### Admin / moderation

Super admin sees everything. Approval workflow on builder-published rows:

- Default: builder publishes → status = `pending_review` → super admin or an automated quality check approves → status = `live`. Below-quality rows (price missing, no suburb) auto-route to a manual queue.
- Pro tier can be auto-approved past N successful publishes (trust-built, reduces friction).
- Banned for repeated quality violations: super admin can flag a builder tenant `quality_paused` which blocks new publishes until reviewed.

### Builder onboarding (post-signup)

- Step 1 — company profile: ABN, registered name, primary state, logo upload, colors (Pro feature, defaults applied for Free).
- Step 2 — first properties: pick "add manually" (form for 1-5 listings) or "bulk upload" (CSV template download + upload + column mapping). For Free tier, gates active count to 100; for Pro, unlimited.
- Step 3 — notifications: email-only (default Free), email + SMS (Pro).
- Land on `/builder` dashboard with empty-state guidance until first EOI arrives.

### Builder cancellation

- On `subscription.deleted` (Pro → Free downgrade) or full cancel:
  - Pro → Free: feature gates flip; > 100 active listings get the most-recently-edited 100 kept live, the rest move to `withdrawn` (kept on disk, not in catalogue).
  - Full cancel: all live listings → `withdrawn` immediately. Catalogue feeds for brokers stop showing them. Builder retains read-only export of their own data for 30 days, hard delete at 60. EOI history kept indexed by tenant_id but visible read-only to brokers who participated.

### Marketability hooks (Phase 4-ish)

- "Verified builder" badge on Pro tier (manual verification by NextKey team).
- Featured-placement queue: Pro tenants get N featured slots per month, surfaced first in `/properties` for matching searches.
- Co-branded marketing kits: shareable property page on `propmarketer.app/listing/[slug]` that broker can email to clients, branded with both broker + builder logos.
- API access (Pro): inventory sync (POST/PATCH/DELETE on `/api/builder/properties`) so a builder with their own internal CRM can keep PropMarketer in lock-step.

---

## 15. Phase plan revision (with Builder Portal)

| Phase | Scope | Estimate |
|-------|-------|----------|
| 0 | This doc + tier confirmations + repo/domain naming | done after sign-off |
| 1 | Fork repo. Multi-tenant schema (`tenants.kind`, all data tables `tenant_id`, RLS). Supabase Auth. Both broker + builder signup flows. Stripe products + webhooks for both sides. End-state: 1 broker tenant + 1 builder tenant share infra cleanly. | 4-5 weeks |
| 2 | Tier gates + super admin (cross-tenant, impersonate, suspend, moderation queue for builder publishes). Broker app reaches feature parity with current NextKey CRM. | 2-3 weeks |
| 3 | **Builder Portal MVP**: properties CRUD + bulk upload + EOI inbox + basic analytics. **Broker EOI integration**: submit-EOI button on /properties, EOI status on opportunity. White-label (Agency broker tier). | 4-5 weeks |
| 4 | Client portal (end-buyer login). Builder Pro features (real-time alerts, advanced analytics, branded cards, featured slots, API). Marketability features rolled out incrementally. | ongoing |

Total Phase 0→3 estimate: **10-13 weeks** to a launchable product covering both sides.

---

**Next step after Sean signs off on this doc:** kick Phase 1 — fork the repo, create the new Supabase project, add `tenants.kind` + `tenant_id` + RLS to the schema, build both provisioning flows (broker + builder).
