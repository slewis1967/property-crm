/** Overview of Feedback & issues: a tour of the page. Opens a plan to show it; nothing is submitted or approved. */
const IDEA = 'li:has-text("Email a suburb report straight from the contact page")';

export default {
  start: "/feedback",
  steps: [
    {
      say: "This is Feedback and issues. Anyone can use it to report a problem with the CRM, or suggest an improvement.",
      do: async (h) => h.point("h1", 1300),
    },
    {
      say: "You get here from the gold button at the top of the menu. It is on every page.",
      do: async (h) => h.point('nav a[href="/feedback"]', 1600),
    },
    {
      say: "The form on the left starts with what it is about. Something's broken, an idea or request, or other.",
      do: async (h) => {
        await h.point('button:has-text("Something\'s broken")', 800);
        await h.point('button:has-text("Idea / request")', 700);
        await h.point('form button:has-text("Other")', 700);
      },
    },
    {
      say: "Then a short title, room to explain, which page it was on, how urgent it is, and the Submit feedback button.",
      do: async (h) => {
        await h.point("#fb-title", 800);
        await h.point("#fb-details", 800);
        await h.point("#fb-priority", 700);
      },
    },
    {
      say: "On the right, Logged so far lists everything that has been reported. Open shows what is still in progress, and All shows everything.",
      do: async (h) => {
        await h.point('h2:has-text("Logged so far")', 900);
        await h.point('button:text-is("All")', 900);
      },
    },
    {
      say: "The label on each item shows where it is up to, such as Queued, Agent working or Needs your sign-off.",
      do: async (h) => {
        await h.point("span:text-is('Queued')", 800);
        await h.point("span:text-is('Agent working')", 800);
        await h.point("span:text-is('Needs your sign-off')", 800);
      },
    },
    {
      say: "An idea can come back with a proposed plan to read, and buttons to approve or reject it.",
      do: async (h) => {
        await h.click(`${IDEA} >> summary`);
        await h.point(`${IDEA} >> button:has-text("Approve")`, 1300);
      },
    },
    {
      say: "For step by step help with a task here, pick it from the list under this overview.",
      do: async (h) => h.pause(400),
    },
  ],
};
