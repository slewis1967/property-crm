/**
 * PIA core calculation engine — single-property cashflow + tax + equity model.
 *
 * Produces a year-by-year schedule over the configured holding period. All
 * monetary values are AUD nominal (not inflation-adjusted unless the caller
 * explicitly applies a real-rate transform).
 *
 * Tax model: Australian PAYG investor with property held in personal name
 * (not SMSF — that's a separate model). Capital works (Div 43) and plant
 * & equipment (Div 40) depreciation are deductible against rental income;
 * the resulting taxable income gets multiplied by the marginal rate to
 * calculate the tax saving (negative gearing benefit) or extra tax (positive
 * gearing). CGT at sale uses the 50% individual discount if held >12 months.
 *
 * Loan model supports IO + P&I split (interest-only for first N years, then
 * P&I for the remaining term). Repayments are fixed monthly; interest is
 * recalculated on the declining balance.
 *
 * Disclaimer: this is advisor-grade modelling for client discussions. Real
 * property economics depend on property-specific QS depreciation schedules,
 * land tax, lender comparison rates, conveyancing costs, capital improvements,
 * tenant turnover etc. Treat outputs as directional, not contractual.
 */

export interface PiaInputs {
  // Property
  purchasePrice: number;
  weeklyRent: number;
  rentalGrowth: number;        // % per annum
  capitalGrowth: number;       // % per annum
  vacancyWeeks: number;        // weeks per year unoccupied

  // Annual property expenses (sum)
  rates: number;                // council rates
  insurance: number;            // landlord insurance
  bodyCorporate: number;        // strata / body corp
  managementPct: number;        // % of rent (typical 7-10)
  maintenancePct: number;       // % of rent (typical 1-2)
  propertyExpenseGrowth: number;// % p.a. — costs inflate

  // Acquisition costs (paid out of pocket at year 0)
  stampDuty: number;
  legalFees: number;
  buildingInspection: number;
  lenderFees: number;
  otherAcquisition: number;

  // Finance
  loanAmount: number;
  interestRate: number;         // % per annum
  loanTermYears: number;
  ioYears: number;              // years of IO before P&I; 0 = full P&I

  // Tax
  marginalTaxRate: number;      // % (combined federal + medicare)
  capitalWorksAnnual: number;   // Div 43 depreciation (typical 2.5% of build cost)
  plantEquipmentAnnual: number; // Div 40 depreciation (year 1; declines over schedule)
  plantEquipmentDeclineRate: number; // % decline per year of P&E remaining

  // Horizon
  holdingYears: number;         // 1-30
}

export interface YearRow {
  year: number;                 // 1-N
  effectiveRent: number;        // gross rent minus vacancy
  propertyExpenses: number;     // ongoing operating costs (excl. interest)
  interestPaid: number;         // year's interest payments
  principalPaid: number;        // year's principal repayments
  loanRepayments: number;       // sum of interest + principal
  loanBalance: number;          // end-of-year loan balance
  capitalWorks: number;         // Div 43 deduction this year
  plantEquipment: number;       // Div 40 deduction this year
  totalDeductions: number;      // operating + interest + depreciation
  taxableIncome: number;        // effectiveRent - totalDeductions (often negative)
  taxEffect: number;            // taxableIncome × marginalRate (negative = saving/refund)
  cashFlowBeforeTax: number;    // effectiveRent - operating - loanRepayments
  cashFlowAfterTax: number;     // cashFlowBeforeTax - taxEffect (subtract because saving is positive cash)
  propertyValue: number;        // end-of-year market value
  equity: number;               // propertyValue - loanBalance
}

/** Year-1 cashflow breakdown — "is it cashflow positive/negative, and by how much". */
export interface Cashflow {
  weeklyRent: number;
  annualRent: number;        // effective (after vacancy), year 1
  expenses: { rates: number; insurance: number; bodyCorporate: number; management: number; maintenance: number };
  totalExpenses: number;     // sum of the above (year 1)
  interestAnnual: number;    // year-1 loan interest
  loanRepaymentsAnnual: number; // year-1 repayments (interest, or interest+principal in P&I years)
  beforeTaxAnnual: number;   // rent − expenses − repayments (negative = out of pocket)
  taxBenefitAnnual: number;  // negative-gearing tax saving (positive number = benefit)
  afterTaxAnnual: number;    // before-tax + tax benefit
  weeklyBeforeTax: number;
  weeklyAfterTax: number;
  positiveBeforeTax: boolean;
  positiveAfterTax: boolean;
}

