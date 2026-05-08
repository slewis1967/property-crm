# NextKey Email Migration off Google Workspace

**Status:** draft, awaiting Sean's sign-off before any code work starts
**Date:** 2026-05-08
**Goal:** drop NextKey's Google Workspace subscription. All `@nextkey.com.au` mail flows through the CRM. Calendar stays on Google OAuth.
**Estimated effort:** 10-14 weeks. Treat this as a real engineering project, not a feature add.

---

## 1. What "drop Google" means in concrete terms

**In scope:**

- Inbound mail to `nextkey.com.au` no longer routes to Google. New MX records point at a third-party inbound provider that posts each message to our webhook.
- Outbound mail sent via Brevo (already in place). Per-user sender identities for `sean.l@nextkey.com.au` and `glenn.m@nextkey.com.au`.
- All email storage in Supabase. Attachments in Supabase Storage.
- Outlook-grade UX in the CRM: folders, labels, full-text search, drafts auto-save, attachments, bulk multi-select, per-user inbox routing.
- Existing Gmail-OAuth poll ingestion keeps running through the migration as belt-and-braces, then deprecates.

**Out of scope (confirmed Sean 2026-05-08):**

- Calendar — stays on Google OAuth (already integrated). Replacing Google Calendar is a separate 6+ week build.
- Native mobile email apps for **Glenn** — PWA only on iOS / Android. Sean (per §11 Q5 hybrid) keeps his Google Workspace seat and continues using native iOS Mail / Gmail mobile.
- Drive, Meet, Docs — not email; out of scope. Replace separately if needed.
- `stocklist@nextkeypropertyinvest.com` — different domain, free Gmail account, kept on Gmail OAuth poll (the aggregator's existing pipeline).

**Cost picture (with hybrid mobile choice §11 Q5):**

- Currently: Google Workspace ~$20-60/mo for 2 users
- After: Postmark Inbound ~$15/mo + Sean's retained Google seat ~$10-15/mo + Supabase storage delta ~$5/mo
- **Net savings: $0-25/mo (~$0-300/yr)**. Cost-savings are slim — the migration is justified by tighter CRM integration, AI everywhere, foundation for SaaS email-client feature, and data sovereignty. Not by raw subscription dollars.

## 2. Architecture

```
                              MX records on nextkey.com.au
                                       │
                                       ▼
                              ┌──────────────────┐
                              │ Postmark Inbound │  (or AWS SES Inbound — see §3 Q1)
                              │  ~$15/mo         │
                              └──────────────────┘
                                       │
                              POST webhook per message
                                       │
                                       ▼
                    ┌────────────────────────────────────┐
                    │ /api/mail/inbound                  │
                    │  Next.js route on crmnex (Netlify) │
                    │   - parse JSON payload             │
                    │   - resolve recipient → user       │
                    │   - dedupe by Message-ID           │
                    │   - store to Supabase              │
                    │   - upload attachments to Storage  │
                    │   - link to contact (existing)     │
                    │   - fire AI summarisation          │
                    └────────────────────────────────────┘
                                       │
                                       ▼
                              ┌──────────────────┐
                              │ Supabase         │
                              │  email_inbound   │  (existing, augmented)
                              │  email_threads   │  (existing)
                              │  email_folders   │  NEW
                              │  email_labels    │  NEW
                              │  email_drafts    │  NEW
                              │  email_attachments│ NEW
                              └──────────────────┘
                                       │
                                       ▼
                              ┌──────────────────┐
                              │ /mail UI in CRM  │  Outlook-grade web client
                              └──────────────────┘
                                       │
                                       ▼
            Outbound: existing Brevo client, per-user sender identity
```

## 3. Inbound provider — Postmark Inbound (recommended)

Choices considered:

| Provider | Cost (~150/day NextKey volume) | Pros | Cons |
|----------|----|------|------|
| **Postmark Inbound** | $15/mo (10K msg) | Cleanest webhook payload, parses MIME for you, attachments in S3 or inline base64, dead-simple setup | More expensive at higher volumes |
| **AWS SES Inbound** | <$2/mo | Cheap | Setup is heavier (S3 + Lambda or worker), MIME parsing is on you |
| **Mailgun Routes** | $35/mo | Decent | More expensive, less clean than Postmark |
| **CloudMailin** | $9-49/mo | Simple | Smaller company, less battle-tested |
| **Self-hosted Postfix + Dovecot** | infra cost only | "Free" | Operational nightmare. Don't. |

**Recommendation: Postmark Inbound.** $15/mo is fine for NextKey's volume. Webhook payload is JSON with parsed headers, plain-text body, HTML body, attachments. Saves us writing MIME parsing.

Postmark also runs the outbound SMTP we'd swap Brevo for if we wanted, but Brevo's already paid-for and works — keep Brevo for outbound, use Postmark only for inbound. (One-product-per-job is cleaner than betting everything on Postmark.)

## 4. Schema additions

```sql
-- Per-user logical inbox routing
ALTER TABLE email_inbound ADD COLUMN owner_user_email TEXT;
-- e.g. 'sean.l@nextkey.com.au' — derived from To/Cc/Bcc against an alias map

ALTER TABLE email_inbound ADD COLUMN folder_id UUID;        -- nullable, defaults to inbox
ALTER TABLE email_inbound ADD COLUMN labels TEXT[];          -- multi-label per email
ALTER TABLE email_inbound ADD COLUMN is_read BOOLEAN DEFAULT FALSE;
ALTER TABLE email_inbound ADD COLUMN is_starred BOOLEAN DEFAULT FALSE;
ALTER TABLE email_inbound ADD COLUMN is_archived BOOLEAN DEFAULT FALSE;
ALTER TABLE email_inbound ADD COLUMN is_trashed BOOLEAN DEFAULT FALSE;
ALTER TABLE email_inbound ADD COLUMN is_spam BOOLEAN DEFAULT FALSE;
ALTER TABLE email_inbound ADD COLUMN body_search TSVECTOR;   -- full-text search
CREATE INDEX email_inbound_search_idx ON email_inbound USING GIN (body_search);

-- New tables
CREATE TABLE email_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_email TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES email_folders(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (owner_user_email, name, parent_id)
);

CREATE TABLE email_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_email TEXT NOT NULL,
  to_addresses TEXT[],
  cc_addresses TEXT[],
  bcc_addresses TEXT[],
  subject TEXT,
  body_html TEXT,
  reply_to_email_id UUID,             -- if replying
  thread_id UUID,
  attachments JSONB,                   -- [{filename, size, storage_path}]
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE email_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID,                       -- can point to email_inbound OR email_log
  email_kind TEXT CHECK (email_kind IN ('inbound', 'outbound', 'draft')),
  filename TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  storage_path TEXT NOT NULL,          -- bucket/path
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Recipient → user mapping is intentionally simple — alias config table or hardcoded list. Sean + Glenn now, scale later.

## 5. UI — `/mail`

New top-level CRM section. Sidebar: Inbox / Sent / Drafts / Starred / Archive / Trash / Spam / [custom folders] / Labels.

Main pane: thread list with sender, subject snippet, unread bold, label chips, attachment paperclip, time. Multi-select checkboxes. Bulk action bar (mark read/unread, archive, trash, move to folder, apply label).

Detail pane: thread view with all messages collapsed except newest. Actions per message: reply, reply-all, forward, delete, print. AI smart reply already exists — keep it.

Compose: full rich text (TipTap), to/cc/bcc with autocomplete from contacts table, attachments via direct browser → Supabase Storage upload (existing pattern), per-user signature auto-appended, draft auto-save every 5 seconds, send via Brevo.

Search bar: full-text against body_search tsvector. Filters: from, to, has-attachment, date range, folder, label.

Per-user view: Sean sees only his mail (`owner_user_email = 'sean.l@nextkey.com.au'`); same for Glenn. Cloudflare Access already authenticates — we know who's logged in.

## 6. Outbound — per-user sender identity via Brevo

Brevo lets you send from multiple verified senders. Currently outbound goes from a single configured `BREVO_SENDER_EMAIL`. For multi-user:

1. Add both `sean.l@nextkey.com.au` and `glenn.m@nextkey.com.au` as verified senders in Brevo (DKIM signing happens automatically — already true since Brevo currently signs `nextkey.com.au`).
2. Compose UI picks sender from logged-in user identity.
3. `email_log` table already records `from_email` per send — no schema change.

DKIM, SPF, DMARC alignment: keep the existing Brevo records on `nextkey.com.au`. Add Postmark's required records when we cut over MX. Both can coexist (Brevo for outbound, Postmark only inbound).

## 7. MX cutover plan

This is the riskiest step. Order matters.

**Pre-cutover (run in parallel, no risk yet):**

- Set up Postmark inbound, get the webhook URL
- Build + deploy `/api/mail/inbound` route that accepts webhooks
- Test with a subdomain you control: e.g. `mail-test.nextkey.com.au` → MX → Postmark → webhook → Supabase. Send test emails to `anything@mail-test.nextkey.com.au` for a week. Confirm no message loss.

**Cutover day:**

- Pick a quiet window (e.g. Sunday 2am AEST)
- Lower TTL on existing Google MX records to 300s a day before
- Swap MX records on `nextkey.com.au` from Google to Postmark
- Within 30 minutes: new mail arriving at NextKey lands in CRM
- Google Workspace mailboxes still exist, just no new mail. Use them as read-only archive for a month.

**Belt-and-braces:**

- Keep Gmail OAuth poll running for 14 days post-cutover. Catches anything queued in Google before MX swap propagates.
- After 14 days verify nothing's been picked up that wasn't already in CRM. Disable poll.

**Then:**

- Cancel Google Workspace subscription. Mailboxes lock at the end of billing period.

**Rollback:**

- If something goes wrong in the first 24h, swap MX back to Google. ~30 minutes propagation. No mail lost (Google holds it during DNS flux).

## 8. Historical email migration — separate decision

Years of mail in Sean's + Glenn's Gmail mailboxes. Three options:

1. **Don't migrate.** Keep Google Workspace running indefinitely (just don't add new users). Cancel only when accounts are stale. Cheapest engineering, ongoing $20-60/mo.
2. **Read-only archive in CRM.** Bulk export via IMAP or Google Takeout, run a one-shot import script that lands historical email in the same `email_inbound` table marked `source='gmail_archive'`. ~2-3 weeks engineering, depends on volume.
3. **Selective migration.** Import only the last N years OR mail to/from contacts in CRM. Reduces volume. ~2 weeks.

Recommendation: **option 1 for v1**. Postmark catches everything new. Old mail stays where it is until you've decided you genuinely need it in the CRM. Reopen the question in 6 months.

## 9. Stocklist@nextkeypropertyinvest.com

Per `project_aggregator_v2.md`, the aggregator pulls from `stocklist@nextkeypropertyinvest.com` via Gmail OAuth. That's a **separate Google Workspace account** on a **different domain** (`nextkeypropertyinvest.com`, not `nextkey.com.au`).

Options:

- **Leave as-is.** It's a free Gmail account, not a paid Workspace user. Aggregator keeps polling. No work. Recommended.
- **Move into the new pipeline.** New MX record on `nextkeypropertyinvest.com`, route to Postmark, separate webhook for stocklist intake. ~2 weeks of work for no functional change.

Recommendation: **leave the stocklist@ inbox on Gmail OAuth**. It's working, it's free, and the migration of `nextkey.com.au` is enough scope.

## 10. Phase plan + estimates

| Phase | Scope | Estimate | Target completion |
|-------|-------|----------|-------------------|
| 0 | This doc + decisions sign-off | done | 2026-05-08 |
| 1 | Schema additions (folders, drafts, attachments, search). Polish existing email UI: search, drafts auto-save, folders/labels, bulk actions, attachments via Storage. Per-user inbox routing. Still uses Gmail OAuth poll on backend. | 3-4 weeks | ~2026-06-08 |
| 2 | Postmark Inbound setup + webhook handler. Spam-score routing. Run in parallel with Gmail poll on test subdomain `mail-test.nextkey.com.au`. | 2 weeks | ~2026-06-19 |
| 3 | **MX cutover Sunday 21 June 2026 02:00 AEST.** 14-day belt-and-braces with Gmail OAuth poll still running. Cancel Glenn's Google seat at end. Sean's seat retained per §11 Q5. | cutover day + 2 wks observation | 2026-06-21 cutover, ~2026-07-05 stable |
| 4 | Outbound polish — per-user Brevo verified senders, signature integration. | 1 week | ~2026-07-12 |
| 5 | Calendar bridge — render incoming ICS attachments as "Add to Google Calendar" inline. | 1 week | ~2026-07-19 |
| 6 | **Historical email import** (Q2 = yes). Bulk Google Takeout export per mailbox → import to Supabase as `source='gmail_archive'`. Includes attachments. Streaming import to handle volume. | 2-3 weeks | ~2026-08-09 |

**Total: 11-13 weeks. Project completes ~9 August 2026.**

## 11. Decisions log (resolved 2026-05-08)

1. **Inbound provider — Postmark Inbound.** $15/mo, clean webhook API, parses MIME for us, has SpamAssassin scoring built-in.
2. **Historical migration — option 2 (full import).** Bulk export Sean's + Glenn's Gmail mailboxes via Google Takeout / IMAP, import to Supabase tagged `source='gmail_archive'`. Adds ~2-3 weeks (Phase 6) — see §10 phase plan.
3. **Stocklist@ inbox — keep on Gmail OAuth.** Free account, working pipeline, separate domain. Don't touch.
4. **Cutover window — Sunday 21 June 2026, 02:00 AEST.** Picked by Claude on Sean's instruction. Gives Phase 1 (3-4 wks) + Phase 2 (2 wks) clean runway from today (2026-05-08).
5. **Mobile — hybrid.** Sean keeps his Google Workspace seat (~$10-15/mo) for native iOS Mail / Gmail mobile experience. Glenn drops his and goes PWA-only on `/mail`. Easy to flip later.
6. **Spam — use Postmark's built-in SpamAssassin scoring.** Postmark already runs SpamAssassin and includes the score on every webhook. We consume the score and route to spam folder above threshold 5.0. No separate $5/mo service needed.
7. **Trash + spam retention — auto-purge after 30 days** (Gmail-style). Daily cron deletes rows + storage attachments older than 30 days from `is_trashed=true OR is_spam=true`.

## 12. External steps Sean has to do

Before I can start Phase 2 (~early June):

1. **Sign up for Postmark.** Verify the account, add payment, give me the Server API token + Inbound webhook URL config access.
2. **Verify both `sean.l@nextkey.com.au` and `glenn.m@nextkey.com.au`** as Brevo senders so per-user outbound works (Phase 4).

Before Phase 3 cutover (Sunday 21 June 2026):

3. **Lower TTL on existing Google MX records** the day before — Saturday 20 June. (One-line DNS change in Cloudflare; I'll write the exact instruction.)
4. **Be available 02:00 AEST Sunday 21 June.** I do the MX swap + watch logs; you confirm mail reaches the new system from a few external test addresses.
5. **Plan Google Workspace cancel timing for Glenn's seat.** Postmark catches new mail from cutover; once we've verified 14 days of clean delivery (~2026-07-05), cancel Glenn's seat at end of his current billing period. Sean's seat stays.

Before Phase 6 historical import (~late July):

6. **Run Google Takeout** for both Gmail mailboxes — exports `.mbox` files of all historical mail. I'll give exact instructions; takes ~1 hour to request, ~24 hours for Google to deliver. Upload to Supabase Storage; my import script processes from there.

## 13. Things explicitly NOT in scope

- Calendar replacement (stays Google OAuth)
- Native mobile email apps (PWA only)
- Drive, Meet, Docs, Photos
- Multi-tenant version of the email client (that's a SaaS Phase 4 item — see `SAAS_DESIGN.md`)
- Migrating `stocklist@nextkeypropertyinvest.com` (stays on Gmail OAuth)

---

**Status as of 2026-05-08 EOD:** all 7 decisions resolved (see §11). Sean's blockers: sign up for Postmark, verify both senders in Brevo. I'm cleared to start Phase 1 — schema migrations + UI polish (still on Gmail OAuth backend, no MX changes yet, low risk). Tell me when Postmark's set up and I'll start.
