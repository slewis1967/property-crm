/**
 * Lender policy taxonomy — the shape of "what one Australian home-loan lender
 * will and won't do", expressed so a machine can check a client scenario
 * against it.
 *
 * Pure types + vocabularies only. No I/O, no React. The rules that read these
 * live in `verify.ts` (is this fact trustworthy?) and `match.ts` (does this
 * client fit?).
 *
 * ── THE ONE NON-NEGOTIABLE ────────────────────────────────────────────────
 * Every policy value is a `Fact<T>`, and a `Fact` with no `sourceUrl` or no
 * `asAt` date is NOT a policy fact — it is a guess, and guesses must never
 * reach the matching engine. `verify.ts` demotes them to `unverified`, and
 * `match.ts` returns `unknown` (never `pass`) for any check that would have to
 * rely on one. A wrong "this lender will approve you" is far more damaging
 * than "we don't know yet" — the whole design bends toward saying "unknown".
 *
 * ── WHY EVERYTHING IS OPTIONAL ────────────────────────────────────────────
 * Lender policy documents are inconsistent. A research pass will find the
 * assessment buffer for every lender and the exact casual-employment tenure
 * rule for maybe a third. Fields are therefore `Fact<T> | undefined`
 * throughout: an absent field means "not researched / not published", which is
 * a different and honest state from `{ value: null, status: 'not_found' }`
 * ("we looked, the lender doesn't publish it"). Both are handled; neither is
 * ever silently treated as a pass.
 *
 * ── NOT CREDIT ADVICE ─────────────────────────────────────────────────────
 * This models published broker-facing policy for internal research. It is not
 * a credit decision, not a pre-approval, and not consumer-facing credit advice.
 * Only the lender's own assessor can approve a loan.
 */

// ─── Provenance: the wrapper every policy value wears ───────────────────────

/** How sure the researcher was that the value is what the source actually says. */
export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;
export type Confidence = (typeof CONFIDENCE_LEVELS)[number];

/**
 * Trust state of a single fact. Assigned by `verify.ts`, never by the
 * researcher — a research agent supplies evidence, not its own clearance.
 *
 * - `verified`        — has a source URL + as-at date, value is in range, and
 *                       confidence is high enough to act on. Usable in matching.
 * - `unverified`      — recorded, but something is missing//implausible/low
 *                       confidence. Visible in the UI, EXCLUDED from matching.
 * - `not_found`       — we looked and the lender doesn't publish it. Honest gap.
 * - `human_confirmed` — a broker checked it against the real policy document or
 *                       their BDM. Outranks everything; never auto-overwritten.
 */
export const FACT_STATUSES = ["verified", "unverified", "not_found", "human_confirmed"] as const;
export type FactStatus = (typeof FACT_STATUSES)[number];

/** Statuses whose value the matching engine is allowed to rely on. */
export const MATCHABLE_STATUSES: readonly FactStatus[] = ["verified", "human_confirmed"];

/**
 * A single policy value plus everything needed to defend it.
 *
 * `asAt` is a plain 'YYYY-MM-DD' — lender policy changes on a date, not at an
 * instant, and mixing timezones into it only creates off-by-one arguments.
 */
export type Fact<T> = {
  value: T | null;
  /** Date the source document was published/current, 'YYYY-MM-DD'. Required. */
  asAt: string | null;
  /** Public, resolvable URL of the broker policy doc/page. Required. */
  sourceUrl: string | null;
  /** Human label for the source, e.g. "Broker Credit Policy Guide v14". */
  sourceTitle?: string | null;
  confidence: Confidence;
  status: FactStatus;
  /** Caveats, exceptions, "applies only to PAYG", etc. */
  note?: string | null;
  /** Who last touched it: 'research:<model>' or an operator email. */
  updatedBy?: string | null;
  updatedAt?: string | null;
};

/** A fact whose value is a free-text rule the engine can show but not evaluate. */
export type TextFact = Fact<string>;
export type NumberFact = Fact<number>;
export type BoolFact = Fact<boolean>;
export type ListFact = Fact<string[]>;

// ─── The lender itself ──────────────────────────────────────────────────────

/**
 * Lender tiers. Chosen to match how a broker actually reasons about a panel —
 * "who will look at this" — not APRA's legal classification.
 */
