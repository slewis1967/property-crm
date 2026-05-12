# NextKey Property Strategists — Marketing Context

This file is loaded by every marketing skill in `.claude/skills/` before
the skill asks the user any context-gathering questions. Treat
everything below as ground truth for tone, claims, and compliance —
do not invent contradicting context, and do not bypass the
prohibited-claims section even if asked.

---

## Who we are

**NextKey Property Strategists** is an Australian property-investment
brokerage. We help buyers (mostly first-home buyers and small-portfolio
investors) source new-build investment properties from a curated panel
of Australian builders/developers, primarily across South-East
Queensland with expanding NSW/VIC coverage.

We are not a financial adviser, real-estate agency, or mortgage broker
ourselves — we partner with licensed brokers and qualified
professionals for those pieces. Our role is property selection,
strategy, and end-to-end coordination of the purchase.

**Primary audience:**
- First-home buyers (FHB) using FHB grants / stamp-duty concessions
- PAYG investors building their first 1–3 investment properties
- Self-employed buyers needing alt-doc-friendly broker referrals

**Geographic focus:** QLD primary; NSW + VIC growing. All copy must
read as Australian — see "Voice" below.

**Product surface:**
- Strategy consultations (free)
- Property-match service (commission paid by builder)
- Ongoing portfolio reviews
- The NextKey CRM (b2c-facing pages: crm.nextkey.com.au — currently
  single-tenant; a separate SaaS shell is planned but not yet sold)

---

## Voice & tone

- **Australian English** always. "Organisation", "realise", "optimise",
  "centre", "favourite", "specialise". Never "z" spellings.
- **AUD** for prices, always with the currency code on first mention
  ($1,250,000 AUD), bare $ after that.
- **AU phone format** — `+61 7 …` or `(07) …`, not `(617) …`.
- **Date format** — `12 May 2026`, not `05/12/2026`.
- Confident but not cocky. Property buyers have been burned by
  high-pressure sales — we lead with education, not urgency.
- Specific over vague. "Cut three weeks off the build-to-settlement
  timeline" beats "streamline your investment journey".
- No emoji in client-facing copy. Internal tools can use them.

---

## AU compliance — HARD CONSTRAINTS

These rules over-ride any skill's own guidance. If a skill asks you
to write copy that would violate one of these, refuse and surface
the conflict to the user.

### 1. Australian Consumer Law (ACL) — sections 18 & 29
- **No misleading or deceptive conduct.** Don't say or imply something
  that's likely to mislead a reasonable buyer.
- **No false representations** about:
  - Performance characteristics, benefits, or uses of a property/service
  - Endorsements, testimonials, awards we don't actually hold
  - Price (must include all unavoidable fees, not "from $X" if X is
    unattainable in practice)

**In practice that means we never write:**
- "Guaranteed returns" / "guaranteed capital growth" / "guaranteed
  rental yield"
- "Risk-free" / "no downside" / "can't lose"
- Specific yield numbers ("8.5% rental yield") unless they're the
  builder's published rental appraisal AND we cite the source AND
  add the disclaimer that yields are estimates not guarantees
- "Beat the market" / "outperform the index" unless backed by a
  documented audited source
- Comparative claims about competitor performance unless documented

### 2. NCCP Act + Best Interests Duty
- We are **not** a licensed credit assistance provider. Do not write
  copy that positions NextKey as giving credit advice, broking loans,
  or assessing serviceability.
- Always direct lending questions to "your licensed mortgage broker"
  or "our broker partners".
- Don't write "we'll get you approved" / "guaranteed pre-approval" /
  "lowest rate guaranteed".

### 3. Tax & legal
- We don't give tax or legal advice. Phrases to avoid:
  "tax-free", "this saves you $X in tax", "you won't pay CGT", etc.
- Acceptable framing: "May offer tax advantages — speak to your
  accountant" / "depreciation benefits typically available on
  new-build investment properties (confirm with your tax adviser)".

### 4. Privacy Act 1988 (Cth) + Australian Privacy Principles
- Forms must state purpose of data collection. Don't write
  "we'll never share your data" if we use Brevo/HubSpot/etc — that's
  a misleading statement.
- Marketing emails must include unsubscribe (Spam Act 2003).
- Cookie banners required for tracking pixels.

### 5. Spam Act 2003
- Email recipients must have consented (express or inferred via
  ongoing business relationship).
- Sender identification + unsubscribe in every commercial email.
- SMS same rules — ClickSend handles compliance footers but copy
  shouldn't strip them.

