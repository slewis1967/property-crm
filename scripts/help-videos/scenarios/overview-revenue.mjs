/** Overview of Revenue. A tour only; nothing is changed. Uses seeded demo deals. */
export default {
  start: "/revenue",
  steps: [
    {
      say: "This is the Revenue page. It tracks the commission on each deal, what has been banked, and when the rest is due.",
      do: async (h) => h.pause(500),
    },
    {
      say: "At the top right are two buttons. Forecast opens a printable profit forecast, and Add deal records a new deal.",
      do: async (h) => {
        await h.point('a[href="/revenue/forecast"]', 1000);
        await h.point('header button:has-text("Add deal")', 1000);
      },
    },
    {
      say: "The five totals show net and gross remuneration, the share going to referrers, what is banked, and what is outstanding.",
      do: async (h) => {
        await h.point('div.rounded-xl:has(> div:text-is("Net — our total"))', 1100);
        await h.point('div.rounded-xl:has(> div:text-is("Banked"))', 1100);
        await h.point('div.rounded-xl:has(> div:text-is("Outstanding"))', 1100);
      },
    },
    {
      say: "Cash in by month has a bar for each month. Green is money already banked, and dark is money still due.",
      do: async (h) => h.point('h2:has-text("Cash in by month")', 2500),
    },
    {
      say: "The search box narrows the deals table by supplier, lot or purchaser.",
      do: async (h) => h.point('input[placeholder^="Search by supplier"]', 1800),
    },
    {
      say: "The table has one row for each deal. Each payment is a small button you click to mark it paid. Edit and Delete are at the end of the row.",
      do: async (h) => {
        await h.point('th:has-text("Payments")', 1200);
        await h.point('button[title*="mark"] >> nth=0', 1200);
        await h.point('button:text-is("Edit") >> nth=0', 1000);
      },
    },
    {
      say: "The Forecast page has your monthly operating costs at the top, and a forecast document set out for printing underneath.",
      do: async (h) => {
        await h.click('a[href="/revenue/forecast"]');
        await h.page.waitForURL(/\/revenue\/forecast/);
        await h.page.waitForLoadState("networkidle");
        await h.page.waitForSelector("#revenue-forecast");
        await h.pause(500);
        await h.point('h2:has-text("Operating costs")', 1200);
        await h.point("#revenue-forecast h1", 1200);
      },
    },
    {
      say: "For step by step help with a task here, pick it from the list under this overview.",
      do: async (h) => h.pause(400),
    },
  ],
};
