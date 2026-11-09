/** Lender Match: read the shortlist. Nothing is saved; the scenario figures are made up. */
const field = (label) => `label:has(> span:text-is("${label}"))`;
const CARD = 'div.rounded-lg.border.bg-white:has(span:text-is("Macquarie Bank"))';

export default {
  start: "/lenders/match",
  steps: [
    {
      say: "This is Lender Match, after a match has been run. Here is how to read the lender shortlist.",
      do: async (h) => {
        // Get a result on screen quickly; entering a scenario has its own video.
        const set = (label, v) => h.page.locator(`${field(label)} input`).fill(String(v));
        await set("Loan amount", 520000);
        await set("Property value", 650000);
        await set("Applicant income", 92000);
        await set("Partner income", 78000);
        await set("Living expenses / mo", 3200);
        await set("Deposit", 130000);
        await set("Months in role", 36);
        await set("Postcode", "4510");
        await set("Genuine savings evidenced", 45000);
        await h.page.locator('button:has-text("Match lenders")').click();
        await h.page.waitForSelector("text=fit policy", { timeout: 30000 });
      },
    },
    {
      say: "Read the four totals above the list. They count lenders that fit policy, need an exception, lack policy data, or are ruled out.",
      do: async (h) => h.point("div.mb-3.flex.flex-wrap.gap-4", 2500),
    },
    {
      say: "Each lender has a label, and the estimated maximum loan. The small text under the amount says what is limiting it.",
      do: async (h) => {
        await h.point(`${CARD} span.rounded.border`, 1200);
        await h.point(`${CARD} span.w-32`, 1400);
      },
    },
    {
      say: "Click a lender to see every check. A tick is a pass, a cross is a fail, an exclamation mark needs an exception, and a question mark could not be checked.",
      do: async (h) => {
        await h.click(`${CARD} span.font-medium >> nth=0`);
        await h.point(`${CARD} ul`, 2500);
      },
    },
    {
      say: "Click source beside a check to open the lender's published policy in a new tab.",
      do: async (h) => h.point(`${CARD} ul a >> nth=0`, 1600),
    },
    {
      say: "Click Full policy record to open that lender in Lender Policy.",
      do: async (h) => h.point(`${CARD} a:has-text("Full policy record")`, 1600),
    },
    {
      say: "Always confirm the result with the lender before you act on it. This list is an internal research aid, not credit advice, and it is not for the client.",
      do: async (h) => {
        await h.page.mouse.wheel(0, -5000);
        await h.pause(500);
        await h.point("div.bg-amber-50 strong", 1800);
      },
    },
  ],
};
