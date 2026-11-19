/**
 * The partner portal's rules for AI-written text, in one pure module: the
 * system-prompt preamble every portal Claude call starts with, and the
 * post-filter every answer must pass before a partner sees it.
 *
 * The prompt asks; the filter enforces. A model can ignore an instruction, so
 * anything that fails the screen is thrown away and the caller shows its
 * deterministic template instead. Failing closed costs us a nicer sentence;
 * failing open would put a finance claim or a supplier's name in front of a
 * partner's buyers.
 *
 * Rules (Sean, standing):
 *  - Brand firewall: no super, SMSF, finance, loans, credit or Springboard.
 *  - No rent, yield, growth or capital-gain claims or figures.
 *  - No referral-fee or commission figures in marketing copy.
 *  - Masked stock: no builder, estate, lot number, street address or photos.
 *  - The only public contact is Glenn, 0477 201 245.
 */

export const PUBLIC_CONTACT = { name: "Glenn", phone: "0477 201 245" } as const;

/** Prepended to every portal system prompt. */
export const PORTAL_AI_RULES = [
  "You write for a property channel-partner portal in Australia. Strict rules, no exceptions:",
  "1. Never mention superannuation, super, SMSF, finance, financing, loans, mortgages, lending, borrowing, credit, deposit schemes or Springboard. Not even to say they are unavailable.",
  "2. Never state or imply rent, rental return, yield, capital growth, capital gain, price growth, investment returns or any figure for them.",
  "3. Never mention a referral fee, commission or any amount paid to the partner.",
  "4. Never name or guess a builder, developer, estate, project, lot number or street address. Use only the suburb, state and property facts given.",
  "5. Never invent facts, prices, distances, schools, amenities or statistics. Use only the numbers you are given.",
  `6. If contact details are needed, the only contact is ${PUBLIC_CONTACT.name} on ${PUBLIC_CONTACT.phone}. Never give any other name, phone number or email.`,
  "7. Australian English. Plain, warm, professional. No emojis unless asked.",
].join("\n");

type Rule = { id: string; re: RegExp };

const RULES: Rule[] = [
  { id: "firewall:super", re: /\b(super|superannuation|smsf|self[-\s]managed)\b/i },
  { id: "firewall:finance", re: /\b(financ\w*|loans?|mortgages?|lend(?:er|ers|ing)|borrow\w*|credit|pre[-\s]?approv\w*|interest rates?|repayments?)\b/i },
  { id: "firewall:springboard", re: /springboard/i },
  { id: "claims:rent", re: /\b(rent|rental|rents|leased?)\b/i },
  { id: "claims:yield", re: /\b(yields?|roi|returns? on|cash ?flow|positively geared|negative(?:ly)? gear\w*)\b/i },
  { id: "claims:growth", re: /\b(growth|capital gains?|appreciat\w*|value will (?:rise|grow|increase))\b/i },
  { id: "fee", re: /\b(referral fees?|commissions?|finder'?s fee|kickback)\b/i },
  { id: "mask:lot", re: /\blot\s*#?\s*\d+/i },
  { id: "mask:address", re: /\b\d{1,5}\s+[A-Z][a-z]+\s+(street|st|road|rd|avenue|ave|drive|dr|court|ct|crescent|cres|parade|pde|place|pl|way|lane|ln|boulevard|blvd|circuit|cct)\b/i },
  { id: "mask:supplier", re: /\b(builder|builders|developer|developers|homes pty|constructions?)\b/i },
  // WeChat copy is Chinese: loan, mortgage, finance, credit, super/pension, rent, return, yield, appreciation, growth, commission, developer, builder.
  { id: "firewall:zh", re: /贷款|按揭|融资|信贷|养老金|退休金|租金|租赁|回报|收益|增值|升值|佣金|开发商|建筑商/ },
  // We never post to WeChat/RedNote for a partner (an Australian company can't); billing is "AI usage".
  { id: "claims:wechat-autopost", re: /\b(we|nextkey|the agent)\s+(will\s+)?(auto-?)?posts?\b[^.]{0,30}\b(wechat|rednote|xiaohongshu)\b/i },
  { id: "billing:claude", re: /\bclaude (credits?|access)\b/i },
  { id: "contact:sean", re: /\bsean\b|\blewis\b/i },
  { id: "contact:email", re: /[^\s@]+@[^\s@]+\.[a-z]{2,}/i },
];

/** Australian phone numbers in their common written forms. */
const PHONE = /(?:\+?61[\s-]?|0)[2-478](?:[\s-]?\d){8}\b|\b1[38]00(?:[\s-]?\d){6}\b|\b13(?:[\s-]?\d){4}\b/g;

function digits(s: string): string {
  return s.replace(/\D/g, "").replace(/^61/, "0");
}

export type ScreenResult = { ok: true } | { ok: false; reasons: string[] };

/**
 * Screen AI output. `supplierNames` (builders/estates we know) are checked too:
 * the model never sees them, but it can still guess a real one.
 */
export function screenPartnerAiText(text: string, opts: { supplierNames?: readonly string[] } = {}): ScreenResult {
  const reasons: string[] = [];
  for (const r of RULES) if (r.re.test(text)) reasons.push(r.id);

  const glenn = digits(PUBLIC_CONTACT.phone);
  for (const m of text.match(PHONE) ?? []) {
    if (digits(m) !== glenn) {
      reasons.push("contact:phone");
      break;
    }
  }

  const lower = text.toLowerCase();
  for (const name of opts.supplierNames ?? []) {
    const n = name.trim().toLowerCase();
    if (n.length >= 4 && new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower)) {
      reasons.push("mask:supplier-name");
      break;
    }
  }
  return reasons.length ? { ok: false, reasons } : { ok: true };
}

/** Screen every string in a structured answer (arrays and nested objects included). */
export function screenPartnerAiValue(value: unknown, opts: { supplierNames?: readonly string[] } = {}): ScreenResult {
  const strings: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") strings.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(value);
  return screenPartnerAiText(strings.join("\n"), opts);
}
