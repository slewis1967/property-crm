/**
 * The current partner agreement version and the gate test, on their own so a
 * client component (the staff firm card) can use them without bundling the
 * agreement text. Bumping the version sends every firm back through acceptance.
 */
export const PARTNER_AGREEMENT_VERSION = "v1.0";

export function agreementIsCurrent(ref: unknown, signedAt: unknown): boolean {
  return ref === PARTNER_AGREEMENT_VERSION && typeof signedAt === "string" && signedAt.length > 0;
}
