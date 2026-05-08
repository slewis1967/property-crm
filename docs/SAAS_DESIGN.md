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
                              │           │
              ┌───────────────┘           └────────────────┐
              ▼                                            ▼
     ┌────────────────┐                          ┌──────────────────┐
     │ Supabase (new) │                          │ NEXUS API on Fly │
     │  - tenants     │                          │  - aggregator    │
     │  - users       │                          │  - sequence_runner│
     │  - all data    │                          │  - email pipeline│
     │    + tenant_id │                          │  (per-tenant)    │
     │  - Auth        │                          └──────────────────┘
     │  - Storage     │
     └────────────────┘
              │
              ▼
     ┌────────────────┐
     │ Stripe         │
     │  Solo / Growth │
     │  / Pro / Agency│
     └────────────────┘
```

**Three new infrastructure pieces** (don't reuse NextKey's):

- **New repo** `propmarketer-app` (or whatever you name it). Forked from `property-crm` at the current SHA so we inherit the work but evolve independently. NextKey's repo continues unchanged.
- **New Supabase project** — separate from `nextkey-property-crm`. Fresh schema with `tenant_id` baked in from day 1. Easier to reason about than back-filling tenant_id into a populated DB.
- **New Netlify site** — `propmarketer.app` or similar. Custom domains for white-label tenants attach here.

**Existing pieces that stay shared:**

- **NEXUS API on Fly** — handles aggregator + sequence runner + email pipeline. Per-tenant scope passed in request headers. Same Anthropic key, billed-per-call so we can either pass through to tenant or eat the cost (decision: see §10).
- **Stripe** — new account or new product set inside the existing one. Probably new account so NextKey's revenue and PropMarketer's revenue are clearly separated.

## 2. Multi-tenancy data model

Every table in the operational schema gets a `tenant_id UUID NOT NULL` column. RLS policies enforce that authenticated users only see rows where `tenant_id = (auth.jwt() ->> 'tenant_id')::uuid`.

Tables that need it (current count):

| Table                    | Notes                                           |
|--------------------------|-------------------------------------------------|
| `tenants`                | NEW — one row per customer org                  |
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
| `global_stock_pool`      | **shared** — see below                          |
| `builders`               | **shared** — see below                          |
| `ingestion_run`          | **shared**                                      |
| `property_review_queue`  | **shared**                                      |
| `ghl_archive_*`          | NextKey-only, doesn't migrate                   |
| `client_users`           | NEW — end-clients of tenants                    |
| `client_sessions`        | NEW — magic-link tokens                         |
| `tenant_subscription`    | NEW — Stripe state                              |
| `tenant_branding`        | NEW — logo, colors, custom domain               |
| `tenant_audit_log`       | NEW — who-did-what for super admin              |

**Shared tables** (`global_stock_pool`, `builders`, `ingestion_run`, `property_review_queue`): the aggregator's value proposition is a network-effect catalogue — every tenant on Pro+ benefits from every other tenant's builder relationships. So these stay shared. Tenants on Free/Solo/Growth see no aggregator output (gated). Pro+ tenants see all properties, all builders.

**Risk:** if a tenant cancels, do we keep ingesting their builders' emails? Decision needed (§10 Q1).

## 3. Auth

- **App users** (broker/planner staff): Supabase Auth, email + password. Each user can be a member of multiple tenants via `tenant_users`. Active tenant stored in JWT app metadata. RLS policies read it.
- **Super admin** (Sean + team): hardcoded email allowlist. Same Supabase Auth, but `app_metadata.is_super_admin = true` flag set manually in DB. Super admin sees a `/admin` route plus an "Impersonate" action that swaps their `tenant_id` claim.
- **Client users** (end-buyers of a tenant's services): magic-link only, no password. Scoped to a single tenant + a list of opportunities/contacts they're allowed to see. RLS policy: `client_user.tenant_id = row.tenant_id AND row.id IN (allowed_ids)`.

Cloudflare Access stays only on `crm.nextkey.com.au` (the legacy NextKey CRM). It does not gate `propmarketer.app`.

## 4. Tier matrix

Pricing per `project_saas_strategic.md` — confirm in §10 Q4.

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
| **Property aggregator feed**     | ✗         | ✗           | ✓          | ✓               |
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

## 5. Stripe structure

One Product per tier with one monthly Price each. Annual prices added later (typical 2-month discount). Webhook handler in `propmarketer-app/api/stripe/webhook` listens for:

- `customer.subscription.created` / `.updated` / `.deleted` → write tenant.tier + tenant_subscription row
- `invoice.payment_succeeded` → reset usage counters for the new period
- `invoice.payment_failed` → flag tenant.payment_status, surface a banner in-app, freeze writes after 7 days

Customer Portal handles upgrades, downgrades, cards, cancellations. We do NOT roll our own billing UI for v1.

**Usage metering** (for AI requests, email sends): increment `tenant_usage` counters on each call; check before allowing a write; surface in-app at 80%, hard-stop at 100% with upsell modal. Overages on Agency only.

## 6. Provisioning flow

```
Marketing site → "Sign up free" CTA →
  /signup (collect email, password, business name) →
    create user in supabase.auth →
    create tenants row with chosen tier (default: Solo trial) →
    create tenant_users row linking user as 'owner' →
    create Stripe customer + 14-day trial subscription →
    seed tenant defaults (default pipeline, default property types from settings) →
    redirect to /onboarding (3-step wizard: import contacts, connect calendar, invite team) →
    /dashboard
```

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

## 10. Open questions (need Sean's call)

1. **Q1 — Aggregator sharing model**: when a tenant cancels Pro, do we keep ingesting their forwarded builder emails (so re-subscription is smooth) or stop immediately? Recommend: keep ingesting for 60 days, then unforward.
2. **Q2 — Repo name**: `propmarketer-app`? `brokerpro-crm`? `leadgun`? Open to name + I'll register the domain matching it.
3. **Q3 — Stripe account**: new account dedicated to PropMarketer revenue, or new products inside NextKey's existing account? Tax + bookkeeping cleaner if new account.
4. **Q4 — Pricing confirm**: $149/$449/$1199/$2999+ from May memory still right, or rebalance? At $149 Solo with 50 AI requests, gross margin is ~70% after Anthropic + Brevo + Supabase + Netlify. Annual discount? Free tier with severe limits to seed signups?
5. **Q5 — Beta launch**: who pilots? 5-10 friendly brokers / planners on free Pro for 60 days in exchange for testimonial + feedback?
6. **Q6 — AI cost passthrough**: fair-use cap (current plan), or metered overage billing visible to user?
7. **Q7 — NextKey on the new system**: do we migrate NextKey itself onto PropMarketer once it's stable (drinking own champagne) or keep `crm.nextkey.com.au` separate forever?

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

- Multi-tenanting NextKey's existing `crm.nextkey.com.au` — that stays single-tenant.
- The `nextkey-nexus` repo (NEXUS API on Fly) — extending to be tenant-aware is part of Phase 1, but the repo itself stays where it is.
- Migrating NextKey's data into the SaaS — separate decision (Q7).

---

**Next step after Sean signs off on this doc:** kick Phase 1 — fork the repo, create the new Supabase project, add `tenant_id` + RLS to the schema, build the provisioning flow.
