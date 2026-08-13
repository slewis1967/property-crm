/**
 * Identity verification — provider interface.
 *
 * Sean's decision (2026-08-13): a document-verification service checks the
 * licence against the issuing authority, and anything that FAILS OR ERRORS
 * falls to a human rather than blocking the applicant. That shape is the whole
 * reason this is an interface rather than a direct API call — the human path is
 * not a fallback bolted on later, it is half the design.
 *
 * No provider is wired yet: the account is a spending decision. Until one is,
 * `stubProvider` returns `manual_review`, which routes every applicant to the
 * staff queue. That is the correct behaviour for an unconfigured system —
 * it must never be possible for a missing API key to read as "verified".
 *
 * To wire a real provider, implement `IdentityProvider` and return it from
 * `identityProvider()`. Nothing else changes.
 */

export type IdentityCheckOutcome =
  /** The issuing authority confirmed the document. */
  | "pass"
  /** The authority actively disputed it. */
  | "fail"
  /** We could not get an answer — provider down, document unreadable. */
  | "error"
  /** No provider configured, or the provider asked for a human. */
  | "manual_review";

export type IdentityCheckRequest = {
  applicationId: string;
  legalName: string;
  /** Signed, short-lived URLs the provider can fetch. Never the raw objects. */
  frontUrl: string;
  backUrl: string;
};

export type IdentityCheckResult = {
  outcome: IdentityCheckOutcome;
  /** The provider's own reference, so a disputed check can be traced back. */
  reference: string | null;
  provider: string;
  /** Safe to show staff. Must never contain document contents. */
  detail: string | null;
};

export interface IdentityProvider {
  name: string;
  check(req: IdentityCheckRequest): Promise<IdentityCheckResult>;
}

/**
 * The no-provider provider. Deliberately does not pretend to check anything.
 */
export const stubProvider: IdentityProvider = {
  name: "stub",
  async check(): Promise<IdentityCheckResult> {
    return {
      outcome: "manual_review",
      reference: null,
      provider: "stub",
      detail:
        "No verification service is configured, so this needs a human to compare the licence to the name on the application.",
    };
  },
};

export function identityProvider(): IdentityProvider {
  // When a provider is wired, select it here on IDENTITY_PROVIDER. The default
  // is deliberately the stub and not a throw: an unconfigured system should
  // still let an applicant upload and still queue them for review, rather than
  // 500 halfway through onboarding.
  return stubProvider;
}

/**
 * Map a provider outcome to the value stored on the application.
 *
 * `manual_review` deliberately has no stored value — it is the absence of a
 * decision, and writing one would let a queue entry read as a completed check.
 */
export function storedResult(outcome: IdentityCheckOutcome): string | null {
  switch (outcome) {
    case "pass":
      return "pass";
    case "fail":
      return "fail";
    case "error":
      return "error";
    default:
      return null;
  }
}

/** Does this outcome let the applicant straight through to the course? */
export function clearsAutomatically(outcome: IdentityCheckOutcome): boolean {
  return outcome === "pass";
}
