/** Revenue: mark a payment as received. Changes a seeded demo deal (the seed file resets it). */
const ROW = 'tr:has(td:has-text("Lot 3 Sample Coast Rise"))';
const PAYMENT = `${ROW} button[title*="mark"] >> nth=0`;

export default {
  start: "/revenue",
  steps: [
    {
      say: "This is the Revenue page. Here is how to record that a commission payment has been received.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Type in the search box at the top of the deals table to find the deal.",
      do: async (h) => h.type('input[placeholder^="Search by supplier"]', "Sample Coast"),
    },
    {
      say: "Look in the Payments column. Each instalment is a small button showing the amount and the month it is due.",
      do: async (h) => h.point('th:has-text("Payments")', 1800),
    },
    {
      say: "Click the payment amount. It turns green with a tick and is saved straight away.",
      do: async (h) => {
        await h.click(PAYMENT);
        await h.pause(900);
      },
    },
    {
      say: "Check the Banked and Outstanding cards at the top. Both update to include the payment.",
      do: async (h) => {
        await h.point('div.rounded-xl:has(> div:text-is("Banked"))', 1200);
        await h.point('div.rounded-xl:has(> div:text-is("Outstanding"))', 1200);
      },
    },
    {
      say: "If you made a mistake, click the green payment again to set it back to unpaid.",
      do: async (h) => h.point(PAYMENT, 1800),
    },
  ],
};
