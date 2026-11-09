/** Overview of Broadcast: a tour of the page. Nothing is typed or sent. */
export default {
  start: "/broadcast",
  steps: [
    {
      say: "This is Broadcast. It sends one email to many contacts at once, and shows how past sends went.",
      do: async (h) => h.point("h1", 1300),
    },
    {
      say: "Audience is where you choose which business the email comes from, and who receives it. All contacts, or everyone with one tag from Contacts.",
      do: async (h) => {
        await h.point('select[aria-label="Sending business"]', 1100);
        await h.point('select:has(option[value="__all__"])', 1300);
      },
    },
    {
      say: "This line counts people who have unsubscribed. They are always left out.",
      do: async (h) => h.point("text=already opted", 1600),
    },
    {
      say: "Subject and body are where the email itself is written. The unsubscribe footer is added for you.",
      do: async (h) => {
        await h.point('input[placeholder^="e.g. New SDA"]', 900);
        await h.point("textarea >> nth=0", 1100);
      },
    },
    {
      say: "Review and send checks the wording first, then queues the emails. The number on the button is how many people will get it.",
      do: async (h) => h.point('button:has-text("Review & send to")', 1800),
    },
    {
      say: "Below that, Broadcast history lists every past broadcast with its date and number of recipients.",
      do: async (h) => {
        await h.point('h2:has-text("Broadcast history")', 900);
        await h.point('p:text-is("New listings this week")', 1100);
      },
    },
    {
      say: "Each one counts emails sent, pending and failed, with a bar that fills as they go out. Refresh updates the numbers.",
      do: async (h) => {
        await h.point('li:has-text("New listings this week") >> text=sent', 800);
        await h.point('li:has-text("New listings this week") >> text=failed', 800);
        await h.point('button:text-is("Refresh")', 900);
      },
    },
    {
      say: "For step by step help with a task here, pick it from the list under this overview.",
      do: async (h) => h.pause(400),
    },
  ],
};
