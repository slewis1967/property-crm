# Lender policy research pack

One JSON file per lender, named `<id>.json`, matching the `LenderPolicy` type in
`utils/lender-policy/types.ts`. These are the **committed research tranche**:
version-controlled so every change to a policy fact is a reviewable diff, and
loaded as the fallback library when the Supabase `lender_policies` table is
empty or unmigrated.

## The rule that matters

**No source URL + no as-at date = not a policy fact.** `verifyFact()` in
`utils/lender-policy/verify.ts` demotes any such value to `unverified`, and the
matching engine refuses to rely on an unverified value — the check returns
`unknown`, never `pass`. Never write a number into these files that you did not
read on a public lender page.

If a value could not be found, either omit the field entirely (not researched)
or record it honestly:

```json
{ "value": null, "asAt": null, "sourceUrl": null, "confidence": "low", "status": "not_found",
  "note": "Not published on the public broker site; policy guide is behind a broker login." }
```

## Source rules

- Public, no-login lender broker/introducer sites, published credit policy
  guides, rate/product schedules, LMI and LVR matrices, servicing calculators
  and their help text.
- **Never** anything behind a broker login or an aggregator portal (ToS).
- `sourceUrl` must be the page the value was actually read on, not the site root.

## Importing

`POST /api/lenders/import` (authenticated) upserts the pack into Supabase, or
the library falls back to reading these files directly when the table is absent.
