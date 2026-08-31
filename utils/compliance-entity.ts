/**
 * Who the compliance reviewer thinks it is working for.
 *
 * The reviewer's SYSTEM prompt used to open "You are a compliance reviewer for
 * NextKey Property Strategists … NOT licensed under NCCP", and that sentence was
 * the whole entity model. It is wrong for half the mail this CRM sends.
 *
 * NextKey and Springboard are deliberately firewalled brands with different
 * regulatory positions, so a single hard-coded reviewer is wrong for one of them
 * whichever way it is written. Reviewing Springboard introducer-recruitment copy
 * under NextKey's identity produced three false positives in testing, and the
 * worst of them asked us to DELETE the sentence restricting what an introducer
 * may do — the one sentence that most reduces risk. A reviewer that argues for
 * removing a restriction is worse than no reviewer, because its output looks
 * authoritative.
 *
 * Brand is keyed on MailIdentityKey so the copy is reviewed as, and sent as, the
 * same business. See utils/sign-brand.ts for the same split on the signing side.
 */

import { type MailIdentityKey } from "./mailIdentities";

export type ComplianceEntity = {
  /** Legal/trading identity named to the reviewer. */
  name: string;
  /**
   * The opening paragraph of the SYSTEM prompt: who the sender is and what they
   * are NOT licensed to do. Everything downstream in the prompt reasons off this.
   */
  identity: string;
  /**
   * Facts the reviewer must take as given and must not flag as problems in
   * themselves. Empty for NextKey — its prompt has never needed any, and adding
   * some would change how existing copy reviews.
   */
  assume: string[];
};

export const COMPLIANCE_ENTITIES: Record<MailIdentityKey, ComplianceEntity> = {
  nextkey: {
    name: "NextKey Property Strategists",
    identity:
      "You are a compliance reviewer for NextKey Property Strategists (Queensland-based,\n" +
      "NOT licensed under NCCP, NOT a real estate agent, NOT a financial planner). You are reviewing\n" +
      "the subject and body of an outbound bulk email BEFORE it is sent to NextKey's contact list.",
    assume: [],
  },
  springboard: {
    name: "Springboard Homes",
    identity:
      "You are a compliance reviewer for Springboard Homes, the marketing brand of G.B. Mayes\n" +
      "Holdings Pty Ltd (NOT licensed under NCCP, NOT a real estate agent, NOT a financial planner).\n" +
      "You are reviewing the subject and body of an outbound bulk email BEFORE it is sent.",
    assume: [
      "The Community Funding Program is owned and assessed by CRE8 Finance Pty Ltd trading as Your " +
        "Loan Assist, which holds Australian Credit Licence 477483. Springboard does not hold one, " +
        "and correctly says so.",
      "Some Springboard mail is addressed to third-party property professionals being recruited as " +
        "introducers. They are not Springboard staff, and describing an arrangement offered to them " +
        "is not itself a breach.",
    ],
  },
};

/**
 * Anything unrecognised — including undefined from a caller written before brand
 * existed — is NextKey. That is the identity every previously-reviewed broadcast
 * was reviewed under, so the default keeps historical behaviour byte-identical.
 */
export function complianceEntity(brand: string | null | undefined): ComplianceEntity {
  return brand === "springboard"
    ? COMPLIANCE_ENTITIES.springboard
    : COMPLIANCE_ENTITIES.nextkey;
}

/** The entity paragraph plus any assumed facts, ready to head the SYSTEM prompt. */
export function entityPreamble(brand: string | null | undefined): string {
  const e = complianceEntity(brand);
  if (e.assume.length === 0) return e.identity;
  return (
    e.identity +
    "\n\nCONTEXT YOU MUST ASSUME, and must NOT flag as a problem in itself:\n" +
    e.assume.map((a) => `- ${a}`).join("\n")
  );
}
