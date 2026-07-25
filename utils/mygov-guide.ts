/**
 * The in-portal "get your ATO income statement from myGov" walkthrough — pure
 * logic only (the UI is app/portal/[token]/MyGovGuide.tsx).
 *
 * WHY THIS EXISTS. The ATO's own one-page PDF was what we sent clients, and it
 * is the single biggest stumbling block in the whole document set. It fails
 * clients in four specific ways, each of which cost us a real round-trip:
 *
 *  1. It is a PDF ATTACHMENT. On a phone it opens in another app, so the client
 *     loses it the moment they switch to myGov — which is where they have to be.
 *  2. It assumes myGov is ALREADY linked to ATO online services. That is where
 *     most people are actually stuck, and the guide says nothing about it.
 *  3. It never mentions CHOOSING THE INCOME YEAR. A client with two employers
 *     sees two entries for the same year and sends both — exactly what happened
 *     on NK-10010, where two 2025-26 statements arrived and no 2024-25.
 *  4. "Print → save as PDF" is the hardest step for a non-technical person and
 *     is completely different on iPhone, Android and desktop. One line covers
 *     all three.
 *
 * So the walkthrough is one step per screen, in the portal, on the device the
 * client is already holding, naming the exact years we need.
 */

export type Device = "ios" | "android" | "desktop";

/**
 * Which device the client is on — decides the save-as-PDF wording, the step
 * everyone gets stuck on. Unknown/odd agents fall back to "desktop", whose
 * instructions are the most generic.
 */
export function detectDevice(userAgent: string | null | undefined): Device {
  const ua = (userAgent || "").toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return "ios";
  // iPadOS 13+ reports as Macintosh; the touch check happens in the component.
  if (/android/.test(ua)) return "android";
  return "desktop";
}

/** A financial year as the ATO labels it in the income-year list. */
export type FinancialYear = {
  /** "2025-26" — matches both the ATO's label and our verification gate. */
  label: string;
  /** 1 July of the starting year, for ordering. */
  startYear: number;
};

function fy(startYear: number): FinancialYear {
  return { label: `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`, startYear };
}

/**
 * The two financial years YLA want, newest first.
 *
 * YLA ask for "the previous and current financial year". Taken literally that
 * breaks every July: on 25 July 2026 the "current" year is 2026-27, which is
 * three weeks old, has no finalised employer data, and is not what YLA mean —
 * the pair they accepted for this same application was 2025-26 + 2024-25.
 *
 * Employers must finalise their STP reporting by 14 July, and a brand-new year
 * has nothing useful in it, so a year only becomes the "current" one for this
 * purpose once it is a full quarter old. Before that, the year just ended is
 * still the current one.
 *
 * ASSUMPTION worth confirming with YLA: mid-year (say March), this returns the
 * in-progress year plus the one before it, and the in-progress statement is a
 * year-to-date one. That matches the ATO's own sample, which shows Status
 * "Year to date".
 */
export function financialYearsNeeded(now: Date): [FinancialYear, FinancialYear] {
  const month = now.getMonth(); // 0-based; 6 = July
  const year = now.getFullYear();
  // Start year of the financial year we are currently inside.
  const inProgressStart = month >= 6 ? year : year - 1;
  // Jul/Aug/Sep — the in-progress year is too new to be useful.
  const tooNew = month >= 6 && month <= 8;
  const newest = tooNew ? inProgressStart - 1 : inProgressStart;
  return [fy(newest), fy(newest - 1)];
}

/** How to save the print-friendly page as a PDF, per device. */
export const SAVE_AS_PDF: Record<Device, { title: string; steps: string[] }> = {
  ios: {
    title: "Save it as a PDF on your iPhone",
    steps: [
      "Tap the Share button (the square with an arrow pointing up).",
      'Scroll down the list and tap "Print".',
      "On the print preview, pinch OUTWARDS on the page image with two fingers — it opens as a PDF.",
      "Tap Share again, then Save to Files.",
    ],
  },
  android: {
    title: "Save it as a PDF on your Android phone",
    steps: [
      "Tap the three dots (⋮) in the top right of your browser.",
      'Tap "Share", then "Print".',
      'At the top, change the printer to "Save as PDF".',
      "Tap the blue Save/PDF button and choose Downloads.",
    ],
  },
  desktop: {
    title: "Save it as a PDF on your computer",
    steps: [
      "Press Ctrl+P (Windows) or Cmd+P (Mac).",
      'In the Destination or Printer box, choose "Save as PDF" or "Microsoft Print to PDF".',
      "Click Save, and pick somewhere easy to find like your Desktop.",
    ],
  },
};

export type GuideStep = {
  id: string;
  title: string;
  /** Short paragraphs. */
  body: string[];
  /** Optional numbered actions. */
  actions?: string[];
  /** Optional external link to open. */
  link?: { href: string; label: string };
};

export const MYGOV_URL = "https://my.gov.au";

/**
 * The walkthrough, one step per screen. `years` are named explicitly at the
 * step where people go wrong; `device` decides the save-as-PDF wording.
 */
