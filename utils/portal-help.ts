/**
 * Content for the client portal's Help section — pure data, no I/O, so the
 * wording is unit-testable and lives in one place rather than scattered through
 * JSX.
 *
 * The portal used to be an upload form and nothing else. A client who wasn't
 * sure what a document was, or wanted to see what they'd already sent, or
 * needed to speak to someone, had no route that didn't involve emailing us and
 * waiting. Every one of those is a stall in an application.
 *
 * COMPLIANCE BOUNDARY. Nothing here explains the product, eligibility, the
 * investment side or anything a licensed adviser is responsible for. Springboard
 * is Program Manager: we collect documents to bank standard and relay. Help
 * content stays strictly on "what this document is and how to get it".
 */

/**
 * The myGov walkthrough — Springboard's own video, self-hosted.
 *
 * Served from our own origin (see app/api/portal/mygov-video/route.ts) rather
 * than embedded from a third party: it keeps another firm's branding off a
 * client-facing page, needs no CSP exception, and sets no third-party cookie.
 */
export const MYGOV_VIDEO = {
  src: "/api/portal/mygov-video",
  /** The video's own title card. Without it the player opens on black, which
   *  reads as broken rather than as a video waiting to be played. */
  poster: "/api/portal/mygov-poster",
  title: "Finding your income statement on the ATO myGov portal",
  /** Shown while the video loads, and to anyone with media disabled. */
  caption: "Springboard Homes — 1 min 16",
} as const;

export type HelpEntry = {
  /** Matches client_documents.doc_type, so the UI can deep-link from a slot. */
  docKey: string;
  title: string;
  /** What the document actually is — the question clients ask most. */
  what: string[];
  /** How to get a compliant copy. */
  how: string[];
  /** What gets a set rejected. Concrete, not abstract. */
  avoid: string[];
};

export const HELP_ENTRIES: HelpEntry[] = [
  {
    docKey: "ato_income",
    title: "ATO Income Statement",
    what: [
      "The payment summary you download from the ATO section of your myGov account.",
      "It is NOT your tax return, NOT your notice of assessment, and NOT a summary your employer gives you — those can't be accepted.",
      "myGov lists a separate statement for each employer. If you had two jobs in a year, that year has two statements and we need both.",
    ],
    how: [
      "Sign in to myGov and open Australian Taxation Office.",
      "Go to Employment, then Income statement.",
      "Pick the financial year, open the statement with the arrow on the right, scroll to the bottom and choose Print friendly version.",
      "Save that page as a PDF, then repeat for every statement listed under each year we've asked for.",
    ],
    avoid: [
      "A screenshot of the screen — the saved PDF is what's needed.",
      "Only one year. We need both of the years shown in your document list.",
      "Only one employer, when that year lists more than one.",
    ],
  },
  {
    docKey: "payslip",
    title: "Payslips",
    what: ["Your two most recent payslips from your employer's payroll system."],
    how: [
      "Download them from your payroll or HR system (MyPay, Employment Hero, Xero Me, ADP — whatever your employer uses).",
      "Most systems have a Download or Save as PDF button on each payslip.",
    ],
    avoid: [
      "A photo of a printed payslip — download the original instead.",
      "Payslips that aren't the two most recent.",
    ],
  },
  {
    docKey: "photo_id",
    title: "Photo ID",
    what: [
      "Your driver licence or passport.",
      "If it's a licence we need BOTH sides — the front with your photo, and the back with the card number and conditions. That's two separate files.",
    ],
    how: [
      "A clear, straight photo of the card on a plain surface is fine for ID.",
      "Make sure all four corners are in the frame and there's no glare across the text.",
    ],
    avoid: [
      "Only the front of a licence — the back is required too.",
      "Photos taken at an angle, or with a flash reflecting off the card.",
    ],
  },
  {
    docKey: "super_statement",
    title: "Super statement",
    what: ["Your most recent superannuation statement."],
    how: [
      "Download it from your super fund's website or app, or from myGov under Super.",
      "The most recent statement is all we need.",
    ],
    avoid: ["A screenshot of your balance — the statement document is what's needed."],
  },
];

export const HELP_BY_KEY: Record<string, HelpEntry> = Object.fromEntries(
  HELP_ENTRIES.map((h) => [h.docKey, h]),
);

/** General questions, answered without straying into product or eligibility. */
export const HELP_FAQ: { q: string; a: string }[] = [
  {
    q: "Why does everything have to be a PDF under 1MB?",
    a: "The lender assessing your application works to a strict document standard and returns the whole set if one file doesn't meet it — which costs about a week. When you upload here we convert and resize your file automatically, so you don't have to.",
  },
  {
    q: "Can I upload a photo instead?",
    a: "Yes. Photos are converted to a properly formatted PDF on your device as you upload. Where you can download the original document instead, that's always clearer.",
  },
  {
    q: "I've uploaded the wrong file — can I replace it?",
    a: "Yes. Press Replace on that document and upload the right one. The new file takes its place.",
  },
  {
    q: "Can I email or post my documents instead?",
    a: "You can — reply to any of our emails and we'll add them for you. Uploading here is faster because your file is checked as it arrives.",
  },
  {
    q: "Who sees my documents?",
    a: "Your Springboard consultant and Your Loan Assist, the lender assessing your application. Nobody else.",
  },
];

/**
 * The application journey, for a client who is already in the program.
 *
 * DELIBERATELY PROCESS ONLY — the sequence of steps and who does what. It makes
 * no claim about the product, eligibility, returns or the investment side, all
 * of which belong to the licensed adviser's Statement of Advice, not to us.
 * Springboard's role here is Program Manager: collect documents to bank
 * standard, present assessments, relay outcomes.
 */
export type JourneyStep = { n: number; title: string; detail: string; who: string };

export const JOURNEY: JourneyStep[] = [
  { n: 1, title: "Preliminary Assessment", detail: "We collect your documents and your assessment is prepared.", who: "You + Springboard" },
  { n: 2, title: "Program approval", detail: "Your assessment is reviewed and the outcome is confirmed to you.", who: "Your Loan Assist" },
  { n: 3, title: "Advice appointment", detail: "A licensed adviser meets with you and issues their written advice. They charge a fee for this, which they will explain to you directly.", who: "Licensed adviser" },
  { n: 4, title: "Home loan — conditional approval", detail: "Your bank home loan is submitted and conditionally approved.", who: "Your Loan Assist" },
  { n: 5, title: "Deposit loan — conditional approval", detail: "The second loan covering your deposit and upfront costs is conditionally approved.", who: "Your Loan Assist" },
  { n: 6, title: "Finding your home", detail: "You choose a property, and your home loan approval is updated for it.", who: "You" },
  { n: 7, title: "Formal approvals", detail: "Both loans move from conditional to formal approval.", who: "Your Loan Assist" },
  { n: 8, title: "Settlement", detail: "Your purchase settles and you get the keys.", who: "Everyone" },
];