export interface PiaSummary {
  // KPIs
  grossYield: number;
  netYield: number;             // year-1 (rent - operating) / purchase
  initialCashRequired: number;  // deposit + acquisition costs
  totalAcquisitionCost: number;
  totalCashOutflow: number;     // sum of negative after-tax cashflow over holding years
  totalCashInflow: number;      // sum of positive after-tax cashflow
  netCashOverHolding: number;
  endValue: number;
  endEquity: number;
  endLoanBalance: number;
  capitalGain: number;          // gross before CGT
  cgtPayable: number;           // 50% discount if individual + held >12mo
  totalReturn: number;          // netCashOverHolding + (endEquity - initialCashRequired) - cgtPayable
  irrApprox: number;            // simple compounded return on initial cash, ignoring time-of-cashflows
  breakevenYear: number | null; // first year cashFlowAfterTax >= 0 (null if never)
  cashflow: Cashflow;           // year-1 positive/negative breakdown
  schedule: YearRow[];
}

const round = (n: number) => Math.round(isFinite(n) ? n : 0);

/** Standard P&I monthly payment formula. r = annual rate (decimal). */
function piMonthlyPayment(principal: number, annualRate: number, years: number): number {
  if (annualRate <= 0) return principal / (years * 12);
  const r = annualRate / 12;
  const n = years * 12;
  return (principal * r) / (1 - Math.pow(1 + r, -n));
}

/**
 * Walk the loan month-by-month for one year, return interest paid + principal
 * paid in that year and the closing balance. Handles IO transition: in IO
 * years, only interest is paid; on the IO→P&I boundary, principal repayments
 * begin and the full principal is amortised over the remaining years.
 */
function loanYearWalk(
  startBalance: number,
  annualRate: number,
  remainingYearsForPi: number, // years remaining for P&I amortisation
  isIoYear: boolean,
): { interest: number; principal: number; closingBalance: number; monthly: number } {
  if (startBalance <= 0) return { interest: 0, principal: 0, closingBalance: 0, monthly: 0 };
  const r = annualRate / 100 / 12;
  let balance = startBalance;
  let interest = 0;
  let principal = 0;
  let monthly: number;
  if (isIoYear) {
    monthly = balance * r;
    for (let m = 0; m < 12; m++) {
      const i = balance * r;
      interest += i;
    }
  } else {
    monthly = piMonthlyPayment(balance, annualRate / 100, remainingYearsForPi);
    for (let m = 0; m < 12; m++) {
      const i = balance * r;
      const p = Math.max(0, monthly - i);
      const actualPrincipal = Math.min(balance, p);
      balance -= actualPrincipal;
      interest += i;
      principal += actualPrincipal;
      if (balance <= 0) break;
    }
  }
  return { interest, principal, closingBalance: balance, monthly };
}

