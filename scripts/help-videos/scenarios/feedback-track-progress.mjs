/** Feedback: follow up on logged items and approve a plan. Real change (demo database); the seed resets it. */
const IDEA = 'li:has-text("Email a suburb report straight from the contact page")';

export default {
  start: "/feedback",
  steps: [
    {
      say: "This video shows how to see what happened to feedback you have logged.",
      do: async (h) => h.pause(600),
    },
    {
      say: "Look at the Logged so far list on the right.",
      do: async (h) => h.point('h2:has-text("Logged so far")', 1300),
    },
    {
      say: "Click All to include finished items, or Open for the ones still in progress.",
      do: async (h) => {
        await h.click('button:text-is("All")');
        await h.pause(1000);
        await h.click('button:text-is("Open")');
      },
    },
    {
      say: "The coloured label on each item shows where it is up to, such as Queued, Agent working or Needs your sign-off.",
      do: async (h) => {
        await h.point("span:text-is('Queued')", 800);
        await h.point("span:text-is('Agent working')", 800);
        await h.point("span:text-is('Needs your sign-off')", 900);
      },
    },
    {
      say: "If a plan has been written, click View proposed plan to read it.",
      do: async (h) => {
        await h.click(`${IDEA} >> summary`);
        await h.pause(900);
      },
    },
    {
      say: "When the label says Needs your sign-off, click Approve to let the work go ahead, or Reject.",
      do: async (h) => {
        await h.point(`${IDEA} >> button:has-text("Reject")`, 700);
        await h.click(`${IDEA} >> button:has-text("Approve")`);
        await h.page.waitForSelector(`${IDEA} >> text=Approved`);
      },
    },
  ],
};