export const LENDER_TIERS = [
  "major_bank", // CBA, Westpac, NAB, ANZ
  "regional_bank", // Bendigo, BOQ, Suncorp, ME, Bank of us...
  "mutual_bank", // customer-owned: Great Southern, Newcastle Permanent, Beyond, P&N...
  "foreign_bank", // HSBC, Citi-successors, Bank of China, ICBC
  "non_bank", // Pepper, Liberty, Resimac, Firstmac, Bluestone, La Trobe
  "neobank_digital", // Athena, Unloan, Tiimely (Tic:Toc), Up
  "specialist_near_prime", // credit-impaired / alt-doc specialists
  "white_label", // aggregator-badged product on someone else's funding
  "other",
] as const;
export type LenderTier = (typeof LENDER_TIERS)[number];

export const LENDER_STATUSES = ["active", "paused", "withdrawn", "research_only"] as const;
export type LenderStatus = (typeof LENDER_STATUSES)[number];

// ─── Servicing parameters — the per-lender layer over utils/finance/capacity ─

/** How a lender assesses a debt the client already has elsewhere. */
export const COMMITMENT_TREATMENTS = [
  "actual_repayment", // take the repayment as stated
  "benchmark", // apply the lender's own benchmark (e.g. 3.8% of card limit)
  "greater_of", // greater of actual and benchmark — the common conservative rule
  "buffered_actual", // actual repayment stressed at a buffered rate
  "unknown",
] as const;
export type CommitmentTreatment = (typeof COMMITMENT_TREATMENTS)[number];

/** Which household-expenditure benchmark floors declared living expenses. */
export const HEM_BASES = ["hem", "hpi", "internal_benchmark", "declared_only", "unknown"] as const;
export type HemBasis = (typeof HEM_BASES)[number];

export type ServicingPolicy = {
  /**
   * Percentage points added to the product rate to get the assessment rate.
   * APRA's prudential expectation has been +3.00 since Oct 2021; several
   * lenders sit above it and a few run exception buffers of 1.00 for
   * like-for-like refinance.
   */
  assessmentBufferPct?: NumberFact;
  /** Assessment-rate floor — assessed at max(product rate + buffer, floor). */
  assessmentFloorRatePct?: NumberFact;
  /** Reduced buffer available on a like-for-like refinance, if published. */
  refinanceBufferPct?: NumberFact;

  /** Fraction of gross rent counted as income, e.g. 0.80. */
  rentShadingPct?: NumberFact;
  /** Whether shading is instead of, or on top of, itemised holding costs. */
  rentShadingBasis?: TextFact;

  /** Treatment of existing external debts. */
  existingCommitmentTreatment?: Fact<CommitmentTreatment>;
  /** Monthly assessment on a credit card LIMIT, as a fraction, e.g. 0.038. */
  creditCardAssessmentPct?: NumberFact;
  /** Minimum monthly assessment on a BNPL facility, if published. */
  bnplTreatment?: TextFact;
  /** HECS/HELP treatment — some lenders ignore a balance under a threshold. */
  hecsTreatment?: TextFact;

  /** Living-expense benchmark used as the floor. */
  hemBasis?: Fact<HemBasis>;
  /** Multiplier applied to the benchmark, if the lender loads it (e.g. 1.10). */
  hemLoadingPct?: NumberFact;

  /** Hard debt-to-income cap, e.g. 6.0. Null = no published hard cap. */
  dtiCap?: NumberFact;
  /** DTI above which the file is referred/scrutinised rather than declined. */
  dtiReferThreshold?: NumberFact;

  /**
   * Whether the lender adds back the tax benefit of a negatively geared
   * property to assessable income. Materially changes investor capacity.
   */
  negativeGearingAddBack?: BoolFact;
  /** Whether depreciation is added back on top of the gearing benefit. */
  depreciationAddBack?: BoolFact;

  /** Notional interest-only loading, or the term used to assess an IO loan. */
  interestOnlyAssessment?: TextFact;
  /** Term used to assess the residual after an IO period, in years. */
  ioResidualTermYears?: NumberFact;

  /** Anything material that doesn't fit a field above. */
  notes?: TextFact;
};

// ─── LVR / LMI ──────────────────────────────────────────────────────────────

/** One row of an LVR band → maximum loan size matrix. */
export type LvrBand = {
  /** Upper bound of the band, inclusive, as a percentage (e.g. 90). */
  maxLvrPct: number;
  /** Maximum loan amount at this LVR, in dollars. Null = no published cap. */
  maxLoanAmount: number | null;
  /** Free-text qualifier ("metro postcodes only", "PAYG only"). */
  qualifier?: string | null;
};

