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
    "id": "bank-of-sydney",
    "name": "Bank of Sydney",
    "legalName": "Bank of Sydney Ltd",
    "tier": "foreign_bank",
    "status": "active",
    "acl": "243444",
    "abn": "44 093 488 629",
    "brokerSiteUrl": "https://www.banksyd.com.au/broker/",
    "policyDocUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
    "funder": null,
    "panels": null,
    "servicing": {
      "assessmentBufferPct": {
        "value": null,
        "asAt": null,
        "sourceUrl": null,
        "confidence": "low",
        "status": "not_found",
        "note": "Residential Lending Guidelines v2025.4 states only that 'The Bank's serviceability calculator must be used' and requires a minimum Cash Flow Ratio of 1.00. No buffer or floor rate is published on the public broker site."
      },
      "assessmentFloorRatePct": {
        "value": null,
        "asAt": null,
        "sourceUrl": null,
        "confidence": "low",
        "status": "not_found",
        "note": "Not published in the public Residential Lending Guidelines; servicing is calculator-driven."
      },
      "rentShadingPct": {
        "value": 0.8,
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines Version 2025.4, November 2025 — 'Rental Income - Residential Investment'",
        "confidence": "high",
        "status": "verified",
        "note": "20.00% discount for Metropolitan postcodes (i.e. 80% counted). Regional postcodes 30.00% discount (0.70); National postcodes (Standard) 50.00% discount (0.50); National postcodes (high density) 'Not accepted'. Postcode categories align to the QBE LMI Location Guide."
      },
      "rentShadingBasis": {
        "value": "Discount 'against expected receipts to provide adequate allowances for non-occupancy and investment property-related fees and expenses' — i.e. instead of itemised holding costs.",
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — Rental Income",
        "confidence": "high",
        "status": "verified"
      },
      "existingCommitmentTreatment": {
        "value": "unknown",
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — Verifying Other Commitments",
        "confidence": "low",
        "status": "verified",
        "note": "Guide says: 'Commitments will be based on Comprehensive Credit Reporting (CCR) data or if data not available via CRR the banks carded rates will apply for serviceability purposes.' Does not map cleanly onto the taxonomy values."
      },
      "creditCardAssessmentPct": {
        "value": null,
        "asAt": null,
        "sourceUrl": null,
        "confidence": "low",
        "status": "not_found",
        "note": "Guide refers to 'the banks carded rates' where CCR data is unavailable but publishes no percentage."
      },
      "hemBasis": {
        "value": "hem",
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — Living Expenses",
        "confidence": "high",
        "status": "verified",
        "note": "'Living expenses will be calculated at the higher of: Customer declared living expense, or The Household Expenditure Measure (HEM)'."
      },
      "dtiCap": {
        "value": 7,
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — Servicing",
        "confidence": "high",
        "status": "verified",
        "note": "'Maximum DTI of 7.0.' Note: 'DTI exceeding 7.0 may be considered on a case-by-case basis.'"
      },
      "notes": {
        "value": "Minimum Cash Flow Ratio outcome of at least 1.00 is required in all cases to evidence affordability. Board (living with friends/family or sublet) assessed at a minimum of $650 per month per borrower or the amount advised by the client, whichever is higher.",
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — Servicing / Verifying Other Commitments",
        "confidence": "high",
        "status": "verified"
      }
    },
    "lvr": {
      "maxLvrOwnerOccupiedPct": {
        "value": 95,
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — Security Types & Maximum LVR",
        "confidence": "high",
        "status": "verified",
        "note": "'Residential Property Owner Occupied (P&I) — Metro Postcodes Freehold, First Ranking Charge — 95% (LVR above 80% to be covered by LMI)'. Interest-only owner occupier is capped at 80% (LMI above 75%)."
      },
      "maxLvrInvestmentPct": {
        "value": null,
        "asAt": null,
        "sourceUrl": null,
        "confidence": "low",
        "status": "not_found",
        "note": "The Security Types & Maximum LVR table in the PDF is a multi-column layout that does not extract unambiguously — investment P&I appears grouped with owner occupied at 95% metro / 90% regional, but the row-to-criteria alignment could not be read with confidence. Investment interest-only is shown at 80% (LMI above 75%). Needs a human read of page 12 of the guide."
      },
      "maxLvrNoLmiPct": {
        "value": 80,
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — Security Types & Maximum LVR",
        "confidence": "high",
        "status": "verified",
        "note": "'LVR above 80% to be covered by LMI' on standard residential P&I. Excludes the No LMI (select professions) policy, which is recorded separately as an LMI waiver."
      },
      "maxLvrCashOutPct": {
        "value": 80,
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — Cash Out and Debt Consolidation",
        "confidence": "high",
        "status": "verified",
        "note": "'Maximum LVR of 80%'. Cash out <= $250,000 needs no formal evidence of purpose; > $250,000 requires reasonable evidence of purpose."
      },
      "lmiProvider": {
        "value": [
          "QBE Lenders Mortgage Insurance Limited (QBELMI)"
        ],
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — Rental Income note",
        "confidence": "high",
        "status": "verified",
        "note": "'The Bank has adopted the terminology of Metropolitan, Regional and National postcodes to align with the methodology of its Lenders Mortgage Insurer, QBE Lenders Mortgage Insurance Limited (QBELMI).'"
      },
      "lmiWaiverProfessions": {
        "value": [
          "Medical Professionals (Medical Board, Chiropractic, Dental, Medical Radiation Practice, Nursing and Midwifery, Optometry, Occupational Therapy, Osteopathy, Paramedicine, Pharmacy, Physiotherapy, Podiatry, Psychology Boards; also Pathologists, Veterinarians, Psychiatrists)",
          "Registered Accountants, Actuaries or Financial Analysts (CA, CPA, FIAA, CFA)",
          "Financial Planner (holds valid AFSL)",
          "Registered Solicitors",
          "Barristers",
          "Registered Engineers",
          "Geologists, Geophysicists & Hydrogeologists",
          "Commercial Pilots & Air Traffic Controllers",
          "Construction Project Managers",
          "Registered Quantity Surveyors",
          "Registered Planners",
          "Land Surveyors",
          "Accredited Cyber Security Professionals",
          "Registered Architects",
          "Registered Teachers",
          "Police Officers",
          "Firefighters",
          "Defence Force Personnel"
        ],
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — No LMI Policy",
        "confidence": "high",
        "status": "verified",
        "note": "'No LMI Policy for Select Professionals' (previously 'Professionals Package'). The Bank's CRO has discretion to approve other professions on an individual application basis."
      },
      "lmiWaiverMaxLvrPct": {
        "value": 90,
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — No LMI Policy",
        "confidence": "high",
        "status": "verified",
        "note": "'The Bank may, by exception, approve an LVR up to a maximum of 90% for borrowers earning at least 50% of their assessable income from the professions noted below, with a minimum of three years' experience in the relevant field aligned to their qualification.' Applies to owner occupied P&I; regional postcodes cap the No LMI policy at 80%."
      }
    },
    "income": {
      "rules": {
        "value": [
          {
            "type": "payg_permanent_full_time",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 6,
            "evidence": "Two of the three most recent electronically issued pay slips showing borrower name, employer name, ABN, and a minimum 3 months year-to-date income. Handwritten pay slips not accepted.",
            "conditions": "100% of gross base income where applicant can demonstrate minimum 6 months in current role or 12 months in the same field/line of work, and completion of any probationary period."
          },
          {
            "type": "payg_probation",
            "accepted": false,
            "shadingPct": null,
            "minHistoryMonths": null,
            "evidence": null,
            "conditions": "'Completion of any probationary period (however if they have been in the same field of employment they can be considered on an exception basis. Call your RM to clarify individual eligibility)'."
          },
          {
            "type": "payg_casual",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 12,
            "evidence": "Evidence of at least 12 months in current role or at least 2 years in same field. Two years' tax returns if with current employer on a casual basis for less than 12 months.",
            "conditions": "'Casual employment income from borrowers will only be accepted when applying for a loan jointly with a full-time salaried or self-employed applicant i.e. applicants whose sole income is casual will not be acceptable.'"
          },
          {
            "type": "payg_fixed_term_contract",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 12,
            "evidence": "Details of current employment contract including salary, conditions, term and expiry date. Last 2 years' tax returns and NOA where employed on contract less than 12 months.",
            "conditions": "Minimum 12 months in current role or at least 12 months in the same field. 'Acceptance of contracts with less than six months to expiry subject to approving officer's assessment of renewal prospects.'"
          },
          {
            "type": "self_employed_sole_trader",
            "accepted": true,
            "shadingPct": null,
            "minHistoryMonths": 24,
            "evidence": "Last two years tax returns and Notice of Assessment; tax status confirmed via ATO Tax Portals and Integrated Client Account Portal; confirmation the business has been established for at least two full financial years.",
            "conditions": "Business income calculated from 'taxable income' — the average of the last two years, or only the most recent year if the borrower qualifies under the Bank's No LMI policy. Depreciation in the most recent tax return may be added back."
          },
          {
            "type": "self_employed_company",
            "accepted": true,
            "shadingPct": null,
            "minHistoryMonths": 24,
            "evidence": "Corporate/Trusts — last two years tax returns and accountant-prepared financial statements.",
            "conditions": "'Income from self-employed borrowers operating an incorporated business should be referred through to your RM.' Subject to the loan amount being $2 million and for consumer purposes, a company guarantee is not required for self-employed borrowers."
          },
          {
            "type": "rental_residential",
            "accepted": true,
            "shadingPct": 0.8,
            "minHistoryMonths": null,
            "evidence": "Current lease agreement, rental receipts, rental valuation or agent letter, managing agent statements, or a tax return no more than 6 months old.",
            "conditions": "20.00% discount Metropolitan postcodes; 30.00% Regional; 50.00% National (Standard); National high-density rental income not accepted. The Bank may apply further discounts at its discretion."
          },
          {
            "type": "overtime_essential_services",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 6,
            "evidence": "Evidence of regular receipt over a minimum period of 6 months, or a contract of employment outlining the conditions.",
            "conditions": "100% where the applicant is in the Essential Service Industry — Ambulance, Police, Fire Service, Medical Nursing, Medical Doctors, Defence Force and Corrective Services."
          },
          {
            "type": "overtime_other",
            "accepted": true,
            "shadingPct": 0.75,
            "minHistoryMonths": 6,
            "evidence": "Evidence of payment over a minimum of 6 months.",
            "conditions": "75% where it is not a condition of employment; 100% if confirmed by the employer in writing as a permanent condition of employment."
          },
          {
            "type": "shift_allowance",
            "accepted": true,
            "shadingPct": 0.75,
            "minHistoryMonths": 6,
            "evidence": "Evidence of payment over a minimum of 6 months.",
            "conditions": "Grouped with overtime and penalties: 75% where not a condition of employment, 100% if a written permanent condition of employment."
          },
          {
            "type": "commission",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 24,
            "evidence": "Contract of employment outlining commission conditions, OR last 2 years PAYG payment summaries showing consistent payments, OR last 2 years tax returns and NOAs.",
            "conditions": "100% of the average of last two years. Applicant must have been in their job or similar role for at least 2 years. 'Discretion should be exercised if the industry in which applicant is employed is subject to volatility e.g. Real Estate.'"
          },
          {
            "type": "bonus",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 24,
            "evidence": "As for commission income.",
            "conditions": "100% of the average of last two years; applicant in the job or similar role for at least 2 years."
          },
          {
            "type": "car_allowance",
            "accepted": true,
            "shadingPct": 0.5,
            "minHistoryMonths": null,
            "evidence": null,
            "conditions": "'50% of a borrowers' vehicle allowance may be added to the net income figure available for servicing, provided it is a condition of employment.' 100% of any corresponding lease or hire purchase must be included as a commitment. Separately, a fully maintained company vehicle available for unrestricted private use adds $5,000 per annum to net income (PAYG borrowers only)."
          },
          {
            "type": "dividends",
            "accepted": true,
            "shadingPct": 0.75,
            "minHistoryMonths": 24,
            "evidence": "Last 2 years tax returns and Notices of Assessment plus evidence of current investments held.",
            "conditions": "75% of the average payment over the last 2 years (grouped as Investment Income — trust distributions, interest or dividends)."
          },
          {
            "type": "trust_distributions",
            "accepted": true,
            "shadingPct": 0.75,
            "minHistoryMonths": 24,
            "evidence": "Recurrent distributions for at least two financial years supported by taxation returns for both the trust/company and the individual applicant.",
            "conditions": "Investment income (trust distributions, interest or dividends) at 75% of the 2-year average. Where the borrower is a beneficiary of a trust or material shareholder of a private company, the guide states the 'Average of the last two years' taxable income'."
          },
          {
            "type": "government_family_tax_benefit",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": null,
            "evidence": "Statement from Centrelink or Family Assistance Office.",
            "conditions": "100% of payments where the payment is determined to be available for a minimum of 5 years from the date of loan assessment or approval. Should be less than 50% of total income on the application."
          },
          {
            "type": "government_disability_support",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": null,
            "evidence": "Statement from Centrelink or Family Assistance Office.",
            "conditions": "100% of payments (listed as 'Government Pensions e.g. Veteran Affairs, Centrelink Disability'). Applicants whose government/other benefits collectively comprise greater than 50% of total income 'will be deemed to have not met the Bank's eligibility criteria'."
          },
          {
            "type": "government_jobseeker",
            "accepted": false,
            "shadingPct": null,
            "minHistoryMonths": null,
            "evidence": null,
            "conditions": "'Some government payments such as Invalid pensions, Unemployment benefits, Sickness/accident benefits and Workers compensation are not acceptable.'"
          },
          {
            "type": "child_support_maintenance",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 3,
            "evidence": "Child Support Agency Assessment showing the amount payable and the names and dates of birth of the eligible children, AND 3 months current bank statements confirming receipt.",
            "conditions": "100% of income; must be paid through the Child Support Agency and be available for a minimum of 5 years. 'Private arrangements are not acceptable under any circumstances.'"
          }
        ],
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines Version 2025.4, November 2025 — Acceptable Income / Additional Sources of Income / Income Documentation",
        "confidence": "high",
        "status": "verified"
      },
      "selfEmployedMinYears": {
        "value": 2,
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — Self Employed / Income Documentation",
        "confidence": "high",
        "status": "verified",
        "note": "'Individual - last two years tax returns and Notice of Assessment' and 'confirmation that the business has been established for at least two full financial years'."
      },
      "oneYearFinancialsAccepted": {
        "value": true,
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — Self Employed (Sole Traders)",
        "confidence": "medium",
        "status": "verified",
        "note": "Only within the No LMI policy: income may be calculated using 'Only the most recent year's taxable income, if the borrower qualifies under the requirements of the Bank's No LMI policy previously known as Professionals Package.' Two years of tax returns are still required as documents."
      },
      "notes": {
        "value": "Maternity leave: maximum LVR 80.00%; income consideration limited to 75% of gross employer maternity and government paid parental leave payments received within the 12-month period from application, supported by documentation. All maternity leave income from applicants unable to provide documentary evidence of return-to-work terms is excluded.",
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — Maternity Leave Policy",
        "confidence": "high",
        "status": "verified"
      }
    },
    "employment": {
      "minMonthsCurrentJob": {
        "value": 6,
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — PAYG Salary and Wages (Permanent)",
        "confidence": "high",
        "status": "verified",
        "note": "'Minimum 6 months in current role or 12 months in the same field/line of work'."
      },
      "sameIndustryContinuityAccepted": {
        "value": true,
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — Permanent Employment",
        "confidence": "high",
        "status": "verified"
      },
      "minMonthsSameIndustry": {
        "value": 12,
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — PAYG Salary and Wages (Permanent)",
        "confidence": "high",
        "status": "verified",
        "note": "For permanent PAYG. Casual requires at least 2 years in the same field/line of employment; contract requires at least 12 months."
      },
      "probationAccepted": {
        "value": false,
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — PAYG Salary and Wages (Permanent)",
        "confidence": "medium",
        "status": "verified",
        "note": "Requires 'Completion of any probationary period', with an exception path: 'however if they have been in the same field of employment they can be considered on an exception basis. Call your RM to clarify individual eligibility.'"
      },
      "probationConditions": {
        "value": "Completion of any probationary period is required. Applicants who have not been in their current role for at least 6 months or in the same field/line of employment for at least one year must have completed any probationary period in their current position. Same-field applicants may be considered on an exception basis via the RM.",
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — Permanent Employment",
        "confidence": "high",
        "status": "verified"
      },
      "minMonthsCasual": {
        "value": 12,
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — Casual Employment",
        "confidence": "high",
        "status": "verified",
        "note": "'Minimum 12 months in current role or at least 2 years in the same field/line of employment.' Under 12 months requires 2 years' tax returns."
      },
      "minMonthsContract": {
        "value": 12,
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — Contractual Employment",
        "confidence": "high",
        "status": "verified",
        "note": "'Minimum 12 months in current role or at least 12 months in the same field/line of work.'"
      },
      "minMonthsSelfEmployedAbn": {
        "value": 24,
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — Self Employed (Income Documentation)",
        "confidence": "medium",
        "status": "verified",
        "note": "Expressed as 'the business has been established for at least two full financial years' — financial years, not calendar months; 24 is the closest faithful expression."
      }
    },
    "credit": {
      "notes": {
        "value": null,
        "asAt": null,
        "sourceUrl": null,
        "confidence": "low",
        "status": "not_found",
        "note": "The public Residential Lending Guidelines v2025.4 contains no credit-history section — no default, judgment, bankruptcy, arrears, credit score or enquiry rules are published. Only that commitments are assessed off Comprehensive Credit Reporting data."
      }
    },
    "security": {
      "unacceptablePropertyTypes": {
        "value": [
          "Property zoned rural or rural residential that does not meet the Bank's acceptable criteria",
          "Strata Title Hotel, Motel, Resort style dwellings",
          "Time-share properties that cannot be occupied on a permanent basis",
          "Properties with restricted market appeal e.g. aged care complexes",
          "Student accommodation",
          "Split contract arrangement",
          "Any property that cannot be effectively mortgaged using usual bank security documents e.g. Vic Stratum Security",
          "Unit developments held as security on one title where the number of dwellings exceeds 4 units",
          "Any property where any valuation risk rating is rated as '5'",
          "Residential units less than 40 m2",
          "More than 4 units/apartments on one property site, whether on one title or separate strata titles",
          "Mixed use properties on a single title",
          "Convertible Units and Dual Key Apartments",
          "Properties with no legal street access (land locked)",
          "Any partially constructed dwellings",
          "Mobile or Temporary homes (dwellings not permanently affixed to site)",
          "Security in WA regional area, NT, Tasmanian regional area",
          "Serviced apartments (0% LVR); high density, serviced apartments and dwellings in regional QLD"
        ],
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — Unacceptable Security",
        "confidence": "high",
        "status": "verified"
      },
      "minUnitFloorAreaSqm": {
        "value": 40,
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — Unacceptable Security",
        "confidence": "high",
        "status": "verified",
        "note": "'Residential units less than 40 m2' are unacceptable security. Studio / 1 bedroom units between 40m2 and 50m2 in Metro postcodes are capped at 70% LVR. BOS 'presently has NO appetite for serviced apartments or dwellings < 50sqm in QLD, regardless of postcode'."
      },
      "postcodeRestrictionsPublished": {
        "value": true,
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — BOS Location Guide",
        "confidence": "high",
        "status": "verified",
        "note": "'The BOS Location Guide is based on the QBE LMI Postcodes and lists all the acceptable postcodes for metropolitan and regional areas... All postcodes NOT listed in the BOS Location Guide are considered as National. National postcodes may in certain cases be allowable for servicing income but never acceptable for security purposes.' The Location Guide itself sits on the BOSbroker site under 'Resources' — no public direct URL found."
      },
      "highDensityPolicy": {
        "value": "High density = any security located in a building having 6 or more floors or more than 50 accommodation units. Maximum exposure of 10% of units with a maximum of 5 units in a development, AND unit must be >50sqm. High density, serviced apartments and dwellings in regional QLD are not acceptable. Rental income from high density properties in National postcodes is not accepted.",
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — Security Types & Maximum LVR",
        "confidence": "high",
        "status": "verified"
      },
      "servicedApartmentAccepted": {
        "value": false,
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — Security Types & Maximum LVR",
        "confidence": "high",
        "status": "verified",
        "note": "'Serviced apartments — 0%' maximum LVR."
      },
      "studentAccommodationAccepted": {
        "value": false,
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — Unacceptable Security",
        "confidence": "high",
        "status": "verified"
      },
      "notes": {
        "value": "Security must be zoned for residential use, fully developed with road access and services (electricity, water, sewerage). Full valuation required showing sales evidence with a marketing period of six months or less. Income produced from the property must not be the primary source of income to service the debt. The Bank does not accept Tasmanian, NT or WA properties in Regional areas as security. In QLD, LVR is restricted to a maximum of 70% for Brisbane postcodes 4000-4006, 4009-4010, 4101, 4169 and Gold Coast 4215-4218, and to a maximum of 70% for residential properties in Regional QLD. Bank of Sydney will consider securities in NSW, ACT, VIC, QLD, SA, WA, TAS, NT.",
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — Security / State restrictions / Location Guide",
        "confidence": "high",
        "status": "verified"
      }
    },
    "product": {
      "minLoanAmount": {
        "value": null,
        "asAt": null,
        "sourceUrl": null,
        "confidence": "low",
        "status": "not_found",
        "note": "Not published in the Residential Lending Guidelines or on the public broker home-loans product page."
      },
      "maxLoanAmount": {
        "value": null,
        "asAt": null,
        "sourceUrl": null,
        "confidence": "low",
        "status": "not_found",
        "note": "Not published as a hard cap. The guide references '$2 million' only in the context of company guarantees for self-employed borrowers."
      },
      "maxLoanTermYears": {
        "value": 30,
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — Mature Aged Borrowers",
        "confidence": "medium",
        "status": "verified",
        "note": "Inferred from the worked example: 'The term of the loan is to be limited to the maximum age of 80 years i.e. for a borrower aged 50, the maximum term would be 30 years for owner occupied home loans.' The guide does not state a standalone maximum term."
      },
      "genuineSavingsRequiredPct": {
        "value": 0.05,
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — Genuine Savings",
        "confidence": "high",
        "status": "verified",
        "note": "'5% genuine equity if mortgage insurance is required'. May include funds in a bank account or term deposit held 3 months or more, equity in residential property owned for at least 3 months, or shares held for at least 3 months."
      },
      "genuineSavingsRequiredAboveLvrPct": {
        "value": 80,
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — Genuine Savings / Non-Genuine Savings",
        "confidence": "medium",
        "status": "verified",
        "note": "Genuine savings are triggered by LMI ('if mortgage insurance is required'), and LMI is required above 80% LVR on standard residential P&I. Non-genuine savings (gifts, inheritance, sale of assets, tax refund) are capped at a maximum LVR of 80%."
      },
      "genuineSavingsMinMonths": {
        "value": 3,
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — Genuine Savings",
        "confidence": "high",
        "status": "verified",
        "note": "'Funds held in a Bank Account or Term Deposit for 3 months or more'."
      },
      "giftedDepositAccepted": {
        "value": true,
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — Non-Genuine Savings (Maximum LVR 80%)",
        "confidence": "high",
        "status": "verified",
        "note": "'The non-genuine savings contribution may consist of: Gifts, Inheritance, sale of assets, tax refund; Validation must be provided.' Maximum LVR 80%. Borrowers must hold sufficient funds to cover government fees, duties and charges; borrowed funds for these are not acceptable."
      },
      "smsfLendingAvailable": {
        "value": false,
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — Unacceptable Borrowers",
        "confidence": "high",
        "status": "verified",
        "note": "SMSFs are listed under 'Unacceptable Borrowers'."
      },
      "constructionAvailable": {
        "value": true,
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — Security Types & Maximum LVR",
        "confidence": "high",
        "status": "verified",
        "note": "'Residential Construction including Vacant land (First Ranking Charge)' is a listed security type; funding via progress payments with 'as is' and 'on completion' panel valuations, a fixed price builders contract, council approved plans and builder's insurance required."
      },
      "bridgingAvailable": {
        "value": true,
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — Security Types & Maximum LVR",
        "confidence": "high",
        "status": "verified",
        "note": "'Bridging Loan: Residential Property — Metro Postcodes' appears in the security table with a maximum 18 months term shown in the same row group."
      },
      "maxAgeAtMaturity": {
        "value": 80,
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — Mature Aged Borrowers",
        "confidence": "high",
        "status": "verified",
        "note": "'The term of the loan is to be limited to the maximum age of 80 years... This is not applicable for investment loans.'"
      },
      "exitStrategyRequiredOverAge": {
        "value": 50,
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — Mature Aged Borrowers",
        "confidence": "high",
        "status": "verified",
        "note": "'Where the applicant is over the age of 50, an acceptable signed exit strategy from the applicant is to be provided... A signed exit strategy is not required if each mature age applicant on the application has a net asset position greater than or equal to $500,000.'"
      },
      "notes": {
        "value": "Pre-approvals valid 90 days; conditional approvals 30 days; formal approvals 60 days from the date of approval. Applications submitted via Loanapp or Apply Online; electronic signature accepted except for Verification of Identity.",
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines v2025.4 — Approvals / Submitting an Application",
        "confidence": "high",
        "status": "verified"
      }
    },
    "residency": {
      "rules": {
        "value": [
          {
            "status": "australian_citizen",
            "accepted": true,
            "maxLvrPct": null,
            "conditions": "Individuals/PAYG employees and self-employed individuals are acceptable borrowers. The restriction applies only to applicants who are not Australian or New Zealand citizens with permanent residency status residing in Australia."
          },
          {
            "status": "permanent_resident",
            "accepted": true,
            "maxLvrPct": null,
            "conditions": "'Restrictions apply to applicants who are not Australian or New Zealand citizens with permanent residency status residing in Australia' — i.e. permanent residents residing in Australia fall outside the restriction."
          },
          {
            "status": "nz_citizen_444",
            "accepted": true,
            "maxLvrPct": null,
            "conditions": "New Zealand citizens are named alongside Australian citizens in the borrower restriction wording. The guide does not separately address subclass 444."
          },
          {
            "status": "temporary_visa_work",
            "accepted": null,
            "maxLvrPct": null,
            "conditions": "Unstated. Listed only via the blanket 'Restrictions apply to applicants who are not Australian or New Zealand citizens with permanent residency status residing in Australia' under Unacceptable Borrowers. The restrictions themselves are not published."
          },
          {
            "status": "temporary_visa_student",
            "accepted": null,
            "maxLvrPct": null,
            "conditions": "Unstated — covered only by the blanket restriction on applicants who are not Australian/NZ citizens or permanent residents residing in Australia."
          },
          {
            "status": "expat_citizen_overseas",
            "accepted": true,
            "maxLvrPct": null,
            "conditions": "'Note: Expats can be considered on a case-by-case basis.' No LVR or income-shading terms are published."
          },
          {
            "status": "foreign_non_resident",
            "accepted": null,
            "maxLvrPct": null,
            "conditions": "Unstated. The guide restricts applicants who are not Australian or New Zealand citizens with permanent residency status residing in Australia, but does not publish the resulting non-resident terms."
          }
        ],
        "asAt": "2025-11-01",
        "sourceUrl": "https://www.banksyd.com.au/globalassets/documents/pdfs/broker/2025.11bosbroker-lending-guidelines.pdf",
        "sourceTitle": "Residential Lending Guidelines Version 2025.4, November 2025 — Acceptable / Unacceptable Borrowers",
        "confidence": "medium",
        "status": "verified",
        "note": "The guide states the restriction but not its content; only the expat case-by-case note is explicit."
      },
      "foreignIncomeShadingPct": {
        "value": null,
        "asAt": null,
        "sourceUrl": null,
        "confidence": "low",
        "status": "not_found",
        "note": "Not published. The Residential Lending Guidelines contain no foreign-currency income section."
      }
    },
    "version": 1,
    "effectiveFrom": "2025-11-01",
    "effectiveTo": null,
    "researchedAt": "2026-07-29",
    "researchedBy": "research:claude-opus-5",
    "gaps": [
      "No assessment buffer or floor rate is published — the guide only mandates use of the Bank's serviceability calculator and a minimum Cash Flow Ratio of 1.00.",
      "Investment maximum LVR could not be read reliably: the Security Types & Maximum LVR table on page 12 is a multi-column layout whose row-to-criteria alignment does not survive text extraction. Needs a human read.",
      "No credit-history policy at all is published — nothing on defaults, judgments, bankruptcy, arrears, credit score or enquiries.",
      "Minimum and maximum loan amounts are not published on the broker site or in the guide.",
      "Non-resident and temporary-visa terms are referenced ('restrictions apply') but the restrictions themselves are not published; only 'Expats can be considered on a case-by-case basis'.",
      "No foreign-currency income shading or accepted-currency list is published, despite Bank of Sydney's foreign-bank positioning.",
      "The BOS Location Guide (acceptable metro/regional postcodes, based on QBE LMI postcodes) is stated to live on the BOSbroker site under 'Resources' — no public direct URL was found.",
      "Credit card / BNPL / HECS assessment percentages are not published; the guide says commitments come from CCR data or 'the banks carded rates'.",
      "The public product page (banksyd.com.au/broker/products/home-loans/) still shows rates dated 17 November 2023 and carries no policy parameters."
    ]
  },
  {
    "id": "bcu-bank",
    "name": "BCU Bank",
    "legalName": "Police & Nurses Limited (BCU Bank is a retail brand of Police & Nurses Limited, the same entity that trades as P&N Bank)",
    "tier": "mutual_bank",
    "status": "active",
    "acl": "240701",
    "abn": "69 087 651 876",
    "brokerSiteUrl": "https://www.bcu.com.au/home-loans/broker/",
    "policyDocUrl": "https://www.bcu.com.au/important-information/target-market-determinations/",
    "panels": null,
    "servicing": {
      "assessmentBufferPct": {
        "value": null,
        "asAt": null,
        "sourceUrl": null,
        "confidence": "low",
        "status": "not_found",
        "note": "Not published publicly. BCU directs accredited brokers to a broker hub for product and policy information, which requires a login; the public site (TMDs, credit guide, rates) states no assessment buffer or floor rate."
      },
      "notes": {
        "value": "No serviceability parameters (buffer, floor rate, HEM basis, DTI cap, rent shading) are published on BCU Bank's public website.",
        "asAt": "2026-07-29",
        "sourceUrl": "https://www.bcu.com.au/home-loans/broker/",
        "sourceTitle": "Why do brokers choose BCU Bank? | BCU Bank",
        "confidence": "high",
        "status": "verified"
      }
    },
    "lvr": {
      "maxLvrOwnerOccupiedPct": {
        "value": 95,
        "asAt": "2026-04-22",
        "sourceUrl": "https://www.bcu.com.au/important-information/target-market-determinations/offset-home-loan-oo-tmd/",
        "sourceTitle": "Offset Home Loan Owner Occupied Target Market Determination (effective 22/04/2026)",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Up to 95% LVR (Lenders Mortgage Insurance may be required where applicable and as determined by BCU).\\" The OMG Home Loan P&I OO TMD (effective 12/03/2026) states the same 95% ceiling."
      },
      "maxLvrInvestmentPct": {
        "value": 90,
        "asAt": "2026-04-22",
        "sourceUrl": "https://www.bcu.com.au/important-information/target-market-determinations/variable-home-loan-inv-tmd/",
        "sourceTitle": "Variable Home Loan INV Target Market Determination (effective 22/04/2026)",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Up to 90% LVR (Lenders Mortgage Insurance may be required where applicable and as determined by BCU).\\" The Basic Investment Loan IO TMD (effective 22/04/2024) also caps at 90%."
      },
      "notes": {
        "value": "Owner-occupied variable products are priced in three LVR bands: <=60%, >60-80%, >80-95%.",
        "asAt": "2026-03-12",
        "sourceUrl": "https://www.bcu.com.au/important-information/target-market-determinations/omg-home-loan-pi-oo-tmd/",
        "sourceTitle": "OMG Home Loan Owner Occupied Target Market Determination",
        "confidence": "high",
        "status": "verified"
      }
    },
    "income": {},
    "employment": {},
    "credit": {},
    "security": {
      "acceptablePropertyTypes": {
        "value": [
          "Property used for predominantly residential purposes"
        ],
        "asAt": "2026-04-22",
        "sourceUrl": "https://www.bcu.com.au/important-information/target-market-determinations/offset-home-loan-oo-tmd/",
        "sourceTitle": "Offset Home Loan Owner Occupied Target Market Determination",
        "confidence": "medium",
        "status": "verified",
        "note": "TMD security requirement only. No published acceptable/unacceptable security schedule, minimum unit size, postcode category list or high-density policy."
      }
    },
    "product": {
      "minLoanAmount": {
        "value": 20000,
        "asAt": "2026-03-12",
        "sourceUrl": "https://www.bcu.com.au/important-information/target-market-determinations/omg-home-loan-pi-oo-tmd/",
        "sourceTitle": "OMG Home Loan Owner Occupied Target Market Determination (effective 12/03/2026)",
        "confidence": "high",
        "status": "verified",
        "note": "$20,000.00 minimum stated on every BCU home-loan TMD reviewed (OMG OO, Offset OO, Variable INV, Basic Investment IO, Bridging)."
      },
      "maxLoanAmount": {
        "value": 5000000,
        "asAt": "2026-03-12",
        "sourceUrl": "https://www.bcu.com.au/important-information/target-market-determinations/omg-home-loan-pi-oo-tmd/",
        "sourceTitle": "OMG Home Loan Owner Occupied Target Market Determination (effective 12/03/2026)",
        "confidence": "high",
        "status": "verified",
        "note": "$5,000,000.00 maximum stated on every BCU home-loan TMD reviewed."
      },
      "maxLoanTermYears": {
        "value": 30,
        "asAt": "2026-03-12",
        "sourceUrl": "https://www.bcu.com.au/important-information/target-market-determinations/omg-home-loan-pi-oo-tmd/",
        "sourceTitle": "OMG Home Loan Owner Occupied Target Market Determination (effective 12/03/2026)",
        "confidence": "high",
        "status": "verified",
        "note": "Loan term stated as \\"5 - 30 years\\"."
      },
      "maxInterestOnlyYearsInvestment": {
        "value": 5,
        "asAt": "2024-04-22",
        "sourceUrl": "https://www.bcu.com.au/important-information/target-market-determinations/basic-investment-loan-io-lvr-90-tmd/",
        "sourceTitle": "Basic Investment Loan IO (<90% LVR) Target Market Determination (effective 22/04/2024)",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Interest only terms of 3 or 5 years, then principal and interest for the remaining term.\\""
      },
      "offsetAvailable": {
        "value": true,
        "asAt": "2026-04-22",
        "sourceUrl": "https://www.bcu.com.au/important-information/target-market-determinations/offset-home-loan-oo-tmd/",
        "sourceTitle": "Offset Home Loan Owner Occupied Target Market Determination",
        "confidence": "high",
        "status": "verified",
        "note": "\\"100% offset available, with up to 3 offset accounts permitted to be linked to the home loan account.\\" Available on owner-occupied and investor variable products; the no-frills OMG loan has redraw only."
      },
      "redrawAvailable": {
        "value": true,
        "asAt": "2026-03-12",
        "sourceUrl": "https://www.bcu.com.au/important-information/target-market-determinations/omg-home-loan-pi-oo-tmd/",
        "sourceTitle": "OMG Home Loan Owner Occupied Target Market Determination",
        "confidence": "high",
        "status": "verified"
      },
      "bridgingAvailable": {
        "value": true,
        "asAt": "2024-04-19",
        "sourceUrl": "https://www.bcu.com.au/important-information/target-market-determinations/bridging-loan-tmd/",
        "sourceTitle": "Bridging Loan - OO Target Market Determination (effective 19/04/2024)",
        "confidence": "high",
        "status": "verified",
        "note": "Owner-occupied bridging only; term 6 months (sale of existing property) or 12 months (construction), max 80% LVR, interest capitalised to end of term."
      },
      "governmentSchemesSupported": {
        "value": [
          "Home Guarantee Scheme (Australian Government 5% Deposit Scheme)"
        ],
        "asAt": "2026-07-29",
        "sourceUrl": "https://firsthomebuyers.gov.au/australian-government-5-percent-deposit-scheme/5-percent-participating-lenders",
        "sourceTitle": "Home Guarantee Scheme Participating Lenders | Housing Australia",
        "confidence": "medium",
        "status": "verified",
        "note": "BCU is named on Housing Australia's participating-lender list (page carries no publication date; captured 2026-07-29). IMPORTANT FOR BROKERS: the BCU TMDs state \\"Loans originated under the Australian Government 5% Deposit Scheme are distributed through approved internal BCU Bank Home Lenders only\\" (OMG Home Loan P&I OO TMD, effective 12/03/2026) - i.e. the scheme is NOT available through the broker channel at BCU."
      },
      "notes": {
        "value": "Broker-originated lending IS accepted: the TMDs name \\"an accredited Mortgage Broker\\" as an approved distribution channel and set out obligations for \\"Accredited aggregators and brokers\\". BCU runs a public broker page, an accredited-broker hub, and an online broker accreditation eLearning module.",
        "asAt": "2026-03-12",
        "sourceUrl": "https://www.bcu.com.au/important-information/target-market-determinations/omg-home-loan-pi-oo-tmd/",
        "sourceTitle": "OMG Home Loan Owner Occupied Target Market Determination",
        "confidence": "high",
        "status": "verified"
      }
    },
    "residency": {},
    "version": 1,
    "effectiveFrom": "2026-03-12",
    "researchedAt": "2026-07-29",
    "researchedBy": "research:claude-opus-5",
    "gaps": [
      "BCU Bank and P&N Bank are the SAME legal entity (Police & Nurses Limited, ACL 240701) operating two retail brands with separately published TMDs; credit policy is likely shared but this is not stated publicly, so the two records are kept independent.",
      "No public credit policy guide. Broker product/policy detail sits behind the BCU broker hub login, out of scope under the no-login source rule.",
      "Servicing entirely unsourced: assessment buffer, floor rate, DTI cap, rent shading, HEM basis, credit-card and HECS treatment not published.",
      "No income-type policy published (casual, self-employed, overtime, bonus, commission, Centrelink, rental).",
      "No employment tenure minimums, credit-history knock-outs, or residency/visa rules published.",
      "No security policy detail: no minimum unit size, postcode category list, high-density or rural policy published.",
      "Owner-occupied maximum interest-only term not captured; construction lending availability not confirmed from a public source.",
      "Several BCU TMDs read (Bridging, Basic Investment IO) carry 2024 effective dates and may have been superseded."
    ]
  },
  {
    "id": "firefighters-mutual-bank",
    "name": "Firefighters Mutual Bank",
    "legalName": "Teachers Mutual Bank Limited",
    "tier": "mutual_bank",
    "status": "active",
    "acl": "238981",
    "abn": "30 087 650 459",
    "brokerSiteUrl": "https://www.fmbank.com.au/broker",
    "policyDocUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
    "funder": "Teachers Mutual Bank Limited",
    "panels": null,
    "servicing": {
      "assessmentBufferPct": {
        "value": 3,
        "asAt": "2026-07-10",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/channels/websites/common-assets/broker/servicing-calculator-for-up-to-four.xlsm",
        "sourceTitle": "TMBL broker serviceability calculator (up to four applicants), .xlsm",
        "confidence": "medium",
        "status": "verified",
        "note": "Read from the product rate table inside the publicly downloadable broker servicing calculator: column 'BufferRate' = 3 on every home loan product row, and 'Assessment Rate' = product rate + 3. Not stated as a buffer in the Lending Reference Guide, which only says 'a standard assessment rate with an appropriate buffer above the actual loan interest rate'. asAt is the file's last-modified date (10 Jul 2026).",
        "updatedBy": "research:claude-opus-5"
      },
      "assessmentFloorRatePct": {
        "value": 6,
        "asAt": "2026-07-10",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/channels/websites/common-assets/broker/servicing-calculator-for-up-to-four.xlsm",
        "sourceTitle": "TMBL broker serviceability calculator (up to four applicants), .xlsm",
        "confidence": "medium",
        "status": "verified",
        "note": "Column 'AssessmentFloorRate' = 6 on every home loan product row of the calculator's rate table. asAt is the file's last-modified date.",
        "updatedBy": "research:claude-opus-5"
      },
      "rentShadingPct": {
        "value": 0.8,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel (current as at October 2025), p5",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Residential Rental 80% - Lower of actual gross or current market residential rental\\". Commercial rental is 50%; NRAS properties 80% of actual rent paid by tenant.",
        "updatedBy": "research:claude-opus-5"
      },
      "existingCommitmentTreatment": {
        "value": "greater_of",
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p7 (Expenditure)",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Repayments for existing credit facilities are to be the greater of either: the actual home loan repayment stated by the applicant, or the repayment amount assessed by the Bank based on the current loan limit ... plus an appropriate buffer\\". Personal loans are taken at actual repayment.",
        "updatedBy": "research:claude-opus-5"
      },
      "bnplTreatment": {
        "value": "3.8% of the BNPL limit. If the facility has no limit, the actual repayment amount stated by the borrower.",
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p7",
        "confidence": "high",
        "status": "verified",
        "updatedBy": "research:claude-opus-5"
      },
      "hecsTreatment": {
        "value": "Minimum repayment as per ATO Study Repayment Calculator",
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p7",
        "confidence": "high",
        "status": "verified",
        "updatedBy": "research:claude-opus-5"
      },
      "hemBasis": {
        "value": "hem",
        "asAt": "2026-07-10",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/channels/websites/common-assets/broker/servicing-calculator-for-up-to-four.xlsm",
        "sourceTitle": "TMBL broker serviceability calculator - 'HEM Living Expenses' / 'HEM Postcodes' worksheets",
        "confidence": "medium",
        "status": "verified",
        "note": "The broker calculator floors declared living expenses against a HEM table keyed on postcode/family type ('Surplus taking HEM into account'). The Lending Reference Guide itself does not name the benchmark.",
        "updatedBy": "research:claude-opus-5"
      },
      "dtiCap": {
        "value": 7,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p7 (Serviceability)",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Debt to Income Ratio (DTI): Maximum DTI ≤7 times\\".",
        "updatedBy": "research:claude-opus-5"
      },
      "interestOnlyAssessment": {
        "value": "All interest only loans have serviceability assessed over the remaining P&I term (e.g. 30 year total term with 3 year IO term is assessed over 27 years). Every IO application must state the applicant's reason for choosing IO over P&I.",
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p8",
        "confidence": "high",
        "status": "verified",
        "updatedBy": "research:claude-opus-5"
      },
      "notes": {
        "value": "Other commitment treatments (p7): overdrafts 2% of the limit; margin/equity loans at limit x actual rate + 3% buffer / 12; credit cards calculated over a three year term using the Bank's credit card benchmark rate; notional rental expense of $650 per month added where a borrower buying/refinancing an investment property lives rent free or at unusually low rent. All applications must show a positive monthly surplus. All debt commitments must be verified with the last 2 statements (min 60 days).",
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p7",
        "confidence": "high",
        "status": "verified",
        "updatedBy": "research:claude-opus-5"
      }
    },
    "lvr": {
      "maxLvrOwnerOccupiedPct": {
        "value": 95,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p10 (Maximum LVRs with LMI)",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Up to 95% including the capitalisation of LMI and any bank fees, where applicable, EXCEPT where the purpose is for construction of an owner occupied dwelling, then up to 90% prior to the capitalisation of LMI\\". Up to 98% under the Australian Government 5% Deposit Scheme.",
        "updatedBy": "research:claude-opus-5"
      },
      "maxLvrInvestmentPct": {
        "value": 95,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p10",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Up to 95% including the capitalisation of LMI and any bank fees ... EXCEPT where the purpose is for construction of an investment dwelling, then up to 90% prior to the capitalisation of LMI\\".",
        "updatedBy": "research:claude-opus-5"
      },
      "maxLvrNoLmiPct": {
        "value": 80,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, pp10-11 (Maximum LVRs without LMI or 5% Deposit Scheme)",
        "confidence": "high",
        "status": "verified",
        "note": "80% is the top of the no-LMI matrix and applies to Metro and Regional/Rural securities valued up to $2m (owner occupied and investment alike). It steps down by location and security value - see lvr.notes for the full matrix.",
        "updatedBy": "research:claude-opus-5"
      },
      "maxLvrCashOutPct": {
        "value": 90,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p1 (Acceptable Purposes - Cash Out)",
        "confidence": "high",
        "status": "verified",
        "note": "\\"0 - ≤85% LVR: No limit applicable to cash out component. >85% - ≤90% LVR: cash out component limited to up to 20% of the security value. >90% LVR: No cash out allowed.\\"",
        "updatedBy": "research:claude-opus-5"
      },
      "maxLvrConstructionPct": {
        "value": 90,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p10",
        "confidence": "high",
        "status": "verified",
        "note": "90% prior to the capitalisation of LMI and any bank fees, for construction of either an owner occupied or an investment dwelling.",
        "updatedBy": "research:claude-opus-5"
      },
      "maxLvrCompanyTrustPct": {
        "value": null,
        "asAt": null,
        "sourceUrl": null,
        "confidence": "low",
        "status": "not_found",
        "note": "Not applicable / not published - the guide states \\"Companies & Trusts: The Bank does not lend to these entities\\" (p1) and the product matrix states \\"Borrowing entity: Personal names only (no companies or trusts)\\"."
      },
      "lmiCapitalisable": {
        "value": true,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p8 (LMI Premium)",
        "confidence": "high",
        "status": "verified",
        "note": "\\"LMI Premium: Capitalised on all loans\\".",
        "updatedBy": "research:claude-opus-5"
      },
      "lmiInclusiveOfMaxLvr": {
        "value": true,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p10",
        "confidence": "high",
        "status": "verified",
        "note": "The 95% ceiling is \\"including the capitalisation of LMI and any bank fees\\" - i.e. the premium sits inside the stated maximum LVR (the construction 90% is the exception, measured prior to capitalisation).",
        "updatedBy": "research:claude-opus-5"
      },
      "lmiProvider": {
        "value": [
          "Helia"
        ],
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p8",
        "confidence": "high",
        "status": "verified",
        "note": "\\"LMI Provider: Helia. Note Helia may have some requirements or restrictions that are additional to this guide\\".",
        "updatedBy": "research:claude-opus-5"
      },
      "notes": {
        "value": "No-LMI maximum LVR matrix (identical for owner occupied and investment), by security location x security value: Metro - 80% (≤$1m), 80% (>$1m-≤$2m), 80% (>$2m-≤$4m), 70% (>$4m). Regional - 80%, 80%, 70%, 60%. Rural - 80%, 80%, 70%, 60%. Not Elsewhere Classified - 80%, 70%, 60%, 50%. The maximum LVR is based on the individual value of each acceptable security; where more than one security is taken no single security can exceed the maximum for its location. Other LVR restrictions: four or more dwellings on one title - max 60%; Company Title - max 80% where the security is >10km outside a capital city CBD; time share allowing permanent owner occupancy - max 80%.",
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, pp10-11",
        "confidence": "high",
        "status": "verified",
        "updatedBy": "research:claude-opus-5"
      }
    },
    "income": {
      "rules": {
        "value": [
          {
            "type": "payg_permanent_full_time",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 6,
            "evidence": "Two most recent payslips, or 3 months of bank statements showing salary continuity",
            "conditions": "All other applicants - PAYG: \\"Full Time 100% - Minimum 6 months in the job or 12 months in the industry\\". Applicants employed in eligible Education and Essential Services occupations (which include Commissioned Fire Officer, Senior Fire Fighter, Fire Fighter, Commissioned Police Officer, Supervisor Police Officer, Police Officer, Ambulance Officer and Intensive Care Ambulance Paramedic) are accepted at 100% with \\"No minimum time in employment required\\"."
          },
          {
            "type": "payg_permanent_part_time",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 6,
            "conditions": "\\"Regular Part Time 100% - Minimum 6 months in the job or 12 months in the industry\\". Irregular part time income is Nil. Eligible Education/Essential Services occupations: permanent/regular part time 100% with no minimum time in employment."
          },
          {
            "type": "payg_casual",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 6,
            "conditions": "\\"Regular Casual 100% - Minimum 6 months in current employment\\". Irregular casual is Nil. Eligible Education/Essential Services occupations: regular casual or relief 100% with a minimum 3 months in employment."
          },
          {
            "type": "payg_fixed_term_contract",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": null,
            "conditions": "Stated only in the Education/Essential Services table: \\"Fixed Term Contract 100% - Must be full time position under contract\\". Not addressed for other applicants."
          },
          {
            "type": "overtime_essential_services",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 3,
            "conditions": "Eligible Education/Essential Services occupations: \\"Regular Overtime 100% - Proven over three months as evidenced by taxation records, employment contract or payslips\\". Irregular overtime is Nil."
          },
          {
            "type": "overtime_other",
            "accepted": true,
            "shadingPct": 0.8,
            "minHistoryMonths": 24,
            "conditions": "Recorded at the conservative rate. \\"Regular Overtime 80% - Must be a condition of employment, or proven over 2 years\\". 100% is allowed instead, proven over three months, for named employee types: airline workers, mining sector workers, child care workers, aged care and disabled care workers, public transport operators, medical practitioners (e.g. doctors, surgeons), construction trades workers, protective service workers. Irregular overtime is Nil."
          },
          {
            "type": "shift_allowance",
            "accepted": true,
            "shadingPct": 0.8,
            "minHistoryMonths": 24,
            "conditions": "Recorded at the conservative rate. \\"Regular Shift Allowance 80% - Must be a condition of employment, or proven over 2 years\\". 100% (proven over three months) for the same named employee types as overtime, and 100% for eligible Education/Essential Services occupations proven over three months. Irregular shift allowance is Nil."
          },
          {
            "type": "bonus",
            "accepted": true,
            "shadingPct": 0.8,
            "minHistoryMonths": 24,
            "conditions": "\\"Commission/Bonuses 80% of average of last 2 years - Proven over 2 years as evidenced by taxation records, employment contract or payslips\\"."
          },
          {
            "type": "commission",
            "accepted": true,
            "shadingPct": 0.8,
            "minHistoryMonths": 24,
            "conditions": "\\"Commission/Bonuses 80% of average of last 2 years - Proven over 2 years\\"."
          },
          {
            "type": "car_allowance",
            "accepted": true,
            "shadingPct": 1,
            "conditions": "\\"Vehicle Allowance 100% - Added to gross taxable income. Note: If a fully maintained vehicle is provided with no reciprocal cash flow benefit, $5,000 can be added to the net income\\"."
          },
          {
            "type": "self_employed_sole_trader",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 24,
            "evidence": "Latest two full years of personal and business tax returns plus the latest year's Tax Assessment Notice; interim financials are unacceptable",
            "conditions": "\\"Proven over 2 years as evidenced by personal and business taxation records. Where income has increased over the last two years by ≤ 20% the latest year's income can be used. Where income has increased over the last two years by >20%, then maximum of 120% of previous year's income is to be used.\\" Allowable add-backs at 100%: interest on loans being refinanced by the Bank, superannuation contributions above SGL, non-recurring expenses; depreciation add-back is the lesser of the actual depreciation amount or 20% of NPBT."
          },
          {
            "type": "self_employed_company",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 24,
            "evidence": "Two years personal and business tax returns plus a current balance sheet and profit and loss statement",
            "conditions": "Same 2-year rule and add-backs as sole traders. Note the Bank will not lend TO a company or trust - the borrower must be a natural person."
          },
          {
            "type": "self_employed_trust",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 24,
            "conditions": "Same 2-year rule and add-backs. The Bank does not lend to trusts as borrowing entities."
          },
          {
            "type": "rental_residential",
            "accepted": true,
            "shadingPct": 0.8,
            "conditions": "\\"Residential Rental 80% - Lower of actual gross or current market residential rental\\". NRAS properties 80% of actual rent paid by tenant."
          },
          {
            "type": "rental_commercial",
            "accepted": true,
            "shadingPct": 0.5,
            "conditions": "\\"Commercial Rental Property 50% - Lower of actual gross or current market rental, as per rental lease agreement or rental appraisal by real estate agent\\"."
          },
          {
            "type": "dividends",
            "accepted": true,
            "shadingPct": 0.8,
            "minHistoryMonths": 24,
            "conditions": "\\"Investment (i.e. interest & dividend income only) 80% of average of last two years - Confirmation of current ownership of investment\\"."
          },
          {
            "type": "government_age_pension",
            "accepted": true,
            "shadingPct": 1,
            "conditions": "\\"Government and Non-Government Pensions 100% - If considered permanent for the next 5 years\\"."
          },
          {
            "type": "government_family_tax_benefit",
            "accepted": true,
            "shadingPct": 1,
            "conditions": "\\"Government Paid Parenting/Family Allowance 100% - If considered permanent for the next 5 years, except for Family Tax Benefit where acceptable for dependents up to and including 15 years\\"."
          },
          {
            "type": "government_parenting_payment",
            "accepted": true,
            "shadingPct": 1,
            "conditions": "\\"Government Paid Parenting/Family Allowance 100% - If considered permanent for the next 5 years\\"."
          },
          {
            "type": "child_support_maintenance",
            "accepted": true,
            "shadingPct": 1,
            "evidence": "Child Support Agency Assessment showing the amount payable and eligible children, plus 6 months of consistent payments on bank statements",
            "conditions": "\\"Other Income e.g. child support payments, workers compensation 100% - If considered permanent for the next 5 years\\"."
          },
          {
            "type": "foreign_income",
            "accepted": true,
            "shadingPct": 0.7,
            "conditions": "\\"Overseas Income - All currencies 70%. Overseas income is acceptable only from the following income types: PAYG income, Rental income\\"."
          }
        ],
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel (current as at October 2025), pp2-6 (Acceptable Income)",
        "confidence": "high",
        "status": "verified",
        "note": "The guide runs two separate income tables - one for applicants employed in eligible Education and Essential Services occupations (which is where most Health Professionals Bank members sit) and one for all other applicants. Where they differ, the 'all other applicants' figure is recorded as the value and the essential-services concession is stated in conditions. Guarantor income is \\"Not acceptable\\".",
        "updatedBy": "research:claude-opus-5"
      },
      "selfEmployedMinYears": {
        "value": 2,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, pp4 and 7",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Proven over 2 years as evidenced by personal and business taxation records\\"; standard verification is \\"the latest two full years of personal and business taxation returns\\" and \\"Interim financials are unacceptable\\".",
        "updatedBy": "research:claude-opus-5"
      },
      "notes": {
        "value": "Simplified self-employed verification is available where the applicant has paid themselves a regular salary for at least six months, business income is NOT required for servicing, and the business has traded at least two years - verified from six months of salary credits or two consecutive payslips, plus an accountant's letter confirming trading start date, sufficient profits and ability to continue paying the declared salary.",
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p6",
        "confidence": "high",
        "status": "verified",
        "updatedBy": "research:claude-opus-5"
      }
    },
    "employment": {
      "minMonthsCurrentJob": {
        "value": 6,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p3",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Full Time 100% - Minimum 6 months in the job or 12 months in the industry\\" for all other applicants. Nil minimum applies to applicants in the eligible Education and Essential Services occupation list (includes Commissioned Fire Officer, Senior Fire Fighter, Fire Fighter, police officers, ambulance officers and ICU paramedics).",
        "updatedBy": "research:claude-opus-5"
      },
      "sameIndustryContinuityAccepted": {
        "value": true,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p3",
        "confidence": "high",
        "status": "verified",
        "note": "The tenure test is \\"Minimum 6 months in the job OR 12 months in the industry\\".",
        "updatedBy": "research:claude-opus-5"
      },
      "minMonthsSameIndustry": {
        "value": 12,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p3",
        "confidence": "high",
        "status": "verified",
        "updatedBy": "research:claude-opus-5"
      },
      "minMonthsCasual": {
        "value": 6,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p4",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Regular Casual 100% - Minimum 6 months in current employment\\". 3 months for eligible Education/Essential Services occupations (regular casual or relief).",
        "updatedBy": "research:claude-opus-5"
      },
      "minMonthsSelfEmployedAbn": {
        "value": 24,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p4",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Proven over 2 years as evidenced by personal and business taxation records\\".",
        "updatedBy": "research:claude-opus-5"
      },
      "probationAccepted": {
        "value": null,
        "asAt": null,
        "sourceUrl": null,
        "confidence": "low",
        "status": "not_found",
        "note": "Probation is not mentioned anywhere in the public TMBL 3rd Party Lending Reference Guide or product matrix."
      }
    },
    "credit": {
      "notes": {
        "value": null,
        "asAt": null,
        "sourceUrl": null,
        "confidence": "low",
        "status": "not_found",
        "note": "TMBL publishes no credit-history policy in its public broker material. The 3rd Party Lending Reference Guide (Oct 2025), product matrix (May 2026) and broker forms/fact sheets pages contain no rules on defaults, judgments, bankruptcy, arrears, credit score or enquiries."
      }
    },
    "security": {
      "acceptablePropertyTypes": {
        "value": [
          "Residential use properties only",
          "Freehold Title",
          "Strata, Group, Cluster or Community Title",
          "Survey Strata",
          "Company Title",
          "99 Year Leasehold",
          "Stratum Title",
          "Residential Area Right and Residential Licence (only applicable in Victoria)"
        ],
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, pp9-10 (Acceptable Securities / Acceptable Title)",
        "confidence": "high",
        "status": "verified",
        "note": "Also: first ranking financial institution charge only; located in Australia; dwellings must be a private, self contained (bathing and cooking facilities) immobile structure; must be serviced by power, water, utilities and vehicular access.",
        "updatedBy": "research:claude-opus-5"
      },
      "unacceptablePropertyTypes": {
        "value": [
          "Contaminated property",
          "Property with a known flood height above floor level",
          "Property subject to land slip",
          "Property subject to mine subsidence",
          "Time share or serviced apartment which does not allow for permanent owner occupancy",
          "Property generating primary production income (hobby farms excepted)",
          "Off the plan purchase"
        ],
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p9 (Property Exclusions)",
        "confidence": "high",
        "status": "verified",
        "updatedBy": "research:claude-opus-5"
      },
      "minUnitFloorAreaSqm": {
        "value": 60,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p9",
        "confidence": "high",
        "status": "verified",
        "note": "Two thresholds are published: \\"Minimum size for two or more bedroom units, excluding car space and balconies, is 60m2. Minimum size for studio or one bedroom units, excluding car space and balconies, is 30m2\\". The stricter 60m2 is recorded as the value; a studio or one-bedroom unit may go to 30m2.",
        "updatedBy": "research:claude-opus-5"
      },
      "maxLandSizeHa": {
        "value": 40,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p9",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Maximum land area of 40 hectares (100 acres)\\".",
        "updatedBy": "research:claude-opus-5"
      },
      "postcodeRestrictionsPublished": {
        "value": true,
        "asAt": "2024-08-21",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/real-property-classifications.pdf",
        "sourceTitle": "TMBL Real Property Classifications, effective 21 Aug 2024",
        "confidence": "high",
        "status": "verified",
        "note": "\\"The Bank classifies the location of real properties into categories based on their postcode. The categories are: Metro, Regional, Rural, Not Elsewhere Classified (NEC).\\" 57 pages of postcode-to-category mappings; the category drives the no-LMI maximum LVR matrix.",
        "updatedBy": "research:claude-opus-5"
      },
      "postcodeListUrl": {
        "value": "https://www.fmbank.com.au/content/dam/documents/collateral/real-property-classifications.pdf",
        "asAt": "2024-08-21",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/real-property-classifications.pdf",
        "sourceTitle": "TMBL Real Property Classifications, effective 21 Aug 2024",
        "confidence": "high",
        "status": "verified",
        "updatedBy": "research:claude-opus-5"
      },
      "ruralResidentialAccepted": {
        "value": true,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, pp10-11",
        "confidence": "medium",
        "status": "verified",
        "note": "\\"Rural\\" is one of the four published location categories and carries its own no-LMI LVR row (80% up to $2m, 70% >$2m-≤$4m, 60% >$4m). Property generating primary production income is excluded, hobby farms excepted, and land area is capped at 40ha.",
        "updatedBy": "research:claude-opus-5"
      },
      "companyTitleAccepted": {
        "value": true,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, pp10-11",
        "confidence": "high",
        "status": "verified",
        "note": "Company Title is on the acceptable title list; \\"Maximum LVR is 80% when the security property is located >10kms outside a capital city CBD\\".",
        "updatedBy": "research:claude-opus-5"
      },
      "leaseholdAccepted": {
        "value": true,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p10",
        "confidence": "high",
        "status": "verified",
        "note": "\\"99 Year Leasehold\\" is listed as an acceptable title.",
        "updatedBy": "research:claude-opus-5"
      },
      "strataAccepted": {
        "value": true,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p10",
        "confidence": "high",
        "status": "verified",
        "updatedBy": "research:claude-opus-5"
      },
      "offThePlanAccepted": {
        "value": false,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p9 (Property Exclusions)",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Property ... Is an off the plan purchase\\" is listed under Property Exclusions.",
        "updatedBy": "research:claude-opus-5"
      },
      "notes": {
        "value": "LVR restrictions by security type: four or more dwellings on one title - maximum LVR 60%; Company Title - maximum 80% where >10km outside a capital city CBD; time share allowing permanent owner occupancy - maximum 80%. Valuation types: Contract of Sale (purchase, LVR ≤60%), Valuer General/Council Rates Notice (already owned, LVR ≤60%), AVM, Desktop Valuation. Building insurance is required on all securities noting Teachers Mutual Bank Limited as mortgagee. Construction: no owner builders, no kit homes or relocatable dwellings, no strata-titled properties, no refinance where construction is in progress, and no more than two properties on one title; fixed price building contracts only.",
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, pp10-12",
        "confidence": "high",
        "status": "verified",
        "updatedBy": "research:claude-opus-5"
      }
    },
    "product": {
      "maxLoanTermYears": {
        "value": 30,
        "asAt": "2026-05-23",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/product-matrix.pdf",
        "sourceTitle": "TMBL Product Matrix, effective 23 May 2026",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Repayment term: Min 6 months and max 30 years\\" for both Your Way Home Loan and Your Way Plus Home Loan.",
        "updatedBy": "research:claude-opus-5"
      },
      "offsetAvailable": {
        "value": true,
        "asAt": "2026-05-23",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/product-matrix.pdf",
        "sourceTitle": "TMBL Product Matrix, effective 23 May 2026",
        "confidence": "high",
        "status": "verified",
        "note": "Your Way Plus Home Loan only: \\"100% offset across up to 8 eligible linked offset accounts. Available on both variable and fixed rate home loans.\\" The base Your Way Home Loan has no offset.",
        "updatedBy": "research:claude-opus-5"
      },
      "redrawAvailable": {
        "value": true,
        "asAt": "2026-05-23",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/product-matrix.pdf",
        "sourceTitle": "TMBL Product Matrix, effective 23 May 2026",
        "confidence": "high",
        "status": "verified",
        "note": "Your Way: fee free, variable rate only. Your Way Plus: fee free, includes both variable and fixed rate loans.",
        "updatedBy": "research:claude-opus-5"
      },
      "constructionAvailable": {
        "value": true,
        "asAt": "2026-05-23",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/product-matrix.pdf",
        "sourceTitle": "TMBL Product Matrix, effective 23 May 2026",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Construction loans: Yes - variable rate loans only\\" on both products. Progressive drawdown for construction or major renovations only.",
        "updatedBy": "research:claude-opus-5"
      },
      "genuineSavingsRequiredAboveLvrPct": {
        "value": 90,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p8 (Savings/Deposit Funds)",
        "confidence": "high",
        "status": "verified",
        "note": "\\"LMI Loans - When LVR ≤ 90%: No evidence of savings/deposit funds required. When LVR > 90%: Evidence of savings/deposit funds required.\\" For loans with family guarantors the threshold is 80% (above 80% the Bank does not generate the business).",
        "updatedBy": "research:claude-opus-5"
      },
      "giftedDepositAccepted": {
        "value": true,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p9",
        "confidence": "high",
        "status": "verified",
        "updatedBy": "research:claude-opus-5"
      },
      "giftedDepositConditions": {
        "value": "\\"Gifted funds to the applicant should be supported by a letter from the provider of the fund clearly stating that the funds are a gift and are not repayable.\\" Gifts count as acceptable savings/deposit funds, but \\"if application requires LMI the gift must be from an immediate family member\\". Gifts are NOT acceptable towards the minimum deposit contribution for Australian Government 5% Deposit Scheme loans. Borrowed funds (e.g. proceeds of personal loans) are never acceptable.",
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, pp8-9",
        "confidence": "high",
        "status": "verified",
        "updatedBy": "research:claude-opus-5"
      },
      "governmentSchemesSupported": {
        "value": [
          "Australian Government 5% Deposit Scheme - General Stream",
          "Australian Government 5% Deposit Scheme - Single Parent Stream",
          "First Home Owner Grant (accepted as deposit funds)",
          "First Home Super Saver Scheme (accepted as deposit funds)"
        ],
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, pp8-9",
        "confidence": "high",
        "status": "verified",
        "note": "5% Deposit Scheme requires at least 5% genuine savings (General Stream) or 2% (Single Parent Stream) held or accumulated for a minimum of three months; gifts and other non-saved funds do not count towards that minimum. LVR up to 98% including capitalisation of bank fees.",
        "updatedBy": "research:claude-opus-5"
      },
      "guarantorAccepted": {
        "value": true,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, pp1 and 9",
        "confidence": "high",
        "status": "verified",
        "updatedBy": "research:claude-opus-5"
      },
      "guarantorConditions": {
        "value": "Guarantor must be the applicant's partner (spouse/de facto) or a family member (parent, child, sibling, grandparent or grandchild), be a permanent resident or citizen of Australia, be at least 18, be financially acceptable to the Bank, and complete a Guarantor Information Form. \\"Guarantee will be limited to a specified amount and must be supported by a first ranking charge over a security property acceptable to the Bank.\\" Third party (parental) security allows borrowing 100% of the purchase price and associated costs. Guarantor income is not acceptable for servicing. On family-guarantee loans: LVR ≤80% no evidence of savings required; LVR >80% \\"Not available (the Bank does not generate this business)\\".",
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, pp1, 5 and 9",
        "confidence": "high",
        "status": "verified",
        "updatedBy": "research:claude-opus-5"
      },
      "notes": {
        "value": "Firefighters Mutual Bank is a division of Teachers Mutual Bank Limited (ABN 30 087 650 459, AFSL/ACL 238981), alongside Teachers Mutual Bank, UniBank and Health Professionals Bank; all four share one credit policy and one broker accreditation. Membership is restricted: an applicant must be an Australian citizen or permanent resident AND either \\"employed in, retired from, or volunteer in the Australian emergency services sector\\" or \\"immediate family to a Firefighters Mutual Bank member\\". Applicants must be at least 18 and \\"a member of the Bank or eligible for membership of the Bank\\". BORROWING ENTITY IS PERSONAL NAMES ONLY - \\"Companies & Trusts: The Bank does not lend to these entities\\" - so company, trust and SMSF borrowers are out of scope. Two products only: Your Way Home Loan ($600 establishment fee, no offset) and Your Way Plus Home Loan (annual package fee, waived for eligible essential-worker first home buyers - the essential-worker list includes Commissioned Fire Officer, Senior Fire Fighter and Fire Fighter; 100% offset across up to 8 accounts). Both allow owner occupied, investment and construction. Fixed rate lock up to 90 days for 0.10% of the applied amount. An exit strategy is required where the contractual loan term will exceed the applicant's expected income stream.",
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, pp1 and 8; TMBL Product Matrix eff. 23 May 2026; Firefighters Mutual Bank 'Why join us' eligibility page (https://www.fmbank.com.au/about/why-join-us)",
        "confidence": "high",
        "status": "verified",
        "updatedBy": "research:claude-opus-5"
      }
    },
    "residency": {
      "rules": {
        "value": [
          {
            "status": "australian_citizen",
            "accepted": true,
            "maxLvrPct": null,
            "conditions": "Applicant \\"Must be ... Permanent resident or citizen of Australia\\" and at least 18 years of age."
          },
          {
            "status": "permanent_resident",
            "accepted": true,
            "maxLvrPct": null,
            "conditions": "Applicant \\"Must be ... Permanent resident or citizen of Australia\\"."
          },
          {
            "status": "temporary_visa_work",
            "accepted": false,
            "maxLvrPct": null,
            "conditions": "The guide requires applicants (and guarantors) to be a permanent resident or citizen of Australia; temporary visa holders are not provided for."
          },
          {
            "status": "temporary_visa_student",
            "accepted": false,
            "maxLvrPct": null,
            "conditions": "The guide requires applicants to be a permanent resident or citizen of Australia."
          },
          {
            "status": "foreign_non_resident",
            "accepted": false,
            "maxLvrPct": null,
            "conditions": "The guide requires applicants to be a permanent resident or citizen of Australia."
          },
          {
            "status": "nz_citizen_444",
            "accepted": null,
            "maxLvrPct": null,
            "conditions": "Not addressed. Subclass 444 holders are neither citizens nor permanent residents, and the guide is silent - confirm with the Bank."
          },
          {
            "status": "expat_citizen_overseas",
            "accepted": null,
            "maxLvrPct": null,
            "conditions": "Not addressed directly. Overseas income is accepted at 70% from PAYG and rental sources only, which implies some overseas-based applicants are contemplated, but no expat rule is published."
          }
        ],
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p1 (Applicant Types) and p5 (Overseas Income)",
        "confidence": "medium",
        "status": "verified",
        "note": "Only the citizen/PR requirement is published explicitly; the 'false' entries are the direct consequence of that requirement rather than separately stated exclusions.",
        "updatedBy": "research:claude-opus-5"
      },
      "foreignIncomeShadingPct": {
        "value": 0.7,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p5",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Overseas Income - Currency: All currencies 70%. Overseas income is acceptable only from the following income types: PAYG income, Rental income\\".",
        "updatedBy": "research:claude-opus-5"
      },
      "acceptedForeignCurrencies": {
        "value": [
          "All currencies"
        ],
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.fmbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p5",
        "confidence": "high",
        "status": "verified",
        "updatedBy": "research:claude-opus-5"
      }
    },
    "version": 1,
    "effectiveFrom": "2025-10-01",
    "effectiveTo": null,
    "researchedAt": "2026-07-29",
    "researchedBy": "research:claude-opus-5",
    "gaps": [
      "Assessment buffer (3.00) and assessment floor rate (6.00) come from the product rate table inside the public broker servicing calculator (.xlsm), not from a policy statement - the Lending Reference Guide only says 'a standard assessment rate with an appropriate buffer'. Worth a BDM confirmation.",
      "Credit card assessment: the Lending Reference Guide (Oct 2025) says cards are 'calculated over a three year term using the Bank's credit card benchmark rate' while the broker calculator still carries a 3% of limit monthly percentage. The two conflict, so no creditCardAssessmentPct is recorded. The credit card benchmark rate itself is not published.",
      "No credit-history policy is published at all - nothing on defaults, judgments, writs, bankruptcy/Part IX, arrears, credit score or number of enquiries.",
      "No minimum or maximum loan amount is published (only a minimum term of 6 months and maximum of 30 years).",
      "Maximum interest-only term is not published for either owner occupied or investment loans.",
      "Probation policy is not published.",
      "No maximum age at maturity is published; the guide only requires an exit strategy 'where the contractual loan term will exceed an applicant's expected income stream'.",
      "No refinance-specific reduced buffer, negative-gearing add-back or depreciation add-back rule is published.",
      "High-density / inner-city apartment concentration policy is not published (only a 60% cap for four or more dwellings on one title).",
      "SMSF and bridging lending are not mentioned; company/trust borrowing is explicitly excluded, which makes SMSF lending very unlikely, but no source states it.",
      "The Real Property Classifications postcode list is dated 21 Aug 2024 and may have been superseded.",
      "Firefighters Mutual Bank shares one credit policy with Teachers Mutual Bank, UniBank and Health Professionals Bank - no FMB-specific credit variation was found. The only brand-level difference is membership eligibility."
    ]
  },
  {
    "id": "great-southern-bank",
    "name": "Great Southern Bank",
    "legalName": "Credit Union Australia Ltd (Great Southern Bank is a business name of Credit Union Australia Ltd)",
    "tier": "mutual_bank",
    "status": "active",
    "acl": "238317",
    "abn": "44 087 650 959",
    "brokerSiteUrl": "https://www.greatsouthernbank.com.au/brokers",
    "policyDocUrl": "https://www.greatsouthernbank.com.au/__data/assets/pdf_file/0016/431071/great-southern-bank-basic-variable-home-loan-target-market-determination.pdf",
    "panels": null,
    "servicing": {
      "assessmentBufferPct": {
        "value": null,
        "asAt": null,
        "sourceUrl": null,
        "confidence": "low",
        "status": "not_found",
        "note": "Not published. Checked the home-loan TMDs, the rates pages and the home-loan hub; Great Southern Bank does not publish an assessment buffer or floor rate on any no-login page. The broker landing page (greatsouthernbank.com.au/brokers) is served behind a Cloudflare bot block and its policy resources sit behind a broker login."
      },
      "notes": {
        "value": "No serviceability parameters (buffer, floor rate, HEM basis, DTI cap, rent shading, credit-card assessment) are published publicly.",
        "asAt": "2025-07-31",
        "sourceUrl": "https://www.greatsouthernbank.com.au/__data/assets/pdf_file/0016/431071/great-southern-bank-basic-variable-home-loan-target-market-determination.pdf",
        "sourceTitle": "Basic Variable Home Loan Target Market Determination (effective 31 July 2025)",
        "confidence": "medium",
        "status": "verified"
      }
    },
    "lvr": {
      "maxLvrOwnerOccupiedPct": {
        "value": null,
        "asAt": null,
        "sourceUrl": null,
        "confidence": "low",
        "status": "not_found",
        "note": "Great Southern Bank does not publish a numeric maximum LVR. The published rate card's top pricing band is simply \\"LVR is more than 90%\\" with no stated ceiling (https://www.greatsouthernbank.com.au/home-loans/interest-rates, effective 22 May 2026), and the TMDs say only \\"Maximum LVR applies\\". A 90% cap IS published, but only for the >30-year loan term product variant."
      },
      "maxLvrNoLmiPct": {
        "value": 80,
        "asAt": "2025-07-31",
        "sourceUrl": "https://www.greatsouthernbank.com.au/__data/assets/pdf_file/0016/431071/great-southern-bank-basic-variable-home-loan-target-market-determination.pdf",
        "sourceTitle": "Basic Variable Home Loan Target Market Determination (effective 31 July 2025)",
        "confidence": "high",
        "status": "verified",
        "note": "TMD financial-situation criteria include \\"paying Lenders Mortgage Insurance (LMI) for this home loan if the loan to value ratio is above 80%\\". The rates page states the same: \\"having an LVR of 80% or lower also means you could avoid paying Lenders Mortgage Insurance (LMI)\\"."
      },
      "lmiInclusiveOfMaxLvr": {
        "value": true,
        "asAt": "2026-05-22",
        "sourceUrl": "https://www.greatsouthernbank.com.au/home-loans/interest-rates",
        "sourceTitle": "Home Loan Interest Rates | Great Southern Bank (rates effective 22 May 2026)",
        "confidence": "high",
        "status": "verified",
        "note": "Footnote: \\"Maximum LVR applies and includes Lenders' Mortgage Insurance and Great Southern Bank loan setup fees where applicable.\\" Also \\"*Loan-to-value ratio (LVR) inclusive of Lenders' Mortgage Insurance (LMI).\\" So LMI and setup fees are counted INSIDE the LVR ceiling, not on top of it."
      },
      "notes": {
        "value": "Published LVR pricing bands: 70% or less; above 70% and up to 80%; above 80% and up to 90%; more than 90%. LVR is calculated inclusive of LMI and Great Southern Bank loan setup fees.",
        "asAt": "2026-05-22",
        "sourceUrl": "https://www.greatsouthernbank.com.au/home-loans/interest-rates",
        "sourceTitle": "Home Loan Interest Rates | Great Southern Bank",
        "confidence": "high",
        "status": "verified"
      }
    },
    "income": {},
    "employment": {},
    "credit": {},
    "security": {
      "acceptablePropertyTypes": {
        "value": [
          "Residential property (owner occupied or investment)",
          "Land purchase"
        ],
        "asAt": "2025-07-31",
        "sourceUrl": "https://www.greatsouthernbank.com.au/__data/assets/pdf_file/0016/431071/great-southern-bank-basic-variable-home-loan-target-market-determination.pdf",
        "sourceTitle": "Basic Variable Home Loan Target Market Determination (effective 31 July 2025)",
        "confidence": "medium",
        "status": "verified",
        "note": "Derived from the TMD's stated loan purposes: purchase, construct or renovate a residential owner-occupied or investment property; purchase land; refinance; access equity; consolidate personal debts. No acceptable/unacceptable security schedule, minimum unit size, postcode category list or high-density policy is published."
      }
    },
    "product": {
      "minLoanAmount": {
        "value": 100000,
        "asAt": "2025-07-31",
        "sourceUrl": "https://www.greatsouthernbank.com.au/__data/assets/pdf_file/0016/431071/great-southern-bank-basic-variable-home-loan-target-market-determination.pdf",
        "sourceTitle": "Basic Variable Home Loan Target Market Determination (effective 31 July 2025)",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Minimum Loan amount - (a) new home loans with a minimum application amount of $100,000; or (b) switching or restructuring of existing Great Southern Bank home loans when it includes new borrowing of at least $10,000.\\" So $100,000 for a new-to-bank application; $10,000 of new borrowing for an internal restructure. Same wording in the Offset Variable Home Loan TMD."
      },
      "maxLoanAmount": {
        "value": 5000000,
        "asAt": "2025-07-31",
        "sourceUrl": "https://www.greatsouthernbank.com.au/__data/assets/pdf_file/0016/431071/great-southern-bank-basic-variable-home-loan-target-market-determination.pdf",
        "sourceTitle": "Basic Variable Home Loan Target Market Determination (effective 31 July 2025)",
        "confidence": "high",
        "status": "verified"
      },
      "maxLoanTermYears": {
        "value": 40,
        "asAt": "2025-07-31",
        "sourceUrl": "https://www.greatsouthernbank.com.au/__data/assets/pdf_file/0016/431071/great-southern-bank-basic-variable-home-loan-target-market-determination.pdf",
        "sourceTitle": "Basic Variable Home Loan Target Market Determination (effective 31 July 2025)",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Loan term - from 1 to 40 years.\\" A term ABOVE 30 years is heavily conditioned: at least one applicant must be a first home buyer, ALL applicants must be aged 40 or under at approval, and maximum 90% LVR (inclusive of fees). Terms above 30 years are NOT available on Green Home Offer loans, government scheme loans, shared equity loans, loans with guarantors, or loans to businesses/companies/trusts/non-resident borrowers. Standard maximum term is therefore 30 years."
      },
      "maxInterestOnlyYearsOwnerOcc": {
        "value": 3,
        "asAt": "2025-07-31",
        "sourceUrl": "https://www.greatsouthernbank.com.au/__data/assets/pdf_file/0016/431071/great-southern-bank-basic-variable-home-loan-target-market-determination.pdf",
        "sourceTitle": "Basic Variable Home Loan Target Market Determination (effective 31 July 2025)",
        "confidence": "high",
        "status": "verified",
        "note": "\\"interest only repayments (up to 3 years for owner occupiers or 5 years for investors). Interest only repayments on loan terms above 30 years are only available for construction loans.\\""
      },
      "maxInterestOnlyYearsInvestment": {
        "value": 5,
        "asAt": "2025-07-31",
        "sourceUrl": "https://www.greatsouthernbank.com.au/__data/assets/pdf_file/0016/431071/great-southern-bank-basic-variable-home-loan-target-market-determination.pdf",
        "sourceTitle": "Basic Variable Home Loan Target Market Determination (effective 31 July 2025)",
        "confidence": "high",
        "status": "verified"
      },
      "offsetAvailable": {
        "value": true,
        "asAt": "2025-07-01",
        "sourceUrl": "https://www.greatsouthernbank.com.au/__data/assets/pdf_file/0018/431073/great-southern-bank-offset-variable-home-loan-target-market-determination.pdf",
        "sourceTitle": "Offset Variable Home Loan Target Market Determination (effective July 2025)",
        "confidence": "high",
        "status": "verified",
        "note": "Separate Offset Variable Home Loan product. The TMD's effective date is stated only as \\"July 2025\\" (no day); recorded as the 1st of that month."
      },
      "redrawAvailable": {
        "value": true,
        "asAt": "2025-03-01",
        "sourceUrl": "https://www.greatsouthernbank.com.au/__data/assets/pdf_file/0019/431074/great-southern-bank-home-loan-bridging-loan-target-market-determination.pdf",
        "sourceTitle": "Bridging Loan - Home Loan Target Market Determination (effective March 2025)",
        "confidence": "medium",
        "status": "verified",
        "note": "\\"Redraw - allows customers to access extra payments made over the minimum amount.\\" Read on the Bridging Loan TMD; redraw is a standard feature across the variable range. TMD effective date stated as \\"March 2025\\" (no day)."
      },
      "constructionAvailable": {
        "value": true,
        "asAt": "2025-07-31",
        "sourceUrl": "https://www.greatsouthernbank.com.au/__data/assets/pdf_file/0016/431071/great-southern-bank-basic-variable-home-loan-target-market-determination.pdf",
        "sourceTitle": "Basic Variable Home Loan Target Market Determination (effective 31 July 2025)",
        "confidence": "high",
        "status": "verified",
        "note": "TMD purposes include \\"purchase, construct or renovate a residential owner occupied or investment property\\", and the rate card prices construction as a separate repayment type."
      },
      "bridgingAvailable": {
        "value": true,
        "asAt": "2025-03-01",
        "sourceUrl": "https://www.greatsouthernbank.com.au/__data/assets/pdf_file/0019/431074/great-southern-bank-home-loan-bridging-loan-target-market-determination.pdf",
        "sourceTitle": "Bridging Loan - Home Loan Target Market Determination (effective March 2025)",
        "confidence": "high",
        "status": "verified",
        "note": "Interest-only term up to 6 months (up to 12 months for construction), minimum $100,000, maximum $5,000,000, interest capitalises monthly. Requires an existing Great Southern Bank loan and registered first mortgage over the property being sold, and a maximum 70% LVR ACROSS BOTH loans and properties."
      },
      "governmentSchemesSupported": {
        "value": [
          "Home Guarantee Scheme (Australian Government 5% Deposit Scheme)"
        ],
        "asAt": "2026-07-29",
        "sourceUrl": "https://firsthomebuyers.gov.au/australian-government-5-percent-deposit-scheme/5-percent-participating-lenders",
        "sourceTitle": "Home Guarantee Scheme Participating Lenders | Housing Australia",
        "confidence": "medium",
        "status": "verified",
        "note": "Great Southern Bank is named on Housing Australia's participating-lender list (page carries no publication date; captured 2026-07-29). The bank's own scheme page says it is \\"our sixth year taking part\\" and covers both the 5% first-home-buyer guarantee and the 2%-deposit single-parent guarantee: https://www.greatsouthernbank.com.au/home-loans/government-scheme"
      },
      "guarantorAccepted": {
        "value": true,
        "asAt": "2025-07-31",
        "sourceUrl": "https://www.greatsouthernbank.com.au/__data/assets/pdf_file/0016/431071/great-southern-bank-basic-variable-home-loan-target-market-determination.pdf",
        "sourceTitle": "Basic Variable Home Loan Target Market Determination (effective 31 July 2025)",
        "confidence": "medium",
        "status": "verified",
        "note": "Inferred from the TMD's exclusion list for >30-year terms, which names \\"Loans with guarantors\\" as a category that exists but is ineligible for the extended term - i.e. guarantor loans are offered on standard terms. No published guarantor policy detail (security limits, guarantor age, family relationship) was found."
      },
      "notes": {
        "value": "Broker-originated lending IS accepted. The Basic Variable Home Loan TMD names \\"Accredited Mortgage Brokers\\" as a distribution channel: \\"This product can be distributed by Mortgage Brokers who hold an Australian Credit Licence or are a credit representative of an aggregator group which holds an Australian Credit Licence.\\" It also imposes reporting obligations on \\"Home loan brokers who distribute Great Southern Bank Home Loans\\". Borrower types accepted: individuals; an Australian registered company with a simple structure; individuals in a partnership; individuals or companies as trustee of an Australian registered family discretionary trust (maximum loan term 30 years for non-individual borrowers).",
        "asAt": "2025-07-31",
        "sourceUrl": "https://www.greatsouthernbank.com.au/__data/assets/pdf_file/0016/431071/great-southern-bank-basic-variable-home-loan-target-market-determination.pdf",
        "sourceTitle": "Basic Variable Home Loan Target Market Determination (effective 31 July 2025)",
        "confidence": "high",
        "status": "verified"
      }
    },
    "residency": {
      "rules": {
        "value": [
          {
            "status": "australian_citizen",
            "accepted": true,
            "conditions": "All borrowers must be 18 years of age or above."
          },
          {
            "status": "permanent_resident",
            "accepted": true,
            "conditions": "All borrowers must be 18 years of age or above."
          },
          {
            "status": "nz_citizen_444",
            "accepted": true,
            "conditions": "TMD eligibility reads \\"Australian citizens or permanent residents of Australia (including New Zealand citizens)\\"."
          },
          {
            "status": "foreign_non_resident",
            "accepted": false,
            "conditions": "The TMD's eligibility criteria admit only Australian citizens or permanent residents (including NZ citizens), and non-resident borrowers are named in the exclusion list for extended loan terms."
          }
        ],
        "asAt": "2025-07-31",
        "sourceUrl": "https://www.greatsouthernbank.com.au/__data/assets/pdf_file/0016/431071/great-southern-bank-basic-variable-home-loan-target-market-determination.pdf",
        "sourceTitle": "Basic Variable Home Loan Target Market Determination (effective 31 July 2025)",
        "confidence": "high",
        "status": "verified",
        "note": "Verbatim eligibility criterion: \\"Australian citizens or permanent residents of Australia (including New Zealand citizens)\\". Temporary-visa holders are not mentioned and, on the face of the TMD, do not meet the eligibility criterion - but the TMD does not name them explicitly, so treat temporary-visa acceptance as unresearched rather than as a published decline."
      }
    },
    "version": 1,
    "effectiveFrom": "2025-07-31",
    "researchedAt": "2026-07-29",
    "researchedBy": "research:claude-opus-5",
    "gaps": [
      "No numeric maximum LVR is published anywhere. The rate card's top band is open-ended (\\"LVR is more than 90%\\"). The bank's first-home-buyer page says \\"loan options available from as little as a 5% deposit\\", which implies 95%, but that was not treated as a policy statement of the cap.",
      "The broker landing page https://www.greatsouthernbank.com.au/brokers returns HTTP 403 to non-browser clients (Cloudflare bot protection) and its resources sit behind a broker login, so no broker policy guide could be read.",
      "Servicing entirely unsourced: assessment buffer, floor rate, DTI cap, rent shading, HEM basis, credit-card and HECS treatment.",
      "No income-type policy published (casual, self-employed, overtime, bonus, commission, Centrelink, rental). A commonly-repeated claim that GSB accepts two years' ATO Notices of Assessment for self-employed borrowers up to 80% LVR appears only on third-party broker sites and was NOT recorded.",
      "No employment tenure minimums, credit-history knock-outs, genuine-savings policy or LMI-waiver profession list published.",
      "No security policy detail: no minimum unit size, postcode category list, high-density, rural or company-title policy.",
      "Temporary-visa (work/student/partner) acceptance is not addressed in any public document.",
      "Whether the Home Guarantee Scheme is available through the broker channel at Great Southern Bank is not stated publicly (note: sister mutuals P&N and BCU explicitly restrict scheme loans to internal lenders)."
    ]
  },
  {
    "id": "health-professionals-bank",
    "name": "Health Professionals Bank",
    "legalName": "Teachers Mutual Bank Limited",
    "tier": "mutual_bank",
    "status": "active",
    "acl": "238981",
    "abn": "30 087 650 459",
    "brokerSiteUrl": "https://www.hpbank.com.au/broker",
    "policyDocUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
    "funder": "Teachers Mutual Bank Limited",
    "panels": null,
    "servicing": {
      "assessmentBufferPct": {
        "value": 3,
        "asAt": "2026-07-10",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/channels/websites/common-assets/broker/servicing-calculator-for-up-to-four.xlsm",
        "sourceTitle": "TMBL broker serviceability calculator (up to four applicants), .xlsm",
        "confidence": "medium",
        "status": "verified",
        "note": "Read from the product rate table inside the publicly downloadable broker servicing calculator: column 'BufferRate' = 3 on every home loan product row, and 'Assessment Rate' = product rate + 3. Not stated as a buffer in the Lending Reference Guide, which only says 'a standard assessment rate with an appropriate buffer above the actual loan interest rate'. asAt is the file's last-modified date (10 Jul 2026).",
        "updatedBy": "research:claude-opus-5"
      },
      "assessmentFloorRatePct": {
        "value": 6,
        "asAt": "2026-07-10",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/channels/websites/common-assets/broker/servicing-calculator-for-up-to-four.xlsm",
        "sourceTitle": "TMBL broker serviceability calculator (up to four applicants), .xlsm",
        "confidence": "medium",
        "status": "verified",
        "note": "Column 'AssessmentFloorRate' = 6 on every home loan product row of the calculator's rate table. asAt is the file's last-modified date.",
        "updatedBy": "research:claude-opus-5"
      },
      "rentShadingPct": {
        "value": 0.8,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel (current as at October 2025), p5",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Residential Rental 80% - Lower of actual gross or current market residential rental\\". Commercial rental is 50%; NRAS properties 80% of actual rent paid by tenant.",
        "updatedBy": "research:claude-opus-5"
      },
      "existingCommitmentTreatment": {
        "value": "greater_of",
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p7 (Expenditure)",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Repayments for existing credit facilities are to be the greater of either: the actual home loan repayment stated by the applicant, or the repayment amount assessed by the Bank based on the current loan limit ... plus an appropriate buffer\\". Personal loans are taken at actual repayment.",
        "updatedBy": "research:claude-opus-5"
      },
      "bnplTreatment": {
        "value": "3.8% of the BNPL limit. If the facility has no limit, the actual repayment amount stated by the borrower.",
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p7",
        "confidence": "high",
        "status": "verified",
        "updatedBy": "research:claude-opus-5"
      },
      "hecsTreatment": {
        "value": "Minimum repayment as per ATO Study Repayment Calculator",
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p7",
        "confidence": "high",
        "status": "verified",
        "updatedBy": "research:claude-opus-5"
      },
      "hemBasis": {
        "value": "hem",
        "asAt": "2026-07-10",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/channels/websites/common-assets/broker/servicing-calculator-for-up-to-four.xlsm",
        "sourceTitle": "TMBL broker serviceability calculator - 'HEM Living Expenses' / 'HEM Postcodes' worksheets",
        "confidence": "medium",
        "status": "verified",
        "note": "The broker calculator floors declared living expenses against a HEM table keyed on postcode/family type ('Surplus taking HEM into account'). The Lending Reference Guide itself does not name the benchmark.",
        "updatedBy": "research:claude-opus-5"
      },
      "dtiCap": {
        "value": 7,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p7 (Serviceability)",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Debt to Income Ratio (DTI): Maximum DTI ≤7 times\\".",
        "updatedBy": "research:claude-opus-5"
      },
      "interestOnlyAssessment": {
        "value": "All interest only loans have serviceability assessed over the remaining P&I term (e.g. 30 year total term with 3 year IO term is assessed over 27 years). Every IO application must state the applicant's reason for choosing IO over P&I.",
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p8",
        "confidence": "high",
        "status": "verified",
        "updatedBy": "research:claude-opus-5"
      },
      "notes": {
        "value": "Other commitment treatments (p7): overdrafts 2% of the limit; margin/equity loans at limit x actual rate + 3% buffer / 12; credit cards calculated over a three year term using the Bank's credit card benchmark rate; notional rental expense of $650 per month added where a borrower buying/refinancing an investment property lives rent free or at unusually low rent. All applications must show a positive monthly surplus. All debt commitments must be verified with the last 2 statements (min 60 days).",
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p7",
        "confidence": "high",
        "status": "verified",
        "updatedBy": "research:claude-opus-5"
      }
    },
    "lvr": {
      "maxLvrOwnerOccupiedPct": {
        "value": 95,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p10 (Maximum LVRs with LMI)",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Up to 95% including the capitalisation of LMI and any bank fees, where applicable, EXCEPT where the purpose is for construction of an owner occupied dwelling, then up to 90% prior to the capitalisation of LMI\\". Up to 98% under the Australian Government 5% Deposit Scheme.",
        "updatedBy": "research:claude-opus-5"
      },
      "maxLvrInvestmentPct": {
        "value": 95,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p10",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Up to 95% including the capitalisation of LMI and any bank fees ... EXCEPT where the purpose is for construction of an investment dwelling, then up to 90% prior to the capitalisation of LMI\\".",
        "updatedBy": "research:claude-opus-5"
      },
      "maxLvrNoLmiPct": {
        "value": 80,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, pp10-11 (Maximum LVRs without LMI or 5% Deposit Scheme)",
        "confidence": "high",
        "status": "verified",
        "note": "80% is the top of the no-LMI matrix and applies to Metro and Regional/Rural securities valued up to $2m (owner occupied and investment alike). It steps down by location and security value - see lvr.notes for the full matrix.",
        "updatedBy": "research:claude-opus-5"
      },
      "maxLvrCashOutPct": {
        "value": 90,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p1 (Acceptable Purposes - Cash Out)",
        "confidence": "high",
        "status": "verified",
        "note": "\\"0 - ≤85% LVR: No limit applicable to cash out component. >85% - ≤90% LVR: cash out component limited to up to 20% of the security value. >90% LVR: No cash out allowed.\\"",
        "updatedBy": "research:claude-opus-5"
      },
      "maxLvrConstructionPct": {
        "value": 90,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p10",
        "confidence": "high",
        "status": "verified",
        "note": "90% prior to the capitalisation of LMI and any bank fees, for construction of either an owner occupied or an investment dwelling.",
        "updatedBy": "research:claude-opus-5"
      },
      "maxLvrCompanyTrustPct": {
        "value": null,
        "asAt": null,
        "sourceUrl": null,
        "confidence": "low",
        "status": "not_found",
        "note": "Not applicable / not published - the guide states \\"Companies & Trusts: The Bank does not lend to these entities\\" (p1) and the product matrix states \\"Borrowing entity: Personal names only (no companies or trusts)\\"."
      },
      "lmiCapitalisable": {
        "value": true,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p8 (LMI Premium)",
        "confidence": "high",
        "status": "verified",
        "note": "\\"LMI Premium: Capitalised on all loans\\".",
        "updatedBy": "research:claude-opus-5"
      },
      "lmiInclusiveOfMaxLvr": {
        "value": true,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p10",
        "confidence": "high",
        "status": "verified",
        "note": "The 95% ceiling is \\"including the capitalisation of LMI and any bank fees\\" - i.e. the premium sits inside the stated maximum LVR (the construction 90% is the exception, measured prior to capitalisation).",
        "updatedBy": "research:claude-opus-5"
      },
      "lmiProvider": {
        "value": [
          "Helia"
        ],
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p8",
        "confidence": "high",
        "status": "verified",
        "note": "\\"LMI Provider: Helia. Note Helia may have some requirements or restrictions that are additional to this guide\\".",
        "updatedBy": "research:claude-opus-5"
      },
      "notes": {
        "value": "No-LMI maximum LVR matrix (identical for owner occupied and investment), by security location x security value: Metro - 80% (≤$1m), 80% (>$1m-≤$2m), 80% (>$2m-≤$4m), 70% (>$4m). Regional - 80%, 80%, 70%, 60%. Rural - 80%, 80%, 70%, 60%. Not Elsewhere Classified - 80%, 70%, 60%, 50%. The maximum LVR is based on the individual value of each acceptable security; where more than one security is taken no single security can exceed the maximum for its location. Other LVR restrictions: four or more dwellings on one title - max 60%; Company Title - max 80% where the security is >10km outside a capital city CBD; time share allowing permanent owner occupancy - max 80%.",
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, pp10-11",
        "confidence": "high",
        "status": "verified",
        "updatedBy": "research:claude-opus-5"
      }
    },
    "income": {
      "rules": {
        "value": [
          {
            "type": "payg_permanent_full_time",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 6,
            "evidence": "Two most recent payslips, or 3 months of bank statements showing salary continuity",
            "conditions": "All other applicants - PAYG: \\"Full Time 100% - Minimum 6 months in the job or 12 months in the industry\\". Applicants employed in eligible Education and Essential Services occupations (which include Registered Nurse, Registered Midwife, Registered Mental Health Nurse, Registered Developmental Disability Nurse, Enrolled Nurse, Ambulance Officer and Intensive Care Ambulance Paramedic) are accepted at 100% with \\"No minimum time in employment required\\"."
          },
          {
            "type": "payg_permanent_part_time",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 6,
            "conditions": "\\"Regular Part Time 100% - Minimum 6 months in the job or 12 months in the industry\\". Irregular part time income is Nil. Eligible Education/Essential Services occupations: permanent/regular part time 100% with no minimum time in employment."
          },
          {
            "type": "payg_casual",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 6,
            "conditions": "\\"Regular Casual 100% - Minimum 6 months in current employment\\". Irregular casual is Nil. Eligible Education/Essential Services occupations: regular casual or relief 100% with a minimum 3 months in employment."
          },
          {
            "type": "payg_fixed_term_contract",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": null,
            "conditions": "Stated only in the Education/Essential Services table: \\"Fixed Term Contract 100% - Must be full time position under contract\\". Not addressed for other applicants."
          },
          {
            "type": "overtime_essential_services",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 3,
            "conditions": "Eligible Education/Essential Services occupations: \\"Regular Overtime 100% - Proven over three months as evidenced by taxation records, employment contract or payslips\\". Irregular overtime is Nil."
          },
          {
            "type": "overtime_other",
            "accepted": true,
            "shadingPct": 0.8,
            "minHistoryMonths": 24,
            "conditions": "Recorded at the conservative rate. \\"Regular Overtime 80% - Must be a condition of employment, or proven over 2 years\\". 100% is allowed instead, proven over three months, for named employee types: airline workers, mining sector workers, child care workers, aged care and disabled care workers, public transport operators, medical practitioners (e.g. doctors, surgeons), construction trades workers, protective service workers. Irregular overtime is Nil."
          },
          {
            "type": "shift_allowance",
            "accepted": true,
            "shadingPct": 0.8,
            "minHistoryMonths": 24,
            "conditions": "Recorded at the conservative rate. \\"Regular Shift Allowance 80% - Must be a condition of employment, or proven over 2 years\\". 100% (proven over three months) for the same named employee types as overtime, and 100% for eligible Education/Essential Services occupations proven over three months. Irregular shift allowance is Nil."
          },
          {
            "type": "bonus",
            "accepted": true,
            "shadingPct": 0.8,
            "minHistoryMonths": 24,
            "conditions": "\\"Commission/Bonuses 80% of average of last 2 years - Proven over 2 years as evidenced by taxation records, employment contract or payslips\\"."
          },
          {
            "type": "commission",
            "accepted": true,
            "shadingPct": 0.8,
            "minHistoryMonths": 24,
            "conditions": "\\"Commission/Bonuses 80% of average of last 2 years - Proven over 2 years\\"."
          },
          {
            "type": "car_allowance",
            "accepted": true,
            "shadingPct": 1,
            "conditions": "\\"Vehicle Allowance 100% - Added to gross taxable income. Note: If a fully maintained vehicle is provided with no reciprocal cash flow benefit, $5,000 can be added to the net income\\"."
          },
          {
            "type": "self_employed_sole_trader",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 24,
            "evidence": "Latest two full years of personal and business tax returns plus the latest year's Tax Assessment Notice; interim financials are unacceptable",
            "conditions": "\\"Proven over 2 years as evidenced by personal and business taxation records. Where income has increased over the last two years by ≤ 20% the latest year's income can be used. Where income has increased over the last two years by >20%, then maximum of 120% of previous year's income is to be used.\\" Allowable add-backs at 100%: interest on loans being refinanced by the Bank, superannuation contributions above SGL, non-recurring expenses; depreciation add-back is the lesser of the actual depreciation amount or 20% of NPBT."
          },
          {
            "type": "self_employed_company",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 24,
            "evidence": "Two years personal and business tax returns plus a current balance sheet and profit and loss statement",
            "conditions": "Same 2-year rule and add-backs as sole traders. Note the Bank will not lend TO a company or trust - the borrower must be a natural person."
          },
          {
            "type": "self_employed_trust",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 24,
            "conditions": "Same 2-year rule and add-backs. The Bank does not lend to trusts as borrowing entities."
          },
          {
            "type": "rental_residential",
            "accepted": true,
            "shadingPct": 0.8,
            "conditions": "\\"Residential Rental 80% - Lower of actual gross or current market residential rental\\". NRAS properties 80% of actual rent paid by tenant."
          },
          {
            "type": "rental_commercial",
            "accepted": true,
            "shadingPct": 0.5,
            "conditions": "\\"Commercial Rental Property 50% - Lower of actual gross or current market rental, as per rental lease agreement or rental appraisal by real estate agent\\"."
          },
          {
            "type": "dividends",
            "accepted": true,
            "shadingPct": 0.8,
            "minHistoryMonths": 24,
            "conditions": "\\"Investment (i.e. interest & dividend income only) 80% of average of last two years - Confirmation of current ownership of investment\\"."
          },
          {
            "type": "government_age_pension",
            "accepted": true,
            "shadingPct": 1,
            "conditions": "\\"Government and Non-Government Pensions 100% - If considered permanent for the next 5 years\\"."
          },
          {
            "type": "government_family_tax_benefit",
            "accepted": true,
            "shadingPct": 1,
            "conditions": "\\"Government Paid Parenting/Family Allowance 100% - If considered permanent for the next 5 years, except for Family Tax Benefit where acceptable for dependents up to and including 15 years\\"."
          },
          {
            "type": "government_parenting_payment",
            "accepted": true,
            "shadingPct": 1,
            "conditions": "\\"Government Paid Parenting/Family Allowance 100% - If considered permanent for the next 5 years\\"."
          },
          {
            "type": "child_support_maintenance",
            "accepted": true,
            "shadingPct": 1,
            "evidence": "Child Support Agency Assessment showing the amount payable and eligible children, plus 6 months of consistent payments on bank statements",
            "conditions": "\\"Other Income e.g. child support payments, workers compensation 100% - If considered permanent for the next 5 years\\"."
          },
          {
            "type": "foreign_income",
            "accepted": true,
            "shadingPct": 0.7,
            "conditions": "\\"Overseas Income - All currencies 70%. Overseas income is acceptable only from the following income types: PAYG income, Rental income\\"."
          }
        ],
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel (current as at October 2025), pp2-6 (Acceptable Income)",
        "confidence": "high",
        "status": "verified",
        "note": "The guide runs two separate income tables - one for applicants employed in eligible Education and Essential Services occupations (which is where most Health Professionals Bank members sit) and one for all other applicants. Where they differ, the 'all other applicants' figure is recorded as the value and the essential-services concession is stated in conditions. Guarantor income is \\"Not acceptable\\".",
        "updatedBy": "research:claude-opus-5"
      },
      "selfEmployedMinYears": {
        "value": 2,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, pp4 and 7",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Proven over 2 years as evidenced by personal and business taxation records\\"; standard verification is \\"the latest two full years of personal and business taxation returns\\" and \\"Interim financials are unacceptable\\".",
        "updatedBy": "research:claude-opus-5"
      },
      "notes": {
        "value": "Simplified self-employed verification is available where the applicant has paid themselves a regular salary for at least six months, business income is NOT required for servicing, and the business has traded at least two years - verified from six months of salary credits or two consecutive payslips, plus an accountant's letter confirming trading start date, sufficient profits and ability to continue paying the declared salary.",
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p6",
        "confidence": "high",
        "status": "verified",
        "updatedBy": "research:claude-opus-5"
      }
    },
    "employment": {
      "minMonthsCurrentJob": {
        "value": 6,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p3",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Full Time 100% - Minimum 6 months in the job or 12 months in the industry\\" for all other applicants. Nil minimum applies to applicants in the eligible Education and Essential Services occupation list (includes registered/enrolled nurses, midwives, ambulance officers and ICU paramedics).",
        "updatedBy": "research:claude-opus-5"
      },
      "sameIndustryContinuityAccepted": {
        "value": true,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p3",
        "confidence": "high",
        "status": "verified",
        "note": "The tenure test is \\"Minimum 6 months in the job OR 12 months in the industry\\".",
        "updatedBy": "research:claude-opus-5"
      },
      "minMonthsSameIndustry": {
        "value": 12,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p3",
        "confidence": "high",
        "status": "verified",
        "updatedBy": "research:claude-opus-5"
      },
      "minMonthsCasual": {
        "value": 6,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p4",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Regular Casual 100% - Minimum 6 months in current employment\\". 3 months for eligible Education/Essential Services occupations (regular casual or relief).",
        "updatedBy": "research:claude-opus-5"
      },
      "minMonthsSelfEmployedAbn": {
        "value": 24,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p4",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Proven over 2 years as evidenced by personal and business taxation records\\".",
        "updatedBy": "research:claude-opus-5"
      },
      "probationAccepted": {
        "value": null,
        "asAt": null,
        "sourceUrl": null,
        "confidence": "low",
        "status": "not_found",
        "note": "Probation is not mentioned anywhere in the public TMBL 3rd Party Lending Reference Guide or product matrix."
      }
    },
    "credit": {
      "notes": {
        "value": null,
        "asAt": null,
        "sourceUrl": null,
        "confidence": "low",
        "status": "not_found",
        "note": "TMBL publishes no credit-history policy in its public broker material. The 3rd Party Lending Reference Guide (Oct 2025), product matrix (May 2026) and broker forms/fact sheets pages contain no rules on defaults, judgments, bankruptcy, arrears, credit score or enquiries."
      }
    },
    "security": {
      "acceptablePropertyTypes": {
        "value": [
          "Residential use properties only",
          "Freehold Title",
          "Strata, Group, Cluster or Community Title",
          "Survey Strata",
          "Company Title",
          "99 Year Leasehold",
          "Stratum Title",
          "Residential Area Right and Residential Licence (only applicable in Victoria)"
        ],
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, pp9-10 (Acceptable Securities / Acceptable Title)",
        "confidence": "high",
        "status": "verified",
        "note": "Also: first ranking financial institution charge only; located in Australia; dwellings must be a private, self contained (bathing and cooking facilities) immobile structure; must be serviced by power, water, utilities and vehicular access.",
        "updatedBy": "research:claude-opus-5"
      },
      "unacceptablePropertyTypes": {
        "value": [
          "Contaminated property",
          "Property with a known flood height above floor level",
          "Property subject to land slip",
          "Property subject to mine subsidence",
          "Time share or serviced apartment which does not allow for permanent owner occupancy",
          "Property generating primary production income (hobby farms excepted)",
          "Off the plan purchase"
        ],
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p9 (Property Exclusions)",
        "confidence": "high",
        "status": "verified",
        "updatedBy": "research:claude-opus-5"
      },
      "minUnitFloorAreaSqm": {
        "value": 60,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p9",
        "confidence": "high",
        "status": "verified",
        "note": "Two thresholds are published: \\"Minimum size for two or more bedroom units, excluding car space and balconies, is 60m2. Minimum size for studio or one bedroom units, excluding car space and balconies, is 30m2\\". The stricter 60m2 is recorded as the value; a studio or one-bedroom unit may go to 30m2.",
        "updatedBy": "research:claude-opus-5"
      },
      "maxLandSizeHa": {
        "value": 40,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p9",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Maximum land area of 40 hectares (100 acres)\\".",
        "updatedBy": "research:claude-opus-5"
      },
      "postcodeRestrictionsPublished": {
        "value": true,
        "asAt": "2024-08-21",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/real-property-classifications.pdf",
        "sourceTitle": "TMBL Real Property Classifications, effective 21 Aug 2024",
        "confidence": "high",
        "status": "verified",
        "note": "\\"The Bank classifies the location of real properties into categories based on their postcode. The categories are: Metro, Regional, Rural, Not Elsewhere Classified (NEC).\\" 57 pages of postcode-to-category mappings; the category drives the no-LMI maximum LVR matrix.",
        "updatedBy": "research:claude-opus-5"
      },
      "postcodeListUrl": {
        "value": "https://www.hpbank.com.au/content/dam/documents/collateral/real-property-classifications.pdf",
        "asAt": "2024-08-21",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/real-property-classifications.pdf",
        "sourceTitle": "TMBL Real Property Classifications, effective 21 Aug 2024",
        "confidence": "high",
        "status": "verified",
        "updatedBy": "research:claude-opus-5"
      },
      "ruralResidentialAccepted": {
        "value": true,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, pp10-11",
        "confidence": "medium",
        "status": "verified",
        "note": "\\"Rural\\" is one of the four published location categories and carries its own no-LMI LVR row (80% up to $2m, 70% >$2m-≤$4m, 60% >$4m). Property generating primary production income is excluded, hobby farms excepted, and land area is capped at 40ha.",
        "updatedBy": "research:claude-opus-5"
      },
      "companyTitleAccepted": {
        "value": true,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, pp10-11",
        "confidence": "high",
        "status": "verified",
        "note": "Company Title is on the acceptable title list; \\"Maximum LVR is 80% when the security property is located >10kms outside a capital city CBD\\".",
        "updatedBy": "research:claude-opus-5"
      },
      "leaseholdAccepted": {
        "value": true,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p10",
        "confidence": "high",
        "status": "verified",
        "note": "\\"99 Year Leasehold\\" is listed as an acceptable title.",
        "updatedBy": "research:claude-opus-5"
      },
      "strataAccepted": {
        "value": true,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p10",
        "confidence": "high",
        "status": "verified",
        "updatedBy": "research:claude-opus-5"
      },
      "offThePlanAccepted": {
        "value": false,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p9 (Property Exclusions)",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Property ... Is an off the plan purchase\\" is listed under Property Exclusions.",
        "updatedBy": "research:claude-opus-5"
      },
      "notes": {
        "value": "LVR restrictions by security type: four or more dwellings on one title - maximum LVR 60%; Company Title - maximum 80% where >10km outside a capital city CBD; time share allowing permanent owner occupancy - maximum 80%. Valuation types: Contract of Sale (purchase, LVR ≤60%), Valuer General/Council Rates Notice (already owned, LVR ≤60%), AVM, Desktop Valuation. Building insurance is required on all securities noting Teachers Mutual Bank Limited as mortgagee. Construction: no owner builders, no kit homes or relocatable dwellings, no strata-titled properties, no refinance where construction is in progress, and no more than two properties on one title; fixed price building contracts only.",
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, pp10-12",
        "confidence": "high",
        "status": "verified",
        "updatedBy": "research:claude-opus-5"
      }
    },
    "product": {
      "maxLoanTermYears": {
        "value": 30,
        "asAt": "2026-05-23",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/product-matrix.pdf",
        "sourceTitle": "TMBL Product Matrix, effective 23 May 2026",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Repayment term: Min 6 months and max 30 years\\" for both Your Way Home Loan and Your Way Plus Home Loan.",
        "updatedBy": "research:claude-opus-5"
      },
      "offsetAvailable": {
        "value": true,
        "asAt": "2026-05-23",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/product-matrix.pdf",
        "sourceTitle": "TMBL Product Matrix, effective 23 May 2026",
        "confidence": "high",
        "status": "verified",
        "note": "Your Way Plus Home Loan only: \\"100% offset across up to 8 eligible linked offset accounts. Available on both variable and fixed rate home loans.\\" The base Your Way Home Loan has no offset.",
        "updatedBy": "research:claude-opus-5"
      },
      "redrawAvailable": {
        "value": true,
        "asAt": "2026-05-23",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/product-matrix.pdf",
        "sourceTitle": "TMBL Product Matrix, effective 23 May 2026",
        "confidence": "high",
        "status": "verified",
        "note": "Your Way: fee free, variable rate only. Your Way Plus: fee free, includes both variable and fixed rate loans.",
        "updatedBy": "research:claude-opus-5"
      },
      "constructionAvailable": {
        "value": true,
        "asAt": "2026-05-23",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/product-matrix.pdf",
        "sourceTitle": "TMBL Product Matrix, effective 23 May 2026",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Construction loans: Yes - variable rate loans only\\" on both products. Progressive drawdown for construction or major renovations only.",
        "updatedBy": "research:claude-opus-5"
      },
      "genuineSavingsRequiredAboveLvrPct": {
        "value": 90,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p8 (Savings/Deposit Funds)",
        "confidence": "high",
        "status": "verified",
        "note": "\\"LMI Loans - When LVR ≤ 90%: No evidence of savings/deposit funds required. When LVR > 90%: Evidence of savings/deposit funds required.\\" For loans with family guarantors the threshold is 80% (above 80% the Bank does not generate the business).",
        "updatedBy": "research:claude-opus-5"
      },
      "giftedDepositAccepted": {
        "value": true,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p9",
        "confidence": "high",
        "status": "verified",
        "updatedBy": "research:claude-opus-5"
      },
      "giftedDepositConditions": {
        "value": "\\"Gifted funds to the applicant should be supported by a letter from the provider of the fund clearly stating that the funds are a gift and are not repayable.\\" Gifts count as acceptable savings/deposit funds, but \\"if application requires LMI the gift must be from an immediate family member\\". Gifts are NOT acceptable towards the minimum deposit contribution for Australian Government 5% Deposit Scheme loans. Borrowed funds (e.g. proceeds of personal loans) are never acceptable.",
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, pp8-9",
        "confidence": "high",
        "status": "verified",
        "updatedBy": "research:claude-opus-5"
      },
      "governmentSchemesSupported": {
        "value": [
          "Australian Government 5% Deposit Scheme - General Stream",
          "Australian Government 5% Deposit Scheme - Single Parent Stream",
          "First Home Owner Grant (accepted as deposit funds)",
          "First Home Super Saver Scheme (accepted as deposit funds)"
        ],
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, pp8-9",
        "confidence": "high",
        "status": "verified",
        "note": "5% Deposit Scheme requires at least 5% genuine savings (General Stream) or 2% (Single Parent Stream) held or accumulated for a minimum of three months; gifts and other non-saved funds do not count towards that minimum. LVR up to 98% including capitalisation of bank fees.",
        "updatedBy": "research:claude-opus-5"
      },
      "guarantorAccepted": {
        "value": true,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, pp1 and 9",
        "confidence": "high",
        "status": "verified",
        "updatedBy": "research:claude-opus-5"
      },
      "guarantorConditions": {
        "value": "Guarantor must be the applicant's partner (spouse/de facto) or a family member (parent, child, sibling, grandparent or grandchild), be a permanent resident or citizen of Australia, be at least 18, be financially acceptable to the Bank, and complete a Guarantor Information Form. \\"Guarantee will be limited to a specified amount and must be supported by a first ranking charge over a security property acceptable to the Bank.\\" Third party (parental) security allows borrowing 100% of the purchase price and associated costs. Guarantor income is not acceptable for servicing. On family-guarantee loans: LVR ≤80% no evidence of savings required; LVR >80% \\"Not available (the Bank does not generate this business)\\".",
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, pp1, 5 and 9",
        "confidence": "high",
        "status": "verified",
        "updatedBy": "research:claude-opus-5"
      },
      "notes": {
        "value": "Health Professionals Bank is a division of Teachers Mutual Bank Limited (ABN 30 087 650 459, AFSL/ACL 238981), alongside Teachers Mutual Bank, UniBank and Firefighters Mutual Bank. It launched into the broker channel as TMBL's fourth division; existing TMBL broker accreditations cover it. Membership is restricted: an applicant must be an Australian citizen or permanent resident AND either employed in or retired from the Australian health sector, or studying/graduated from an Australian university in healthcare (medicine, nursing, allied health), or immediate family of a Health Professionals Bank member. Applicants must be at least 18 and \\"a member of the Bank or eligible for membership of the Bank\\". BORROWING ENTITY IS PERSONAL NAMES ONLY - \\"Companies & Trusts: The Bank does not lend to these entities\\" - so company, trust and SMSF borrowers are out of scope. Two products only: Your Way Home Loan ($600 establishment fee, no offset) and Your Way Plus Home Loan (annual package fee, waived for eligible essential-worker first home buyers; 100% offset across up to 8 accounts). Both allow owner occupied, investment and construction. Fixed rate lock up to 90 days for 0.10% of the applied amount. An exit strategy is required where the contractual loan term will exceed the applicant's expected income stream.",
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, pp1 and 8; TMBL Product Matrix eff. 23 May 2026; Health Professionals Bank 'Why join us' eligibility page (https://www.hpbank.com.au/about/why-join-us)",
        "confidence": "high",
        "status": "verified",
        "updatedBy": "research:claude-opus-5"
      }
    },
    "residency": {
      "rules": {
        "value": [
          {
            "status": "australian_citizen",
            "accepted": true,
            "maxLvrPct": null,
            "conditions": "Applicant \\"Must be ... Permanent resident or citizen of Australia\\" and at least 18 years of age."
          },
          {
            "status": "permanent_resident",
            "accepted": true,
            "maxLvrPct": null,
            "conditions": "Applicant \\"Must be ... Permanent resident or citizen of Australia\\"."
          },
          {
            "status": "temporary_visa_work",
            "accepted": false,
            "maxLvrPct": null,
            "conditions": "The guide requires applicants (and guarantors) to be a permanent resident or citizen of Australia; temporary visa holders are not provided for."
          },
          {
            "status": "temporary_visa_student",
            "accepted": false,
            "maxLvrPct": null,
            "conditions": "The guide requires applicants to be a permanent resident or citizen of Australia."
          },
          {
            "status": "foreign_non_resident",
            "accepted": false,
            "maxLvrPct": null,
            "conditions": "The guide requires applicants to be a permanent resident or citizen of Australia."
          },
          {
            "status": "nz_citizen_444",
            "accepted": null,
            "maxLvrPct": null,
            "conditions": "Not addressed. Subclass 444 holders are neither citizens nor permanent residents, and the guide is silent - confirm with the Bank."
          },
          {
            "status": "expat_citizen_overseas",
            "accepted": null,
            "maxLvrPct": null,
            "conditions": "Not addressed directly. Overseas income is accepted at 70% from PAYG and rental sources only, which implies some overseas-based applicants are contemplated, but no expat rule is published."
          }
        ],
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p1 (Applicant Types) and p5 (Overseas Income)",
        "confidence": "medium",
        "status": "verified",
        "note": "Only the citizen/PR requirement is published explicitly; the 'false' entries are the direct consequence of that requirement rather than separately stated exclusions.",
        "updatedBy": "research:claude-opus-5"
      },
      "foreignIncomeShadingPct": {
        "value": 0.7,
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p5",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Overseas Income - Currency: All currencies 70%. Overseas income is acceptable only from the following income types: PAYG income, Rental income\\".",
        "updatedBy": "research:claude-opus-5"
      },
      "acceptedForeignCurrencies": {
        "value": [
          "All currencies"
        ],
        "asAt": "2025-10-01",
        "sourceUrl": "https://www.hpbank.com.au/content/dam/documents/collateral/lending-reference-guide.pdf",
        "sourceTitle": "TMBL Home Loan Lending Reference Guide - 3rd Party Channel, p5",
        "confidence": "high",
        "status": "verified",
        "updatedBy": "research:claude-opus-5"
      }
    },
    "version": 1,
    "effectiveFrom": "2025-10-01",
    "effectiveTo": null,
    "researchedAt": "2026-07-29",
    "researchedBy": "research:claude-opus-5",
    "gaps": [
      "Assessment buffer (3.00) and assessment floor rate (6.00) come from the product rate table inside the public broker servicing calculator (.xlsm), not from a policy statement - the Lending Reference Guide only says 'a standard assessment rate with an appropriate buffer'. Worth a BDM confirmation.",
      "Credit card assessment: the Lending Reference Guide (Oct 2025) says cards are 'calculated over a three year term using the Bank's credit card benchmark rate' while the broker calculator still carries a 3% of limit monthly percentage. The two conflict, so no creditCardAssessmentPct is recorded. The credit card benchmark rate itself is not published.",
      "No credit-history policy is published at all - nothing on defaults, judgments, writs, bankruptcy/Part IX, arrears, credit score or number of enquiries.",
      "No minimum or maximum loan amount is published (only a minimum term of 6 months and maximum of 30 years).",
      "Maximum interest-only term is not published for either owner occupied or investment loans.",
      "Probation policy is not published.",
      "No maximum age at maturity is published; the guide only requires an exit strategy 'where the contractual loan term will exceed an applicant's expected income stream'.",
      "No refinance-specific reduced buffer, negative-gearing add-back or depreciation add-back rule is published.",
      "High-density / inner-city apartment concentration policy is not published (only a 60% cap for four or more dwellings on one title).",
      "SMSF and bridging lending are not mentioned; company/trust borrowing is explicitly excluded, which makes SMSF lending very unlikely, but no source states it.",
      "The Real Property Classifications postcode list is dated 21 Aug 2024 and may have been superseded.",
      "Health Professionals Bank shares one credit policy with Teachers Mutual Bank, UniBank and Firefighters Mutual Bank - no HPB-specific credit variation was found. The only brand-level difference is membership eligibility."
    ]
  },
  {
    "id": "macquarie-bank",
    "name": "Macquarie Bank",
    "legalName": "Macquarie Bank Limited",
    "tier": "regional_bank",
    "status": "active",
    "acl": "237502",
    "abn": "46 008 583 542",
    "brokerSiteUrl": "https://www.macquarie.com.au/brokers/home-loan-brokers.html",
    "policyDocUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
    "funder": null,
    "panels": null,
    "servicing": {
      "assessmentBufferPct": {
        "value": 3,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s3A Serviceability Assessment",
        "confidence": "high",
        "status": "verified",
        "note": "\\"The minimum assessment rate buffer is 3.00% with an assessment rate floor of 5.30%.\\" Buffer is applied to the higher of the carded rate or revert rate, by loan split."
      },
      "assessmentFloorRatePct": {
        "value": 5.3,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s3A",
        "confidence": "high",
        "status": "verified",
        "note": "Assessed at the higher of (carded/revert rate + 3.00%) or the 5.30% floor."
      },
      "refinanceBufferPct": {
        "value": null,
        "asAt": null,
        "sourceUrl": null,
        "confidence": "low",
        "status": "not_found",
        "note": "No reduced like-for-like refinance buffer is published in Credit Guidelines v14.0."
      },
      "rentShadingPct": {
        "value": 0.75,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s3D Income - Rental Income",
        "confidence": "high",
        "status": "verified",
        "note": "Residential 75%. Short-term stay (holiday letting/serviced apartments) and room rental 65%. Non-residential (commercial/industrial/office) 65%. Applied in line with borrower's % ownership."
      },
      "rentShadingBasis": {
        "value": "Shading is instead of itemised holding costs, but only up to a limit: \\"If the investment property expenses exceed 20% of the gross rental income, the actual expense will be applied for servicing purposes (i.e. Gross rent - 5% - Investment property expenses).\\" For short-term stay the equivalent is Gross rent - 15% - investment property expenses.",
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s3D",
        "confidence": "high",
        "status": "verified",
        "note": null
      },
      "existingCommitmentTreatment": {
        "value": "greater_of",
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s3F Commitments - Existing financial obligations",
        "confidence": "high",
        "status": "verified",
        "note": "Other secured/unsecured loans: \\"The higher of: Repayment amount on the loan commitment assessed at the assessment rate (higher of interest rate for this loan plus buffer or assessment rate floor) with the actual remaining P&I loan term; or Declared actual repayment amount.\\""
      },
      "creditCardAssessmentPct": {
        "value": 0.038,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s3F",
        "confidence": "high",
        "status": "verified",
        "note": "Policy states credit cards are assessed at \\"45.6% pa of the card limit\\". 45.6% / 12 = 3.8% per month of the limit, which is the monthly fraction this field records. Charge cards: 0% of repayment/limit if 3 months' statements are provided and the balance is paid in full each statement period for at least 3 statement periods."
      },
      "bnplTreatment": {
        "value": "Buy Now Pay Later is assessed at the lower of the declared annualised repayment amount, or the outstanding balance. The declared repayment cannot be $0 where an outstanding balance greater than $0 is evident, and vice versa.",
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s3F",
        "confidence": "medium",
        "status": "verified",
        "note": "Read from a multi-row table (Credit cards / Charge card / Rental expense / BNPL); row-to-value pairing inferred from ordering in the PDF."
      },
      "hecsTreatment": {
        "value": "\\"Where HELP/HECS and mandatory child support are visible on payslips these must be deemed as involuntary and included in as an expense item in the existing commitments section. If evidence is provided confirming the HELP/HECS debt has been paid out in full then the associated payments can be excluded.\\"",
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s3B",
        "confidence": "high",
        "status": "verified",
        "note": "No de-minimis balance threshold is published - the payment is counted regardless of balance size unless the debt is fully paid out."
      },
      "hemBasis": {
        "value": "hem",
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s3H Commitments - Living expenses",
        "confidence": "high",
        "status": "verified",
        "note": "\\"the applicant(s) declared 'General living expenses' are compared to the income tiered HEM value with the maximum of these two figures plus any 'Additional living expenses' used in the servicing calculation.\\" Additional living expenses (personal insurances, private education, OO strata, secondary residence costs) are added on top of the HEM floor, not absorbed by it."
      },
      "dtiCap": {
        "value": 8,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s3A Debt to income (DTI) cap",
        "confidence": "high",
        "status": "verified",
        "note": "\\"A maximum DTI cap of 8 times applies to all loans.\\" DTI caps do not apply where the predominant (>50%) income is non-taxable superannuation pensions, or where joint commitments with non-applicants are included at 100%, provided minimum NSR/servicing surplus is met."
      },
      "dtiReferThreshold": {
        "value": 6,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s3A",
        "confidence": "high",
        "status": "verified",
        "note": "\\"where the DTI is greater than 6 times, a maximum LVR of 80% applies. Please note, any application in this category deemed to have an overall high risk profile will be considered on a case-by-case basis.\\" This is an LVR restriction plus case-by-case scrutiny, not an automatic decline."
      },
      "negativeGearingAddBack": {
        "value": true,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s3G Commitments - Negative gearing",
        "confidence": "high",
        "status": "verified",
        "note": "Accepted for residential investment purposes up to 100% of the purchase price where all funds are borrowed. NOT allowed on vacant land, and not applied on loans in the name of a company or trust. Non-residential investment negative gearing permitted where debt is evidenced by the most recent loan statement and the property is held in an individual's name. Cash-out negative gearing only where an executed purchase contract or transfer/separation evidence exists."
      },
      "depreciationAddBack": {
        "value": null,
        "asAt": null,
        "sourceUrl": null,
        "confidence": "low",
        "status": "not_found",
        "note": "Guidelines v14.0 address property depreciation add-back only for self-employed BUSINESS depreciation (allowable up to 20% of business net profit, s3C). No rule published for depreciation add-back on an investment property's rental loss."
      },
      "interestOnlyAssessment": {
        "value": "\\"For all repayment types (P&I or Interest Only), serviceability is assessed using P&I repayments. For loans with an interest only period, the P&I repayment is calculated using the remaining loan term. For example, a 30 year loan with a 5 year interest only period, [will] be assessed using a 25 year P&I repayment.\\"",
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s3A",
        "confidence": "high",
        "status": "verified",
        "note": null
      },
      "notes": {
        "value": "Minimum servicing surplus of $500pa is required. That minimum does not apply (but a minimum Net Serviceability Ratio of 1.00 does) if declared living expenses are >= 120% of HEM, OR savings >= $10,000 are held post-settlement. A notional rental expense of $650 per month per household applies where an investment applicant declares they live rent-free or at an unusually low rent. Where an applicant guarantees or borrows via a company/trust, the introducer must confirm the entity can meet its liabilities with a 3% pa serviceability buffer applied, or the shortfall is added as an ongoing expense.",
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, ss2D, 3A, 3H",
        "confidence": "high",
        "status": "verified",
        "note": null
      }
    },
    "lvr": {
      "maxLvrOwnerOccupiedPct": {
        "value": 95,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s1D Maximum LVR per loan facility",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Owner occupied purchases with principal and interest repayments: 95% LVR inclusive of low deposit fee capitalisation.\\" Any interest-only portion caps the facility at 80%."
      },
      "maxLvrInvestmentPct": {
        "value": 90,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s1D",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Investor loans with principal and interest repayments: 90% LVR inclusive of low deposit fee capitalisation. Note: If any portion of the loan has an interest only repayment method, the maximum LVR is 80%.\\""
      },
      "maxLvrNoLmiPct": {
        "value": 80,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/help/brokers/credit-guidelines-and-processes/understanding-who-and-what-we-finance/accessing-our-credit-policy-and-calculators.html",
        "sourceTitle": "Macquarie Broker Help Centre - Accessing our credit policy and calculators (Low Deposit Fee Calculator)",
        "confidence": "medium",
        "status": "verified",
        "note": "Macquarie does not charge conventional LMI; it charges a Low Deposit Fee (LDF). The LDF Calculator on the broker help centre is described as calculating indicative fees for applications exceeding 80% LVR, and the credit guidelines' LVR matrix bands break at 70% / 80% / '>80% and <=95% (LDF inclusive)' - so 80% is the highest LVR with no low-deposit charge. Inferred from those two statements rather than an explicit 'no LMI below 80%' sentence."
      },
      "maxLvrCashOutPct": {
        "value": 80,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, ss1A, 1D",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Equity release loans: 80% LVR - refer policy section 1A.\\" Up to 80% LVR there is no limit on the cash-out component subject to risk profile/capacity/collateral; above 80% up to 90% LVR \\"No cash out, equity release or debt consolidation is allowed (beyond a $5,000 allowance for costs).\\""
      },
      "maxLvrConstructionPct": {
        "value": 80,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, Construction Loans s1B",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Maximum LVR 80%\\". LVR is based on the lower of the on-completion valuation or cost to complete (contracted construction price plus land value). Construction is limited to Metro (Category 1) and non-metro (Category 2) locations only."
      },
      "maxLvrRefinancePct": {
        "value": 90,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s1D",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Refinance loans: 90% LVR inclusive of low deposit fee capitalisation.\\""
      },
      "maxLvrCompanyTrustPct": {
        "value": null,
        "asAt": null,
        "sourceUrl": null,
        "confidence": "low",
        "status": "not_found",
        "note": "Credit Guidelines v14.0 states borrowers and guarantors \\"must be natural persons\\", so no company/trust borrower LVR is published for standard residential lending."
      },
      "lmiCapitalisable": {
        "value": true,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s1D",
        "confidence": "high",
        "status": "verified",
        "note": "Macquarie charges a Low Deposit Fee rather than a conventional LMI premium. Every maximum LVR in s1D is expressed as \\"inclusive of low deposit fee capitalisation\\", i.e. the fee may be capitalised but must fit inside the stated maximum LVR."
      },
      "lmiInclusiveOfMaxLvr": {
        "value": true,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s1D",
        "confidence": "high",
        "status": "verified",
        "note": "Maximum LVRs are stated \\"inclusive of low deposit fee capitalisation\\" - the capitalised fee sits inside the cap."
      },
      "lmiProvider": {
        "value": null,
        "asAt": null,
        "sourceUrl": null,
        "confidence": "low",
        "status": "not_found",
        "note": "No external LMI provider is named. Macquarie uses its own Low Deposit Fee above 80% LVR (LDF Calculator published on the broker help centre)."
      },
      "lmiWaiverProfessions": {
        "value": null,
        "asAt": null,
        "sourceUrl": null,
        "confidence": "low",
        "status": "not_found",
        "note": "No professional LMI/LDF waiver list is published in Credit Guidelines v14.0. (A professional-specialisation list exists in s3C but it governs self-employed income verification, not an LMI waiver.)"
      },
      "lvrBands": {
        "value": [
          {
            "maxLvrPct": 70,
            "maxLoanAmount": null,
            "qualifier": "Metro (Category 1): security property value limit $10m. For properties >$10m a maximum LVR of 60% applies (or $7m loan amount where higher)."
          },
          {
            "maxLvrPct": 80,
            "maxLoanAmount": null,
            "qualifier": "Metro (Category 1): security property value limit $5m."
          },
          {
            "maxLvrPct": 95,
            "maxLoanAmount": null,
            "qualifier": "Metro (Category 1), LDF inclusive: security property value limit $1.5m."
          },
          {
            "maxLvrPct": 70,
            "maxLoanAmount": null,
            "qualifier": "Non-metro & Regional (Categories 2 & 3): security property value limit $3m. For properties >$3m a maximum LVR of 60% applies."
          },
          {
            "maxLvrPct": 80,
            "maxLoanAmount": null,
            "qualifier": "Non-metro & Regional (Categories 2 & 3): security property value limit $1.5m."
          },
          {
            "maxLvrPct": 95,
            "maxLoanAmount": null,
            "qualifier": "Non-metro & Regional (Categories 2 & 3), LDF inclusive: security property value limit $750,000; above that, outside policy."
          }
        ],
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s1D Maximum allowable LVR per security",
        "confidence": "medium",
        "status": "verified",
        "note": "This matrix caps the SECURITY PROPERTY VALUE per LVR band, not the loan amount - so maxLoanAmount is left null and the constraint is recorded in the qualifier. Category 4 locations are outside policy (refer BDM). Where a facility is secured by multiple properties, a maximum LVR of 80% per security applies."
      },
      "notes": {
        "value": "Valuation red flags (extended selling period >6 months, Market Segment Conditions Risk Rating of 4 or 5, any '5' risk ratings) cap the security at 80% LVR, and at 75% LVR for properties valued above $3m (Cat 1) or above $1m (Cat 2/3). Postcode category and high-risk/high-density flags are returned by the 'Security Details' section of the Manual Servicing Calculator once a postcode is entered.",
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s1D",
        "confidence": "high",
        "status": "verified",
        "note": null
      }
    },
    "income": {
      "rules": {
        "value": [
          {
            "type": "payg_permanent_full_time",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 6,
            "evidence": "Two computer-generated payslips, latest no more than 60 days old and oldest no more than 4 months old. One payslip plus a signed employment contract/letter is acceptable where base income only is relied on.",
            "conditions": "Minimum 6 months in current employment OR 6 months in the same field/industry in a prior role. Time taken between roles need not be considered."
          },
          {
            "type": "payg_permanent_part_time",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 6,
            "evidence": "As per permanent full-time PAYG payslip requirements.",
            "conditions": "Permanent salary/wage employment (full-time or part-time): minimum 6 months in current employment OR 6 months in the same field/industry in a prior role."
          },
          {
            "type": "payg_casual",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 6,
            "evidence": "Two computer-generated payslips; YTD can be annualised where it covers a minimum period of 6 months. Where YTD covers less than 6 months or is missing, add the most recent PAYG summary / ATO income statement (Tax Ready) or tax return, and use the lower of YTD annualised or the most recent financial year's income.",
            "conditions": "Casual income is counted at 100% (\\"Maximum proportion for servicing 100%\\", conditions \\"None.\\"). Minimum 6 months in current employment OR 6 months in the same field/industry."
          },
          {
            "type": "payg_fixed_term_contract",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 6,
            "evidence": "As per PAYG payslip requirements.",
            "conditions": "Contract employment: minimum 6 months in current employment OR 6 months in the same field/industry in a prior role. No minimum remaining contract term is published."
          },
          {
            "type": "payg_contractor_abn",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 6,
            "evidence": "Two computer-generated payslips; YTD annualised where it covers a minimum 6 months (same treatment as casual income).",
            "conditions": "PAYG contractor income follows the additional casual/PAYG-contractor verification rules in s3B. Self-employed contract workers who previously worked PAYG in the same industry/field for over 2 years are assessed under s3C."
          },
          {
            "type": "second_job",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 12,
            "evidence": "PAYG payslips.",
            "conditions": "\\"Held for at least 12 months. However, where the applicant is employed within the healthcare, teaching or aged/disability care industries (applies to both roles), there is no minimum term applicable for the second job.\\""
          },
          {
            "type": "overtime_other",
            "accepted": true,
            "shadingPct": 0.8,
            "minHistoryMonths": null,
            "evidence": "Two payslips whose YTD covers at least 3 months, annualised.",
            "conditions": "Overtime - non essential services: 80% maximum proportion for servicing. \\"Confirmed as regular, ongoing and evidenced.\\""
          },
          {
            "type": "overtime_essential_services",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": null,
            "evidence": "Two payslips whose YTD covers at least 3 months, annualised.",
            "conditions": "100%. \\"Essential services are limited to occupations in the following services: Public transport operations; Fire fighters; Provision of health services; Provision of garbage or sewerage services; Prison officers; Police; Power / energy technicians (this does not include electricians).\\""
          },
          {
            "type": "bonus",
            "accepted": true,
            "shadingPct": 0.8,
            "minHistoryMonths": null,
            "evidence": "Employer letter on letterhead, or a payslip confirming the payment(s), or the most recent financial year's ATO income statement/payment summary or tax return. The 3-month YTD rule does not apply to bonuses.",
            "conditions": "\\"Commission or bonus\\" - 80% maximum proportion for servicing. Confirmed as regular, ongoing and evidenced."
          },
          {
            "type": "commission",
            "accepted": true,
            "shadingPct": 0.8,
            "minHistoryMonths": null,
            "evidence": "Two payslips whose YTD covers at least 3 months, annualised.",
            "conditions": "\\"Commission or bonus\\" - 80% maximum proportion for servicing. Confirmed as regular, ongoing and evidenced."
          },
          {
            "type": "car_allowance",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": null,
            "evidence": "Payslips; fixed allowances (e.g. car, phone) can be applied as base income and are exempt from the 3-month YTD rule.",
            "conditions": "100%. \\"Permanent part of income and any associated lease payments are included in liabilities.\\""
          },
          {
            "type": "shift_allowance",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": null,
            "evidence": "Two payslips whose YTD covers at least 3 months, annualised.",
            "conditions": "100%. Condition of employment and industry standard."
          },
          {
            "type": "self_employed_sole_trader",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 24,
            "evidence": "Business tax returns or accountant-prepared P&L and balance sheet for the most recent 2 years (1 year if it shows 2-year comparables), plus personal tax returns for the 2 most recent financial years and the most recent ATO notice of assessment.",
            "conditions": "At least 2 years trading in the current business (1 year for listed self-employed professionals, LVR then capped at 80%). Upward trend: max 120% of the previous year, not exceeding the highest year, unless 6+ months of BAS support the most recent year at >=90% annualised. Downward trend: use the most recent year. Cash flow projections are unacceptable."
          },
          {
            "type": "self_employed_company",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 24,
            "evidence": "As per standard self-employed evidence (2 years' business + personal returns).",
            "conditions": "Add-backs allowed: directors'/partners' salaries not separately used, excess director superannuation, interest on loans being refinanced, business depreciation up to 20% of business net profit, non-recurring one-off items confirmed by the accountant, discretionary family trust distributions to children under 18. Minority shareholders (<50%) not spousally related to other shareholders must support company profits with actual dividends received. An applicant owning <25% of the entity and relying only on PAYG salary from it may be assessed under PAYG rules."
          },
          {
            "type": "self_employed_trust",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 24,
            "evidence": "As per standard self-employed evidence.",
            "conditions": "Assessed in line with the borrower's ownership rights (shares, units). Distributions from a discretionary family trust to children under 18 are an allowable add-back."
          },
          {
            "type": "rental_residential",
            "accepted": true,
            "shadingPct": 0.75,
            "minHistoryMonths": null,
            "evidence": "Proposed purchases: lesser of the rent per the Macquarie-ordered valuation, a licensed agent's estimate/tenancy management agreement no more than 60 days old, or a current executed tenancy agreement. Existing properties: rental statement <=60 days old, current executed tenancy agreement, most recent tax return, annual rental statement, or bank statements showing rental credits for at least 3 months.",
            "conditions": "75% of verified rental income in line with the borrower's % ownership. Short-term stay (holiday letting/serviced apartments) and room rental properties: 65%."
          },
          {
            "type": "rental_commercial",
            "accepted": true,
            "shadingPct": 0.65,
            "minHistoryMonths": null,
            "evidence": "Lease agreements should be obtained where significant reliance is placed on non-residential rent.",
            "conditions": "Non-residential (e.g. commercial, industrial, office): 65% of verified rental income in line with the borrower's % ownership."
          },
          {
            "type": "dividends",
            "accepted": true,
            "shadingPct": 0.8,
            "minHistoryMonths": null,
            "evidence": "The lower investment income figure from the two most recent tax returns, OR a deeming rate of 3% of the investment asset's value where actual income is unknown (asset value verified by holding reports/bank statements, using the lower of the current statement or one 12 months old).",
            "conditions": "Investment income (interest on non-offset cash, franked/unfranked dividends and franking credits, managed fund distributions) is counted at 80%. Assets must be in the name of the borrower(s)/guarantor(s)."
          },
          {
            "type": "superannuation_pension",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": null,
            "evidence": "Confirmation from the superannuation provider that the pension is permanent and ongoing.",
            "conditions": "100%. Includes government superannuation pensions (e.g. Comsuper and Military pensions). Where non-taxable superannuation pension is >50% of servicing income, the DTI cap does not apply."
          },
          {
            "type": "government_family_tax_benefit",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": null,
            "evidence": "Government-issued family allowance statements.",
            "conditions": "100% as supporting or secondary income only. \\"Dependent child must be under 11 years of age at the time of the application.\\""
          },
          {
            "type": "child_support_maintenance",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 6,
            "evidence": "Agreement registered with the Child Support Agency (or a court order with payments evidenced), plus six months' consistent payments evidenced on bank statements.",
            "conditions": "100% as supporting or secondary income. Payments must be permanent for the next five years, the dependent child must be under 11 at application, and it cannot be the sole source of income."
          },
          {
            "type": "foreign_income",
            "accepted": true,
            "shadingPct": 0.8,
            "minHistoryMonths": 24,
            "evidence": "Consistent and evidenced via the previous 2 years' Australian tax returns. All documents in English or translated by a registered licensed Australian translation service.",
            "conditions": "80%. \\"As a guide acceptable foreign income should be limited to annuity pension, rental or investment income. Cannot be sole source or majority of income required to meet loan serviceability.\\" Where a PAYG applicant works for a foreign entity, is paid foreign income and holds a valid current Australian residential address, standard PAYG verification applies instead, still with an 80% haircut after conversion; overtime/commission/bonus take their own haircut in addition."
          }
        ],
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, ss3B-3E",
        "confidence": "high",
        "status": "verified",
        "note": "Shading percentages are taken from the s3B \\"Maximum proportion for servicing\\" column and the s3D/s3E percentages, verified against a reading-order extraction of the source PDF."
      },
      "altDocAvailable": {
        "value": null,
        "asAt": null,
        "sourceUrl": null,
        "confidence": "low",
        "status": "not_found",
        "note": "No alt-doc/low-doc program is described in Credit Guidelines v14.0; all self-employed verification paths require tax returns or accountant-prepared financials."
      },
      "selfEmployedMinYears": {
        "value": 2,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s3C",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Self-employed - at least 2 years trading in the current business. For self-employed professionals, require a minimum of 1 year trading in their current business.\\""
      },
      "oneYearFinancialsAccepted": {
        "value": true,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s3C Professional Specialisation",
        "confidence": "high",
        "status": "verified",
        "note": "Only for listed self-employed professionals (CA ANZ/CPA/CFA accountant, FIAA actuary, lawyer, registered medico, Engineers Australia engineer, vet, architect, pharmacist, psychologist, podiatrist, optometrist). Conditions: LVR must not exceed 80%; business trading at least 12 months; income evidence covering at least 12 months. Also available generally where the most recent year's financial statement shows two-year comparables."
      },
      "notes": {
        "value": "Effective 1 April each year prior-year financials are required for all self-employed applicants, with a 2-week pipeline grace period (hard from 15 April). Salary sacrifice is counted at 100% where convertible to gross taxable income and evidenced on payslips; 'tax free' salary sacrifice arrangements require employment in public health, social work or charity work. Employer or government paid parental leave is 100% with evidence it continues until return to work, and return-to-work income can be used where savings cover the shortfall and an employer letter confirms the resume date and pay rate. Long service leave at full pay is used at 100%; at half pay, half pay is used unless return-to-work income criteria are met. Disability benefits and salary continuance / income protection payments are 100% but only as supporting/secondary income, and only where ongoing, not subject to medical review, and payable for the loan term or until retirement (assumed age 70).",
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, ss3B, 3C, 3E",
        "confidence": "high",
        "status": "verified",
        "note": null
      }
    },
    "employment": {
      "minMonthsCurrentJob": {
        "value": 6,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s3B PAYG - Employment history (Tenure)",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Permanent salary/wage employment (full-time or part-time) and contract employment - minimum 6 months in current employment OR employed for a minimum of 6 months in the same field/industry in prior role.\\""
      },
      "sameIndustryContinuityAccepted": {
        "value": true,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s3B",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Note, in relation to the above, the time taken between roles does not need to be considered.\\""
      },
      "minMonthsSameIndustry": {
        "value": 6,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s3B",
        "confidence": "high",
        "status": "verified",
        "note": "Alternative to 6 months in the current job, for permanent, contract and casual employment alike."
      },
      "probationAccepted": {
        "value": null,
        "asAt": null,
        "sourceUrl": null,
        "confidence": "low",
        "status": "not_found",
        "note": "Credit Guidelines v14.0 s3B sets tenure rules by employment type but does not mention probation. The 6-month current-employment / 6-month same-industry test is the only published tenure gate."
      },
      "minMonthsCasual": {
        "value": 6,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s3B",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Casual employment - minimum 6 months in current employment OR employed for a minimum of 6 months in the same field/industry.\\""
      },
      "minMonthsContract": {
        "value": 6,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s3B",
        "confidence": "high",
        "status": "verified",
        "note": "Contract employment is grouped with permanent salary/wage employment for tenure purposes."
      },
      "minContractRemainingMonths": {
        "value": null,
        "asAt": null,
        "sourceUrl": null,
        "confidence": "low",
        "status": "not_found",
        "note": "No minimum remaining fixed-term contract period is published in Credit Guidelines v14.0."
      },
      "minMonthsSelfEmployedAbn": {
        "value": 24,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s3C",
        "confidence": "high",
        "status": "verified",
        "note": "\\"at least 2 years trading in the current business\\". Reduced to 12 months for listed self-employed professionals (LVR then capped at 80%), and self-employed contract workers who previously worked as PAYG in the same industry/field for over 2 years are acceptable."
      },
      "maxEmploymentGapMonths": {
        "value": null,
        "asAt": null,
        "sourceUrl": null,
        "confidence": "low",
        "status": "not_found",
        "note": "No maximum employment gap is published. Policy instead states the time taken between roles does not need to be considered where the same-industry test is met."
      },
      "notes": {
        "value": "Applicants employed by a family owned or controlled business must satisfy any TWO of: computer-generated payslips (or a current-FY my.Gov income statement no older than 60 days); bank statements evidencing the most recent 6 months of regular salary credits; or the most recent individual tax return plus ATO notice of assessment (or a Tax Ready prior-year my.Gov income statement). This does not apply where a PAYG applicant works for a self-employed spouse and both are parties to the loan - self-employed verification is then followed.",
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s3B",
        "confidence": "high",
        "status": "verified",
        "note": null
      }
    },
    "credit": {
      "maxDefaults": {
        "value": 0,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s2D Credit reports",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Unacceptable items: Bankrupts; Judgements; Court writs; Outstanding defaults, financial or non-financial.\\" Any outstanding (unpaid) default is unacceptable. Paid defaults may be considered - see paidDefaultsAccepted and defaultIgnoredUnderAmount."
      },
      "defaultIgnoredUnderAmount": {
        "value": 500,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s2D Adverse items",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Paid non-financial defaults less than or equal to $500 can be considered if supported by a satisfactory explanation from the client.\\" This is a consideration threshold for PAID NON-FINANCIAL defaults only, not a blanket disregard."
      },
      "paidDefaultsAccepted": {
        "value": true,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s2D Adverse items",
        "confidence": "medium",
        "status": "verified",
        "note": "Conditional. \\"Prior defaults greater than $500, can only be considered on an exception basis. Refer to your BDM. Any adverse findings must be supported by an explanation from the client.\\" Paid non-financial defaults <= $500 can be considered with a satisfactory explanation."
      },
      "paidDefaultMinAgeMonths": {
        "value": null,
        "asAt": null,
        "sourceUrl": null,
        "confidence": "low",
        "status": "not_found",
        "note": "No minimum age for a paid default is published; the test is size (>$500 = exception basis) and explanation, not age."
      },
      "unpaidDefaultsAccepted": {
        "value": false,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s2D",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Outstanding defaults, financial or non-financial\\" are listed as unacceptable items."
      },
      "judgmentsAccepted": {
        "value": false,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s2D",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Judgements\\" listed as an unacceptable item."
      },
      "writsAccepted": {
        "value": false,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s2D",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Court writs\\" listed as an unacceptable item."
      },
      "bankruptcyDischargedMinYears": {
        "value": null,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s2D",
        "confidence": "low",
        "status": "not_found",
        "note": "\\"Bankrupts\\" are listed as an unacceptable item, but no minimum period since discharge is published, so the number of years required cannot be sourced."
      },
      "partIxDischargedMinYears": {
        "value": null,
        "asAt": null,
        "sourceUrl": null,
        "confidence": "low",
        "status": "not_found",
        "note": "Part IX debt agreements are not mentioned in Credit Guidelines v14.0."
      },
      "maxArrears12Months": {
        "value": 0,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s2F Account Conduct (CCR RHI)",
        "confidence": "medium",
        "status": "verified",
        "note": "The published test is over 24 months, not 12: \\"If any account shows any instances of RHI status code = 2, 3, 4, 5, 6 or X in the last 24 months we will not be able to proceed with the application.\\" RHI code 2 = 30-59 days overdue. A single RHI code 1 (up to 29 days overdue) in the last 24 months \\"we may be able to consider based on the overall strength of the application\\". So zero payments 30+ days late is the effective requirement, but over a 24-month window."
      },
      "minCreditScore": {
        "value": null,
        "asAt": null,
        "sourceUrl": null,
        "confidence": "low",
        "status": "not_found",
        "note": "No minimum credit score is published in Credit Guidelines v14.0; policy says CCR data \\"will be reviewed as part of the credit assessment\\"."
      },
      "maxEnquiries6Months": {
        "value": null,
        "asAt": null,
        "sourceUrl": null,
        "confidence": "low",
        "status": "not_found",
        "note": "No general enquiry cap is published. A narrow rule exists: four or more non-Macquarie consumer real property mortgage enquiries with role type 'Guarantor' is an indicator of increased risk \\"where present the credit analyst is to decline the application\\" - that applies only to guarantor-role enquiries, not to enquiries generally, so it is recorded here as a note rather than as a value."
      },
      "paydayLendingPolicy": {
        "value": null,
        "asAt": null,
        "sourceUrl": null,
        "confidence": "low",
        "status": "not_found",
        "note": "Payday lending / SACC conduct is not addressed in Credit Guidelines v14.0."
      },
      "gamblingPolicy": {
        "value": "Gambling is listed as an unacceptable purpose for equity release / cash out funds. No policy on gambling transactions appearing in transaction statements is published.",
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s1A",
        "confidence": "medium",
        "status": "verified",
        "note": null
      },
      "notes": {
        "value": "All financial enquiries in the last 3 months must be confirmed as 'not proceeded' or 'proceeded' and entered in liabilities. CCR RHI is reviewed on all accounts held over the last 24 months, and CCR FHI (financial hardship) over the last 12 months - where an FHI status code of A or V is present, acceptable conduct is needed across all accounts for 24 months plus 6 months of full payments after the assistance arrangement ends. Where a refinance statement review is requested, statements must cover 6 months (3 months for credit cards) and show no more than 1 dishonoured/missed/late repayment or over-limit event per application, resolved within 30 days or by the next scheduled repayment; the most recent statement must be no more than 6 weeks old at submission.",
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, ss2D, 2F",
        "confidence": "high",
        "status": "verified",
        "note": null
      }
    },
    "security": {
      "acceptablePropertyTypes": {
        "value": [
          "Residential house and land",
          "Residential strata home unit with at least one bedroom and living floor space no less than 50m2 (excluding balcony and car space)",
          "House & land on acreage or rural residential property with an acceptable dwelling, essential services connected, sealed roads and non-income producing",
          "Off the plan purchases",
          "Stratum title (VIC) home units",
          "Mixed zoned properties where the property is for residential use and that is permitted under the zoning requirements"
        ],
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s4A Acceptable Securities",
        "confidence": "high",
        "status": "verified",
        "note": "Tank water and septic tank connections are acceptable on rural residential where common to the location with no adverse valuer comment."
      },
      "unacceptablePropertyTypes": {
        "value": [
          "Vacant land with no intent to build",
          "More than two dwellings on one title",
          "Leasehold property under national parks & wildlife authority (e.g. land in Thredbo or Kosciusko)",
          "Property allotments in sparsely populated areas",
          "Company title, Company Share title (VIC)",
          "Purple Title (WA)",
          "Moiety Title (SA)",
          "Properties under a 'time share' arrangement",
          "Land subject to licence to occupy or properties with 'lease of life' covenants on title",
          "Properties subject to the Western Lands Act",
          "Strata title hotel/motel room",
          "Dual key apartments",
          "Commercial or industrial zoned property",
          "Properties not exclusively for residential use regardless of zoning",
          "Stand-alone 2nd mortgage securities",
          "Partially complete properties (only considered under construction loan parameters where the original builder completes the works)",
          "Relocatable or transportable homes",
          "Properties affected by contamination",
          "Properties where essential services are not connected",
          "Owner/builder construction",
          "University or student apartments",
          "Rural residential properties not meeting the acceptable criteria",
          "Properties located in remote mining towns",
          "Strata retirement village apartments",
          "Serviced apartments",
          "Third party securities",
          "Properties affected by any government or state planning schemes",
          "Properties in need of significant repair unless the repairs form part of the loan purpose and funds are adequately controlled",
          "Properties adversely impacted by mine subsidence or landslip",
          "Studio apartments/bed sitters with living floor space less than 50m2 excluding balcony and car space",
          "Properties deemed unsuitable for home loan purposes by the valuer",
          "Where the borrower owns >25% or more than 4 dwellings in a single development"
        ],
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s4A Unacceptable securities",
        "confidence": "high",
        "status": "verified",
        "note": null
      },
      "minUnitFloorAreaSqm": {
        "value": 50,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s4A",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Residential strata home unit with at least one bedroom having a living floor space area no less than 50m2 (excluding balcony and car space)\\" is acceptable; studio apartments/bed sitters under 50m2 are unacceptable. Studios/bedsitters at or above 50m2 are a restricted security - refer BDM."
      },
      "maxLandSizeHa": {
        "value": 40,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s1D Maximum LVR/Loan amount per security - land size",
        "confidence": "high",
        "status": "verified",
        "note": "\\">40 hectares: Unacceptable.\\" Land-size LVR steps: up to 4ha standard LVR parameters; >4 up to 10ha 80% LVR; >10 up to 20ha 70% LVR; >20 up to 40ha 60% LVR - each subject to location category limits."
      },
      "postcodeRestrictionsPublished": {
        "value": true,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s1D",
        "confidence": "high",
        "status": "verified",
        "note": "Not published as a standalone list. Policy directs brokers to the 'Security Details' section of the Manual Servicing Calculator, which flags High Risk and High Density postcodes and returns the location category (1 Metro / 2 Non-metro / 3 Regional / 4 Other - outside policy) once a postcode is entered."
      },
      "postcodeListUrl": {
        "value": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie-bank-mortgage-solutions-serviceability-calculator.xlsm",
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/help/brokers/credit-guidelines-and-processes/understanding-who-and-what-we-finance/accessing-our-credit-policy-and-calculators.html",
        "sourceTitle": "Macquarie Broker Help Centre - Accessing our credit policy and calculators",
        "confidence": "medium",
        "status": "verified",
        "note": "The postcode categorisation lives inside the publicly downloadable Macquarie serviceability calculator workbook ('Security Details' section), not in a published postcode list."
      },
      "restrictedPostcodeMaxLvrPct": {
        "value": 80,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s1D",
        "confidence": "high",
        "status": "verified",
        "note": "\\"High risk postcode location: 80% LVR.\\" Separately, Category 4 locations are outside policy entirely (refer BDM), and Category 2 & 3 (non-metro/regional) carry lower property-value caps per LVR band."
      },
      "highDensityPolicy": {
        "value": "\\"High density apartment/unit(s): Up to 80% LVR can be considered where the repayment type is Principal and Interest. Where any portion of the loan is interest only, the LVR is capped at 70%.\\" High Density postcodes are flagged by the 'Security Details' section of the Manual Servicing Calculator.",
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s1D",
        "confidence": "high",
        "status": "verified",
        "note": "Macquarie defines high density by postcode flag rather than by storeys or number of units in the development."
      },
      "highDensityMaxLvrPct": {
        "value": 80,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s1D",
        "confidence": "high",
        "status": "verified",
        "note": "80% with P&I repayments; 70% if any portion of the loan is interest only."
      },
      "ruralResidentialAccepted": {
        "value": true,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s4A",
        "confidence": "high",
        "status": "verified",
        "note": "\\"House & land on acreage or rural residential property with acceptable dwelling, essential services connected sealed roads and non-income producing.\\" Rural residential properties not meeting that criteria are unacceptable, as are allotments in sparsely populated areas and remote mining towns."
      },
      "ruralMaxLvrPct": {
        "value": null,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s1D",
        "confidence": "low",
        "status": "not_found",
        "note": "No single rural LVR cap is published; rural exposure is limited instead by the land-size ladder (up to 4ha standard, >4-10ha 80%, >10-20ha 70%, >20-40ha 60%, >40ha unacceptable) and the location category property-value caps."
      },
      "companyTitleAccepted": {
        "value": false,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s4A",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Company title, Company Share title (VIC)\\" listed as unacceptable securities."
      },
      "leaseholdAccepted": {
        "value": true,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s4A",
        "confidence": "medium",
        "status": "verified",
        "note": "Case by case, refer BDM: \\"Leasehold properties not in ACT where the unexpired lease term is 10 years greater than loan term\\" sits in the higher-risk-but-considerable list. Leasehold property under national parks & wildlife authority (e.g. Thredbo, Kosciusko) is unacceptable."
      },
      "strataAccepted": {
        "value": true,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s4A",
        "confidence": "high",
        "status": "verified",
        "note": "Residential strata home units accepted where at least one bedroom and living floor space >= 50m2 excluding balcony and car space. Strata title hotel/motel rooms and strata retirement village apartments are unacceptable."
      },
      "offThePlanAccepted": {
        "value": true,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, ss1D, 4A, 4B",
        "confidence": "high",
        "status": "verified",
        "note": "Listed as an acceptable security. Land-size/other-features matrix shows off the plan at 90% LVR inclusive of low deposit fee capitalisation. Valuation must be no older than 90 days at submission including off-the-plan purchases; if the contract of sale exchanged more than 12 months before valuation, the on-completion valuation can be used so long as the loan does not exceed 100% of the purchase price."
      },
      "servicedApartmentAccepted": {
        "value": false,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s4A",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Serviced apartments\\" listed as unacceptable securities. (Rent from serviced-apartment-style short-stay properties is separately shaded to 65% where such a property is owned but not offered as security.)"
      },
      "studentAccommodationAccepted": {
        "value": false,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s4A",
        "confidence": "high",
        "status": "verified",
        "note": "\\"University or student apartments\\" listed as unacceptable securities."
      },
      "displayHomeLeasebackAccepted": {
        "value": true,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s4A",
        "confidence": "medium",
        "status": "verified",
        "note": "\\"Display homes\\" appear in the higher-risk list: \\"The following higher risk security types may be considered on a case by case basis, Refer to your BDM to confirm if the security can be considered.\\" The leaseback arrangement itself is not separately addressed."
      },
      "nrasAccepted": {
        "value": null,
        "asAt": null,
        "sourceUrl": null,
        "confidence": "low",
        "status": "not_found",
        "note": "NRAS properties are not mentioned in Credit Guidelines v14.0."
      },
      "sdaNdisAccepted": {
        "value": null,
        "asAt": null,
        "sourceUrl": null,
        "confidence": "low",
        "status": "not_found",
        "note": "SDA / NDIS housing is not mentioned in Credit Guidelines v14.0."
      },
      "maxSecurities": {
        "value": 4,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s4A",
        "confidence": "medium",
        "status": "verified",
        "note": "This is a concentration limit within ONE development, not a limit on total securities per facility: unacceptable \\"Where the borrower owns >25% or more than 4 dwellings in a single development\\". Where a facility is secured by multiple properties a maximum LVR of 80% per security applies."
      },
      "notes": {
        "value": "For LVRs above 80% a full valuation is always required. Valuations must be no older than 90 days at submission and no older than 180 days at settlement. Developer discounts are not treated as part of the borrower's deposit - they reduce the sale price. In Queensland, where the builder/developer or a related party is the vendor, the valuer may request a Form 8 Certificate detailing total commission and marketing fees. Essential or structural repairs over $10k outside a construction loan require reasonable grounds that the borrower can afford them.",
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, ss4B, 4C",
        "confidence": "high",
        "status": "verified",
        "note": null
      }
    },
    "product": {
      "minLoanAmount": {
        "value": 150000,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s1B Loan Amount",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Minimum loan amount $150,000\\" (stated as a guide). Minimum principal increase amount $25,000. Construction loans also have a $150,000 minimum."
      },
      "maxLoanAmount": {
        "value": 10000000,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s1B",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Maximum aggregate exposure per Borrower $10,000,000\\" (stated as a guide). Construction loans are capped at $2,000,000 at 80% LVR, with the construction component not exceeding 50% of loan size for loans over $1,500,000."
      },
      "maxLoanTermYears": {
        "value": 30,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s1C Loan Term",
        "confidence": "high",
        "status": "verified",
        "note": "Maximum loan term 30 years; minimum loan term 5 years."
      },
      "maxInterestOnlyYearsOwnerOcc": {
        "value": 5,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s1C",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Maximum initial interest only period: Up to 5 years\\", plus up to 5 years subsequent subject to credit approval. Policy is not split by occupancy. Critically: \\"Interest only is unavailable within the last 20 years of a loan term\\", and any interest-only portion caps the facility LVR at 80%."
      },
      "maxInterestOnlyYearsInvestment": {
        "value": 5,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s1C",
        "confidence": "high",
        "status": "verified",
        "note": "Same rule as owner-occupied - the guidelines do not distinguish IO term by occupancy. Interest only is unavailable within the last 20 years of the loan term."
      },
      "constructionAvailable": {
        "value": true,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, Construction Loans",
        "confidence": "high",
        "status": "verified",
        "note": "Up to 2 residential dwellings, licensed contracted builder, fixed-price fixed-term industry-standard contract, commencement within 3 months of initial settlement, completion within 24 months. Owner-builder, kit/demountable homes and construction of more than 2 dwellings are unacceptable. Metro (Cat 1) and non-metro (Cat 2) locations only."
      },
      "genuineSavingsRequiredPct": {
        "value": 0.05,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s2E Contributions & Genuine Savings",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Where LVR > 85% (excluding low deposit fee capitalisation), 5% of purchase price is required to be evidenced as genuine savings.\\""
      },
      "genuineSavingsRequiredAboveLvrPct": {
        "value": 85,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s2E",
        "confidence": "high",
        "status": "verified",
        "note": "The 85% threshold is measured excluding low deposit fee capitalisation."
      },
      "genuineSavingsMinMonths": {
        "value": 3,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s2E Genuine savings source",
        "confidence": "high",
        "status": "verified",
        "note": "Funds held or accumulated in a personal savings account or term deposit for 3 or more months; shares/managed fund units purchased and held at least 3 months (or sold having been held 3 months); equity in real estate; off-the-plan deposits paid over 3 months ago; loan repayments in excess of contractual P&I. Unacceptable: First Home Owners' Grant, any form of loan, projected savings/savings plans/rental purchase plans, funds held in a business account without evidence of personal saving."
      },
      "rentalLedgerAsGenuineSavings": {
        "value": false,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s2E",
        "confidence": "medium",
        "status": "verified",
        "note": "The unacceptable list names \\"Projected savings, savings plans and/or rental purchase plans of any type\\" and \\"Rental savings plans (e.g. where rent that is paid contributes to the deposit)\\". A rent ledger is not named explicitly as a genuine-savings substitute anywhere in the acceptable list, so the answer is read as no."
      },
      "giftedDepositAccepted": {
        "value": true,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s2E",
        "confidence": "high",
        "status": "verified",
        "note": "Gifts are accepted as a contribution. They only count as GENUINE SAVINGS where the amount has been held for three months or more."
      },
      "giftedDepositConditions": {
        "value": "\\"Where the borrower receives a gift from a family member or friend to assist with the purchase, written confirmation must be received from the donor of the funds confirming the amount and that funds are not repayable.\\" Where the funds are a loan rather than a gift, written confirmation from the lender of the funds is required confirming the amount, any conditions and repayment terms (and the repayment becomes a commitment). Gifts and inheritance count as genuine savings only where held for three months or more.",
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s2E",
        "confidence": "high",
        "status": "verified",
        "note": null
      },
      "governmentSchemesSupported": {
        "value": null,
        "asAt": null,
        "sourceUrl": null,
        "confidence": "low",
        "status": "not_found",
        "note": "Credit Guidelines v14.0 does not list participation in the Home Guarantee Scheme or state first-home schemes. It does state \\"Loans involving or offered in-conjunction with any shared equity schemes\\" are an unacceptable loan purpose, and that the First Home Owners' Grant is not acceptable as genuine savings."
      },
      "guarantorAccepted": {
        "value": true,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, ss2A, 2C",
        "confidence": "medium",
        "status": "verified",
        "note": "Guarantors must be natural persons and mortgagors must be documented as either a borrower or a guarantor. The acceptable-structures table only permits a guarantor structure where the guarantor is in a spousal relationship with the borrower; 'A borrows, A mortgages, B guarantees' is explicitly not acceptable. Independent legal and financial advice is required for all guarantors (ILA only for directors of company borrowers). A security/family guarantee product is not described in these guidelines."
      },
      "guarantorConditions": {
        "value": "Borrowers and guarantors must be natural persons aged 18+. Independent legal and financial advice is required for all guarantors, for all borrowers 70 years old and over, and for all non-English-speaking borrowers (with a translation certificate). Legal advice is not required for a practising lawyer, nor financial advice for a practising accountant/financial planner - but their spouse must still obtain advice independent of them and their firm. Third party securities are an unacceptable security type.",
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, ss2A, 2C, 4A",
        "confidence": "high",
        "status": "verified",
        "note": null
      },
      "exitStrategyRequiredOverAge": {
        "value": 55,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s3J Exit Strategy",
        "confidence": "high",
        "status": "verified",
        "note": "An exit strategy is required where an applicant is BOTH 55 or older at application AND will be 70 or older at loan maturity (or has advised an intention to retire before maturity). For joint spousal applicants the test applies to any applicant whose income is required to service; for non-spousal joint applicants it applies to any applicant regardless of whether their income is used."
      },
      "maxAgeAtMaturity": {
        "value": null,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s3J",
        "confidence": "low",
        "status": "not_found",
        "note": "No hard maximum age at maturity is published - age 70 at maturity triggers an exit-strategy requirement rather than a decline. Retirement age is assumed to be 70 for income-protection income purposes unless advised earlier."
      },
      "notes": {
        "value": "Maximum LVR on a purchase is 100% of the purchase price (i.e. the valuation cannot be used to lend above the price). Where the LVR is greater than 85% of the purchase price, the genuine savings requirement must be met. Downsizing exit strategies are assessed at current market value with no assumed capital growth, and the applicant must be able to buy the new property and extinguish all debt on the existing one.",
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, ss3J, 4C",
        "confidence": "high",
        "status": "verified",
        "note": null
      }
    },
    "residency": {
      "rules": {
        "value": [
          {
            "status": "australian_citizen",
            "accepted": true,
            "maxLvrPct": null,
            "conditions": "Standard loan parameters apply ONLY where a current/valid Australian residential address is held. Where no current/valid Australian residential address is held, the application is outside guidelines - including for Australian citizens."
          },
          {
            "status": "permanent_resident",
            "accepted": true,
            "maxLvrPct": null,
            "conditions": "Standard loan parameters apply where a current/valid Australian residential address is held. No Australian residential address = outside guidelines."
          },
          {
            "status": "expat_citizen_overseas",
            "accepted": false,
            "maxLvrPct": null,
            "conditions": "Residency Matrix: single applicant who is an Australian citizen/permanent resident with no current/valid Australian residential address = \\"Outside guidelines\\". Same outcome for two or more applicants where no applicant holds a current/valid Australian residential address, including two Australian citizens."
          },
          {
            "status": "temporary_visa_work",
            "accepted": false,
            "maxLvrPct": null,
            "conditions": "As a sole applicant, or as a non-spousal co-applicant whose income IS required to service the debt, or as a spousal co-applicant who IS the predominant servicer: outside guidelines. Standard loan parameters DO apply where an Australian citizen/PR borrows with a temporary-resident co-applicant whose income is not required to service the debt, or a spousal temporary-resident co-applicant who is not the predominant servicer, and all applicants hold a current/valid Australian residential address."
          },
          {
            "status": "temporary_visa_student",
            "accepted": false,
            "maxLvrPct": null,
            "conditions": "Not separately named. The Residency Matrix treats all \\"non-Australian citizen/non-permanent resident (i.e. temporary resident or temporary visa holder)\\" applicants alike - outside guidelines other than as a non-servicing co-applicant alongside an Australian citizen/PR."
          },
          {
            "status": "foreign_non_resident",
            "accepted": false,
            "maxLvrPct": null,
            "conditions": "\\"Non-Australian citizen/non-permanent resident (any)\\" with no current/valid Australian residential address: outside guidelines."
          }
        ],
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s2B Residency Matrix",
        "confidence": "high",
        "status": "verified",
        "note": "New Zealand citizens on a subclass 444 visa are not separately addressed in the Residency Matrix, so no rule is recorded for nz_citizen_444."
      },
      "acceptedVisaSubclasses": {
        "value": null,
        "asAt": null,
        "sourceUrl": null,
        "confidence": "low",
        "status": "not_found",
        "note": "No visa subclasses are named. The Residency Matrix works on citizen / permanent resident / temporary resident status and whether a current Australian residential address is held."
      },
      "foreignIncomeShadingPct": {
        "value": 0.8,
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s3E Foreign income",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Where foreign currency is to be converted to Australian dollars, only 80% of the amount after conversion at current exchange rates is to be used for loan servicing.\\" Overtime, commission or bonus take their own variability haircut IN ADDITION to the 80% foreign-income haircut. Foreign income cannot be the sole source or majority of servicing income."
      },
      "acceptedForeignCurrencies": {
        "value": [
          "GBP",
          "EUR",
          "HKD",
          "NZD",
          "SGD",
          "USD",
          "CAD",
          "JPY",
          "CHF"
        ],
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, s3E",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Acceptable foreign currencies are GBP, EUR, HKD, NZD, SGD, USD, CAD, JPY and CHF.\\" This applies to the pathway where a PAYG applicant is employed by a foreign entity, is paid foreign income and holds a valid current Australian residential address."
      },
      "firbRequiredNote": {
        "value": null,
        "asAt": null,
        "sourceUrl": null,
        "confidence": "low",
        "status": "not_found",
        "note": "FIRB is not mentioned in Credit Guidelines v14.0 - consistent with non-residents being outside guidelines entirely."
      },
      "notes": {
        "value": "All income documents must be in English or translated into English with an appropriate translation certificate from a registered licensed translation service domiciled in Australia. Independent legal and financial advice is required for all non-English-speaking borrowers, with the legal advice specifically going through the contracts and obligations of the loan.",
        "asAt": "2026-07-08",
        "sourceUrl": "https://www.macquarie.com.au/assets/bfs/documents/broker/mortgages/macquarie_broker-credit-guidelines.pdf",
        "sourceTitle": "Macquarie Residential Home Loans Credit Guidelines v14.0, ss2C, 3E",
        "confidence": "high",
        "status": "verified",
        "note": null
      }
    },
    "version": 1,
    "effectiveFrom": "2026-07-08",
    "researchedAt": "2026-07-29",
    "researchedBy": "research:claude-opus-5",
    "gaps": [
      "Product features (offset, redraw, bridging, SMSF residential lending) are not covered by the broker Credit Guidelines - they sit in the Home Loans Product Guide, which was not read for this pass.",
      "No LMI provider is named because Macquarie charges its own Low Deposit Fee instead; the LDF scale itself is only available in the downloadable LDF Calculator workbook, not as published figures.",
      "No LMI/LDF waiver for medical or other professions is published.",
      "Bankruptcy and Part IX: bankrupts are an unacceptable item but no minimum period since discharge is published, so no years-since-discharge value could be sourced.",
      "No minimum credit score, general credit-enquiry cap, or payday-lending conduct policy is published.",
      "Probation policy is not addressed anywhere in the guidelines.",
      "Postcode categories (Metro Cat 1 / Non-metro Cat 2 / Regional Cat 3 / Other Cat 4), high-risk postcode flags and high-density postcode flags are only resolvable inside the Macquarie Manual Servicing Calculator workbook - there is no published postcode list to mirror.",
      "Government first-home scheme participation (Home Guarantee Scheme / FHG, state schemes) is not stated.",
      "Depreciation add-back on an investment property's rental loss is not addressed (only business depreciation for self-employed applicants, capped at 20% of business net profit).",
      "NRAS and SDA/NDIS security policy is not mentioned."
    ]
  },
  {
    "id": "p-and-n-bank",
    "name": "P&N Bank",
    "legalName": "Police & Nurses Limited (trading as P&N Bank; BCU Bank is the other retail brand of the same entity)",
    "tier": "mutual_bank",
    "status": "active",
    "acl": "240701",
    "abn": "69 087 651 876",
    "brokerSiteUrl": "https://www.pnbank.com.au/home-loans/broker/",
    "policyDocUrl": "https://www.pnbank.com.au/important-information/target-market-determinations/",
    "panels": null,
    "servicing": {
      "assessmentBufferPct": {
        "value": null,
        "asAt": null,
        "sourceUrl": null,
        "confidence": "low",
        "status": "not_found",
        "note": "Not published publicly. P&N's product/policy detail for brokers sits behind the Broker Hub login at https://broker.pnbank.info/; the public site (TMDs, credit guide, rates) does not state an assessment buffer or floor rate."
      },
      "notes": {
        "value": "No serviceability parameters (buffer, floor rate, HEM basis, DTI cap, rent shading) are published on P&N Bank's public website. Accredited brokers are directed to the Broker Hub (broker.pnbank.info) for product and policy information, which requires a login and is therefore out of scope for this record.",
        "asAt": "2026-07-29",
        "sourceUrl": "https://www.pnbank.com.au/home-loans/broker/",
        "sourceTitle": "Supporting WA brokers and their clients | P&N Bank",
        "confidence": "high",
        "status": "verified"
      }
    },
    "lvr": {
      "maxLvrOwnerOccupiedPct": {
        "value": 95,
        "asAt": "2026-04-22",
        "sourceUrl": "https://www.pnbank.com.au/important-information/target-market-determinations/offset-variable-home-loan-tmd/",
        "sourceTitle": "Offset Variable Home Loan Target Market Determination (effective 22/04/2026)",
        "confidence": "high",
        "status": "verified",
        "note": "TMD states LVR \\"Less than or equal to 95% (Lenders Mortgage Insurance may be required where applicable and as determined by P&N)\\". The Basic Variable Home Loan - OO TMD (effective 12/03/2026) states the same 95% ceiling."
      },
      "maxLvrInvestmentPct": {
        "value": 90,
        "asAt": "2026-04-22",
        "sourceUrl": "https://www.pnbank.com.au/important-information/target-market-determinations/investor-offset-home-loan-tmd/",
        "sourceTitle": "Investor Offset Home Loan Target Market Determination (effective 22/04/2026)",
        "confidence": "high",
        "status": "verified",
        "note": "TMD states LVR \\"Up to 90% (Lenders Mortgage Insurance may be required where applicable and as determined by P&N)\\". The Investor Basic Home Loan - IO TMD (effective 13/11/2025) also caps at 90%."
      },
      "maxLvrCashOutPct": {
        "value": 90,
        "asAt": "2026-01-08",
        "sourceUrl": "https://www.pnbank.com.au/important-information/target-market-determinations/equity-access-tmd/",
        "sourceTitle": "Equity Access Target Market Determination (effective 08/01/2026)",
        "confidence": "medium",
        "status": "verified",
        "note": "Equity Access is P&N's line-of-credit equity release product, capped at \\"Up to 90% LVR\\". This is the equity-release product ceiling, not necessarily a general cash-out policy limit on a term loan."
      },
      "notes": {
        "value": "LVR bands on the owner-occupied variable products are priced in five tiers: <=60%, >60-70%, >70-80%, >80-90%, >90-95%. Investor variable products are tiered <=70%, <=80%, <=90%.",
        "asAt": "2026-04-22",
        "sourceUrl": "https://www.pnbank.com.au/important-information/target-market-determinations/offset-variable-home-loan-tmd/",
        "sourceTitle": "Offset Variable Home Loan Target Market Determination",
        "confidence": "high",
        "status": "verified"
      }
    },
    "income": {},
    "employment": {},
    "credit": {},
    "security": {
      "acceptablePropertyTypes": {
        "value": [
          "Property used for predominantly residential purposes"
        ],
        "asAt": "2026-04-22",
        "sourceUrl": "https://www.pnbank.com.au/important-information/target-market-determinations/offset-variable-home-loan-tmd/",
        "sourceTitle": "Offset Variable Home Loan Target Market Determination",
        "confidence": "medium",
        "status": "verified",
        "note": "TMD security requirement only. No published acceptable/unacceptable security schedule, minimum unit size, postcode category list or high-density policy on the public site."
      }
    },
    "product": {
      "minLoanAmount": {
        "value": 20000,
        "asAt": "2026-04-22",
        "sourceUrl": "https://www.pnbank.com.au/important-information/target-market-determinations/offset-variable-home-loan-tmd/",
        "sourceTitle": "Offset Variable Home Loan Target Market Determination (effective 22/04/2026)",
        "confidence": "high",
        "status": "verified",
        "note": "$20,000.00 minimum stated on every P&N home-loan TMD reviewed (owner-occupied, investor, bridging, Equity Access)."
      },
      "maxLoanAmount": {
        "value": 5000000,
        "asAt": "2026-04-22",
        "sourceUrl": "https://www.pnbank.com.au/important-information/target-market-determinations/offset-variable-home-loan-tmd/",
        "sourceTitle": "Offset Variable Home Loan Target Market Determination (effective 22/04/2026)",
        "confidence": "high",
        "status": "verified",
        "note": "$5,000,000.00 maximum stated on every P&N home-loan TMD reviewed."
      },
      "maxLoanTermYears": {
        "value": 30,
        "asAt": "2026-04-22",
        "sourceUrl": "https://www.pnbank.com.au/important-information/target-market-determinations/offset-variable-home-loan-tmd/",
        "sourceTitle": "Offset Variable Home Loan Target Market Determination (effective 22/04/2026)",
        "confidence": "high",
        "status": "verified",
        "note": "Loan term stated as \\"5 - 30 years\\"."
      },
      "maxInterestOnlyYearsInvestment": {
        "value": 5,
        "asAt": "2025-11-13",
        "sourceUrl": "https://www.pnbank.com.au/important-information/target-market-determinations/investor-basic-home-loan-tmd-io/",
        "sourceTitle": "Investor Basic Home Loan - IO Target Market Determination (effective 13/11/2025)",
        "confidence": "high",
        "status": "verified",
        "note": "\\"Interest only terms of 3 or 5 years, then principal and interest for the balance of the term.\\""
      },
      "offsetAvailable": {
        "value": true,
        "asAt": "2026-04-22",
        "sourceUrl": "https://www.pnbank.com.au/important-information/target-market-determinations/offset-variable-home-loan-tmd/",
        "sourceTitle": "Offset Variable Home Loan Target Market Determination",
        "confidence": "high",
        "status": "verified",
        "note": "\\"100% offset available, with up to 3 offset accounts permitted to be linked to the home loan account.\\" Available on both owner-occupied and investor variable products."
      },
      "redrawAvailable": {
        "value": true,
        "asAt": "2026-04-22",
        "sourceUrl": "https://www.pnbank.com.au/important-information/target-market-determinations/offset-variable-home-loan-tmd/",
        "sourceTitle": "Offset Variable Home Loan Target Market Determination",
        "confidence": "high",
        "status": "verified"
      },
      "bridgingAvailable": {
        "value": true,
        "asAt": "2024-04-19",
        "sourceUrl": "https://www.pnbank.com.au/important-information/target-market-determinations/bridging-loan-oo-tmd/",
        "sourceTitle": "Bridging Loan Target Market Determination (effective 19/04/2024)",
        "confidence": "high",
        "status": "verified",
        "note": "Owner-occupied bridging only; term 6 months (sale of existing property) or 12 months (construction), max 80% LVR, interest capitalised."
      },
      "governmentSchemesSupported": {
        "value": [
          "Home Guarantee Scheme (Australian Government 5% Deposit Scheme)"
        ],
        "asAt": "2026-07-29",
        "sourceUrl": "https://firsthomebuyers.gov.au/australian-government-5-percent-deposit-scheme/5-percent-participating-lenders",
        "sourceTitle": "Home Guarantee Scheme Participating Lenders | Housing Australia",
        "confidence": "medium",
        "status": "verified",
        "note": "P&N Bank is named on Housing Australia's participating-lender list (page carries no publication date; captured 2026-07-29). IMPORTANT FOR BROKERS: the P&N TMDs state \\"Loans originated under the Australian Government 5% Deposit Scheme are distributed through approved internal P&N Bank Home Lenders only\\" (Offset Variable Home Loan TMD, effective 22/04/2026) - i.e. the scheme is NOT available through the broker channel at P&N."
      },
      "notes": {
        "value": "Broker-originated lending IS accepted: the TMDs list \\"an accredited Mortgage Broker\\" as an approved distribution channel, and P&N runs a public broker page plus an accredited-broker Broker Hub (broker.pnbank.info), NextGen and Simpology lodgement, and a broker support line (08 9219 7411).",
        "asAt": "2026-04-22",
        "sourceUrl": "https://www.pnbank.com.au/important-information/target-market-determinations/offset-variable-home-loan-tmd/",
        "sourceTitle": "Offset Variable Home Loan Target Market Determination",
        "confidence": "high",
        "status": "verified"
      }
    },
    "residency": {},
    "version": 1,
    "effectiveFrom": "2026-04-22",
    "researchedAt": "2026-07-29",
    "researchedBy": "research:claude-opus-5",
    "gaps": [
      "No public credit policy guide. All broker product/policy detail is behind the Broker Hub login (broker.pnbank.info), which is out of scope under the no-login source rule.",
      "Servicing entirely unsourced: assessment buffer, floor rate, DTI cap, rent shading, HEM basis, credit-card and HECS treatment are not published anywhere public.",
      "No income-type policy published (casual, self-employed, overtime, bonus, commission, Centrelink, rental).",
      "No employment tenure minimums, credit-history knock-outs, or residency/visa rules published.",
      "No security policy detail: no minimum unit size, postcode category list, high-density or rural policy published.",
      "Owner-occupied maximum interest-only term not captured (fixed-rate OO IO TMD exists but was not read); construction lending availability not confirmed from a public source.",
      "Whether membership/eligibility is geographically restricted (P&N is WA-focused) is not stated as a lending restriction on the public site."
    ]
  },
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
  },
  {
    "id": "resimac",
    "name": "Resimac",
    "legalName": "Resimac Limited",
    "tier": "non_bank",
    "status": "active",
    "acl": "247829",
    "abn": "55 095 034 003",
    "brokerSiteUrl": "https://broker.resimac.com.au/",
    "policyDocUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
    "servicing": {
      "assessmentBufferPct": {
        "value": 2,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Group Ltd Broker Product Guide, 25 September 2025 — 'Serviceability' p7",
        "confidence": "high",
        "status": "verified",
        "note": "Quote: 'The \\"stressed assessment rate\\" for all products is the higher of either the actual rate plus a 2.00% loading or a floor assessment rate of 5.75%.'"
      },
      "assessmentFloorRatePct": {
        "value": 5.75,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Serviceability p7",
        "confidence": "high",
        "status": "verified",
        "note": "Applies to all products."
      },
      "refinanceBufferPct": {
        "value": 1,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Serviceability p7",
        "confidence": "medium",
        "status": "verified",
        "note": "Quote: 'For refinance and debt consolidation applications, a refinance buffer of 1% may apply. Conditions apply.' Confidence medium — 'may apply' and the conditions are not published."
      },
      "rentShadingPct": {
        "value": 0.9,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Acceptable PAYG income table p7",
        "confidence": "high",
        "status": "verified",
        "note": "'Rental income — Current — 90%' on both Prime and Specialist. Footnote 5: 'Airbnb accepted. 90% of income for serviceability with 12 months evidence.'"
      },
      "creditCardAssessmentPct": {
        "value": 0.038,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Serviceability p7",
        "confidence": "high",
        "status": "verified",
        "note": "Quote: 'Existing credit card / store card / buy now pay later limits are assessed at 3.8% per month.' Note this covers BNPL limits as well as cards."
      },
      "bnplTreatment": {
        "value": "Buy now pay later limits are assessed at 3.8% per month, on the same basis as credit card and store card limits.",
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Serviceability p7",
        "confidence": "high",
        "status": "verified",
        "note": null
      },
      "interestOnlyAssessment": {
        "value": "Repayments on interest only portions are assessed over the remaining principal and interest term.",
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Serviceability p7",
        "confidence": "high",
        "status": "verified",
        "note": null
      },
      "notes": {
        "value": "Serviceability ratio test: 'A minimum net surplus ratio of 1.00 times or greater, with an annual surplus of $200 is required.' Maximum aggregate loan exposure across the group is $5,000,000.",
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Serviceability p7, Maximum loan amounts p5",
        "confidence": "high",
        "status": "verified",
        "note": "Resimac announced that HEM living expenses apply from 18 February 2026 — that change post-dates this guide and its detail could not be read from a public, no-login page, so no hemBasis fact is recorded."
      }
    },
    "lvr": {
      "maxLvrOwnerOccupiedPct": {
        "value": 95,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Prime lending product matrix p2",
        "confidence": "high",
        "status": "verified",
        "note": "Prime Flex and Prime Standard: maximum LVR 95% (with LMI). Prime Alt Doc: 90%. Specialist Clear: 90% (Alt Doc refinance 85%). Specialist Plus: 85%. Specialist Assist: 85%."
      },
      "maxLvrNoLmiPct": {
        "value": 90,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — 'Prime - without LMI' loan amount matrix p5",
        "confidence": "medium",
        "status": "verified",
        "note": "The 'Prime - without LMI' matrix runs to an 85% and 90% row (Category 1 only, $2.5m), and a lender's risk fee of 1.00% (80.01-85%) / 2.00% (85.01-90%) applies in place of LMI. The 'Prime - with LMI' matrix starts at 'Up to 95%'. Confidence medium because the guide does not state a maximum no-LMI LVR in words — it is read off the two matrices."
      },
      "lmiCapitalisable": {
        "value": true,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Fees and charges p6",
        "confidence": "high",
        "status": "verified",
        "note": "'LMI can be capitalised into the loan... Loan amount cannot exceed product maximum.' On Specialist, the Lenders Risk Fee and Lenders Settlement Fee can be capitalised but the final LVR and loan amount cannot exceed the product maximum."
      },
      "lmiInclusiveOfMaxLvr": {
        "value": true,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Prime product matrix p2, Fees and charges p6",
        "confidence": "high",
        "status": "verified",
        "note": "The LMI capitalisation row on the Prime matrix reads '(cannot exceed 95% LVR)' — the capitalised premium must sit inside the 95% ceiling, not on top of it."
      },
      "lmiProvider": {
        "value": [
          "Helia"
        ],
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — 'Prime - with LMI' p5",
        "confidence": "high",
        "status": "verified",
        "note": "'Refer to the Helia Lenders Mortgage Insurance guidelines.' On the no-LMI and Specialist products Resimac charges its own Lenders Risk Fee instead: Prime Alt Doc 1.00% (80.01-85% LVR) / 2.00% (85.01-90%); Specialist Full Doc 0.75% / 1.00% / 1.25% / 1.50% and Specialist Alt Doc 1.00% / 1.25% / 1.50% / 2.00% across the <70 / 70.01-80 / 80.01-85 / 85.01-90 bands."
      },
      "lvrBands": {
        "value": [
          {
            "maxLvrPct": 65,
            "maxLoanAmount": 3500000,
            "qualifier": "Prime Flex & Standard and Prime Alt Doc, Category 1 location. Cat 2 $2.0m; Cat 3 $500k (Flex/Standard only)."
          },
          {
            "maxLvrPct": 70,
            "maxLoanAmount": 3500000,
            "qualifier": "Prime, Category 1. Cat 2 $2.0m; Cat 3 $500k. Non-resident Cat 1 $750k at 70%."
          },
          {
            "maxLvrPct": 75,
            "maxLoanAmount": 3500000,
            "qualifier": "Prime, Category 1. Cat 2 $2.0m; Category 3 not available."
          },
          {
            "maxLvrPct": 80,
            "maxLoanAmount": 3500000,
            "qualifier": "Prime, Category 1. Cat 2 $2.0m; Category 3 not available."
          },
          {
            "maxLvrPct": 85,
            "maxLoanAmount": 2500000,
            "qualifier": "Prime, Category 1 only. Alt Doc at this band attracts a risk fee. Categories 2 and 3 not available."
          },
          {
            "maxLvrPct": 90,
            "maxLoanAmount": 2500000,
            "qualifier": "Prime, Category 1 only. Alt Doc at this band attracts a risk fee. Categories 2 and 3 not available."
          },
          {
            "maxLvrPct": 95,
            "maxLoanAmount": 5000000,
            "qualifier": "Prime Flex & Standard WITH LMI only, Categories 1, 2 and 3. Amounts are for owner-occupied purposes; investment purpose loans may be lower — refer to the Helia LMI guidelines."
          }
        ],
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — 'Prime & Specialist Maximum loan amounts' p5",
        "confidence": "medium",
        "status": "verified",
        "note": "PRIME tier only, Category 1 location, owner-occupied. The guide's own caveats: 'LVR restrictions apply in some locations and for some security types. Refer to the Acceptable Property Locations tool' and 'Loan amounts are for owner occupied purposes. Investment purpose loans may be lower.' Confidence medium because the source is a multi-column matrix whose alignment had to be reconstructed from the PDF text layer. The Specialist matrix (Clear/Plus/Assist by category) was NOT transcribed — see gaps."
      },
      "notes": {
        "value": "Resimac assigns every location a Category (1, 2 or 3) which caps both LVR and loan amount. The category lookup is the 'Acceptable Property Locations' tool on resimac.com.au, which sits in a secure/broker area and so is not a citable public source.",
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — pp5, 8, 9",
        "confidence": "high",
        "status": "verified",
        "note": null
      }
    },
    "income": {
      "altDocAvailable": {
        "value": true,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Product matrix pp2-3",
        "confidence": "high",
        "status": "verified",
        "note": "Alt Doc is offered across Prime and all three Specialist tiers (Clear, Plus, Assist)."
      },
      "altDocEvidence": {
        "value": "Prime Alt Doc: self-certified income declaration + 2 year ABN + ONE of an accountant's verification, 6 months BAS, or 3 months business bank statements. Specialist Clear: accountant's verification (where the accountant has acted for the applicant 12+ months), or 6 months BAS, or 3 months business bank statements. Specialist Plus: 6 months BAS, or 3 months business bank statements, or an accountant's verification (for 75% LVR and where the accountant has acted for the applicant 12+ months). Specialist Assist: 6 months BAS or 3 months business bank statements.",
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — 'Income and assessment requirements' p4",
        "confidence": "high",
        "status": "verified",
        "note": "Resimac adds: 'The level of income must support the borrower's asset and liability statement of position... Resimac will not consider Alt Doc loan applications where it is readily apparent the borrower is not declaring income for tax purposes.'"
      },
      "altDocMaxLvrPct": {
        "value": 90,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Prime product matrix p2",
        "confidence": "high",
        "status": "verified",
        "note": "Prime Alt Doc 90% (no LMI available — 'N/A' in the LMI capitalisation row; a lender's risk fee applies above 80%). Specialist Clear Alt Doc refinance is capped at 85%."
      },
      "selfEmployedMinYears": {
        "value": 2,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — 'Income and assessment requirements' p4",
        "confidence": "high",
        "status": "verified",
        "note": "Full Doc: 'Self-Employed - last 2 years full Business / Company and Personal Taxation returns (only 12 months for Clear). This must also be supported by the latest available Tax Assessment Notice. 150% year on year variance can be used.'"
      },
      "oneYearFinancialsAccepted": {
        "value": true,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — p4",
        "confidence": "high",
        "status": "verified",
        "note": "Only on Specialist Clear — 'only 12 months for Clear'. Prime Full Doc requires 2 years."
      },
      "rules": {
        "value": [
          {
            "type": "payg_permanent_full_time",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 6,
            "evidence": "Either 2 of the 3 most recent computer-generated payslips, or 3 months of statements from a financial institution showing regular salary credits with the name of the employer, as a minimum.",
            "conditions": "'Full time employment' — minimum duration 6 months, allowance 100%, on both Prime and Specialist."
          },
          {
            "type": "payg_permanent_part_time",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 6,
            "evidence": "As per full-time PAYG.",
            "conditions": "'Permanent part time (as primary income)' — minimum duration 6 months, allowance 100%, on both Prime and Specialist."
          },
          {
            "type": "payg_casual",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 6,
            "evidence": "As per full-time PAYG; where overtime and/or commissions are included, the latest PAYG payment summary or tax assessment notice is also required.",
            "conditions": "Casual is accepted at a 100% allowance on both Prime and Specialist. Minimum duration is read from the p7 income table as 6 months — see the note on the rules Fact about column alignment."
          },
          {
            "type": "payg_fixed_term_contract",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 6,
            "evidence": "As per full-time PAYG.",
            "conditions": "'PAYG contract' — 100% allowance. On Specialist the allowance carries footnote 4: 'Based on 46 weeks of the year allowing for unpaid sick and annual leave.' Minimum duration is 6 months on Prime and 'Current' on Specialist per the p7 table."
          },
          {
            "type": "second_job",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 6,
            "evidence": null,
            "conditions": "6 months minimum duration, 100% allowance on both tiers. Footnote 6: 'Total combined hours worked capped at 60 hours per week.'"
          },
          {
            "type": "overtime_other",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": null,
            "evidence": "Latest PAYG payment summary (computer generated) or tax assessment notice in addition to payslips.",
            "conditions": "Overtime is allowed at 100% on both Prime and Specialist. The minimum-duration cell could not be read unambiguously from the PDF's column layout, so no minHistoryMonths is recorded."
          },
          {
            "type": "commission",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 6,
            "evidence": "Latest PAYG payment summary or tax assessment notice in addition to payslips.",
            "conditions": "Prime: minimum 6 months, 100%. Specialist: minimum 12 months, 100%."
          },
          {
            "type": "bonus",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 24,
            "evidence": "Latest PAYG payment summary or tax assessment notice in addition to payslips.",
            "conditions": "'Bonuses (paid at least quarterly)' — Prime minimum 24 months at 100%; Specialist minimum 12 months at 100%. Bonuses paid less often than quarterly are not covered by this row."
          },
          {
            "type": "shift_allowance",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 12,
            "evidence": null,
            "conditions": "'Shift allowance and penalties' — Prime minimum 12 months at 100%; Specialist minimum 6 months at 100%."
          },
          {
            "type": "car_allowance",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 0,
            "evidence": null,
            "conditions": "Minimum duration 'Current', 100% allowance on both tiers. Separately, a fully maintained company car (net) is worth up to $4,000 added to income on both tiers."
          },
          {
            "type": "rental_residential",
            "accepted": true,
            "shadingPct": 0.9,
            "minHistoryMonths": 0,
            "evidence": "For Airbnb income, 12 months evidence.",
            "conditions": "90% allowance on both Prime and Specialist. 'Airbnb accepted. 90% of income for serviceability with 12 months evidence.'"
          },
          {
            "type": "dividends",
            "accepted": true,
            "shadingPct": 0.8,
            "minHistoryMonths": 24,
            "evidence": null,
            "conditions": "Prime: minimum 24 months at an 80% allowance. Specialist: minimum 12 months at 100%. Confidence on the row-to-value mapping is medium — see the note on this rules Fact."
          },
          {
            "type": "government_family_tax_benefit",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 0,
            "evidence": null,
            "conditions": "'Family tax benefit A & B' — minimum duration 'Current', 100% on both tiers. Footnote 1: 'Accepted where the allowance is determined to be permanent and the child is under 14 years of age.'"
          },
          {
            "type": "child_support_maintenance",
            "accepted": true,
            "shadingPct": 0.8,
            "minHistoryMonths": null,
            "evidence": null,
            "conditions": "'Maintenance payments' — 80% allowance on Prime, 100% on Specialist. Footnote 1: accepted where the allowance is determined to be permanent and the child is under 14 years of age. The minimum-duration cell could not be read unambiguously."
          },
          {
            "type": "government_age_pension",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 0,
            "evidence": null,
            "conditions": "'Permanent pensions' — minimum duration 'Current', 100% on both tiers. Footnote 3 is a hard limit: 'Government assistant / welfare payments - this income will only be considered as a supplementary source of income.'"
          },
          {
            "type": "government_disability_support",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 0,
            "evidence": null,
            "conditions": "Covered by the 'Permanent pensions' row, subject to the same footnote 3 restriction to supplementary income only."
          },
          {
            "type": "self_employed_sole_trader",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 24,
            "evidence": "Full Doc: last 2 years full business/company and personal tax returns plus the latest tax assessment notice (12 months only for Specialist Clear); 150% year-on-year variance can be used. Alt Doc: self-certification plus accountant's verification, or 6 months BAS, or 3 months business bank statements.",
            "conditions": "Prime Alt Doc: ABN registered 2 years, business continuously operated 2 years, and where gross turnover exceeds $75,000 a valid GST registration for at least 12 months. Specialist Alt Doc: ABN and business age 12 months (Clear) or 6 months (Plus and Assist), with GST registration for the same period where turnover exceeds $75,000. At least one borrower must be self-employed; PAYG borrowers are permitted as secondary borrowers."
          },
          {
            "type": "self_employed_company",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 24,
            "evidence": "As per sole trader.",
            "conditions": "Proprietary companies limited by shares are acceptable, restricted to a single entity applicant. Maximum 4 shareholder directors per borrowing company, each holding at least 25% of issued capital. 'Only one applicant type (Individual, Company or Trust) per application.'"
          },
          {
            "type": "self_employed_trust",
            "accepted": true,
            "shadingPct": 1,
            "minHistoryMonths": 24,
            "evidence": "As per sole trader.",
            "conditions": "Discretionary trusts only — 'no Unit or Hybrid Trusts' — restricted to a single entity applicant."
          },
          {
            "type": "foreign_income",
            "accepted": true,
            "shadingPct": 0.9,
            "minHistoryMonths": null,
            "evidence": "Income evidence must be translated into English by an authorised/approved translator and converted to Australian dollars at the current exchange rate.",
            "conditions": "Non-resident (expat) lending only: 'A maximum of 90% of overseas income converted to Australian dollars may be used for serviceability purposes.' Where foreign income cannot be adequately verified, 80% of the gross market rental income for the security property must cover the proposed repayments at the default interest rate on a P&I basis over the remaining term. Non-resident self-employed, company or business borrowers are excluded."
          }
        ],
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — 'Acceptable PAYG income' table p7 and 'Income and assessment requirements' p4",
        "confidence": "medium",
        "status": "verified",
        "note": "Every allowance percentage above is quoted from Resimac's 'Allowance (%)' columns, which is high-confidence. The Fact as a whole is marked medium because the p7 table is a four-column layout (Prime min duration / Prime allowance / Specialist min duration / Specialist allowance) whose rows do not align cleanly in the PDF text layer; the minHistoryMonths values for bonus, dividends, maintenance and overtime in particular should be re-read against the visual PDF before being relied on. Where a cell could not be attributed with confidence, minHistoryMonths is left null rather than guessed."
      }
    },
    "employment": {
      "minMonthsCurrentJob": {
        "value": 6,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Acceptable PAYG income p7",
        "confidence": "high",
        "status": "verified",
        "note": "'Full time employment — Min. Duration 6' on both Prime and Specialist. Permanent part time is also 6 months."
      },
      "minMonthsSelfEmployedAbn": {
        "value": 24,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Prime product parameters p8",
        "confidence": "high",
        "status": "verified",
        "note": "Prime Alt Doc: 'ABN must be registered for two (2) years' and 'the borrowers must have continually operated the same business for a minimum of 2 years'. Specialist: 12 months for Clear, 6 months for Plus and Assist."
      },
      "minMonthsGstRegistered": {
        "value": 12,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Prime product parameters p8",
        "confidence": "high",
        "status": "verified",
        "note": "Prime: 'Where the borrower has a business with gross turnover in excess of $75,000 there must be a valid GST registration in place for a minimum period of 12 months.' Specialist: 12 months (Clear), 6 months (Plus and Assist), on the same turnover trigger."
      }
    },
    "credit": {
      "maxDefaults": {
        "value": 0,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Specialist product matrix p3 / 'Which Specialist loan is for me?' p4",
        "confidence": "medium",
        "status": "verified",
        "note": "This is the 'Number of credit events >$2k' row for SPECIALIST CLEAR: 0. Specialist Plus allows 1; Specialist Assist unlimited. Resimac defines a credit event as 'any single event that caused an adverse credit bureau listing or listings. A single credit event can consist of multiple bureau listings, provided the borrower can demonstrate that all listings were caused by that single event and the period over which the listings were reported does not exceed 6 months.' The Prime tier's credit-event tolerance is not published in this guide."
      },
      "defaultIgnoredUnderAmount": {
        "value": 2000,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — p4 and Specialist product parameters p9",
        "confidence": "high",
        "status": "verified",
        "note": "'Applicants with defaults, writs or summons under $2,000 accepted for Specialist Clear and Specialist Plus to 80% LVR.' Restated on p9 as: 'We'll consider applicants with defaults and judgements under $2,000.' The $2,000 threshold is also what defines a countable 'credit event >$2k'."
      },
      "paidDefaultsAccepted": {
        "value": true,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — p4, p9",
        "confidence": "high",
        "status": "verified",
        "note": "'Applicants with defaults, writs or summons paid over 12 months ago accepted.' Specialist tiers only."
      },
      "paidDefaultMinAgeMonths": {
        "value": 12,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — p4, p9",
        "confidence": "high",
        "status": "verified",
        "note": "Paid more than 12 months before application. Unpaid listings need to be more than 24 months old."
      },
      "unpaidDefaultsAccepted": {
        "value": true,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — p4, p9",
        "confidence": "high",
        "status": "verified",
        "note": "'Applicants with defaults, writs or summons listed over 24 months ago, paid or unpaid accepted.' Specialist tiers only."
      },
      "judgmentsAccepted": {
        "value": true,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Specialist product parameters p9",
        "confidence": "high",
        "status": "verified",
        "note": "Under $2,000 considered; paid more than 12 months ago considered; listed more than 2 years ago considered."
      },
      "writsAccepted": {
        "value": true,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Specialist product parameters p9",
        "confidence": "high",
        "status": "verified",
        "note": "Writs and summonses are treated on the same terms as defaults and judgements."
      },
      "bankruptcyDischargedMinYears": {
        "value": 0,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Specialist product matrix p3, p4",
        "confidence": "high",
        "status": "verified",
        "note": "Specialist Clear requires only that the bankruptcy is 'Discharged' — no minimum time since discharge is stated. Remarkably, Specialist Plus and Assist accept a CURRENT (undischarged) bankruptcy: Plus 'Current but entered two or more years ago', Assist 'Current but entered less than two years ago'."
      },
      "maxArrears6Months": {
        "value": 0,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Specialist product matrix p3, p4",
        "confidence": "medium",
        "status": "verified",
        "note": "MORTGAGE arrears, Specialist Clear: 'Less than 1'. Specialist Plus: 'Less than 3'. Specialist Assist: 'Unlimited'. The guide does not state the window these are measured over, so the 6-month field is used as the closest match — treat the window as unpublished. 'The definition of Mortgage Arrears is full payments missed / in arrears.'"
      },
      "notes": {
        "value": "'If the applicant fits into more than one credit rating, the highest level is to apply.' First home buyers are restricted to Specialist Clear and Plus. Resimac's approved credit reference agency is Equifax; credit reports must be current and no older than 21 days at submission, and cannot be accessed without the applicant's written consent. Credit reports are required for individual applicants (consumer and commercial enquiries), company and company-trustee entities, and applicable guarantors.",
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Specialist product parameters p9",
        "confidence": "high",
        "status": "verified",
        "note": null
      }
    },
    "security": {
      "acceptablePropertyTypes": {
        "value": [
          "Residential or rural residential properties up to ten hectares (25 acres)",
          "Residential properties greater than 40sqm (exclusive of balconies and parking)",
          "Vacant residential land in Category 1 localities only, as collateral security to a maximum 50% of total gross security value, max LVR 80% for residential allotments"
        ],
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Specialist product parameters, 'Acceptable security properties' p9",
        "confidence": "high",
        "status": "verified",
        "note": "This list is from the SPECIALIST product parameters. Vacant land must have kerbed and sealed road access and water, sewerage and power connected or running immediately up to the boundary. Note that on PRIME, vacant land as sole security is unacceptable."
      },
      "unacceptablePropertyTypes": {
        "value": [
          "Properties not zoned Residential or Rural Residential",
          "Rural residential properties exceeding ten hectares (25 acres)",
          "Construction loans / development or partially completed dwellings",
          "Commercial or industrial properties",
          "Rural zoned, or commercial/mixed use properties having residential units above commercial shops",
          "Leasehold properties (excluding ACT Crown Land)",
          "Properties situated in a commercial or business area, even if zoned Residential",
          "Units under 30sqm living area on Prime; residential properties less than 40sqm on Specialist (excluding balconies and parking)",
          "Developments converted from another usage (office block, hotel or motel conversion)",
          "Holiday resorts",
          "University campus style accommodation",
          "Studio apartments or bed sitters with no separate bedroom; serviced apartments",
          "Apartments/flats with shared toilet facilities",
          "Units in retirement village complexes",
          "Units or townhouse developments that have not been strata titled",
          "Properties issued under Company Title",
          "Properties with more than two residences on the same title",
          "Mobile homes; owner builder, relocatable or kit homes; time share",
          "Exhibition homes in display villages",
          "Flood, land slip or other adversely affected areas (Specialist: less than 1:100 year flood is unacceptable)",
          "Areas affected by high tension powerlines or motorways; mine subsidence",
          "Contaminated or potentially contaminated sites",
          "Security currently used for business purposes (unless minimal cost to reconvert)",
          "Dilapidated or poorly maintained properties in need of major repairs",
          "Resumption orders or properties adversely affected by a local government or state planning scheme",
          "Heritage listing classification limiting future saleability; restrictive zoning or usage",
          "Unique or specialised properties, or those with restrictive usage or appeal",
          "A house with less than two bedrooms",
          "Properties not connected to normal town services such as water and electricity",
          "Income producing farms; income producing properties other than residential investment property",
          "Vacant land as sole security (Prime)",
          "Properties with less than 3 comparable sales, or an extended selling period",
          "Security located on an island without a sealed road connection to the mainland",
          "Residential improvement value less than 10% of the value of the property",
          "Ownership of more than 4 or 25% of residential units in any single development, whichever is lower"
        ],
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — 'Unacceptable security properties' pp8-9",
        "confidence": "high",
        "status": "verified",
        "note": "Merged from the Prime (p8) and Specialist (p9) unacceptable-security lists; where the two differ the tier is named in the entry."
      },
      "minUnitFloorAreaSqm": {
        "value": 30,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Prime product parameters p8",
        "confidence": "high",
        "status": "verified",
        "note": "PRIME: 'Units under 30sqm in living area (whereby this area measurement excludes balconies, courtyards and car spaces)' are unacceptable. SPECIALIST is stricter: 'Residential properties less than 40sqm (exclusive of balconies and parking)' are unacceptable."
      },
      "maxLandSizeHa": {
        "value": 10,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — pp8-9",
        "confidence": "high",
        "status": "verified",
        "note": "'Rural residential properties exceeding ten hectares (25 acres)' are unacceptable security."
      },
      "postcodeRestrictionsPublished": {
        "value": true,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — 'Acceptable property locations' pp8-9",
        "confidence": "high",
        "status": "verified",
        "note": "Category 1/2/3 locations drive both max LVR and max loan amount. 'To view Resimac's Acceptable Property Locations go to www.resimac.com.au, select the Acceptable Property Locations tool and follow the prompts in the secure area.' The tool sits behind a login, so the category for a given postcode cannot be cited from a public source."
      },
      "ruralResidentialAccepted": {
        "value": true,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — pp8-9",
        "confidence": "high",
        "status": "verified",
        "note": "Accepted up to ten hectares (25 acres). Rural-ZONED property, and income-producing farms, are not accepted."
      },
      "companyTitleAccepted": {
        "value": false,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Prime unacceptable securities p8",
        "confidence": "high",
        "status": "verified",
        "note": "'Properties issued under Company Title' listed as unacceptable security."
      },
      "leaseholdAccepted": {
        "value": false,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — pp8-9",
        "confidence": "high",
        "status": "verified",
        "note": "'Leasehold properties (excluding ACT Crown Land)' are unacceptable — i.e. ACT Crown lease IS acceptable."
      },
      "strataAccepted": {
        "value": true,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Prime unacceptable securities p8",
        "confidence": "medium",
        "status": "verified",
        "note": "Inferred from the decline of the opposite case: 'Units or townhouse developments that have not been strata titled' are unacceptable, so strata title is required rather than merely permitted."
      },
      "servicedApartmentAccepted": {
        "value": false,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Specialist unacceptable securities p9",
        "confidence": "high",
        "status": "verified",
        "note": "'Studio and Serviced apartments' listed as unacceptable."
      },
      "studentAccommodationAccepted": {
        "value": false,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Prime unacceptable securities p8",
        "confidence": "high",
        "status": "verified",
        "note": "'University campus style accommodation' listed as unacceptable."
      },
      "displayHomeLeasebackAccepted": {
        "value": false,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — pp8-9",
        "confidence": "high",
        "status": "verified",
        "note": "'Exhibition homes in display villages' (Prime) / 'Exhibition homes' (Specialist) listed as unacceptable."
      },
      "maxSecurities": {
        "value": 4,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — pp8-9",
        "confidence": "high",
        "status": "verified",
        "note": "'Ownership of more than 4 or 25% of residential units in any single development, whichever is the lower' is unacceptable, as is 'Total exposure of more than 4 or 25% to Resimac Limited of residential units in any single development'. This is a per-development concentration cap."
      },
      "notes": {
        "value": "Valuations must come from an approved Resimac panel valuer (a separate Specialist Lending panel applies to Specialist loans), be addressed to Resimac Limited, be extended for use by the security trustee (Perpetual Trustee Company Limited) and the mortgage insurer, and be no more than 90 days old at settlement. Partial discharge requires a written signed request and a formal credit assessment; if the remaining security valuation is more than 6 months old a revaluation is required, and if the remaining security has moved to a worse location category the LVR must be reduced to that category's maximum.",
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Valuation report / Partial discharge pp8-9",
        "confidence": "high",
        "status": "verified",
        "note": null
      }
    },
    "product": {
      "minLoanAmount": {
        "value": 50000,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Product matrix pp2-3",
        "confidence": "high",
        "status": "verified",
        "note": "Prime Standard, Prime Alt Doc and all Specialist tiers: $50k. Prime Flex is higher at $150k."
      },
      "maxLoanAmount": {
        "value": 3500000,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Product matrix p2",
        "confidence": "high",
        "status": "verified",
        "note": "$3.5m across Prime Flex, Standard and Alt Doc. Specialist Clear $2.5m, Specialist Plus $1.5m, Specialist Assist $1m. With LMI the Prime matrix reaches $5.0m at up to 95% LVR. Maximum aggregate loan exposure to the group is $5,000,000."
      },
      "maxLoanTermYears": {
        "value": 30,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Product matrix pp2-3",
        "confidence": "high",
        "status": "verified",
        "note": "'15 - 30 years' on every product — note the MINIMUM term of 15 years, which is unusual and can knock out short-term requests."
      },
      "maxInterestOnlyYearsOwnerOcc": {
        "value": 5,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Product matrix p2",
        "confidence": "high",
        "status": "verified",
        "note": "Prime Flex and Standard: '1 - 10 years (O/O max. 5 years & 80% LVR)'. So owner-occupied interest only is capped at 5 years AND 80% LVR. Prime Alt Doc: 1-5 years with O/O max 80% LVR. All Specialist tiers: 1-5 years, O/O max 80% LVR."
      },
      "maxInterestOnlyYearsInvestment": {
        "value": 10,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Product matrix p2",
        "confidence": "high",
        "status": "verified",
        "note": "Prime Flex and Standard allow interest only of 1-10 years; the 5-year cap is expressly an owner-occupied restriction. Prime Alt Doc and all Specialist tiers are 1-5 years."
      },
      "offsetAvailable": {
        "value": true,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Features pp2-3",
        "confidence": "high",
        "status": "verified",
        "note": "'Multiple Offsets available' on both Prime and Specialist."
      },
      "redrawAvailable": {
        "value": true,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Features pp2-3",
        "confidence": "high",
        "status": "verified",
        "note": "'Redraw available' on both Prime and Specialist."
      },
      "constructionAvailable": {
        "value": false,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Unacceptable security properties pp8-9",
        "confidence": "high",
        "status": "verified",
        "note": "'Construction loans' (Prime) and 'Construction, development or partially completed dwellings' (Specialist) are listed as unacceptable security. Resimac is a knock-out for any construction scenario."
      },
      "genuineSavingsRequiredPct": {
        "value": 0.05,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Prime product parameters, Full Doc loan p8",
        "confidence": "high",
        "status": "verified",
        "note": "Quote: 'Where the LVR is >90%, the applicant(s) must demonstrate a deposit source of at least 5% of the proposed purchase price held in an account in the name of at least one applicant. Borrowed funds are not acceptable as a deposit source.'"
      },
      "genuineSavingsRequiredAboveLvrPct": {
        "value": 90,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — p8",
        "confidence": "high",
        "status": "verified",
        "note": "Below 90% LVR no genuine-savings requirement is stated."
      },
      "giftedDepositAccepted": {
        "value": true,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — 'Funds to complete - all products' p8",
        "confidence": "high",
        "status": "verified",
        "note": "'Gift from an immediate family member' is an acceptable source of funds to complete. Note this does NOT displace the >90% LVR requirement for 5% held in an applicant's own account."
      },
      "giftedDepositConditions": {
        "value": "Acceptable funds to complete across all products: funds held or accumulated in bank accounts; First Home Owner Grant, First Home Saver Account or First Home Super Saver Scheme; equity in or proceeds from the sale of a residential property; shares; accelerated loan repayments; employer bonus; inheritance; sale of assets (boat, car etc.); funds held in a company or business name; and a gift from an immediate family member.",
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — p8",
        "confidence": "high",
        "status": "verified",
        "note": "Unacceptable sources of equity: a favourable purchase involving a government subsidy/equity scheme; vendor finance; developer cash backs or vendor-assisted deposits; rent-to-buy arrangements where rent is refunded on settlement; Bartercard/trade dollars."
      },
      "governmentSchemesSupported": {
        "value": [
          "First Home Owner Grant",
          "First Home Saver Account",
          "First Home Super Saver Scheme"
        ],
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — 'Funds to complete - all products' p8",
        "confidence": "medium",
        "status": "verified",
        "note": "These are named as acceptable sources of funds to complete, which is not quite the same as participating in the scheme as a panel lender. Importantly, the opposite is expressly declined: 'Favourable purchase involving some form of government subsidy / equity scheme' is an unacceptable source of equity. Resimac's participation (or not) in the Home Guarantee Scheme is not stated in this guide."
      },
      "notes": {
        "value": "Only one applicant type (Individual, Company or Trust) per application — e.g. 'John Smith & Smith and Co Pty Limited would be an unacceptable loan structure'. Borrowers must be natural persons (PAYG, sole trader or partnership) who are Australian or NZ residents/citizens over 18. Fees: Prime lenders application/settlement fee $199 (Standard/Flex) or $599 (Alt Doc); Specialist $949; Prime Flex also carries a $299 annual fee. Legal fees are nil for standard loans (individual borrower, single security) but higher for non-standard loans (additional securities, companies, guarantees, trusts). Cash out: Prime without LMI unlimited to 80% LVR; Prime with LMI unlimited to 85% and restricted to 20% of security value from 85.01-90%; Alt Doc no limit to 80%; Specialist Clear and Plus unlimited to 80%; Specialist Assist and refinance of solicitor loans limited to $10,000 and 80% LVR; not available for non-residents.",
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — pp2-3, 6, 8, 9",
        "confidence": "high",
        "status": "verified",
        "note": null
      }
    },
    "residency": {
      "rules": {
        "value": [
          {
            "status": "australian_citizen",
            "accepted": true,
            "maxLvrPct": null,
            "conditions": "'Natural person/s (either PAYG, Sole trader or Partnership) who are Australian or NZ residents/citizens over 18 years old.'"
          },
          {
            "status": "permanent_resident",
            "accepted": true,
            "maxLvrPct": null,
            "conditions": "Australian residents are named as acceptable borrowers."
          },
          {
            "status": "nz_citizen_444",
            "accepted": true,
            "maxLvrPct": null,
            "conditions": "New Zealand residents/citizens are expressly named alongside Australians as acceptable borrowers."
          },
          {
            "status": "expat_citizen_overseas",
            "accepted": true,
            "maxLvrPct": 70,
            "conditions": "This is Resimac's 'non-resident' category: 'A non-resident is deemed to be a citizen and/or permanent resident of Australia or New Zealand who resides and is employed in another country.' Investment properties only; maximum lending amount $750,000; maximum LVR 70%; country restrictions apply; must be a High Net Worth Borrower with net surplus assets greater than $500,000 (international assets permitted); non-resident self-employed, company or business borrowers are excluded; a certified passport copy is required (by an Australian Consular Officer if the applicant has not entered Australia); loan documents executed overseas must be witnessed by an Australian Consular Officer; an irrevocable undertaking to accept service at a physical Australian address (not a PO Box) is required; cash out is not available."
          }
        ],
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Borrowers / Non-resident loan conditions p8",
        "confidence": "high",
        "status": "verified",
        "note": "Temporary-visa holders and genuinely foreign (non-Australian/NZ) buyers are NOT addressed anywhere in this guide — no rule is recorded for them rather than inferring a decline."
      },
      "foreignIncomeShadingPct": {
        "value": 0.9,
        "asAt": "2025-09-25",
        "sourceUrl": "https://cdn.prod.website-files.com/691e099580b3d5209597570c/693766c095916dcf030eb307_RES_Product-Guide_Broker.pdf",
        "sourceTitle": "Resimac Broker Product Guide 25 Sep 2025 — Non-resident loan conditions p8",
        "confidence": "high",
        "status": "verified",
        "note": "'A maximum of 90% of overseas income converted to Australian dollars may be used for serviceability purposes.'"
      }
    },
    "version": 1,
    "effectiveFrom": "2025-09-25",
    "researchedAt": "2026-07-29",
    "researchedBy": "research:claude-opus-5",
    "gaps": [
      "PRIMARY DATE RISK: the most recent Resimac broker product guide findable on a public, no-login URL is dated 25 September 2025 — ten months old. Resimac's own Product & Policy Updates page could not be read (it renders empty to a fetcher), and a search result indicates 'HEM living expenses apply from 18 February 2026', which post-dates this guide. Treat the servicing figures as needing re-confirmation.",
      "No published DTI cap. Resimac publishes a net surplus ratio test (1.00x plus $200 annual surplus) instead.",
      "hemBasis not recorded. The Sept 2025 guide does not name a living-expense benchmark; a Feb 2026 update reportedly introduced HEM but the detail is not on a public page.",
      "No investment-purpose max LVR. The guide says only 'Loan amounts are for owner occupied purposes. Investment purpose loans may be lower' and refers to the Helia LMI guidelines.",
      "The Specialist loan-amount matrix (Clear/Plus/Assist by location category and LVR band, p5) was not transcribed — its column alignment could not be reconstructed reliably from the PDF text layer. Only the Prime bands are recorded in lvrBands.",
      "Minimum-duration cells for overtime, maintenance payments, bonuses and dividends in the p7 income table are ambiguous in the extracted text; those specific numbers should be re-read from the visual PDF.",
      "No published maximum applicant age at maturity, exit-strategy age, or maximum employment gap.",
      "No published guarantor policy — guarantees are mentioned only in the legal-fee schedule as making a loan 'non-standard'.",
      "No published minimum credit score, maximum enquiries, payday-lending policy or gambling policy.",
      "Location Category 1/2/3 lists sit behind the broker login (Acceptable Property Locations tool), so a specific postcode's category cannot be sourced publicly.",
      "SMSF lending is not covered in this guide; Resimac's SMSF offering (if any) was not researched.",
      "Casual employment minimum tenure is recorded as 6 months at medium confidence — re-read the p7 table visually to confirm."
    ]
  }
]`;

/** 9 lender policy records. */
const PACK = JSON.parse(RAW) as LenderPolicy[];

export default PACK;
