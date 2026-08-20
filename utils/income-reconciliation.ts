/**
 * Income reconciliation — does what the applicant DECLARED match what their
 * documents actually EVIDENCE?
 *
 * The YLA verification agent (utils/yla-verification.ts) checks that a document
 * is a legible, correct, in-date document. It deliberately does not read the
 * numbers inside it. That gap cost us a real file: every document passed 7/7,
 * every one was marked Accepted and exported to Drive, and nobody noticed the
 * fact find declared $186k against payslips worth $154k and ATO statements that
 * annualised to $101k. The assessment came back on the wrong income and the
 * whole application was priced off it.
 *
 * So this module reads the financial content and triangulates three views of
 * the same household:
 *
 *   declared    — what the Needs Analysis / Fact Find says
 *   ato         — annualised from the ATO income statements
 *   payslip     — run-rate from the two most recent payslips
 *
 * None of the three is authoritative on its own, and the interesting signal is
 * in the DISAGREEMENT between them. In particular an ATO statement covering a
 * part-year (a job started mid-year) annualises LOW and is not evidence that
 * the applicant earns less — that specific misreading is what a lender did to
 * us, and `atoAnnualisation` flags it rather than reporting a number that looks
 * authoritative because it came from the tax office.
 *
 * Pure decision logic only — no Supabase, no model calls, no clock. The caller
 * passes `asOf` so the staleness checks are deterministic under test. I/O lives
 * in utils/income-reconciliation-run.ts.
 */

/** How far apart two payslips may be and still count as consecutive, per frequency. */
const PERIOD_DAYS: Record<PayFrequency, number> = { wk: 7, fn: 14, m: 30.44, pa: 365 };

/** Payslips older than this are no longer current evidence for a lender. */
export const STALE_PAYSLIP_WEEKS = 6;

/**
 * Declared income above verified by more than this is worth surfacing.
 * Deliberately generous: casual income genuinely swings, and a reconciliation
 * that cries wolf at 5% gets switched off. The Halliday file was out by 20%
 * against payslips and 85% against the ATO statements.
 */
export const MATERIAL_VARIANCE = 0.15;

export type PayFrequency = "wk" | "fn" | "m" | "pa";

export const PERIODS_PER_YEAR: Record<PayFrequency, number> = {
  wk: 52,
  fn: 26,
  m: 12,
  pa: 1,
};

/** One applicant's declared position, as captured on the Needs Analysis / Fact Find. */
export type DeclaredIncome = {
  applicant: string;
  /** Gross annual, already normalised to per-annum by the caller. */
  annual: number | null;
  employer: string | null;
  /** payg | self_employed | unemployed | retired */
  employmentType: string | null;
  /** casual | part_time | full_time | contractor */
  basis: string | null;
  /** ISO date the applicant says they started. */
  startedOn: string | null;
  /**
   * Secondary income the applicant claims (a second job, bonus, commission)
   * that has no document slot of its own. Unevidenced claims are the quiet
   * killer — ours was "$400/wk casual Woolworths" against an employer whose
   * ATO statement showed the job had ended.
   */
  otherIncomeNote: string | null;
};

/** Extracted from one payslip. Every field may be absent — extraction is best-effort. */
export type PayslipEvidence = {
  kind: "payslip";
  applicant: string;
  filename: string;
  employer: string | null;
  /** ISO. Start and end of the pay PERIOD, not the pay date. */
  periodStart: string | null;
  periodEnd: string | null;
  paidOn: string | null;
  frequency: PayFrequency | null;
  grossThisPeriod: number | null;
  ytdGross: number | null;
  /** Overtime + penalties within grossThisPeriod. Lenders shade these. */
  variableComponent: number | null;
  deductions: { label: string; amount: number; preTax: boolean }[];
};

/** Extracted from one ATO income statement (one per employer per financial year). */
export type AtoEvidence = {
  kind: "ato";
  applicant: string;
  filename: string;
  employer: string | null;
  /** e.g. "2025-26" */
  financialYear: string | null;
  /** ISO. The period the statement actually covers — often NOT the full year. */
  periodStart: string | null;
  periodEnd: string | null;
  totalGross: number | null;
  overtime: number | null;
  salarySacrifice: number | null;
  /** True when the statement shows unused leave paid out — the job ended. */
  terminationIndicated: boolean;
};

