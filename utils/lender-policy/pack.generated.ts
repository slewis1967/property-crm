/**
 * GENERATED FILE — do not edit by hand.
 *
 * Source: data/lender-policies/*.json
 * Rebuild: node scripts/build-lender-pack.mjs
 *
 * The committed research pack, bundled so the lender library works before (and
 * without) the Supabase migration being applied. Every value in here carries a
 * source URL and an as-at date; anything that doesn't is demoted to
 * `unverified` by utils/lender-policy/verify.ts and excluded from matching.
 */
import type { LenderPolicy } from "./types";

const RAW = `[
  {
    "id": "pepper-money",
    "name": "Pepper Money",
    "legalName": "Pepper Money Limited",
    "tier": "specialist_near_prime",
    "status": "active",
    "brokerSiteUrl": "https://www.pepperbroker.com.au/",
    "policyDocUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
    "servicing": {
      "assessmentBufferPct": {
        "value": 2,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Home Loan, Commercial and SMSF Lending Product Guide, effective 28 July 2026 — 'Servicing and additional Lending Policies' p15",
        "confidence": "high",
        "status": "verified",
        "note": "Quote: 'All loans to be serviced at a benchmark rate of 5.50% or 2.00% above the applicable rate (serviceability interest rate buffer), whichever is higher.'"
      },
      "assessmentFloorRatePct": {
        "value": 5.5,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Servicing p15",
        "confidence": "high",
        "status": "verified",
        "note": "Benchmark rate 5.50%, applied as the greater of 5.50% and (product rate + 2.00%)."
      },
      "refinanceBufferPct": {
        "value": 1,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Servicing p15",
        "confidence": "high",
        "status": "verified",
        "note": "Quote: 'The serviceability interest rate buffer may be adjusted down to 1% where the: transaction is for a Prime or Near Prime Clear loan up to 80% LVR; AND transaction is the purchase of an investment property; OR transaction is to refinance a home loan or consolidate debts with no more than $20,000 cash out; OR loan interest rate will have an initial Fixed period.'"
      },
      "rentShadingPct": {
        "value": 0.8,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Acceptable Employment & Income table p14",
        "confidence": "high",
        "status": "verified",
        "note": "'Rental Income — Rental income to be received post settlement — 80%'."
      },
      "negativeGearingAddBack": {
        "value": true,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Servicing p15",
        "confidence": "medium",
        "status": "verified",
        "note": "Guide states only 'Negative Gearing: Negative Gearing is accounted for during the loan assessment.' It does not specify the calculation method."
      },
      "interestOnlyAssessment": {
        "value": "Interest Only maximum 5 years followed by P&I; 'Principal and Interest repayments are calculated on the residual loan term' (Additional Note 2).",
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Product Features p13 / Additional Notes p17",
        "confidence": "medium",
        "status": "verified",
        "note": null
      },
      "notes": {
        "value": "Maximum exposure per client: $5,000,000 Prime and Near Prime Clear; $5,000,000 Near Prime ($3,000,000 if >80% LVR); $4,000,000 Specialist ($3,000,000 if >80% LVR). Applicants deriving the majority of income from Centrelink/Social Benefit income are capped at 75% LVR and must service at a minimum 1.25x. For loans with an LVR greater than 90%, serviceability must be a minimum of 1.25x. Sole applicants in a spousal relationship: 50% of joint debt repayments taken plus a single living-expense view, tested at both household and applicant level.",
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Servicing p15",
        "confidence": "high",
        "status": "verified",
        "note": null
      }
    },
    "lvr": {
      "maxLvrOwnerOccupiedPct": {
        "value": 98,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Prime Home Loan p5 and Product Comparison p11",
        "confidence": "high",
        "status": "verified",
        "note": "Prime Full Doc: 'Up to 98% for purchases (Max LVR 95%, LPF can be capitalised to 98%)'. The base LVR is 95%; the extra 3% is capitalised Lender Protection Fee. Near Prime Clear Full Doc is also 98% purchase; Near Prime Full Doc 95% purchase; Specialist Full Doc 95% purchase, Specialist PLUS 80%."
      },
      "maxLvrInvestmentPct": {
        "value": 98,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Prime Home Loan p5",
        "confidence": "medium",
        "status": "verified",
        "note": "The guide does NOT publish a separate investment LVR cap for the standard home loan products — Prime purpose is stated as 'Purchase or refinance of owner occupied and/or investment properties' against a single Max LVR row. Confidence medium because the equality is inferred from the absence of a split, not stated. (Prime Construction does state it explicitly: 'Available up to 95% LVR for both Owner Occupied and Investment purposes'.)"
      },
      "maxLvrRefinancePct": {
        "value": 95,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Product Comparison p11",
        "confidence": "high",
        "status": "verified",
        "note": "Prime Full Doc: 'Up to 95% (including fee capitalisation) for all other loan purposes'. Near Prime Full Doc refinance 90%; Specialist Full Doc refinance 85%."
      },
      "maxLvrCashOutPct": {
        "value": 95,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Prime p5 / Cash Out p16",
        "confidence": "high",
        "status": "verified",
        "note": "Prime: 'Unlimited up to 95% LVR (Max LVR 90%, LPF can be capitalised to 95%, not available for business use)'. Business-use cash out IS allowed on Near Prime Clear / Near Prime / Specialist."
      },
      "maxLvrConstructionPct": {
        "value": 95,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Prime Construction p9",
        "confidence": "high",
        "status": "verified",
        "note": "Full Doc construction 95% OO and investment; Alt Doc construction 85%."
      },
      "lmiCapitalisable": {
        "value": true,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Prime p5",
        "confidence": "medium",
        "status": "verified",
        "note": "Pepper charges a Lender Protection Fee (LPF) rather than third-party LMI. 'All fees can be capitalised to maximum LVR available' and the LPF is capitalised from 95% to 98% on purchases."
      },
      "notes": {
        "value": "Pepper does not use third-party LMI on these products — it charges its own Lender Protection Fee (LPF), calculated via the LPF Calculator in the Tools section on pepperbroker.com.au. Max LVR also varies by postcode category: 'Category 1-4 up to 98% LVR; Category 5 not accepted'. Vacant residential land is limited to categories 1 and 2, max 5 acres, max loan $1,500,000 up to 75% LVR and $1,000,000 up to 85%.",
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Security p15, Additional Notes p17",
        "confidence": "high",
        "status": "verified",
        "note": null
      }
    },
    "income": {
      "altDocAvailable": {
        "value": true,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Alt Doc sections pp5-8",
        "confidence": "high",
        "status": "verified",
        "note": "Alt Doc offered on Prime, Near Prime Clear, Near Prime, Specialist and Specialist PLUS, plus construction and commercial."
      },
      "altDocEvidence": {
        "value": "Declaration of financial position plus ONE of: 6 months business bank statements; 6 months BAS; or a Pepper Money accountant's letter. Prime Alt Doc also requires ABN registered 24 months and GST registered 12 months (accountant's letter acceptable up to $3m customer exposure).",
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Prime Alt Doc p5",
        "confidence": "high",
        "status": "verified",
        "note": null
      },
      "altDocMaxLvrPct": {
        "value": 95,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Prime Alt Doc p5 / Product Comparison p11",
        "confidence": "high",
        "status": "verified",
        "note": "Prime Alt Doc up to 95% LVR. Lower on the other tiers: Near Prime Clear Alt Doc 90%; Near Prime Alt Doc 85% purchase / 80% other purposes; Specialist Alt Doc 85% purchase / 80% other, Specialist PLUS Alt Doc 75%."
      },
      "selfEmployedMinYears": {
        "value": 2,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Prime Full Doc p5, Acceptable Employment & Income p14",
        "confidence": "high",
        "status": "verified",
        "note": "Prime Full Doc: last 2 years tax returns + 2 years NOAs, or last 2 years financial statements. 'Full Doc - Minimum self-employed period of 24 months'."
      },
      "oneYearFinancialsAccepted": {
        "value": true,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Near Prime Clear p6, Near Prime p7",
        "confidence": "high",
        "status": "verified",
        "note": "NOT on Prime. Near Prime Clear accepts 1 year tax returns + 1 year NOA (or 1 year financial statements). Near Prime accepts 1 year for clear credit, else 2 years. Caveat quoted: 'If prior years' financial results are also provided, we are obliged to consider this in our assessment.'"
      },
      "rules": {
        "value": [
          {
            "type": "payg_permanent_full_time",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 6,
            "evidence": "Last payslip + 3 months bank statements noting salary credits; OR either last payslip or 3 months bank statements plus one of: letter of employment, Notice of Assessment, latest PAYG payment summary, or a Pepper employment check.",
            "conditions": "Base salary, allowances and shift penalties at 100%. PRIME: minimum 12 months continuous employment within the same industry, OR minimum 6 months employment with the current employer. NEAR PRIME CLEAR, NEAR PRIME and SPECIALIST: no minimum time frame required."
          },
          {
            "type": "payg_permanent_part_time",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 6,
            "evidence": "As per full-time PAYG.",
            "conditions": "Same rule as full-time — 'Full or Part-Time or Contract (PAYG)' is a single row in the income table."
          },
          {
            "type": "payg_fixed_term_contract",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 6,
            "evidence": "As per full-time PAYG.",
            "conditions": "Contract PAYG is grouped with full/part-time in the income table. Minimum remaining contract term is not published."
          },
          {
            "type": "payg_probation",
            "accepted": true,
            "shadingPct": null,
            "minHistoryMonths": null,
            "evidence": null,
            "conditions": "'Where the borrower is on probation, application can be considered based on the strength of the borrower's overall position.' No shading published."
          },
          {
            "type": "payg_casual",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 12,
            "evidence": "Where the payslip YTD is < 6 months, an ATO payment summary or tax return or notice of assessment is required in addition to the standard PAYG evidence.",
            "conditions": "PRIME or SPECIALIST PLUS: minimum 12 months continuous service with the current employer. NEAR PRIME CLEAR, NEAR PRIME or SPECIALIST: minimum 6 months continuous service with the current employer, with a minimum 18 months continuous employment in the same industry."
          },
          {
            "type": "second_job",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 12,
            "evidence": null,
            "conditions": "Same row as casual: PRIME/SPECIALIST PLUS 12 months with current employer; NEAR PRIME CLEAR/NEAR PRIME/SPECIALIST 6 months with current employer plus 18 months same industry."
          },
          {
            "type": "overtime_other",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 6,
            "evidence": "Where the payslip YTD is < 6 months, an ATO payment summary/tax return/NOA is also required.",
            "conditions": "Quote: '100% if a condition of a borrowers employment, 50% if confirmed as being regular for 6 months from the same employer.' i.e. shading is 1.00 only where overtime is a condition of employment, otherwise 0.50."
          },
          {
            "type": "bonus",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 24,
            "evidence": "ATO payment summary / tax return / NOA in addition to payslips.",
            "conditions": "PRIME: 100% if confirmed as received for the last 2 years from the current employer; the average of the last 2 years is used. NEAR PRIME CLEAR, NEAR PRIME or SPECIALIST: must be demonstrated over the last 12 months."
          },
          {
            "type": "commission",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 24,
            "evidence": "ATO payment summary / tax return / NOA in addition to payslips.",
            "conditions": "Same row as bonus — PRIME 2 years averaged; non-conforming tiers 12 months."
          },
          {
            "type": "shift_allowance",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": null,
            "evidence": null,
            "conditions": "Shift penalties are included in the 100% 'base salary, allowances and shift penalties' definition."
          },
          {
            "type": "car_allowance",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": null,
            "evidence": null,
            "conditions": "'100% if a condition of a borrower's employment.' Separately, a fully maintained company car allows a maximum $5,000 added to gross taxable income."
          },
          {
            "type": "self_employed_sole_trader",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 24,
            "evidence": "Full Doc: last 2 years tax returns + 2 years NOAs, OR last 2 years financial statements executed by a registered tax agent or accountant (CPA, CAA or NIA). Alt Doc: declaration of financial position + 6 months business bank statements, or 6 months BAS, or a Pepper accountant's letter.",
            "conditions": "Acceptable income forms: net profit before tax, directors' wages/salaries, depreciation, interest on debts being refinanced, and superannuation contributions in excess of 12%. Full Doc minimum self-employed period 24 months. Alt Doc: PRIME & NEAR PRIME CLEAR 24 months; NEAR PRIME 12 months (clear credit) else 24; SPECIALIST and SPECIALIST PLUS 6 months. An average of the last 2 years is used unless the most recent year is lower, in which case the most recent year is used (Full Doc only)."
          },
          {
            "type": "self_employed_company",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 24,
            "evidence": "As per sole trader.",
            "conditions": "Pepper will lend to 'private partnerships, individuals, companies, trustees (maximum 6 borrowers)'."
          },
          {
            "type": "self_employed_trust",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 24,
            "evidence": "As per sole trader.",
            "conditions": "Trustees are named as acceptable borrowers (maximum 6 borrowers)."
          },
          {
            "type": "rental_residential",
            "accepted": true,
            "shadingPct": 0.8,
            "minHistoryMonths": null,
            "evidence": null,
            "conditions": "'Rental income to be received post settlement' — 80%."
          },
          {
            "type": "government_age_pension",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": null,
            "evidence": null,
            "conditions": "'Centrelink Pension received (e.g. aged, invalid etc.)' at 100%. But: 'Applicants that derive majority of their income from Centrelink and Social Benefits Income can qualify for a maximum 75% LVR' and serviceability must be a minimum of 1.25x."
          },
          {
            "type": "government_disability_support",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": null,
            "evidence": null,
            "conditions": "Covered by 'Centrelink Pension received (e.g. aged, invalid etc.)'. Majority-Centrelink applicants capped at 75% LVR with 1.25x servicing."
          },
          {
            "type": "government_family_tax_benefit",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": null,
            "evidence": null,
            "conditions": "'Family assistance payment for dependent children regardless of age (Part A, Part B and parenting payments will be used; rental, sickness and pharmaceutical allowances will not be used).' Accepted on prime if received for the next 5 years or more; accepted on non-conforming if received for less than 5 years and the customer can maintain servicing once it ends. Foster income only offsets the living expense of the foster children."
          },
          {
            "type": "government_parenting_payment",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": null,
            "evidence": null,
            "conditions": "Named in the Family Payments row as usable ('Part A, Part B and parenting payments will be used')."
          },
          {
            "type": "superannuation_pension",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": null,
            "evidence": null,
            "conditions": "'Superannuation — Pension or annuities' at 100%."
          },
          {
            "type": "annuity",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": null,
            "evidence": null,
            "conditions": "Same row as superannuation pension."
          },
          {
            "type": "child_support_maintenance",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 3,
            "evidence": "Proof of receipt of maintenance for a continuous period of at least 3 months via savings statements; or a Child Support Agency letter confirming the maintenance agreement.",
            "conditions": "Requires a court order or child support agency agreement, or proof of 3 months' continuous receipt, with no age restrictions. Accepted on prime if received for the next 5 years or more; on non-conforming if less than 5 years and servicing survives its end."
          },
          {
            "type": "dividends",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 24,
            "evidence": null,
            "conditions": "'Income from cash deposits held or share portfolios. Two years consistency required. Capital gains on sale of assets is not acceptable.'"
          },
          {
            "type": "foreign_income",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": null,
            "evidence": null,
            "conditions": "Accepted for NON-CONFORMING home loans only (not Prime). Customers must be Australian residents and have PAYG income deposited into an Australian bank account by the employer. Income can be from a foreign company and does not need tax paid in Australia. 'Foreign self-employed income is not considered.'"
          },
          {
            "type": "trust_distributions",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": null,
            "evidence": null,
            "conditions": "Under 'Forms of Guaranteed Income — Inheritance and trust beneficiaries etc (not accepted on PRIME)' — 100%."
          }
        ],
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — 'Acceptable Employment & Income' table pp14-15",
        "confidence": "high",
        "status": "verified",
        "note": "Every shadingPct above is the 'Allowance' column of Pepper's income table. Note the guide's own caveat: 'The % of income allowed is based on the borrower being able to meet the Acceptable Employment Type policy.' overtime_essential_services is not a separate Pepper category — overtime is one row."
      },
      "notes": {
        "value": "Housing allowance provided by an employer or government body is accepted at 100% but NOT on Prime. Maternity leave: servicing is based on the lowest income received during the leave period; the income gap must be covered by savings and cannot exceed 3 months.",
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — pp14-15",
        "confidence": "high",
        "status": "verified",
        "note": null
      }
    },
    "employment": {
      "minMonthsCurrentJob": {
        "value": 6,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Acceptable Employment & Income p14",
        "confidence": "high",
        "status": "verified",
        "note": "PRIME only. Near Prime Clear, Near Prime and Specialist state 'No minimum time frame required.'"
      },
      "sameIndustryContinuityAccepted": {
        "value": true,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — p14",
        "confidence": "high",
        "status": "verified",
        "note": "PRIME: 'Minimum 12 months continuous employment within same industry, or Minimum 6 months employment with current employer.' The two are alternatives."
      },
      "minMonthsSameIndustry": {
        "value": 12,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — p14",
        "confidence": "high",
        "status": "verified",
        "note": "PRIME PAYG. For casual on the non-conforming tiers the same-industry requirement is 18 months."
      },
      "probationAccepted": {
        "value": true,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — footnote ^ p15",
        "confidence": "medium",
        "status": "verified",
        "note": "Quote: 'Where the borrower is on probation, application can be considered based on the strength of the borrower's overall position.' Discretionary, not an entitlement."
      },
      "probationConditions": {
        "value": "Considered based on the strength of the borrower's overall position (credit assessor discretion). No published tenure or shading rule.",
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — footnote ^ p15",
        "confidence": "medium",
        "status": "verified",
        "note": null
      },
      "minMonthsCasual": {
        "value": 12,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — p14",
        "confidence": "high",
        "status": "verified",
        "note": "PRIME or SPECIALIST PLUS: 12 months continuous service with current employer. NEAR PRIME CLEAR / NEAR PRIME / SPECIALIST: 6 months with current employer plus 18 months continuous same-industry employment."
      },
      "minMonthsSelfEmployedAbn": {
        "value": 24,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Prime Alt Doc p5",
        "confidence": "high",
        "status": "verified",
        "note": "Prime Alt Doc: 'ABN registered for 24 months'. Near Prime Alt Doc: 12 months for clear credit else 24. Specialist Alt Doc: 6 months (12 months for Specialist PLUS)."
      },
      "minMonthsGstRegistered": {
        "value": 12,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Prime Alt Doc p5",
        "confidence": "high",
        "status": "verified",
        "note": "Prime Alt Doc: 'GST registered for 12 months'. Near Prime Alt Doc: 6 months for clear credit else 12. Specialist Alt Doc: 6 months (12 months for Specialist PLUS)."
      }
    },
    "credit": {
      "paidDefaultsAccepted": {
        "value": true,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Prime p5, Near Prime p7, Specialist p8",
        "confidence": "high",
        "status": "verified",
        "note": "PRIME: 'Paid defaults up to $500 may be considered'. NEAR PRIME CLEAR: paid/unpaid defaults up to $1,000. NEAR PRIME: unlimited defaults, judgements and writs <= $3,000 (paid or unpaid), and unlimited > $3,000 if listed > 24 months. SPECIALIST: unlimited <= $3,000; unlimited > $3,000 if listed > 12 months. SPECIALIST PLUS: additionally unlimited defaults/judgements/writs from one credit event < 12 months old."
      },
      "defaultIgnoredUnderAmount": {
        "value": 500,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Prime Home Loan p5",
        "confidence": "high",
        "status": "verified",
        "note": "PRIME threshold. The equivalent threshold is $1,000 on Near Prime Clear (paid or unpaid) and $3,000 on Near Prime / Specialist (paid or unpaid, unlimited number)."
      },
      "unpaidDefaultsAccepted": {
        "value": true,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Near Prime Clear p6, Near Prime p7",
        "confidence": "high",
        "status": "verified",
        "note": "TRUE on the non-conforming tiers only. Near Prime Clear: 'Paid/Unpaid Defaults up to $1,000 may be considered'. Near Prime and Specialist: unlimited defaults paid OR unpaid subject to the size/age tests. PRIME requires the default to be PAID (and <= $500)."
      },
      "judgmentsAccepted": {
        "value": true,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Near Prime p7, Specialist p8",
        "confidence": "high",
        "status": "verified",
        "note": "Near Prime and Specialist accept unlimited judgements <= $3,000 (paid or unpaid), and > $3,000 where listed > 24 months (Near Prime) or > 12 months (Specialist). Not published for Prime."
      },
      "writsAccepted": {
        "value": true,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Near Prime p7, Specialist p8",
        "confidence": "high",
        "status": "verified",
        "note": "Same treatment as judgements on the non-conforming tiers. Not published for Prime."
      },
      "bankruptcyDischargedMinYears": {
        "value": 0,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Near Prime p7, Specialist p8",
        "confidence": "high",
        "status": "verified",
        "note": "Near Prime, Near Prime Construction and Specialist all state 'Discharged from bankruptcy (1 day accepted)' — i.e. no minimum time since discharge. This is a NON-CONFORMING tier concession; the Prime product does not publish a bankruptcy rule."
      },
      "maxArrears6Months": {
        "value": 1,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Specialist p8, Product Comparison p11",
        "confidence": "medium",
        "status": "verified",
        "note": "MORTGAGE arrears. Specialist: 'Up to 1 month mortgage arrears / RHI 1 (within the last 6 months)'. Specialist PLUS: 'Unlimited mortgage arrears (within last 6 months)'. Prime, Near Prime Clear and Near Prime require mortgage RHI 0 (see the RHI table p16)."
      },
      "notes": {
        "value": "Pepper maps Repayment History Information (RHI) directly to product tier. Mortgages: RHI 0 = Prime / Near Prime Clear / Near Prime; RHI 1 = Specialist; RHI 2, 3, 4, 5, 6, X = Specialist Plus. Non-mortgages: RHI 0 = Prime; RHI 1 = Near Prime Clear; RHI 2-3 = Near Prime; RHI 4-6 = Specialist; RHI X = Specialist Plus. Non-mortgage arrears limits: up to 1 month within the last 3 months (Near Prime Clear); up to 3 months within the last 3 months (Near Prime); up to 6 months (Specialist). ATO debts: 'Pepper will accept ATO Debts with payment plans to remain after settlement on Near Prime and Specialist.' Debt consolidation is unlimited in number on all tiers (Prime excludes tax and business debt).",
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Repayment History Information p16, Product Comparison p11",
        "confidence": "high",
        "status": "verified",
        "note": null
      }
    },
    "security": {
      "unacceptablePropertyTypes": {
        "value": [
          "Rural properties",
          "Commercial properties",
          "Relocatable and mobile homes",
          "Serviced apartments",
          "Studio apartments",
          "Resort complexes",
          "Retirement villages",
          "Bedsits",
          "Heritage listed buildings"
        ],
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — 'Will Not Lend On' p15",
        "confidence": "high",
        "status": "verified",
        "note": "Verbatim from the 'Will Not Lend On' box on the residential home-loan side. Commercial property IS lendable under the separate Pepper Commercial products."
      },
      "minUnitFloorAreaSqm": {
        "value": 40,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — 'Developments and Units' p15",
        "confidence": "high",
        "status": "verified",
        "note": "Quote (Prime and Near Prime Clear): 'Units in inner-city and metro postcode locations must have a minimum internal floor size of 30sqm, all other locations minimum must be 40sqm.' 40 is the general figure; 30sqm applies in inner-city/metro."
      },
      "maxLandSizeHa": {
        "value": 10,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Acceptable Securities pp5-8",
        "confidence": "high",
        "status": "verified",
        "note": "'Residential securities in categories 1 - 4 with a maximum land size of 25 acres (10 hectares)'. Vacant residential land is limited to 5 acres and categories 1-2 only."
      },
      "postcodeRestrictionsPublished": {
        "value": true,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Security p15, Additional Note 1 p17",
        "confidence": "high",
        "status": "verified",
        "note": "'Lending areas based on postcode listing: Category 1-4 up to 98% LVR; Category 5 not accepted.' The category lookup itself is the Postcode Search tool on pepperbroker.com.au."
      },
      "postcodeListUrl": {
        "value": "https://www.pepperbroker.com.au/resources/tools",
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Additional Note 1 p17",
        "confidence": "low",
        "status": "verified",
        "note": "The guide says only: 'Refer to Pepper Money's Postcode Search in Tools section on pepperbroker.com.au for category lending limits'. The exact deep link was NOT stated in the document — this URL is the Tools section it names, and should be confirmed before being relied on."
      },
      "highDensityPolicy": {
        "value": "A unit in a 'High Density' postcode AND in a development with more than 35 units: maximum 80% LVR and maximum loan amount $1,500,000. A unit in a 'High Density Exclusion' postcode will not be accepted. Separately, on Near Prime Clear / Near Prime / Specialist, max LVR 75% for new units (less than 12 months old). Darwin: a unit in a development of 35 or more units is an unacceptable security; all other Darwin units max 70% LVR (exclusive of fees); and Darwin securities valued at more than 1.5x the local postcode median house price are not acceptable.",
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — 'Developments and Units' / 'Darwin Securities' p15",
        "confidence": "high",
        "status": "verified",
        "note": null
      },
      "highDensityMaxLvrPct": {
        "value": 80,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — 'Developments and Units' p15",
        "confidence": "high",
        "status": "verified",
        "note": "Applies where the unit is in a 'High Density' postcode AND the development has more than 35 units; max loan also capped at $1,500,000."
      },
      "ruralResidentialAccepted": {
        "value": false,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — 'Will Not Lend On' p15",
        "confidence": "medium",
        "status": "verified",
        "note": "'Rural properties' is listed under Will Not Lend On. Confidence medium because the guide does not define where 'rural residential' ends and 'rural' begins, and it separately allows residential securities up to 25 acres (10 ha) in categories 1-4."
      },
      "maxSecurities": {
        "value": 6,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — 'Developments and Units' p15",
        "confidence": "medium",
        "status": "verified",
        "note": "Quote: '100% exposure accepted to individual borrowers up to 6 strata titled units, townhouses or villas. If over 6, the maximum exposure cannot exceed 25% or limit of 3.' This is a per-development concentration rule, not a hard cap on the number of securities per loan."
      },
      "notes": {
        "value": "Security titles considered: Torrens, old system, community, crown lease. Pepper will refinance private and solicitor loans. Portability is available on all new loans, like-for-like only (Category 1 postcode to Category 1 postcode, house to house, unit to unit). Valuation may be a Full Valuation, SMARTval, Electronic Valuation Report or an AVM.",
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Additional Lending Policies p16, Valuations p17",
        "confidence": "high",
        "status": "verified",
        "note": null
      }
    },
    "product": {
      "minLoanAmount": {
        "value": 100000,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Product Features p13",
        "confidence": "high",
        "status": "verified",
        "note": "'Minimum Loan Amount — $100,000 (Prime), $50,000 (Non-conforming)'. The non-conforming minimum is $50,000."
      },
      "maxLoanAmount": {
        "value": 5000000,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Prime p5, Near Prime Clear p6",
        "confidence": "high",
        "status": "verified",
        "note": "Prime and Near Prime Clear: $5,000,000 inclusive of fees. Near Prime and Specialist: $2,500,000. Specialist PLUS: $1,000,000. Construction: $2,000,000 (Full Doc) / $1,000,000 (Near Prime Construction Alt Doc). Loan size also steps down by LVR band — see the 'Loan size limits' matrix on p12."
      },
      "maxLoanTermYears": {
        "value": 40,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Product Comparison p11",
        "confidence": "high",
        "status": "verified",
        "note": "'Loan Term 10 - 40 years' across Prime, Near Prime Clear, Near Prime and Specialist. Construction loans are 10-30 years; commercial 10-30 years."
      },
      "maxInterestOnlyYearsOwnerOcc": {
        "value": 5,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Product Features p13",
        "confidence": "medium",
        "status": "verified",
        "note": "'Interest Only (maximum 5 years followed by Principal and Interest). Interest Only available on terms up to 30 years.' The guide does not split the IO maximum by owner-occupied vs investment — 5 years is the single published figure."
      },
      "maxInterestOnlyYearsInvestment": {
        "value": 5,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Product Features p13",
        "confidence": "medium",
        "status": "verified",
        "note": "Same single published maximum of 5 years; no OO/investment split is published. Fixed-rate IO periods are 2, 3 or 5 years and must equal the fixed-rate period."
      },
      "offsetAvailable": {
        "value": true,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Product Features p13",
        "confidence": "high",
        "status": "verified",
        "note": "'100% Interest Offset Sub-Account available' on variable only (N/A on fixed). On construction loans, only post-construction."
      },
      "redrawAvailable": {
        "value": true,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Product Features p13",
        "confidence": "high",
        "status": "verified",
        "note": "Variable only. Minimum manual redraw $1,000; minimum online redraw $50."
      },
      "constructionAvailable": {
        "value": true,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Prime Construction p9, Near Prime Construction p10",
        "confidence": "high",
        "status": "verified",
        "note": "Up to two residential dwellings. Requires a fixed-price contract from a licensed builder (not owner builder). IO during construction, maximum 18 months, then P&I. Cash out and debt consolidation are NOT available on construction loans."
      },
      "smsfLendingAvailable": {
        "value": true,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Self Managed Super Fund section pp24-25",
        "confidence": "high",
        "status": "verified",
        "note": "SMSF lending for residential or commercial property is a named product line in this guide. Its specific LVR/loan-size parameters were not extracted in this pass."
      },
      "genuineSavingsRequiredPct": {
        "value": 0,
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Prime p5, Near Prime Clear p6, Near Prime p7, Specialist p8, Construction p9",
        "confidence": "high",
        "status": "verified",
        "note": "'Genuine Savings — Not required' on every home-loan product tier including at 95%+ LVR. This is one of Pepper's key differentiators against bank policy."
      },
      "notes": {
        "value": "Pepper will lend to private partnerships, individuals, companies and trustees, maximum 6 borrowers. All mortgage applications must clearly demonstrate a financial benefit to the applicant(s). Fee capitalisation: all fees can be capitalised to the maximum LVR available. Additional advance: loan must have settled at least 3 months (Prime) / 6 months (non-conforming), minimum $10,000, LVR cannot be varied by more than 10% or an internal refinance is required, $395 establishment fee ($100 if the broker orders the valuation), 1% Lender Protection Fee on the advance amount, $200 legal fees plus disbursements.",
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Additional Lending Policies p16",
        "confidence": "high",
        "status": "verified",
        "note": null
      }
    },
    "residency": {
      "acceptedVisaSubclasses": {
        "value": [
          "309",
          "475",
          "482",
          "489",
          "491",
          "494",
          "820"
        ],
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — 'Acceptable Visa Class' p17",
        "confidence": "high",
        "status": "verified",
        "note": "Verbatim: 'Pepper accepts all Visa that provide permanent residency. In addition, the following pathway Visa's are acceptable across all Product options: 309, 475, 482, 489, 491, 820, 494.'"
      },
      "rules": {
        "value": [
          {
            "status": "permanent_resident",
            "accepted": true,
            "maxLvrPct": null,
            "conditions": "'Pepper accepts all Visa that provide permanent residency.' No separate LVR restriction published."
          },
          {
            "status": "temporary_visa_work",
            "accepted": true,
            "maxLvrPct": null,
            "conditions": "Pathway visas 482, 494, 489, 491 and 475 are acceptable across all product options. No separate LVR restriction published for them."
          },
          {
            "status": "temporary_visa_partner_309_820",
            "accepted": true,
            "maxLvrPct": null,
            "conditions": "Subclasses 309 and 820 are both named as acceptable pathway visas across all product options."
          }
        ],
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — 'Acceptable Visa Class' p17",
        "confidence": "high",
        "status": "verified",
        "note": "Australian citizens are not mentioned in the visa table (they need no visa) so no rule is recorded for them rather than inventing one. Student visas (500), non-resident foreign buyers and expat citizens living overseas are NOT named as acceptable anywhere in this guide — absence is not a stated decline, so no rule is recorded."
      },
      "notes": {
        "value": "Foreign income is accepted for non-conforming home loans only, and only where the customer is an Australian resident with PAYG income paid into an Australian bank account by the employer. Foreign self-employed income is not considered.",
        "asAt": "2026-07-28",
        "sourceUrl": "https://www.pepperbroker.com.au/content/dam/aubroker/broker-au-documents-nc/Pepper%20Money%20Retail%20Product%20Guide.pdf",
        "sourceTitle": "Pepper Money Product Guide 28 Jul 2026 — Foreign Income p15",
        "confidence": "high",
        "status": "verified",
        "note": null
      }
    },
    "version": 1,
    "effectiveFrom": "2026-07-28",
    "researchedAt": "2026-07-29",
    "researchedBy": "research:claude-opus-5",
    "gaps": [
      "No published DTI cap. The guide states a minimum servicing ratio of 1.25x for loans above 90% LVR and for majority-Centrelink applicants, but no debt-to-income multiple.",
      "No published HEM/living-expense benchmark basis. The guide says only that 'Applicants' last three months personal bank statements may be needed at credit assessors discretion for positive confirmation of their declared living expenses'.",
      "No published credit-card assessment percentage, BNPL treatment or HECS/HELP treatment.",
      "The p12 'Loan size limits' LVR-band matrix could not be transcribed reliably — the PDF's column alignment is ambiguous once converted to text, so lvrBands was deliberately left empty rather than risk a wrong max-loan-per-band. Re-read that page visually before populating it.",
      "No published maximum applicant age at maturity or exit-strategy trigger age.",
      "No published guarantor policy, gifted-deposit policy or participation in government first-home schemes (Home Guarantee Scheme etc.).",
      "No published minimum credit score or maximum credit enquiries. Pepper orders an Equifax report but does not state a score cut-off.",
      "No explicit payday-lending or gambling-transaction policy.",
      "The postcode category list is a broker-portal search tool, not a published document — the exact category for a given postcode cannot be verified from a public URL.",
      "Investment-property max LVR is inferred from the absence of an OO/investment split in the product tables rather than stated; confirm with the BDM before relying on 98% for investment purchases.",
      "SMSF product parameters (LVR, min/max loan, liquidity requirements) were not extracted — they are on pp24-25 of the same guide.",
      "No published rule on maximum employment gap, or on minimum remaining term for a fixed-term contract."
    ]
  }
]`;

/** 1 lender policy records. */
const PACK = JSON.parse(RAW) as LenderPolicy[];

export default PACK;