export type LvrPolicy = {
  maxLvrOwnerOccupiedPct?: NumberFact;
  maxLvrInvestmentPct?: NumberFact;
  /** Highest LVR reachable without LMI (excluding waivers/guarantees). */
  maxLvrNoLmiPct?: NumberFact;
  /** Cash-out / equity-release ceiling, usually below the purchase ceiling. */
  maxLvrCashOutPct?: NumberFact;
  maxLvrConstructionPct?: NumberFact;
  maxLvrRefinancePct?: NumberFact;
  /** Ceiling for a company/trust borrower, where it differs. */
  maxLvrCompanyTrustPct?: NumberFact;
  /** Whether LMI can be capitalised on top of the maximum LVR. */
  lmiCapitalisable?: BoolFact;
  /** Whether LMI premium sits inside or outside the stated max LVR. */
  lmiInclusiveOfMaxLvr?: BoolFact;
  /** LMI provider(s): Helia, QBE, self-insured, etc. */
  lmiProvider?: ListFact;
  /**
   * Occupations with an LMI waiver to 90% (commonly medical) or 95%
   * (some lenders). Free-text entries, matched case-insensitively.
   */
  lmiWaiverProfessions?: ListFact;
  lmiWaiverMaxLvrPct?: NumberFact;
  /** The LVR-band → max-loan matrix, largest constraint per band. */
  lvrBands?: Fact<LvrBand[]>;
  notes?: TextFact;
};

// ─── Income types ───────────────────────────────────────────────────────────

/**
 * The income vocabulary. Deliberately granular: "casual" and "overtime" are
 * different policy questions even for the same person, and the whole point of
 * this database is that the difference decides the lender.
 */
export const INCOME_TYPES = [
  "payg_permanent_full_time",
  "payg_permanent_part_time",
  "payg_probation",
  "payg_casual",
  "payg_fixed_term_contract",
  "payg_contractor_abn",
  "overtime_essential_services", // police/nurse/fire — often 100%
  "overtime_other",
  "bonus",
  "commission",
  "shift_allowance",
  "car_allowance",
  "self_employed_sole_trader",
  "self_employed_company",
  "self_employed_trust",
  "rental_residential",
  "rental_commercial",
  "boarder_income",
  "government_family_tax_benefit",
  "government_age_pension",
  "government_disability_support",
  "government_carer_payment",
  "government_jobseeker",
  "government_parenting_payment",
  "child_support_maintenance",
  "dividends",
  "trust_distributions",
  "superannuation_pension",
  "annuity",
  "foreign_income",
  "second_job",
  "share_scheme",
] as const;
export type IncomeType = (typeof INCOME_TYPES)[number];

export type IncomeTypeRule = {
  type: IncomeType;
  /** Is it accepted at all? */
  accepted: boolean | null;
  /** Fraction counted, e.g. 0.80 for shaded overtime. 1 = full. */
  shadingPct?: number | null;
  /** Minimum months of history required in this income. */
  minHistoryMonths?: number | null;
  /** Evidence the lender wants (payslips, ATO NOA, 2 yrs financials...). */
  evidence?: string | null;
  /** Conditions/exclusions in the lender's words. */
  conditions?: string | null;
};

export type IncomePolicy = {
  /** Per-income-type rules. One fact wrapping the whole table so the source
   *  URL and as-at date attach to the policy document they came from. */
  rules?: Fact<IncomeTypeRule[]>;
  /** Overall stance on alt-doc / low-doc lending. */
  altDocAvailable?: BoolFact;
  altDocEvidence?: TextFact;
  altDocMaxLvrPct?: NumberFact;
  /** Years of self-employed financials normally required. */
  selfEmployedMinYears?: NumberFact;
  /** Whether one year's financials is accepted as an exception. */
  oneYearFinancialsAccepted?: BoolFact;
  notes?: TextFact;
};

// ─── Employment tenure ──────────────────────────────────────────────────────

export type EmploymentPolicy = {
  /** Minimum months in the CURRENT job for a permanent PAYG applicant. */
  minMonthsCurrentJob?: NumberFact;
  /** Whether the requirement is waived for same-industry continuity. */
  sameIndustryContinuityAccepted?: BoolFact;
  minMonthsSameIndustry?: NumberFact;
  /** Probation: accepted at all, and on what terms. */
  probationAccepted?: BoolFact;
  probationConditions?: TextFact;
  minMonthsCasual?: NumberFact;
  minMonthsContract?: NumberFact;
  /** Minimum remaining term on a fixed-term contract, months. */
  minContractRemainingMonths?: NumberFact;
  minMonthsSelfEmployedAbn?: NumberFact;
  minMonthsGstRegistered?: NumberFact;
  /** Maximum acceptable gap in employment history, months. */
  maxEmploymentGapMonths?: NumberFact;
  notes?: TextFact;
};

