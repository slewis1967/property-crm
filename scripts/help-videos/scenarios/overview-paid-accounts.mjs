/** Overview of Paid Accounts. A tour only: nothing is changed. Demo accounts are invented. */
export default {
  start: "/paid-services",
  steps: [
    {
      say: "Paid Accounts lists every paid service the business runs on, what each one costs, and which ones need attention today.",
      do: async (h) => h.point('h1:text-is("Paid Accounts")', 1500),
    },
    {
      say: "The four tiles at the top sum up what needs attention, the committed spend, and how many accounts are active.",
      do: async (h) => {
        await h.point('div:text-is("Needs attention")', 1000);
        await h.point('div:text-is("Committed spend")', 1000);
        await h.point('div:text-is("Not budgeted")', 1000);
      },
    },
    {
      say: "The Daily check bar shows when the automatic check last ran, with buttons to refresh balances or send the digest.",
      do: async (h) => {
        await h.point('strong:text-is("Daily check:")', 1200);
        await h.point('button:has-text("Refresh balances")', 900);
        await h.point('button:has-text("Send digest now")', 900);
      },
    },
    {
      say: "Below that are the accounts that need attention. Each coloured box gives the reason, with buttons to deal with it.",
      do: async (h) => {
        await h.point('h2:has-text("need attention")', 900);
        await h.point("text=payment overdue by", 1400);
      },
    },
    {
      say: "Further down is the register, the full table of accounts, with the cost, next due date, how it is paid and its status.",
      do: async (h) => h.point('h2:text-is("The register")', 1500),
    },
    {
      say: "The buttons above the table filter it, and each row has links to open billing, edit the details, or remove the account.",
      do: async (h) => {
        await h.point('button:has-text("Flagged (")', 900);
        await h.point('tr:has-text("Example Hosting Co") td >> nth=-1', 1500);
      },
    },
    {
      say: "Add account, at the top right, opens a form for a new service.",
      do: async (h) => h.point('button:has-text("Add account")', 1400),
    },
    {
      say: "For step by step help with a task here, pick it from the list under this overview.",
      do: async (h) => h.pause(600),
    },
  ],
};
