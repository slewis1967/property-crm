# Lender Policy database + matching engine

Every Australian home-loan lender's published lending policy, in a form a
machine can check a client scenario against.

Two surfaces:

- **`/lenders`** — the reference library. Search and filter published policy
  across every lender on file, with the state of the evidence on every row.
- **`/lenders/match`** — the matching engine. A client scenario in, a ranked
  lender shortlist out, with a pass/fail reason and a source link behind every
  line, plus an estimated maximum loan under each lender's own servicing
  parameters.

---

## The problem this solves, and the problem it creates

A broker's real question is not "how much can this client borrow?" — the
capacity engine already answers that. It is "**which lenders will actually look
at this client, and which one lends the most?**" Those are different questions,
because the answer turns on policy: the assessment buffer, whether casual income
is shaded, whether a 38m² unit is acceptable security, whether a paid default
five years ago is fatal.

That data is published — every lender puts a broker credit policy guide on a
public website — but it is spread across a hundred sites in a hundred formats,
and it changes constantly. So it gets researched by AI.

Which creates the real risk. **A language model reading lender websites is
excellent at producing a plausible assessment buffer and terrible at knowing it
invented one.** The dangerous failure here is not an empty database; an empty
database is obviously empty. It is a *confidently wrong* one, which produces a
broker recommending a lender that will decline the client, with a citation
underneath it that looks authoritative.

Everything below is built around that.

---

## The one non-negotiable rule

**A policy fact with no source URL and no as-at date is not a policy fact.**

Every value in the taxonomy is a `Fact<T>`:

```ts
{ value, asAt, sourceUrl, sourceTitle, confidence, status, note }
```

`verifyFact()` (`utils/lender-policy/verify.ts`) demotes to `unverified`
anything that is:

