/** Overview of Tasks (archive). A tour only. All tasks and people are invented. */
export default {
  start: "/tasks/archive",
  steps: [
    {
      say: "This page is a view only record of the tasks logged against contacts in the previous system.",
      do: async (h) => h.point('h1:text-is("Tasks")', 1500),
    },
    {
      say: "It is the Tasks link under Archive in the sidebar. Current tasks are on the other Tasks page, under CRM.",
      do: async (h) => h.point('nav a[href="/tasks/archive"]', 1800),
    },
    {
      say: "The count beside the heading shows how many old tasks are held.",
      do: async (h) => h.point("text=/\\d+ records?/", 1400),
    },
    {
      say: "All, Open and Completed narrow the list to tasks that were never finished, or to tasks that were done.",
      do: async (h) => {
        await h.point('a:text-is("All")', 800);
        await h.point('a:text-is("Open")', 800);
        await h.point('a:text-is("Completed")', 800);
      },
    },
    {
      say: "The search box finds tasks by a word in the title or the description.",
      do: async (h) => h.point('input[name="q"]', 1600),
    },
    {
      say: "Title shows what the task was. Contact shows who it was for, and the name opens that person on Contacts.",
      do: async (h) => {
        await h.point('th:text-is("Title")', 900);
        await h.point('td a:has-text("Olivia Bennett")', 1300);
      },
    },
    {
      say: "Due, Status and Added show when it was due, whether it was done or left open, and when it was created.",
      do: async (h) => {
        await h.point('th:text-is("Due")', 800);
        await h.point('th:text-is("Status")', 800);
        await h.point('th:text-is("Added")', 800);
      },
    },
    {
      say: "For step by step help with a task here, pick it from the list under this overview.",
      do: async (h) => h.pause(600),
    },
  ],
};
