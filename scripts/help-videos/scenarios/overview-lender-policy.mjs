/**
 * Overview of Lender Policy. A tour only; nothing is changed. No client records
 * on screen; the lenders are from the research pack committed in the repo.
 */
export default {
  start: "/lenders",
  steps: [
    {
      say: "This is Lender Policy. It is a reference library of what Australian home loan lenders publish about their lending rules.",
      do: async (h) => h.pause(500),
    },
    {
      say: "The button at the top opens Lender Match, which scores a client against this library.",
      do: async (h) => h.point('a[href="/lenders/match"]', 1800),
    },
    {
      say: "The amber notice is a reminder that this is an internal research aid, not credit advice.",
      do: async (h) => h.point("div.bg-amber-50 strong", 1500),
    },
    {
      say: "Next are the search box and two dropdowns. They find a lender by name, type, or the figures it holds.",
      do: async (h) => {
        await h.point('input[placeholder^="Search lenders"]', 900);
        await h.point("select >> nth=0", 800);
        await h.point("select >> nth=1", 800);
      },
    },
    {
      say: "The totals line shows how many lenders are listed, and how many of their facts are verified, unverified, or recorded as gaps.",
      do: async (h) => h.point("text=verified facts", 2200),
    },
    {
      say: "The list is grouped by lender type. Each row shows how much of the record is verified, its gaps, and when it was researched.",
      do: async (h) => {
        await h.point('h2:has-text("Major bank")', 900);
        await h.point('a[href^="/lenders/"]:not([href="/lenders/match"]) >> nth=1', 1800);
      },
    },
    {
      say: "Opening a lender shows what the record does not establish, then every figure by topic, with its label, source link and date.",
      do: async (h) => {
        await h.click('a[href="/lenders/macquarie-bank"] span.font-medium');
        await h.page.waitForURL(/\/lenders\/macquarie-bank$/);
        await h.page.waitForSelector("text=What this record does not establish");
        await h.point("text=What this record does not establish", 1000);
        await h.scroll(520);
        await h.pause(1000);
      },
    },
    {
      say: "For step by step help with a task here, pick it from the list under this overview.",
      do: async (h) => h.pause(400),
    },
  ],
};