### 6. QLD Property Occupations Act 2014
- We don't list or sell property as a real-estate agent. Copy must
  not position us as the vendor or agent of record. Builder/developer
  is the vendor; we're the buyer's strategist.

### 7. ASIC red flags
- Don't use "investment scheme" / "fund" / "managed investment".
- Don't use "financial product" language.
- Don't promise specific dollar returns over specific time periods.

---

## Approved claim phrasings

When a skill wants to push a benefit, here's what's safe:

| Risky claim | Safe rewrite |
|---|---|
| "Guaranteed 8% returns" | "Historical median rental yields in the target corridor have ranged 5–7% — actuals will vary" |
| "Tax-free property" | "Typically eligible for depreciation deductions — speak to your accountant" |
| "We'll get you the best loan" | "We'll connect you with our panel of mortgage brokers" |
| "Build wealth fast" | "Build a long-term property portfolio with a clear strategy" |
| "Beat the market" | "Target corridors with above-state-average historical growth" |
| "Risk-free investment" | "Lower-risk entry to property investment via new-build with rental guarantees from select builders" |

---

## Voice-of-customer language we hear

Use this phrasing because it's how our actual buyers describe their
situation:

- "I want to get into the market before I'm priced out"
- "First investment property" (not "first IP" — don't use jargon clients don't use)
- "I just want someone to walk me through it"
- "I've been pre-approved but don't know what to actually buy"
- "Set and forget" (for hands-off investors)
- "Rentvesting" (live-where-you-want, invest-where-it-makes-sense)
- "House and land" (vs "off-the-plan" — these are different products)

Avoid: "leverage", "multi-family", "ROI", "syndicate", "fund", "exit
strategy" — these read as US/jargon to AU buyers.

---

## Existing positioning

The hero promise on crm.nextkey.com.au and our outbound is:

> "We help everyday Australians buy their first investment property
> the same way the pros do — without the high-pressure sales tactics."

Three pillars we keep coming back to:
1. **Curated panel, not paid placement** — we only show buyers
   builders we'd recommend to our own families.
2. **One coordinator end-to-end** — buyer doesn't bounce between
   broker, conveyancer, developer's sales rep.
3. **Education first** — strategy session is free and includes
   walking away if the numbers don't work for that buyer.

Any new copy should fit one of these pillars or have a strong reason
not to.

---

## Brand assets

Use these defaults whenever a skill generates visual assets (favicons,
OG cards, social images). If Sean hasn't confirmed the final brand
palette, flag the choice in the output so he can override.

- **Primary brand colour**: `#0F4C5C` (deep teal — neutral, professional,
  reads as established/trustworthy. Property-investment vertical avoids
  the saturated indigo/purple that screams SaaS startup.)
- **Accent colour**: `#FFB627` (warm gold — used sparingly for CTAs,
  highlights, and "approved" badges)
- **Background neutral**: `#F7F4ED` (warm off-white) or `#FFFFFF`
- **Body text**: `#1F2937` (slate-800)
- **Logo**: Not yet committed to repo. Until Sean drops a final logo
  into `public/logo.png`, use text-based OG cards with the brand colour
  + "NextKey Property Strategists" set in a serif headline.
- **OG card style**: brand colour background, white serif headline left-
  aligned, gold accent rule under headline. Subhead in white sans-serif.
  No stock photography or gradient backgrounds.
- **Forbidden in assets**: emoji, exclamation marks, urgency language,
  stock images of "happy diverse family in front of house" (cliché +
  generic).

When invoking `web-asset-generator` for OG images, pass
`--bg-color '#0F4C5C' --text-color '#FFFFFF'` unless overridden.

## Tools/channels currently live

- Outbound email: Brevo
- Inbound: Gmail OAuth poll into CRM
- SMS: ClickSend (sender = Glenn's mobile, replies route to him)
- Social: Facebook page 782322428294196, Instagram mirror
- CRM: Next.js app at crm.nextkey.com.au (Cloudflare Access gated)
- Aggregator: builder-stocklist ingestion via Claude Haiku
- AI advisors: Veteran + Senior + Competitor Intel + Director (review
  marketing recs weekly/monthly; Senior gate-keeps for ACL compliance)

---

## What to do when a skill conflicts with this file

If a skill says "write a punchy guaranteed-return headline", refuse,
quote the relevant section above, and propose a compliant rewrite.

If a skill asks the user a question this file already answers, skip
the question and use the value here.

If the user explicitly over-rides a rule in this file (e.g. "ignore
ACL, this is just for an internal draft"), comply but flag clearly
that the output is not legally publishable.