export function runPia(inputs: PiaInputs): PiaSummary {
  const annualRent = inputs.weeklyRent * 52;
  const vacancyAmount = inputs.weeklyRent * inputs.vacancyWeeks;
  const grossYield = (annualRent / inputs.purchasePrice) * 100;

  const totalAcquisition =
    inputs.stampDuty + inputs.legalFees + inputs.buildingInspection +
    inputs.lenderFees + inputs.otherAcquisition;
  const deposit = inputs.purchasePrice - inputs.loanAmount;
  const initialCashRequired = deposit + totalAcquisition;

  const schedule: YearRow[] = [];
  let loanBalance = inputs.loanAmount;
  let plantEquipmentRemaining = inputs.plantEquipmentAnnual;
  let totalCashIn = 0;
  let totalCashOut = 0;
  let breakevenYear: number | null = null;
  const remainingForPi = Math.max(1, inputs.loanTermYears - inputs.ioYears);

  // Year-1 net yield baseline (used for KPI display)
  const year1Operating =
    inputs.rates +
    inputs.insurance +
    inputs.bodyCorporate +
    annualRent * (inputs.managementPct / 100) +
    annualRent * (inputs.maintenancePct / 100);
  const netYield = ((annualRent - year1Operating) / inputs.purchasePrice) * 100;

  for (let y = 1; y <= inputs.holdingYears; y++) {
    // Inflate rent + costs from year 2 onward
    const rentYear = annualRent * Math.pow(1 + inputs.rentalGrowth / 100, y - 1);
    const vacancyDollar = (inputs.weeklyRent * Math.pow(1 + inputs.rentalGrowth / 100, y - 1)) * inputs.vacancyWeeks;
    const effectiveRent = rentYear - vacancyDollar;

    const expGrowth = Math.pow(1 + inputs.propertyExpenseGrowth / 100, y - 1);
    const ratesY = inputs.rates * expGrowth;
    const insuranceY = inputs.insurance * expGrowth;
    const bcY = inputs.bodyCorporate * expGrowth;
    const mgmtY = rentYear * (inputs.managementPct / 100);
    const maintY = rentYear * (inputs.maintenancePct / 100);
    const propertyExpenses = ratesY + insuranceY + bcY + mgmtY + maintY;

    // Loan walk
    const isIoYear = y <= inputs.ioYears;
    const piRemain = isIoYear ? remainingForPi : Math.max(1, remainingForPi - (y - inputs.ioYears - 1));
    const walk = loanYearWalk(loanBalance, inputs.interestRate, piRemain, isIoYear);
    const interestPaid = walk.interest;
    const principalPaid = walk.principal;
    loanBalance = walk.closingBalance;
    const loanRepayments = interestPaid + principalPaid;

    // Depreciation
    const capitalWorks = inputs.capitalWorksAnnual;
    const plantEquipment = plantEquipmentRemaining;
    plantEquipmentRemaining = plantEquipmentRemaining * (1 - inputs.plantEquipmentDeclineRate / 100);
    const totalDeductions = propertyExpenses + interestPaid + capitalWorks + plantEquipment;
    const taxableIncome = effectiveRent - totalDeductions;
    const taxEffect = taxableIncome * (inputs.marginalTaxRate / 100); // negative = refund

    const cashFlowBeforeTax = effectiveRent - propertyExpenses - loanRepayments;
    const cashFlowAfterTax = cashFlowBeforeTax - taxEffect; // subtract because saving (negative tax) adds back

    if (breakevenYear === null && cashFlowAfterTax >= 0) breakevenYear = y;
    if (cashFlowAfterTax > 0) totalCashIn += cashFlowAfterTax;
    else totalCashOut += -cashFlowAfterTax;

    const propertyValue = inputs.purchasePrice * Math.pow(1 + inputs.capitalGrowth / 100, y);
    const equity = propertyValue - loanBalance;

    schedule.push({
      year: y,
      effectiveRent: round(effectiveRent),
      propertyExpenses: round(propertyExpenses),
      interestPaid: round(interestPaid),
      principalPaid: round(principalPaid),
      loanRepayments: round(loanRepayments),
      loanBalance: round(loanBalance),
      capitalWorks: round(capitalWorks),
      plantEquipment: round(plantEquipment),
      totalDeductions: round(totalDeductions),
      taxableIncome: round(taxableIncome),
      taxEffect: round(taxEffect),
      cashFlowBeforeTax: round(cashFlowBeforeTax),
      cashFlowAfterTax: round(cashFlowAfterTax),
      propertyValue: round(propertyValue),
      equity: round(equity),
    });
  }

  const last = schedule[schedule.length - 1];
  const endValue = last?.propertyValue ?? inputs.purchasePrice;
  const endLoanBalance = last?.loanBalance ?? loanBalance;
  const endEquity = last?.equity ?? 0;
  const capitalGain = Math.max(0, endValue - inputs.purchasePrice);
  const taxableGain = capitalGain * 0.5; // 50% individual CGT discount
  const cgtPayable = taxableGain * (inputs.marginalTaxRate / 100);

  const netCashOverHolding = totalCashIn - totalCashOut;
  const totalReturn = netCashOverHolding + (endEquity - initialCashRequired) - cgtPayable;

  // IRR approximation: compounded return on initial cash invested
  // = (totalReturn + initialCashRequired) / initialCashRequired ^ (1/years) - 1
  const finalValue = initialCashRequired + totalReturn;
  const irrApprox =
    initialCashRequired > 0 && finalValue > 0
      ? (Math.pow(finalValue / initialCashRequired, 1 / inputs.holdingYears) - 1) * 100
      : 0;

  // Year-1 cashflow breakdown — itemised expenses + net before/after tax.
  const y1 = schedule[0];
  const mgmt1 = annualRent * (inputs.managementPct / 100);
  const maint1 = annualRent * (inputs.maintenancePct / 100);
  const cashflow: Cashflow = {
    weeklyRent: inputs.weeklyRent,
    annualRent: round(y1?.effectiveRent ?? annualRent),
    expenses: {
      rates: round(inputs.rates),
      insurance: round(inputs.insurance),
      bodyCorporate: round(inputs.bodyCorporate),
      management: round(mgmt1),
      maintenance: round(maint1),
    },
    totalExpenses: round(y1?.propertyExpenses ?? inputs.rates + inputs.insurance + inputs.bodyCorporate + mgmt1 + maint1),
    interestAnnual: round(y1?.interestPaid ?? 0),
    loanRepaymentsAnnual: round(y1?.loanRepayments ?? 0),
    beforeTaxAnnual: round(y1?.cashFlowBeforeTax ?? 0),
    taxBenefitAnnual: round(-(y1?.taxEffect ?? 0)),
    afterTaxAnnual: round(y1?.cashFlowAfterTax ?? 0),
    weeklyBeforeTax: round((y1?.cashFlowBeforeTax ?? 0) / 52),
    weeklyAfterTax: round((y1?.cashFlowAfterTax ?? 0) / 52),
    positiveBeforeTax: (y1?.cashFlowBeforeTax ?? 0) >= 0,
    positiveAfterTax: (y1?.cashFlowAfterTax ?? 0) >= 0,
  };

  return {
    grossYield: round(grossYield * 100) / 100,
    netYield: round(netYield * 100) / 100,
    initialCashRequired: round(initialCashRequired),
    totalAcquisitionCost: round(totalAcquisition),
    totalCashOutflow: round(totalCashOut),
    totalCashInflow: round(totalCashIn),
    netCashOverHolding: round(netCashOverHolding),
    endValue: round(endValue),
    endEquity: round(endEquity),
    endLoanBalance: round(endLoanBalance),
    capitalGain: round(capitalGain),
    cgtPayable: round(cgtPayable),
    totalReturn: round(totalReturn),
    irrApprox: round(irrApprox * 100) / 100,
    breakevenYear,
    cashflow,
    schedule,
  };
}

/** Sensible defaults so the page loads with a meaningful baseline scenario. */
export const DEFAULT_INPUTS: PiaInputs = {
  // Property — typical investor turnkey QLD growth-corridor package
  purchasePrice: 750000,
  weeklyRent: 620,
  rentalGrowth: 3,
  capitalGrowth: 5,
  vacancyWeeks: 2,

  // Operating costs
  rates: 2400,
  insurance: 1500,
  bodyCorporate: 0,
  managementPct: 7.5,
  maintenancePct: 1.5,
  propertyExpenseGrowth: 3,

  // Acquisition (typical for $750K turnkey)
  stampDuty: 21000,
  legalFees: 1800,
  buildingInspection: 600,
  lenderFees: 1200,
  otherAcquisition: 0,

  // Finance
  loanAmount: 600000,    // 80% LVR
  interestRate: 6.25,
  loanTermYears: 30,
  ioYears: 5,

  // Tax
  marginalTaxRate: 39,   // includes 2% medicare; for income $135K-$190K
  capitalWorksAnnual: 8000, // $320K build × 2.5%
  plantEquipmentAnnual: 4500,
  plantEquipmentDeclineRate: 30, // diminishing-value approximation

  // Horizon
  holdingYears: 20,
};
