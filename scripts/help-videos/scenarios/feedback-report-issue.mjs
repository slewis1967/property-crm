/** Feedback: log a problem. The save is real (demo database); the seed removes it again. */
const TITLE = "Export button gives an empty file";

export default {
  start: "/contacts",
  steps: [
    {
      say: "This video shows how to report a problem or suggest an idea. Click Feedback and issues at the top of the menu. It is on every page.",
      do: async (h) => {
        await h.click('nav a[href="/feedback"]');
        await h.page.waitForURL(/\/feedback$/);
        await h.page.waitForSelector("text=Logged so far");
      },
    },
    {
      say: "Choose what it is about. Something's broken, an idea or request, or other.",
      do: async (h) => {
        await h.point('button:has-text("Idea / request")', 700);
        await h.click('button:has-text("Something\'s broken")');
      },
    },
    {
      say: "Give it a short title.",
      do: async (h) => h.type("#fb-title", TITLE),
    },
    {
      say: "Then tell us more. For a problem, say what you did, what happened and what you expected.",
      do: async (h) => {
        await h.click("#fb-details");
        await h.page.keyboard.type(
          "I filtered Contacts to Investors and clicked Export. The file opened with headings but no rows.",
          { delay: 28 },
        );
      },
    },
    {
      say: "Say which page it was on if you know, and choose how urgent it is.",
      do: async (h) => {
        await h.type("#fb-area", "/contacts");
        await h.select("#fb-priority", "high");
      },
    },
    {
      say: "Click Submit feedback.",
      do: async (h) => {
        await h.click('button:has-text("Submit feedback")');
        await h.page.waitForSelector(`li:has-text("${TITLE}")`);
      },
    },
    {
      say: "Your item appears in the list on the right, where you can follow what happens to it.",
      do: async (h) => h.point(`li:has-text("${TITLE}") >> p >> nth=0`, 1500),
    },
  ],
};
