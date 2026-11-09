/** Revenue: change a deal, then delete one. Uses seeded demo deals (the seed file puts them back). */
const EDIT_ROW = 'tr:has(td:has-text("Lot 27 Example Ridge Estate"))';
const DELETE_ROW = 'tr:has(td:has-text("Lot 19 Sample Coast Rise"))';
const MODAL = "div.fixed.inset-0";

export default {
  start: "/revenue",
  steps: [
    {
      say: "This is the Revenue page. Here is how to change a deal, or remove one entered by mistake.",
      do: async (h) => h.pause(500),
    },
    {
      say: "Click Edit at the right hand end of the deal's row.",
      do: async (h) => h.click(`${EDIT_ROW} button:text-is("Edit")`),
    },
    {
      say: "Change the details you need to. Use Stage to move the deal between Active, Settled and Lost.",
      do: async (h) => h.select(`${MODAL} select`, "settled"),
    },
    {
      say: "Click Save changes. Be careful with Lost, because a lost deal no longer shows in this table or in the totals.",
      do: async (h) => {
        await h.click(`${MODAL} button:has-text("Save changes")`);
        await h.page.waitForSelector(MODAL, { state: "detached" });
        await h.point(`${EDIT_ROW} span:text-is("Settled")`, 1200);
      },
    },
    {
      say: "To remove a deal entirely, click Delete on its row.",
      do: async (h) => h.point(`${DELETE_ROW} button:text-is("Delete")`, 1200),
    },
    {
      say: "You are asked to confirm. Click OK and the deal is gone. Deleting cannot be undone.",
      do: async (h) => {
        await h.click(`${DELETE_ROW} button:text-is("Delete")`);
        await h.page.waitForSelector(DELETE_ROW, { state: "detached" });
        await h.pause(800);
      },
    },
  ],
};