export function guideSteps(opts: { device: Device; years: [FinancialYear, FinancialYear] }): GuideStep[] {
  const [newest, previous] = opts.years;
  const save = SAVE_AS_PDF[opts.device];
  return [
    {
      id: "linked",
      title: "First — is your myGov linked to the ATO?",
      body: [
        "When you sign in to myGov, do you see a service called \"Australian Taxation Office\" on your home page?",
        "If you do, you're ready — tap Next.",
        "If you don't, it needs linking first. That takes about five minutes and you'll need either a linking code from the ATO (call 13 28 61) or two identity documents, such as a recent notice of assessment and a bank account the ATO has on file.",
      ],
      actions: [
        "Sign in to myGov and look for \"Australian Taxation Office\".",
        "Not there? Select \"Link another service\", choose the ATO, and follow the prompts.",
        "Stuck at this point? Reply to our email — this is the step most people need a hand with, and we're happy to do it with you over the phone.",
      ],
      link: { href: MYGOV_URL, label: "Open myGov" },
    },
    {
      id: "signin",
      title: "Sign in and open ATO online services",
      body: ["Sign in to myGov, then select Australian Taxation Office from your services."],
      actions: ["Sign in to myGov.", "Select \"Australian Taxation Office\"."],
      link: { href: MYGOV_URL, label: "Open myGov" },
    },
    {
      id: "navigate",
      title: "Go to your income statement",
      body: ["Once you're in ATO online services, the income statement lives under Employment."],
      actions: ["Select \"Employment\".", "Select \"Income statement\"."],
    },
    {
      id: "year",
      title: "Choose the right year — this is the important bit",
      body: [
        `We need two statements: one for ${newest.label} and one for ${previous.label}.`,
        "That's two YEARS, not two employers. If you had more than one job in a year, that year's statement already covers all of them — you'll see each employer listed on the same statement.",
        "Your list may show several years. Pick one year, save it, then come back and do the other.",
      ],
      actions: [
        `Select the ${newest.label} income year.`,
        "Save it (the next steps show you how).",
        `Come back to this list and repeat for ${previous.label}.`,
      ],
    },
    {
      id: "print",
      title: "Open the print-friendly version",
      body: ["This is the version that saves cleanly. A screenshot of the screen won't be accepted."],
      actions: [
        "Tap the down arrow on the right of the statement to open it.",
        "Scroll to the bottom of the page.",
        'Tap "Print friendly version".',
      ],
    },
    {
      id: "save",
      title: save.title,
      body: ["Almost there — this is the step most people get stuck on, so take it slowly."],
      actions: save.steps,
    },
    {
      id: "upload",
      title: "Come back and upload it",
      body: [
        "That's it. Upload the PDF here and you're done with this document.",
        `Remember you need both ${newest.label} and ${previous.label} — if you've only done one, go back and repeat for the other.`,
      ],
    },
  ];
}

/** What the model is told when a client sends a screenshot asking "what now?". */
export function screenHelpPrompt(years: [FinancialYear, FinancialYear]): string {
  return [
    "You are helping an Australian home-loan applicant find their ATO Income Statement in myGov. They are stuck and have sent a photo or screenshot of their screen.",
    `They need to download TWO income statements as PDFs: one for the ${years[0].label} financial year and one for ${years[1].label}. Two YEARS, not two employers.`,
    "The path is: myGov → Australian Taxation Office → Employment → Income statement → choose the income year → open it with the down arrow → scroll down → Print friendly version → save/print as PDF.",
    "Look at what is actually on their screen, work out exactly where they are, and tell them the SINGLE next thing to tap or click.",
    "Reply with STRICT JSON and nothing else:",
    '{"where": "<where they appear to be, one short sentence>", "next": "<the single next action, in plain words, addressed to them as \\"you\\">", "warning": "<a short warning ONLY if they are about to send the wrong thing (a tax return, a notice of assessment, an employer payment summary, or a screenshot instead of a saved PDF), else empty>", "stuck": true/false}',
    "- stuck: true if you genuinely cannot tell where they are, or they appear to be blocked by something they can't fix themselves (for example the ATO is not linked to their myGov).",
    "Be warm, brief and concrete. Never mention JSON. Never ask them for a tax file number, password or any other credential.",
  ].join("\n");
}

export type ScreenHelp = {
  where: string;
  next: string;
  warning: string;
  stuck: boolean;
};

/**
 * Parse the model's reply. Unlike the verification gate — where an unreadable
 * answer must mean "problem" — an unreadable answer HERE means we quietly hand
 * the client to a human, which is always a safe outcome.
 */
export function parseScreenHelp(raw: string): ScreenHelp {
  let obj: Record<string, unknown> = {};
  try {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) obj = JSON.parse(m[0]);
  } catch {
    /* fall through */
  }
  const str = (v: unknown, max = 300) => (typeof v === "string" ? v.slice(0, max).trim() : "");
  const next = str(obj.next);
  return {
    where: str(obj.where, 200),
    next,
    warning: str(obj.warning, 200),
    // No usable instruction → treat as stuck so the UI offers a human.
    stuck: typeof obj.stuck === "boolean" ? obj.stuck || !next : !next,
  };
}