// ─── Credit history knock-outs ──────────────────────────────────────────────

export type CreditPolicy = {
  /** Maximum number of listed defaults tolerated. 0 = any default declines. */
  maxDefaults?: NumberFact;
  /** Dollar value under which a default is disregarded (often telco/utility). */
  defaultIgnoredUnderAmount?: NumberFact;
  /** Whether PAID defaults are acceptable, and how old they must be. */
  paidDefaultsAccepted?: BoolFact;
  paidDefaultMinAgeMonths?: NumberFact;
  unpaidDefaultsAccepted?: BoolFact;
  judgmentsAccepted?: BoolFact;
  writsAccepted?: BoolFact;
  /** Years since discharge before bankruptcy is acceptable. */
  bankruptcyDischargedMinYears?: NumberFact;
  partIxDischargedMinYears?: NumberFact;
  /** Missed repayments allowed on existing credit in the last 6/12 months. */
  maxArrears6Months?: NumberFact;
  maxArrears12Months?: NumberFact;
  /** Minimum comprehensive credit score, where the lender publishes one. */
  minCreditScore?: NumberFact;
  /** Maximum credit enquiries in 6 months before it becomes an issue. */
  maxEnquiries6Months?: NumberFact;
  /** Stance on payday lending / small-amount credit contracts in statements. */
  paydayLendingPolicy?: TextFact;
  /** Stance on gambling transactions in statements. */
  gamblingPolicy?: TextFact;
  notes?: TextFact;
};

// ─── Security / property ────────────────────────────────────────────────────

export type SecurityPolicy = {
  /** Property types accepted as security (free text list). */
  acceptablePropertyTypes?: ListFact;
  /** Types explicitly declined. */
  unacceptablePropertyTypes?: ListFact;
  /** Minimum internal floor area for a unit/apartment, m² (commonly 40–50). */
  minUnitFloorAreaSqm?: NumberFact;
  /** Maximum land size for a residential security, hectares. */
  maxLandSizeHa?: NumberFact;
  /** Whether the lender publishes a restricted/category postcode list. */
  postcodeRestrictionsPublished?: BoolFact;
  /** URL of that list — brokers need the document, not our paraphrase. */
  postcodeListUrl?: TextFact;
  /** LVR cap in a category-2/3 (restricted) postcode. */
  restrictedPostcodeMaxLvrPct?: NumberFact;
  /** High-density-apartment policy (the classic "> 6 storeys / > 30% of a
   *  development" restriction). */
  highDensityPolicy?: TextFact;
  highDensityMaxLvrPct?: NumberFact;
  ruralResidentialAccepted?: BoolFact;
  ruralMaxLvrPct?: NumberFact;
  companyTitleAccepted?: BoolFact;
  leaseholdAccepted?: BoolFact;
  strataAccepted?: BoolFact;
  offThePlanAccepted?: BoolFact;
  servicedApartmentAccepted?: BoolFact;
  studentAccommodationAccepted?: BoolFact;
  displayHomeLeasebackAccepted?: BoolFact;
  nrasAccepted?: BoolFact;
  sdaNdisAccepted?: BoolFact;
  /** Maximum number of securities / units in one development. */
  maxSecurities?: NumberFact;
  notes?: TextFact;
};

// ─── Product / loan parameters ──────────────────────────────────────────────

export type ProductPolicy = {
  minLoanAmount?: NumberFact;
  maxLoanAmount?: NumberFact;
  maxLoanTermYears?: NumberFact;
  maxInterestOnlyYearsOwnerOcc?: NumberFact;
  maxInterestOnlyYearsInvestment?: NumberFact;
  offsetAvailable?: BoolFact;
  redrawAvailable?: BoolFact;
  constructionAvailable?: BoolFact;
  bridgingAvailable?: BoolFact;
  smsfLendingAvailable?: BoolFact;
  /** Minimum genuine-savings requirement as a fraction of price (e.g. 0.05). */
  genuineSavingsRequiredPct?: NumberFact;
  /** LVR above which genuine savings are required at all. */
  genuineSavingsRequiredAboveLvrPct?: NumberFact;
  /** Months the savings must have been held. */
  genuineSavingsMinMonths?: NumberFact;
  /** Whether 6/12 months of rental ledger substitutes for genuine savings. */
  rentalLedgerAsGenuineSavings?: BoolFact;
  giftedDepositAccepted?: BoolFact;
  giftedDepositConditions?: TextFact;
  /** Participation in first-home schemes (HGS/FHG, state schemes). */
  governmentSchemesSupported?: ListFact;
  guarantorAccepted?: BoolFact;
  guarantorConditions?: TextFact;
  /** Maximum applicant age at loan maturity / exit-strategy trigger age. */
  maxAgeAtMaturity?: NumberFact;
  exitStrategyRequiredOverAge?: NumberFact;
  notes?: TextFact;
};

