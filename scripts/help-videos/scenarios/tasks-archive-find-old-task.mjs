/** Tasks archive: find an old task. All tasks and people are invented. */
export default {
  start: "/tasks/archive",
  steps: [
    {
      say: "This video shows how to find an old task from the previous system. There are two Tasks links. Use the one under Archive.",
      do: async (h) => h.point('nav a[href="/tasks/archive"]', 1400),
    },
    {
      say: "Click Open to see only the tasks that were never finished.",
      do: async (h) => {
        await h.click('a:text-is("Open")');
        await h.page.waitForURL(/status=open/);
        await h.page.waitForLoadState("networkidle");
      },
    },
    {
      say: "Click All to see every task again.",
      do: async (h) => {
        await h.click('a:text-is("All")');
        await h.page.waitForLoadState("networkidle");
        await h.pause(500);
      },
    },
    {
      say: "Or type a word in the search box and press Enter. Searching shows all matching tasks, open and completed.",
      do: async (h) => {
        await h.type('input[name="q"]', "contract");
        await h.page.keyboard.press("Enter");
        await h.page.waitForURL(/q=contract/);
        await h.page.waitForLoadState("networkidle");
      },
    },
    {
      say: "Read the Due and Status columns. Status shows done or open.",
      do: async (h) => {
        await h.point('th:text-is("Due")', 800);
        await h.point('th:text-is("Status")', 900);
      },
    },
    {
      say: "Click the contact's name to open their record. Old tasks cannot be changed or ticked off here.",
      do: async (h) => {
        await h.click('td a:has-text("Olivia Bennett")');
        await h.page.waitForURL(/\/contacts\//);
        await h.page.waitForLoadState("networkidle");
      },
    },
  ],
};
