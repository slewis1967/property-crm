/**
 * Overview of Lender Match. A tour only. One match is run with made-up figures
 * so the tour can show a result; a match saves nothing.
 */
const field = (label) => `label:has(> span:text-is("${label}"))`;
const CARD = 'div.rounded-lg.border.bg-white:has(span:text-is("Macquarie Bank"))';

export default {
  start: "/lenders/match",
  steps: [
    {
      say: "This is Lender Match. It scores one client against every lender in Lender Policy, and gives you a ranked shortlist.",
      do: async (h) => h.pause(500),
    },
    {
      say: "The amber notice is a reminder that the shortlist is an internal research aid, and is not for the client.",
      do: async (h) => h.point("div.bg-amber-50 strong", 1500),
    },
    {
      say: "The Scenario panel on the left is where you describe the client. It covers the loan, incomes, the applicant, the property, and the credit file.",
      do: async (h) => {
        await h.point('h2:text-is("Scenario")', 900);
        await h.point('h2:text-is("Applicant")', 800);
        await h.point('h2:text-is("Security")', 800);
        await h.point('h2:text-is("Credit file")', 800);
      },
    },
    {
      say: "Match lenders, at the bottom of the panel, runs the match. Nothing is saved.",
      do: async (h) => {
        const set = (label, v) => h.page.locator(`${field(label)} input`).fill(String(v));
        await set("Loan amount", 520000);
        await set("Property value", 650000);
        await set("Applicant income", 92000);
        await set("Partner income", 78000);
        await set("Living expenses / mo", 3200);
        await set("Deposit", 130000);
        await set("Months in role", 36);
        await set("Genuine savings evidenced", 45000);
        await h.click('button:has-text("Match lenders")');
        await h.page.waitForSelector("text=fit policy", { timeout: 30000 });
        await h.page.mouse.wheel(0, -6000);
        await h.pause(500);
      },
    },
    {
      say: "On the right, four totals count the lenders that fit policy, need an exception, lack policy data, or are ruled out.",
      do: async (h) => h.point("div.mb-3.flex.flex-wrap.gap-4", 2500),
    },
    {
      say: "Each lender in the list shows its name and type, a label for the outcome, and an estimated maximum loan.",
      do: async (h) => {
        await h.point(`${CARD} span.rounded.border`, 1100);
        await h.point(`${CARD} span.w-32`, 1100);
      },
    },
    {
      say: "Click a lender to see every check with a tick or a cross, a source link, and a link to its full record in Lender Policy.",
      do: async (h) => {
        await h.click(`${CARD} span.font-medium >> nth=0`);
        await h.point(`${CARD} ul`, 1500);
        await h.point(`${CARD} a:has-text("Full policy record")`, 1000);
      },
    },
    {
      say: "For step by step help with a task here, pick it from the list under this overview.",
      do: async (h) => h.pause(400),
    },
  ],
};