| Check | Rejects |
|---|---|
| Provenance | no `sourceUrl`, no `asAt` |
| Shape | a bare origin (`https://cba.com.au/` — you don't read a buffer off a homepage), a non-http scheme, an impossible date |
| Freshness | an `asAt` in the future, or more than two years old |
| Plausibility | a value outside `PLAUSIBLE_RANGES` for that field path — a 47% assessment buffer is a misread, not a policy |
| Confidence | the researcher's own `low` |

Demoted facts are **not deleted**. They stay visible in the reference library —
a human can read them and judge for themselves — and are excluded from
automated matching, with the reason shown on the row.

Two further properties matter:

- **`verifyPolicy()` overwrites the researcher's own `status` claim with the
  verdict.** A research agent supplies evidence; it does not grant itself
  clearance. This holds at the API edge too: `POST /api/lenders` re-verifies
  rather than trusting what it was sent.
- **Verification runs on every read**, not just at write time. A fact that was
  fresh when researched goes stale on its own.

`human_confirmed` is the single status that bypasses the plausibility and
confidence heuristics — a broker holding the actual policy document outranks a
range check. It still requires provenance.

---

## `unknown` is a first-class answer

The matching engine returns four outcomes per check: `pass`, `fail`, `refer`,
`unknown`.

**Any check that cannot be evaluated on a verified fact returns `unknown`,
never `pass`.** A lender with no researched credit policy is never reported as
"accepts your defaults"; it is reported as "we haven't confirmed their default
policy". A lender with no real passes at all cannot be `eligible` — it is
`insufficient_data`, which is what stops an empty record sailing to the top of
a shortlist.

`unknown` also covers the *scenario* side: if the fact find doesn't record the
unit's floor area, the minimum-size check says so rather than assuming it fits.

---

## It is not a second calculator

`estimateMaxLoan()` calls `computeCapacity()` from `utils/finance/capacity.ts`
with the lender's own parameters overlaid:

| Lender policy field | Capacity input |
|---|---|
| `servicing.assessmentBufferPct` | `buffer` |
| `servicing.assessmentFloorRatePct` | `assessmentFloorRate` *(new, optional)* |
| `servicing.rentShadingPct` | `rentShading` |
| `servicing.dtiCap` | `dtiCap` |
| `servicing.creditCardAssessmentPct` | `creditCardAssessmentRate` *(new, optional)* |
| `servicing.hemLoadingPct` | `hemLoading` *(new, optional)* |

The three new `CapacityInputs` fields are optional and default to the existing
generic behaviour, so every prior caller is unchanged. The result is then capped
by the lender's published maximum loan and by its maximum LVR against the
property value, and **which of the three bound it is reported** — so a broker
can see whether the client is income-constrained or deposit-constrained.

Any parameter the lender doesn't publish falls back to the generic default, and
the UI says how many did: *"3 servicing parameters not published by this lender,
so generic assumptions were used."* The estimate must never be mistaken for the
lender's own calculator.

---

## Research pipeline

Two callers, one standard — `docs/lender-policy-research-brief.md`, kept in the
repo rather than inlined in a prompt so it can't drift between them.

1. **Bulk tranches** — Claude Code subagents, ~10 lenders each, writing
   `data/lender-policies/<id>.json`.
2. **In-app refresh** — `POST /api/lenders/research {lenderId, apply}`, one
   lender, via OpenRouter with web search.

The in-app route enforces the contract **in code**, not in a prompt:

1. `verifyFact` — provenance, shape, plausibility, confidence.
2. **Live source check** (`source-check.ts`) — the URL must actually resolve.
   This is the gate a prompt cannot enforce and a shape check cannot catch: an
   invented fact usually arrives with an invented-but-plausible URL on the right
   domain. (It carries an SSRF guard, because these URLs come from a model.)
3. **Host allowlist** — aggregator portals (Connective, AFG, LMG, Loan Market)
   and comparison sites (Finder, Canstar, RateCity) are rejected as sources.
   Aggregator portals are also a terms-of-service problem, which is why the
   research brief forbids them outright.
4. **Never auto-applied on its own say-so** — `apply` must be requested, and
   even then only accepted fields are written. A rejected fact is not stored as
   `unverified`; it is not stored at all, because a stored one would look like
   somebody read it somewhere.

Rejections are returned to the caller and logged to
`lender_policy_research_runs.rejections`. **If that log is empty run after run,
the gate has stopped working and should be suspected, not trusted** — the same
lesson as the paid-accounts heartbeat and the YLA sweep that silently returned
zero for weeks.

### Sources

Public, no-login lender broker sites, credit policy guides, rate and product
schedules, LVR/LMI matrices, postcode category lists, and serviceability
calculator help text. Never anything behind a broker login, never an aggregator
portal, never a comparison site's summary presented as the lender's own.

---

## Storage, and why the fallback is a feature

`data/lender-policies/*.json` is the reviewable source of truth — one file per
lender, so a policy change is a git diff. `node scripts/build-lender-pack.mjs`
bundles them into `utils/lender-policy/pack.generated.ts`.

`loadPolicies()` reads Supabase; if the table is missing **or empty**, it serves
the bundled pack and flags `source: "pack"`. So the library and the matching
engine work before `migrations/20260729_lender_policies.sql` is applied. What
the migration buys is *writes*: broker corrections, human confirmation, version
history.

Three deliberate storage decisions:

- **Broker confirmations live in `lender_policy_field_reviews`, not in the
  policy blob**, and are folded over it on read. A later research pass rewrites
  `data` wholesale; corrections stored inside it would be silently destroyed.
  Automated research must never be able to overwrite a human who checked.
- **Superseded policy versions are archived, not overwritten**
  (`lender_policy_versions`). "What did their buffer say when I recommended
  them in March?" has to stay answerable.
- **The table is `lender_policies`, not `lenders`.** A generic name risks
  silently no-opping against a pre-existing table — the `fact_finds` trap. The
  explicit `add column if not exists` block is the second belt.

---

## Compliance boundary

The output is an **internal research aid for licensed brokers**. It is not a
credit assessment, not a pre-approval, not consumer-facing credit advice, and
not for a client's eyes. `MATCH_DISCLAIMER` is rendered on the library, the
detail page and every match run, and the copy says so in those words.

Two supporting decisions:

- `POST /api/lenders/match` is **stateless**. The scenario carries income,
  dependents and credit history — client PII under APP 11 — and a shortlist is a
  working calculation, not a record. The Fact Find and Needs Analysis are the
  records. Not persisting it is the cheapest way to be right about that.
- The Fact Find bridge surfaces its `assumptions[]` **before** the shortlist,
  because the fields the Fact Find lacks (employment basis, tenure, residency,
  credit history) are exactly the ones lenders knock clients out on.

Note that this is *not* Springboard finance marketing, so the YLA clause-7
prior-approval rule does not apply: nothing here is advertising, and nothing
here is shown to a consumer.

---

## Files

| File | Role |
|---|---|
| `utils/lender-policy/types.ts` | The taxonomy — 8 sections, every leaf a `Fact<T>` |
| `utils/lender-policy/verify.ts` | The anti-hallucination gate (pure, tested) |
| `utils/lender-policy/match.ts` | The rules engine + ranking (pure, tested) |
| `utils/lender-policy/scenario.ts` | `LenderScenario`, composing `CapacityInputs` |
| `utils/lender-policy/index.ts` | Hydrate, search/filter, formatting, table-missing guard |
| `utils/lender-policy/store.ts` | Supabase + pack fallback + field reviews (server only) |
| `utils/lender-policy/source-check.ts` | Live URL resolution + SSRF guard (server only) |
| `utils/factfind-lender-scenario.ts` | Fact Find → scenario bridge |
| `app/api/lenders/` | list/save, detail/confirm, match, research, import, scenario |
| `app/lenders/` | Library, detail, match UI |
| `migrations/20260729_lender_policies.sql` | 4 tables, RLS default-deny |
| `docs/lender-policy-research-brief.md` | The research standard both callers follow |

## Operating it

```bash
# after a research tranche
node scripts/build-lender-pack.mjs
npx vitest run utils/lender-policy
```

Then, once `migrations/20260729_lender_policies.sql` is applied in Supabase,
click **Import research pack into the database** on `/lenders` (or
`POST /api/lenders/import`). It is idempotent and archives what it replaces, so
re-running it after each research tranche is the normal publish step.
