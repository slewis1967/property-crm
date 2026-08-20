/**
 * Which business a signer sees, and in what colours.
 *
 * The signature engine serves two brands. A NextKey client signing a fact find
 * should see NextKey; a Springboard client signing their Referral Consent and
 * Privacy Form should see Springboard — they have never heard of NextKey, and
 * the form they are consenting to names Springboard Homes as the party
 * collecting their information. Being asked to sign it under a different
 * company's letterhead is a reason not to sign.
 *
 * BRAND IS CARRIED ON THE REQUEST, NOT DERIVED FROM THE DOCUMENT TYPE. The same
 * doc_type can belong to either business — a Needs Analysis raised by staff for
 * a NextKey client and one raised by a Springboard introducer are the same
 * document and must not look the same to the person signing.
 *
 * Pure constants. Keep in step with migrations/20260821b_signature_brand.sql.
 */

export const SIGN_BRANDS = ["nextkey", "springboard"] as const;
export type SignBrand = (typeof SIGN_BRANDS)[number];

export type SignBrandStyle = {
  /** The name on the letterhead. */
  name: string;
  /** Header/accent colour. */
  colour: string;
  /** How the footer signs off — "Secured by …". */
  secured: string;
  /** Which utils/mailIdentities.ts sender the emails go out as. */
  identity: "default" | "springboard";
};

const STYLES: Record<SignBrand, SignBrandStyle> = {
  nextkey: {
    name: "NextKey Property Strategists",
    // The teal used across every NextKey compliance surface.
    colour: "#0F4C5C",
    secured: "NextKey",
    identity: "default",
  },
  springboard: {
    name: "Springboard Homes",
    // The amber used across the introducer portal, the pack chooser and the
    // consent form itself.
    colour: "#c7894e",
    secured: "Springboard Homes",
    identity: "springboard",
  },
};

/**
 * Anything unrecognised — including a NULL from a row written before the column
 * existed — is NextKey, because that is what every pre-existing signer actually
 * saw. Defaulting the other way would make the record disagree with the signed
 * copy already sitting in their inbox.
 */
export function signBrand(value: string | null | undefined): SignBrand {
  return value === "springboard" ? "springboard" : "nextkey";
}

export function signBrandStyle(value: string | null | undefined): SignBrandStyle {
  return STYLES[signBrand(value)];
}
