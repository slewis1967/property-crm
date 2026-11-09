/** Paid Accounts: mark a flagged account as paid, and snooze another. Demo accounts are invented. */
export default {
  start: "/paid-services",
  steps: [
    {
      say: "This video shows how to deal with a paid account that needs attention. Open Paid Accounts, under System in the sidebar.",
      do: async (h) => h.point('nav a[href="/paid-services"]', 1200),
    },
    {
      say: "The accounts that need you are listed here. Each box is one account, with the reason it was flagged.",
      do: async (h) => {
        await h.point('h2:has-text("need attention")', 800);
        await h.point("text=payment overdue by", 1400);
      },
    },
    {
      say: "Open billing takes you to the supplier's billing page in a new tab, so you can pay the bill.",
      do: async (h) => h.point('a:has-text("Open billing") >> nth=0', 1500),
    },
    {
      say: "Once the bill is paid, click Mark paid.",
      do: async (h) => {
        await h.click('button:has-text("Mark paid") >> nth=0');
        await h.page.waitForSelector("text=Marked paid");
      },
    },
    {
      say: "The account drops off the list, and its next due date moves forward by one billing cycle. This does not pay anything for you.",
      do: async (h) => h.point("text=Marked paid", 1500),
    },
    {
      say: "If you are already dealing with an account, click Snooze seven days.",
      do: async (h) => {
        await h.click('button:has-text("Snooze 7d") >> nth=0');
        await h.page.waitForSelector('text="Saved."');
      },
    },
    {
      say: "It is hidden from this list and from the daily email for a week.",
      do: async (h) => h.point('h2:has-text("need attention")', 1200),
    },
  ],
};