export type IncomeEvidence = PayslipEvidence | AtoEvidence;

export type FindingSeverity = "info" | "warn" | "critical";

export type Finding = {
  applicant: string;
  severity: FindingSeverity;
  /** Stable slug so the UI can group and the sweep can dedupe. */
  code: string;
  message: string;
  /** What someone should actually do about it. */
  action: string | null;
};

export type ApplicantIncomeView = {
  applicant: string;
  declaredAnnual: number | null;
  atoAnnual: number | null;
  /** True when the ATO figure came from a part-year period and understates. */
  atoIsPartYear: boolean;
  payslipAnnual: number | null;
  /** The figure we'd put to a lender: payslip run-rate where we have one. */
  bestEvidenceAnnual: number | null;
};

export type ReconciliationResult = {
  applicants: ApplicantIncomeView[];
  declaredTotal: number | null;
  bestEvidenceTotal: number | null;
  findings: Finding[];
  /** No critical findings — safe to submit on the declared position. */
  pass: boolean;
  summary: string;
};

function daysBetween(aISO: string, bISO: string): number | null {
  const a = Date.parse(aISO);
  const b = Date.parse(bISO);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return (b - a) / 86_400_000;
}

function round(n: number): number {
  return Math.round(n);
}

/**
 * Annualise an ATO income statement using the period it actually covers.
 *
 * A statement for a job started in January covers ~5 months. Dividing its gross
 * by that period and scaling to a year is arithmetically correct but tells you
 * about the applicant's RAMP-UP months, not their current earnings — and for a
 * casual whose hours built over that period it reads materially low. So when
 * the period is short we return the number AND say it can't be relied on.
 */
export function atoAnnualisation(e: AtoEvidence): {
  annual: number | null;
  partYear: boolean;
  coverageDays: number | null;
} {
  if (e.totalGross == null) return { annual: null, partYear: false, coverageDays: null };
  if (!e.periodStart || !e.periodEnd) {
    // No period on the document — treat the figure as a full year, which is
    // what it usually is, but we can't prove it.
    return { annual: round(e.totalGross), partYear: false, coverageDays: null };
  }
  const days = daysBetween(e.periodStart, e.periodEnd);
  if (days == null || days <= 0) return { annual: round(e.totalGross), partYear: false, coverageDays: null };
  // +1 because both endpoints are inclusive pay days.
  const covered = days + 1;
  const annual = round((e.totalGross / covered) * 365);
  // Anything under ~10.5 months is a part year. A full year runs 365 days; a
  // statement that stops a fortnight early is a payroll cutoff, not a part year.
  return { annual, partYear: covered < 320, coverageDays: Math.round(covered) };
}

/** Infer pay frequency from a payslip's own period length when it isn't stated. */
export function inferFrequency(p: PayslipEvidence): PayFrequency | null {
  if (p.frequency) return p.frequency;
  if (!p.periodStart || !p.periodEnd) return null;
  const days = daysBetween(p.periodStart, p.periodEnd);
  if (days == null) return null;
  const covered = days + 1;
  if (covered <= 8) return "wk";
  if (covered <= 16) return "fn";
  if (covered <= 32) return "m";
  return null;
}

/**
 * Run-rate from the payslips we hold: average gross per period, scaled up.
 * Averaging matters for casuals — one big fortnight is not a salary.
 */
