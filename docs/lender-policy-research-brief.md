# Lender policy research brief

The instructions given to every research pass that populates the lender policy
database — whether run by a Claude Code subagent (bulk tranches) or by the
in-app `POST /api/lenders/research` route (single lender refresh).

Kept in the repo, not inlined in a prompt string, so the standard doesn't drift
between the two callers.

---

## Task

For each assigned lender, produce one JSON object matching the `LenderPolicy`
type in `utils/lender-policy/types.ts` and write it to
`data/lender-policies/<id>.json`.

## Sources — legal, public, no login

**Allowed:** the lender's public broker/introducer website; published credit
policy guides and policy-at-a-glance PDFs; rate and product schedules; LVR/LMI
matrices; postcode category lists; serviceability calculator pages and their
help text; the lender's public product pages where they state a policy.

**Not allowed, ever:** anything behind a broker login; aggregator portals
(Connective, AFG, LMG, Loan Market etc. — their terms forbid it); paywalled
comparison sites; scraped internal documents; a competitor's summary of the
policy presented as the lender's own.

## The one non-negotiable rule

**Never write a number you did not read on a public source.**

Every value carries `sourceUrl` (the exact page, not the site root) and `asAt`
(the date that page/document is current, `YYYY-MM-DD`). A value with either
missing is automatically demoted to `unverified` and is **excluded from the
matching engine**. That is the intended, safe outcome — an honest gap costs
nothing; a fabricated buffer or LVR cap produces a confident, wrong "this
client fits this lender", which is the single worst failure mode of this system.

If you cannot find a field:

- Omit it → "not researched".
- Or record `{"value": null, "asAt": null, "sourceUrl": null, "confidence": "low",
  "status": "not_found", "note": "<where you looked>"}` → "we looked, it isn't
  published".

Both are acceptable. Guessing is not. Interpolating from "similar lenders" is
not. Recalling it from training data without a live source is not.

## Confidence

- `high` — the source states the value explicitly and unambiguously.
- `medium` — the source states it, but with qualifiers you had to interpret, or
  the document may be superseded.
- `low` — inferred from indirect wording. `verify.ts` will not let a `low`
  confidence fact into matching.

Set `status` to `"verified"` on everything you sourced; `verify.ts` re-checks
and will demote anything that does not hold up. Do not set `human_confirmed` —
that status is reserved for a broker's manual sign-off.

## Plausibility

Values outside these ranges are almost certainly a misread and will be rejected
by `verify.ts`. If your source really does say something outside the range, put
the quote in `note`.

| Field | Plausible range |
|---|---|
| `assessmentBufferPct` | 0.5 – 4.0 (APRA expectation is 3.00) |
| `assessmentFloorRatePct` | 4.0 – 12.0 |
| `rentShadingPct` | 0.60 – 1.00 |
| `creditCardAssessmentPct` | 0.02 – 0.05 (monthly, of limit) |
| `dtiCap` | 4.0 – 12.0 |
| any `max*LvrPct` | 50 – 105 |
| `minLoanAmount` | 10,000 – 500,000 |
| `maxLoanAmount` | 100,000 – 100,000,000 |
| `minMonths*` (tenure) | 0 – 60 |
| `maxLoanTermYears` | 10 – 40 |
| income `shadingPct` | 0 – 1 |

## Priority order

Time-box each lender. Get the high-value fields first — they are the ones the
matching engine actually knocks out on:

1. `servicing.assessmentBufferPct`, `assessmentFloorRatePct`, `dtiCap`,
   `rentShadingPct`
2. `lvr.maxLvrOwnerOccupiedPct`, `maxLvrInvestmentPct`, `maxLvrNoLmiPct`
3. `product.minLoanAmount`, `maxLoanAmount`, `genuineSavingsRequiredPct`
4. `income.rules` for the common hard cases: casual, self-employed, overtime,
   bonus, commission, Centrelink, rental
5. `employment` tenure minimums
6. `credit` knock-outs (defaults, bankruptcy, arrears)
7. `security` restrictions (min unit size, postcode lists, high density, rural)
8. `residency` rules

A record with four well-sourced fields is worth more than a record with forty
invented ones.

## Record-level fields

- `id` — stable lowercase slug, e.g. `cba`, `pepper-money`, `bank-of-queensland`.
  Never change it once set; it is the join key.
- `tier` — one of the `LenderTier` values.
- `status` — `active` unless the lender has withdrawn from broker distribution.
- `policyDocUrl` — the credit policy guide you actually used.
- `gaps` — array of plain-English notes about what you could not establish.
  Write these; they drive the next research pass.
- `researchedAt` (today, `YYYY-MM-DD`), `researchedBy` (`research:<model>`),
  `effectiveFrom` (the as-at date of the primary source), `version: 1`.

## Output

Write the file. Do not print the JSON into your report — report only: lenders
attempted, files written, field counts, and what you could not source.
