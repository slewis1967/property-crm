/** Paid Accounts: update one account and remove another. The services are invented. */
const row = 'tr:has-text("Example Accounting App")';
const cost = `${row} div:has(> label:has-text("Cost")) input >> nth=0`;
export default {
  start: "/paid-services",
  steps: [
    {
      say: "This video shows how to update or remove a paid account. Scroll down to the register, the table in the lower half of the page.",
      do: async (h) => h.point('h2:text-is("The register")', 1300),
    },
    {
      say: "Click All. The table starts on Flagged, which only shows accounts with something to fix.",
      do: async (h) => h.click('button:has-text("All (")'),
    },
    {
      say: "Click edit at the right hand end of the account's row. The form opens underneath.",
      do: async (h) => h.click(`${row} button:text-is("edit")`),
    },
    {
      say: "Change the boxes you need. Here the price has gone up.",
      do: async (h) => {
        await h.click(cost);
        await h.page.locator(cost).fill("");
        await h.type(cost, "72");
      },
    },
    {
      say: "Click Save.",
      do: async (h) => {
        await h.click(`${row} button:text-is("Save")`);
        await h.page.waitForSelector('text="Saved."');
      },
    },
    {
      say: "To take an account off the list, click remove on its row, then confirm.",
      do: async (h) => {
        await h.click('tr:has-text("Example Old Fax Line") button:text-is("remove")');
        await h.pause(900);
      },
    },
    {
      say: "This only removes it from this list and cannot be undone. It does not cancel the service with the supplier.",
      do: async (h) => h.point('h2:text-is("The register")', 1200),
    },
  ],
};
