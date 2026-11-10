/** Overview of Tasks: a tour of the page. Switches a filter and back; changes nothing. */
export default {
  start: "/tasks",
  steps: [
    {
      say: "This is Tasks. It is the to do list for the team, with the most overdue work at the top.",
      do: async (h) => h.point("h1", 1300),
    },
    {
      say: "Add task, at the top right, opens a small form for a new task.",
      do: async (h) => h.point('button:has-text("+ Add task")', 1500),
    },
    {
      say: "These buttons choose which tasks are listed. Open, Overdue, Completed and All. The number on each is how many it holds.",
      do: async (h) => {
        await h.click('button:has-text("Overdue (")');
        await h.pause(1100);
        await h.click('button:has-text("Open (")');
      },
    },
    {
      say: "The search box finds a task by its wording or by the contact's name.",
      do: async (h) => h.point('input[placeholder^="Search tasks"]', 1400),
    },
    {
      say: "Each row is one task. The square box on the left ticks it off, and the cross on the right deletes it.",
      do: async (h) => {
        await h.point('button[aria-label="Mark as done"] >> nth=0', 1000);
        await h.point('button[title="Delete"] >> nth=0', 1000);
      },
    },
    {
      say: "The label shows when it is due. Red is overdue, amber is today or tomorrow, and grey is further away.",
      do: async (h) => {
        await h.point("span:has-text('overdue') >> nth=0", 900);
        await h.point("span:text-is('Today') >> nth=0", 900);
      },
    },
    {
      say: "A task linked to a person shows their name, which opens their page in Contacts.",
      do: async (h) => h.point('a:text-is("Jack Harris") >> nth=0', 1500),
    },
    {
      say: "The Tasks archive link opens the old task history.",
      do: async (h) => h.point('a:has-text("Tasks archive")', 1500),
    },
    {
      say: "For step by step help with a task here, pick it from the list under this overview.",
      do: async (h) => h.pause(400),
    },
  ],
};
