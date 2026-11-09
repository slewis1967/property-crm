/** Tasks: tick off, filter and search. Real changes (demo database); the seed resets them. */
const DONE = "Send Liam Nguyen the dual occupancy brochure";
const row = (title) => `div.rounded-xl:has(> div p:text-is("${title}"))`;

export default {
  start: "/tasks",
  steps: [
    {
      say: "This video shows how to tick off tasks and see what is overdue.",
      do: async (h) => h.pause(600),
    },
    {
      say: "Click the square box beside a task to mark it done.",
      do: async (h) => {
        await h.click(`${row(DONE)} >> button[aria-label="Mark as done"]`);
        await h.page.waitForSelector(`p:text-is("${DONE}")`, { state: "detached" });
      },
    },
    {
      say: "Click Overdue to see only tasks that are past their due date. The number on each button is how many tasks are in it.",
      do: async (h) => {
        await h.click('button:has-text("Overdue (")');
        await h.pause(1000);
      },
    },
    {
      say: "Click Open to go back to everything still to do. The most overdue tasks are at the top.",
      do: async (h) => h.click('button:has-text("Open (")'),
    },
    {
      say: "Type in the search box to find a task by its wording or by the contact's name.",
      do: async (h) => {
        await h.type('input[placeholder^="Search tasks"]', "Mia");
        await h.pause(900);
      },
    },
    {
      say: "Click the contact's name under a task to open that contact.",
      do: async (h) => {
        await h.point('a:text-is("Mia Anderson") >> nth=0', 1300);
        await h.page.locator('input[placeholder^="Search tasks"]').fill("");
      },
    },
    {
      say: "If you ticked a task by mistake, click Completed, then click its ticked box to reopen it.",
      do: async (h) => {
        await h.click('button:has-text("Completed (")');
        await h.click(`${row(DONE)} >> button[aria-label="Mark as not done"]`);
        await h.pause(600);
      },
    },
  ],
};
