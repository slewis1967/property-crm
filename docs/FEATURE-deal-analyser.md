# Feature Spec — Co-Living / Investment Deal Analyser

**Status:** in build (Phase 0 proven, Phase 1 starting)
**Owner:** Sean Lewis · **Built by / for:** Claude → Hermes (operator)
**Last updated:** 2026-05-24

> Build this against this document. Every decision below is locked. The
> compliance section is a hard constraint, not a guideline.

## 1. What it does
When a builder/supplier emails property packages (flyer PDFs + market data in
the body), the system extracts and verifies the data, then produces
**professional, client-ready investment analysis**:
- **One PIA report per property** (with floorplan/render images pulled from the flyer).
- **One comparison report** when there's more than one property — comparing features,
  benefits, and investment potential, ranking each **1–10**, and recommending the
  strongest for return.
- Reports save to the **opportunity**, export to **PDF**, and are written in clean,
  confident, benefit-led **"Apple-speak."**

We make money by making sales — the analysis exists to help a client make an informed,
confident investment decision. It must be accurate and compliant, or it does the opposite.

## 2. Locked decisions
| # | Decision |
|---|---|
| 1 | **Output:** N properties → N individual PIA reports + 1 comparison report (N>1). Co-living shows single-let vs co-living income *within* its own report. |
| 2 | **Trigger:** automatic when a package email is forwarded by anyone with CRM access (classifier-gated). **Auto-generate, manual-deliver** — the system builds reports into the opportunity; a human approves before any client receives them. |
| 3 | **Rating/recommendation (1–10 + best pick):** client-facing — therefore general-advice framing + disclaimers + compliance-check + human sign-off before send. |
| 4 | **Data sources:** property specs from the PDF flyer; market data from the email body; **rent from the email body, and if missing → prompt the operator to supply a rental figure** (attributed as a NextKey estimate). Never fabricate rent or returns. |
| 5 | **Commission / internal figures** (e.g. "$55k comms") are redacted and can never reach a client document. |

## 3. Proven foundation (Phase 0, validated on the real `Co-Living Investments.eml`)
- **PDF spec extraction** via the OpenRouter `SMART` model's native PDF/vision (CRM `OPENROUTER_API_KEY`) correctly reads price, land/build split, sizes, the **icon-encoded bed/bath/car config** (`5/5/2/1`, `3/3/1/1`), and the **co-living tag**. Land+Build = Total gives a free accuracy check.
- **Body parsing** structures per-suburb market data, **reconciles conflicting multi-source figures** (e.g. 3 Armstrong medians → mean + variance flag), and **redacts commission**.
- **Verification** auto-flags: source disagreements, past-performance/disclaimer requirements on every growth/yield figure, planning projections stated as facts, stale census data, and "config looks co-living but no tag — confirm."
> Do NOT reuse the NEXUS aggregator's Gemini path — its `GEMINI_API_KEY` is an
> OpenRouter key and the google-genai SDK can't use it (silently falls back to Sonnet).
> Use Claude native PDF via the CRM key.

## 4. Pipeline + reuse map
```
inbound forward (PDF flyers + body)        ← email_log + email_attachments (attachment sync live)
 1 CLASSIFY → property package? CRM-authorised sender? → match/create opportunity        [NEW]
 2 EXTRACT  → per PDF: Claude vision → specs JSON; pymupdf → pages 2-4 images → Storage   [NEW + reuse]
 3 PARSE    → body → per-property market; reconcile sources; REDACT commission            [NEW]
 4 VERIFY   → cross-checks (price math, co-living heuristic); confidence + flags          [NEW]
 5 RENT     → rent from body; if missing → status=needs_rent_input → prompt operator      [NEW]
 6 MODEL    → co-living = per-room income; pull client financials from opportunity        [reuse /pia]
 7 GENERATE → 1 report/property (+ comparison if N>1); Apple-speak; embedded images       [NEW templates]
 8 GATE     → compliance-check + disclaimers; hold for human sign-off before client send  [reuse compliance-check]
```
**Reuse:** `pia_reports` + `/api/pia/reports` + `/pia` (storage, email, export), `/compare` + `/api/properties/compare` (comparison), `app/api/ai/compliance-check` + `utils/compliance-review.ts` (gate), `app/api/ai/extract-document` (pattern), jsPDF in `PropertyGrid` (PDF export). **Architecture:** extraction → NEXUS (Python, hooks `elvis_email_inbound.py`); report gen + UI + export → CRM (Next.js). The `deal_packets` table is the contract between them.

## 5. Data model

### `deal_packets` table (run in the Supabase SQL editor)
```sql
create table if not exists deal_packets (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  text,                                   -- NEXUS lead id (opportunities live in NEXUS)
  source_email_id uuid references email_log(id),          -- the inbound package email
  status          text not null default 'extracting',     -- see DealPacketStatus
  property_count  int,
  packet          jsonb not null default '{}'::jsonb,      -- the verified DealPacket (see utils/deal-packet.ts)
  redactions      jsonb default '[]'::jsonb,               -- internal figures stripped (e.g. commission)
  created_by      text,                                    -- CF-Access user who forwarded/triggered
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists deal_packets_opportunity_idx on deal_packets (opportunity_id);
create index if not exists deal_packets_status_idx       on deal_packets (status);
```
RLS: default-deny like the other tables; server-side service-key client only (`utils/supabase.ts`).

### Deal-packet JSON shape
Typed contract in **`utils/deal-packet.ts`**. `status` flow:
`extracting → needs_rent_input → ready → reports_generated` (or `failed`).

## 6. Compliance — HARD constraints (see `.claude/product-marketing-context.md`)
- Direct-property merit assessment + comparison is OK **as general advice** with the standard disclaimer. The 1–10 is "NextKey's assessment of the property's investment merits," not "right for you."
- **Never:** specific loan/finance product recommendations (NCCP — credit licence), SMSF-specific advice (AFSL), tax-treatment claims (tax agent), or any "guaranteed/will" return wording (ACL s.18/29).
- Growth/yield figures appear **only** as sourced, dated, past-performance — never forward promises. Every verify-flag from Phase 0 that says "disclaimer required" must be honoured in the rendered report.
- **Commission and any internal/commercial figure never appears in a client document.**
- Every client-facing report runs through `compliance-check` and requires **human sign-off before send**.

## 7. Phasing
- **Phase 0 — extract → verify → deal-packet.** ✅ Proven (POC). Becomes a real NEXUS module + this table.
- **Phase 1 — report generation.** Deal-packet → 1 PIA report/property, Apple-speak template, embedded flyer images, saved to `pia_reports` on the opportunity, PDF export. Compliance-gated. ← *building now*
- **Phase 2 — comparison + 1–10 rating + recommendation** (client-facing, disclaimed, reviewed).
- **Phase 3 — auto-trigger:** classifier + `elvis_email_inbound.py` hook, with the manual-deliver gate and the `needs_rent_input` prompt.

## 8. Notes for the operator (Hermes)
- Verify before trusting: run `next build` before any merge (the CRM 500 incident on 2026-05-24 came from a fix that didn't build — see `INCIDENT-2026-05-24-crm-500.md`).
- The deal-packet is the seam: keep NEXUS (extraction) and CRM (reports) decoupled through it.
- When in doubt on a number, **flag and prompt** — never invent. A wrong return figure is both a bad sale and a compliance breach.