export function payslipRunRate(payslips: PayslipEvidence[]): number | null {
  const usable = payslips.filter((p) => p.grossThisPeriod != null && inferFrequency(p) != null);
  if (!usable.length) return null;
  const total = usable.reduce((s, p) => s + (p.grossThisPeriod as number), 0);
  const avg = total / usable.length;
  // Mixed frequencies across one applicant's payslips shouldn't happen; if it
  // does, the most common one wins rather than silently averaging apples.
  const counts = new Map<PayFrequency, number>();
  for (const p of usable) {
    const f = inferFrequency(p)!;
    counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  const freq = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  return round(avg * PERIODS_PER_YEAR[freq]);
}

/**
 * Are these payslips consecutive? Lenders ask for two in a row; two with a gap
 * lets an applicant present their two best periods and hide what's between.
 * Ours were 16–29 May and 13–26 June — a whole fortnight missing, while a note
 * on the file claimed they'd been made consecutive.
 */
export function consecutivePayslipIssue(payslips: PayslipEvidence[]): string | null {
  const dated = payslips
    .filter((p) => p.periodStart && p.periodEnd)
    .sort((a, b) => Date.parse(a.periodStart!) - Date.parse(b.periodStart!));
  if (dated.length < 2) return null;
  for (let i = 1; i < dated.length; i++) {
    const prev = dated[i - 1]!;
    const cur = dated[i]!;
    const freq = inferFrequency(cur) ?? inferFrequency(prev);
    if (!freq) continue;
    const gap = daysBetween(prev.periodEnd!, cur.periodStart!);
    if (gap == null) continue;
    // Consecutive periods start the day after the previous one ends, so a gap
    // of ~1 day is correct. Allow 3 for weekend/cutoff wobble.
    if (gap > PERIOD_DAYS[freq] * 0.5 + 3) {
      return `Payslips are not consecutive — ${prev.periodEnd} to ${cur.periodStart} is unaccounted for.`;
    }
  }
  return null;
}

/** The most recent pay date across an applicant's payslips. */
function latestPayDate(payslips: PayslipEvidence[]): string | null {
  const dates = payslips.map((p) => p.paidOn ?? p.periodEnd).filter(Boolean) as string[];
  if (!dates.length) return null;
  return dates.sort((a, b) => Date.parse(b) - Date.parse(a))[0]!;
}

export function stalePayslipIssue(payslips: PayslipEvidence[], asOf: Date): string | null {
  const latest = latestPayDate(payslips);
  if (!latest) return null;
  const days = daysBetween(latest, asOf.toISOString().slice(0, 10));
  if (days == null) return null;
  const weeks = days / 7;
  if (weeks <= STALE_PAYSLIP_WEEKS) return null;
  // Round rather than floor: a payslip 6.7 weeks old reported as "6 weeks"
  // understates exactly the thing the warning exists to convey.
  return `Most recent payslip is ${Math.round(weeks)} weeks old (${latest}).`;
}

function pct(a: number, b: number): number {
  return b === 0 ? 0 : (a - b) / b;
}

function money(n: number): string {
  return `$${n.toLocaleString("en-AU", { maximumFractionDigits: 0 })}`;
}

/** Normalise for comparison — "Woolworths Group Limited" vs "WOOLWORTHS". */
function employerKey(name: string | null): string {
  return (name ?? "")
    .toLowerCase()
    .replace(/\b(pty|ltd|limited|group|australia|trading as|t\/a)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export function reconcile(args: {
  declared: DeclaredIncome[];
  evidence: IncomeEvidence[];
  asOf: Date;
}): ReconciliationResult {
  const { declared, evidence, asOf } = args;
  const findings: Finding[] = [];
  const views: ApplicantIncomeView[] = [];

  const names = [...new Set([...declared.map((d) => d.applicant), ...evidence.map((e) => e.applicant)])];

  for (const name of names) {
    const dec = declared.find((d) => d.applicant === name) ?? null;
    const payslips = evidence.filter((e): e is PayslipEvidence => e.kind === "payslip" && e.applicant === name);
    const atos = evidence.filter((e): e is AtoEvidence => e.kind === "ato" && e.applicant === name);

    const currentEmployerKey = employerKey(dec?.employer ?? null);

    /**
     * The ATO view: the applicant's most recent financial year, counting only
     * employment that hasn't ended.
     *
     * Emphatically NOT matched on employer name. The Needs Analysis has no
     * employer name field — reps type it into the address line — so the file
     * says "Police Headquarters" where the income statement says "REDFLEX
     * TRAFFIC SYSTEMS PTY LTD", and a name match silently produces no ATO
     * figure at all. Dropping the terminated statements achieves what the name
     * match was reaching for (don't add up two jobs the applicant no longer
     * holds both of) using something the documents actually state.
     */
    const latestFy = atos
      .map((a) => a.financialYear)
      .filter((y): y is string => !!y)
      .sort()
      .at(-1);
    const currentAtos = atos.filter(
      (a) => !a.terminationIndicated && (!latestFy || !a.financialYear || a.financialYear === latestFy),
    );
    let atoAnnual: number | null = null;
    for (const a of currentAtos) {
      const { annual } = atoAnnualisation(a);
      if (annual == null) continue;
      atoAnnual = (atoAnnual ?? 0) + annual;
    }

    /**
     * Part-year warnings run over EVERY statement, not just the ones feeding
     * the figure above. This is the single most valuable thing here — it is the
     * misreading a lender made against us — and it must not be suppressed by a
     * bookkeeping decision about which statements to total.
     */
    let atoPartYear = false;
    for (const a of atos) {
      const { annual, partYear, coverageDays } = atoAnnualisation(a);
      if (annual == null || !partYear) continue;
      atoPartYear = true;
      findings.push({
        applicant: name,
        severity: "warn",
        code: "ato_part_year",
        message:
          `${a.employer ?? "Employer"} income statement covers only ${coverageDays} days` +
          `${a.financialYear ? ` of ${a.financialYear}` : ""}. Annualising it gives ${money(annual)}, which understates current earnings.`,
        action: "Use the payslip run-rate for servicing, and say so explicitly if a lender has assessed on this statement.",
      });
    }

    const payslipAnnual = payslipRunRate(payslips);
    const best = payslipAnnual ?? atoAnnual;

    views.push({
      applicant: name,
      declaredAnnual: dec?.annual ?? null,
      atoAnnual,
      atoIsPartYear: atoPartYear,
      payslipAnnual,
      bestEvidenceAnnual: best,
    });

    // --- Document-shape checks -------------------------------------------
    if (payslips.length && payslips.length < 2) {
      findings.push({
        applicant: name,
        severity: "warn",
        code: "payslips_insufficient",
        message: `Only ${payslips.length} payslip on file.`,
        action: "Request two consecutive payslips.",
      });
    }
    const gap = consecutivePayslipIssue(payslips);
    if (gap) {
      findings.push({
        applicant: name,
        severity: "critical",
        code: "payslips_not_consecutive",
        message: gap,
        action: "Request two genuinely consecutive payslips before submitting.",
      });
    }
    const stale = stalePayslipIssue(payslips, asOf);
    if (stale) {
      findings.push({
        applicant: name,
        severity: "warn",
        code: "payslips_stale",
        message: stale,
        action: "Request current payslips — most lenders want them inside six weeks.",
      });
    }

    // --- Declared vs evidenced -------------------------------------------
    if (dec?.annual != null && best != null) {
      const variance = pct(dec.annual, best);
      if (variance > MATERIAL_VARIANCE) {
        findings.push({
          applicant: name,
          severity: "critical",
          code: "declared_above_evidence",
          message: `Declared ${money(dec.annual)} against ${money(best)} evidenced — ${Math.round(variance * 100)}% higher.`,
          action: "Reconcile with the applicant before the file goes to a lender. A signed Needs Analysis carrying an unsupportable figure is the exposure.",
        });
      } else if (variance < -MATERIAL_VARIANCE) {
        findings.push({
          applicant: name,
          severity: "warn",
          code: "declared_below_evidence",
          message: `Declared ${money(dec.annual)} against ${money(best)} evidenced — the file understates them by ${Math.round(-variance * 100)}%.`,
          action: "Update the declared figure; they may service more than the file suggests.",
        });
      }
    }
    if (dec?.annual != null && best == null) {
      findings.push({
        applicant: name,
        severity: "critical",
        code: "income_unevidenced",
        message: `Declared ${money(dec.annual)} with no payslip or income statement on file to support it.`,
        action: "Collect income evidence before submitting.",
      });
    }

    // --- Terminated employment still being claimed ------------------------
    for (const a of atos) {
      if (!a.terminationIndicated) continue;
      const stillClaimed =
        currentEmployerKey && employerKey(a.employer) === currentEmployerKey;
      const inOtherNote =
        dec?.otherIncomeNote && employerKey(a.employer)
          ? employerKey(dec.otherIncomeNote).includes(employerKey(a.employer))
          : false;
      if (stillClaimed || inOtherNote) {
        findings.push({
          applicant: name,
          severity: "critical",
          code: "employment_ended",
          message: `${a.employer ?? "An employer"}'s income statement shows the job ended, but income from it is still on the file.`,
          action: "Confirm with the applicant whether the role continues. If not, amend the Needs Analysis.",
        });
      }
    }

    // --- Secondary income with nothing behind it --------------------------
    if (dec?.otherIncomeNote) {
      const claimedEmployer = employerKey(dec.otherIncomeNote);
      const evidenced = [...payslips, ...atos].some(
        (e) => employerKey(e.employer) && claimedEmployer.includes(employerKey(e.employer)),
      );
      if (!evidenced) {
        findings.push({
          applicant: name,
          severity: "warn",
          code: "secondary_income_unevidenced",
          message: `Additional income noted ("${dec.otherIncomeNote.slice(0, 90)}") with no supporting document.`,
          action: "Either collect payslips for it or remove it from the Needs Analysis — don't let a lender service on it unverified.",
        });
      }
    }

    // --- Deductions attributed to the wrong person ------------------------
    // A condition raised against the wrong applicant costs a round trip. We
    // can't see the lender's conditions here, but we CAN record who actually
    // has salary sacrifice so the answer is on file before they ask.
    const sacrificing = atos.filter((a) => (a.salarySacrifice ?? 0) > 0);
    if (sacrificing.length) {
      findings.push({
        applicant: name,
        severity: "info",
        code: "salary_sacrifice_present",
        message: `Salary sacrifice recorded against ${sacrificing.map((a) => a.employer ?? "an employer").join(", ")}.`,
        action: null,
      });
    }
  }

  const declaredTotal = views.reduce<number | null>(
    (s, v) => (v.declaredAnnual == null ? s : (s ?? 0) + v.declaredAnnual),
    null,
  );
  const bestTotal = views.reduce<number | null>(
    (s, v) => (v.bestEvidenceAnnual == null ? s : (s ?? 0) + v.bestEvidenceAnnual),
    null,
  );

  const criticals = findings.filter((f) => f.severity === "critical").length;
  const warns = findings.filter((f) => f.severity === "warn").length;

  let summary: string;
  if (!findings.length) {
    summary = "Declared income reconciles with the documents on file.";
  } else if (criticals) {
    summary =
      `${criticals} issue${criticals === 1 ? "" : "s"} to resolve before this file goes to a lender` +
      (warns ? `, plus ${warns} to review.` : ".");
  } else {
    summary = `${warns} thing${warns === 1 ? "" : "s"} worth reviewing.`;
  }
  if (declaredTotal != null && bestTotal != null && declaredTotal !== bestTotal) {
    summary += ` Household declared ${money(declaredTotal)}; evidenced ${money(bestTotal)}.`;
  }

  return {
    applicants: views,
    declaredTotal,
    bestEvidenceTotal: bestTotal,
    findings,
    pass: criticals === 0,
    summary,
  };
}

/** Severity ordering for UI sorting and for "worst finding" badges. */
export const SEVERITY_RANK: Record<FindingSeverity, number> = { critical: 0, warn: 1, info: 2 };

export function worstSeverity(findings: Finding[]): FindingSeverity | null {
  if (!findings.length) return null;
  return findings.reduce<FindingSeverity>(
    (worst, f) => (SEVERITY_RANK[f.severity] < SEVERITY_RANK[worst] ? f.severity : worst),
    "info",
  );
}
