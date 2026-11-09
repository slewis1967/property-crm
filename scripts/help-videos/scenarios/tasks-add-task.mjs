/** Tasks: add a task with a due date. The save is real (demo database); the seed removes it again. */
const TITLE = "Send Grace Lee the completed homes list";

function inDays(n) {
  const d = new Date(Date.now() + n * 86400_000);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default {
  start: "/tasks",
  steps: [
    {
      say: "This video shows how to add a task to your to do list.",
      do: async (h) => h.pause(600),
    },
    {
      say: "Click Add task at the top right of the Tasks page.",
      do: async (h) => h.click('button:has-text("+ Add task")'),
    },
    {
      say: "Type what needs doing.",
      do: async (h) => h.type('input[placeholder="What needs doing?"]', TITLE),
    },
    {
      say: "Pick a due date if it has one. This is optional.",
      do: async (h) => {
        await h.click('input[type="date"]');
        await h.page.locator('input[type="date"]').fill(inDays(3));
        await h.pause(600);
      },
    },
    {
      say: "Click Add.",
      do: async (h) => {
        await h.click('button:text-is("Add")');
        await h.page.waitForSelector(`p:has-text("${TITLE}")`);
      },
    },
    {
      say: "The task appears in your list, with its due date on the right.",
      do: async (h) => h.point(`p:has-text("${TITLE}")`, 1500),
    },
  ],
};