// ─── Residency / visa ───────────────────────────────────────────────────────

export const RESIDENCY_STATUSES = [
  "australian_citizen",
  "permanent_resident",
  "nz_citizen_444",
  "temporary_visa_work",
  "temporary_visa_student",
  "temporary_visa_partner_309_820",
  "expat_citizen_overseas",
  "foreign_non_resident",
] as const;
export type ResidencyStatus = (typeof RESIDENCY_STATUSES)[number];

export type ResidencyRule = {
  status: ResidencyStatus;
  accepted: boolean | null;
  maxLvrPct?: number | null;
  conditions?: string | null;
};

export type ResidencyPolicy = {
  rules?: Fact<ResidencyRule[]>;
  /** Visa subclasses explicitly named as acceptable. */
  acceptedVisaSubclasses?: ListFact;
  /** Fraction of foreign-currency income counted. */
  foreignIncomeShadingPct?: NumberFact;
  acceptedForeignCurrencies?: ListFact;
  firbRequiredNote?: TextFact;
  notes?: TextFact;
};

// ─── The whole record ───────────────────────────────────────────────────────

/**
 * One lender's policy as at a point in time.
 *
 * `id` is a stable slug ('cba', 'pepper-money') — it is the join key between
 * the committed research pack, the Supabase row and the UI route, so it must
 * never be regenerated.
 */
export type LenderPolicy = {
  id: string;
  name: string;
  legalName?: string | null;
  tier: LenderTier;
  status: LenderStatus;
  /** Australian Credit Licence number, where published. */
  acl?: string | null;
  abn?: string | null;
  /** Broker/introducer site — the home of the policy documents. */
  brokerSiteUrl?: string | null;
  /** Direct link to the credit-policy guide used for this record. */
  policyDocUrl?: string | null;
  /** Who actually funds/underwrites it, for white-label products. */
  funder?: string | null;
  /** Aggregator panels the lender sits on, if known. */
  panels?: string[] | null;

  servicing: ServicingPolicy;
  lvr: LvrPolicy;
  income: IncomePolicy;
  employment: EmploymentPolicy;
  credit: CreditPolicy;
  security: SecurityPolicy;
  product: ProductPolicy;
  residency: ResidencyPolicy;

  /** Version of the record, bumped on every accepted research/edit pass. */
  version: number;
  /** Date this version of the policy takes effect, 'YYYY-MM-DD'. */
  effectiveFrom: string | null;
  /** Set when superseded by a newer version. Null = current. */
  effectiveTo?: string | null;
  /** Date of the research pass that produced it. */
  researchedAt?: string | null;
  researchedBy?: string | null;
  /** Free-text summary of what the researcher could NOT find. */
  gaps?: string[] | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
};

/** The section keys, in the order the UI shows them. */
export const POLICY_SECTIONS = [
  "servicing",
  "lvr",
  "income",
  "employment",
  "credit",
  "security",
  "product",
  "residency",
] as const;
export type PolicySection = (typeof POLICY_SECTIONS)[number];

export const SECTION_LABELS: Record<PolicySection, string> = {
  servicing: "Servicing & assessment",
  lvr: "LVR & LMI",
  income: "Income types",
  employment: "Employment tenure",
  credit: "Credit history",
  security: "Security & property",
  product: "Product & deposit",
  residency: "Residency & visa",
};

export const TIER_LABELS: Record<LenderTier, string> = {
  major_bank: "Major bank",
  regional_bank: "Regional bank",
  mutual_bank: "Mutual / customer-owned",
  foreign_bank: "Foreign bank",
  non_bank: "Non-bank",
  neobank_digital: "Neobank / digital",
  specialist_near_prime: "Specialist / near-prime",
  white_label: "White label",
  other: "Other",
};
